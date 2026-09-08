// Automações do fluxo de vaga (e-mail/WhatsApp em eventos da candidatura) —
// schema em db/019_automacoes.sql. Duas responsabilidades: semear as
// automações padrão de um tenant (garantirAutomacoesPadrao) e disparar as
// automações ativas de um gatilho (dispararAutomacoes), chamado pelos pontos
// do fluxo em index.js (criarOuReutilizarCandidatura, mudança de etapa,
// reprovar, vaga encerrada).
const crypto = require('crypto');
const { enviarEmailAutomacao } = require('./email');
const { enviarTemplate } = require('./whatsapp');

// Automações que todo tenant já tem, sem precisar criar nada na tela —
// `removivel: false` numa delas trava ativo/exclusão nas rotas (index.js);
// hoje só o WhatsApp de candidatura_criada nasce assim (pedido do Bruno:
// e-mail o recrutador pode desligar, WhatsApp não). `etapa_alcancada` não
// tem seed — o sistema não sabe qual etapa do tenant é "Entrevista", quem
// cria é o recrutador pelo ⚡ da coluna no quadro.
const SEEDS = [
  {
    gatilho: 'candidatura_criada', canal: 'email', removivel: true,
    nome: 'Confirmação de candidatura — E-mail',
    assunto: 'Recebemos sua candidatura para {{vaga}}',
    corpo: 'Olá, {{nome}}!\n\nRecebemos sua candidatura para a vaga de {{vaga}} em {{empresa}}.\n\nComo parte do processo, pedimos que você complete uma avaliação comportamental rápida (leva poucos minutos):\n{{link_avaliacao}}\n\nBoa sorte!',
  },
  {
    gatilho: 'candidatura_criada', canal: 'whatsapp', removivel: false,
    nome: 'Confirmação de candidatura — WhatsApp',
    corpo: 'Oi, {{nome}}! Recebemos sua candidatura para {{vaga}}. Complete sua avaliação comportamental: {{link_avaliacao}}',
  },
  {
    gatilho: 'candidatura_reprovada', canal: 'email', removivel: true,
    nome: 'Candidatura não seguiu — E-mail',
    assunto: 'Sobre sua candidatura para {{vaga}}',
    corpo: 'Olá, {{nome}}.\n\nAgradecemos seu interesse na vaga de {{vaga}}. Neste momento optamos por seguir com outro perfil, mas seu cadastro fica registrado para futuras oportunidades.\n\nObrigado pela participação!',
  },
  {
    gatilho: 'candidatura_reprovada', canal: 'whatsapp', removivel: true,
    nome: 'Candidatura não seguiu — WhatsApp',
    corpo: 'Oi, {{nome}}. Agradecemos seu interesse na vaga de {{vaga}} — por ora seguimos com outro perfil, mas seu cadastro fica pra futuras oportunidades. Obrigado!',
  },
  {
    gatilho: 'vaga_encerrada', canal: 'email', removivel: true,
    nome: 'Vaga encerrada — E-mail',
    assunto: 'A vaga {{vaga}} foi encerrada',
    corpo: 'Olá, {{nome}}.\n\nA vaga de {{vaga}} para a qual você se candidatou foi encerrada. Obrigado pelo interesse — seu cadastro fica registrado para futuras oportunidades.',
  },
  {
    gatilho: 'vaga_encerrada', canal: 'whatsapp', removivel: true,
    nome: 'Vaga encerrada — WhatsApp',
    corpo: 'Oi, {{nome}}. A vaga de {{vaga}} foi encerrada. Obrigado pelo interesse — seu cadastro fica pra futuras oportunidades!',
  },
];

// Ordem posicional {{1}}, {{2}}... de cada template da Meta — definida na
// hora de submeter o template pra aprovação (o código não tem como
// descobrir sozinho). Documentado aqui pra quem for submeter os templates
// saber a ordem esperada; ajustar se os templates aprovados vierem numa
// ordem diferente.
const PARAMETROS_TEMPLATE = {
  candidatura_criada: (d) => [d.nome, d.vaga, d.link_avaliacao],
  etapa_alcancada: (d) => [d.nome, d.vaga, d.etapa],
  candidatura_reprovada: (d) => [d.nome, d.vaga],
  vaga_encerrada: (d) => [d.nome, d.vaga],
};

async function garantirAutomacoesPadrao(pool, tenantId) {
  const { rows: existentes } = await pool.query(
    'select gatilho, canal from automacoes where tenant_id = $1 and etapa_id is null',
    [tenantId]
  );
  const jaTem = new Set(existentes.map((r) => `${r.gatilho}:${r.canal}`));
  for (const seed of SEEDS) {
    if (jaTem.has(`${seed.gatilho}:${seed.canal}`)) continue;
    await pool.query(
      `insert into automacoes (id, tenant_id, gatilho, canal, nome, ativo, removivel, assunto, corpo)
       values ($1, $2, $3, $4, $5, true, $6, $7, $8)`,
      [crypto.randomUUID(), tenantId, seed.gatilho, seed.canal, seed.nome, seed.removivel, seed.assunto || null, seed.corpo]
    );
  }
}

function renderizar(texto, dados) {
  if (!texto) return texto;
  return String(texto).replace(/\{\{(\w+)\}\}/g, (m, chave) => (dados[chave] != null ? String(dados[chave]) : ''));
}

// Dispara as automações ativas de um gatilho pra um candidato. Best-effort:
// nunca lança — uma automação mal configurada (ou o provedor fora do ar) não
// pode derrubar a rota que a chamou (candidatura, mudança de etapa etc.).
// `etapaId`/`etapaNome` só fazem sentido pra gatilho='etapa_alcancada'.
async function dispararAutomacoes(pool, { tenantId, gatilho, etapaId, etapaNome, candidato, vaga, linkAvaliacao }) {
  // Garante os seeds antes de qualquer disparo — cobre o tenant que nunca
  // abriu a tela de Automações (select+insert condicional, barato e idempotente).
  await garantirAutomacoesPadrao(pool, tenantId);

  const condicoes = ['tenant_id = $1', 'gatilho = $2', 'ativo = true'];
  const valores = [tenantId, gatilho];
  if (etapaId) {
    condicoes.push(`etapa_id = $${valores.length + 1}`);
    valores.push(etapaId);
  } else {
    condicoes.push('etapa_id is null');
  }

  const { rows: automacoes } = await pool.query(
    `select * from automacoes where ${condicoes.join(' and ')}`,
    valores
  );
  if (!automacoes.length) return;

  const dados = {
    nome: candidato.nome || '',
    vaga: vaga ? vaga.nome : '',
    empresa: vaga ? (vaga.empresa || '') : '',
    etapa: etapaNome || '',
    link_avaliacao: linkAvaliacao || '',
  };

  for (const automacao of automacoes) {
    try {
      if (automacao.canal === 'email') {
        if (!candidato.email) continue;
        await enviarEmailAutomacao({
          email: candidato.email,
          assunto: renderizar(automacao.assunto || automacao.nome, dados),
          corpo: renderizar(automacao.corpo, dados),
        });
      } else if (automacao.canal === 'whatsapp') {
        if (!candidato.telefone_e164) continue;
        const montarParametros = PARAMETROS_TEMPLATE[automacao.gatilho];
        await enviarTemplate({
          to: candidato.telefone_e164,
          templateName: automacao.whatsapp_template,
          parametros: montarParametros ? montarParametros(dados) : [],
        });
      }
    } catch (err) {
      console.error(`[automacoes] Falha ao disparar automação ${automacao.id} (${automacao.gatilho}/${automacao.canal}): ${err.message}`);
    }
  }
}

module.exports = { garantirAutomacoesPadrao, dispararAutomacoes, renderizar, SEEDS };
