// Automações do fluxo de vaga (e-mail/WhatsApp em eventos da candidatura) —
// schema em db/019_automacoes.sql. Duas responsabilidades: semear as
// automações padrão de um tenant (garantirAutomacoesPadrao) e disparar as
// automações ativas de um gatilho (dispararAutomacoes), chamado pelos pontos
// do fluxo em index.js (criarOuReutilizarCandidatura, mudança de etapa,
// reprovar, vaga encerrada).
const crypto = require('crypto');
const { enviarEmailAutomacao } = require('./email');
const { enviarTemplate, listarTemplates } = require('./whatsapp');

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
    // Corpo é só preview/referência (o texto de verdade é o do template
    // aprovado na Meta, escolhido no campo whatsapp_template) — o link da
    // avaliação vai pelo botão de URL dinâmica do template, não pelo corpo.
    corpo: 'Oi, {{nome}}! Recebemos sua candidatura para {{vaga}}. Toque no botão da mensagem pra completar sua avaliação comportamental.',
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

// Fallback pra template SEM parâmetro nomeado (posicional {{1}}, {{2}}...) —
// nenhum dos templates atuais do People é assim (todos usam {{nome}},
// {{vaga}}...), mas mantém suporte caso um template mais antigo apareça.
// Com parâmetro nomeado (o caso normal), os valores vêm de `dados` direto
// pelo nome que a própria Meta devolve — ver montarParametrosWhatsapp.
const PARAMETROS_CORPO_TEMPLATE = {
  candidatura_criada: (d) => [d.nome, d.vaga],
  etapa_alcancada: (d) => [d.nome, d.vaga, d.etapa],
  candidatura_reprovada: (d) => [d.nome, d.vaga],
  vaga_encerrada: (d) => [d.nome, d.vaga],
};

// Nome do parâmetro nomeado (ex.: "vaga_titulo" no people_confirma_
// cadidatura_2) -> chave equivalente em `dados`. Cobre as variações que já
// apareceram nos templates submetidos; um nome nomeado que não está aqui
// cai no próprio nome como chave (ex.: {{etapa}} -> dados.etapa direto).
const ALIAS_PARAMETRO_NOMEADO = { vaga_titulo: 'vaga' };

// Meta espera só o trecho dinâmico da URL do botão (a base já está fixa no
// template aprovado), não a URL inteira. Só o token (último segmento) seria
// suficiente SE toda base terminasse em ".../avaliacao/{{1}}" — mas achado
// em produção (2026-09-09): dos 3 templates do Bruno, dois usam essa base e
// um usa só o domínio raiz (".../{{1}}"), que precisa do caminho inteiro
// ("people/avaliacao/<token>"), não só do token. Mandar sempre só o token
// gerava link quebrado nesse terceiro. Resolve comparando o CAMINHO da base
// do botão (botaoUrlPrefixo, de lib/whatsapp.js) com o caminho de
// `link_avaliacao` — o que sobrar depois de descontar o prefixo é o valor
// certo, sem depender de qual dos dois formatos o template usa.
function extrairTokenDoLink(link) {
  if (!link) return null;
  return link.split('/').filter(Boolean).pop();
}

function parametroBotaoParaTemplate(link, botaoUrlPrefixo) {
  if (!link) return null;
  let caminhoAlvo;
  try {
    caminhoAlvo = new URL(link).pathname.replace(/^\/+/, '');
  } catch (err) {
    return extrairTokenDoLink(link);
  }
  if (!botaoUrlPrefixo) return extrairTokenDoLink(link); // sem info do template, melhor esforço

  let caminhoPrefixo = '';
  try {
    caminhoPrefixo = new URL(botaoUrlPrefixo).pathname.replace(/^\/+/, '');
  } catch (err) {
    // botaoUrlPrefixo mal formado (não deveria acontecer, vem da própria
    // Meta) — segue com caminhoPrefixo vazio, equivalente a "base é a raiz".
  }
  return caminhoPrefixo && caminhoAlvo.startsWith(caminhoPrefixo)
    ? caminhoAlvo.slice(caminhoPrefixo.length)
    : caminhoAlvo;
}

// Monta os parâmetros de envio pro template escolhido, usando a estrutura
// real que a Meta devolveu (templateInfo, de listarTemplates — pode ser
// undefined se a lista falhou ou o template não foi encontrado nela, aí cai
// no fallback posicional hardcoded). Achado em produção (2026-09-09): os
// templates do Bruno usam parâmetro NOMEADO no corpo ({{nome}}, {{vaga}}) —
// mandar posicional sem `parameter_name` faz a Meta devolver 400 mesmo com a
// contagem certa (ver lib/whatsapp.js). Qualquer gatilho cujo template tenha
// botão de link usa o link da avaliação da candidatura, se ela tiver uma —
// não é exclusividade de candidatura_criada, é o que fizer sentido pro
// template escolhido em cada automação.
function montarParametrosWhatsapp(gatilho, dados, templateInfo) {
  let parametrosCorpo;
  if (templateInfo && templateInfo.parametros_nomeados) {
    parametrosCorpo = templateInfo.parametros_corpo.map((nomeParam) => ({
      nome: nomeParam, nomeado: true,
      valor: dados[ALIAS_PARAMETRO_NOMEADO[nomeParam] || nomeParam] || '',
    }));
  } else {
    const montarCorpo = PARAMETROS_CORPO_TEMPLATE[gatilho];
    parametrosCorpo = (montarCorpo ? montarCorpo(dados) : []).map((valor) => ({ valor, nomeado: false }));
  }

  const precisaBotao = templateInfo ? templateInfo.tem_botao_url : gatilho === 'candidatura_criada';
  const parametroBotao = precisaBotao
    ? parametroBotaoParaTemplate(dados.link_avaliacao, templateInfo && templateInfo.botao_url_prefixo)
    : null;

  return { parametrosCorpo, parametroBotao };
}

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

  await autoEscolherTemplateObrigatorio(pool, tenantId);
}

// Prioridade: aprovado + com botão de link (candidatura_criada sempre tem
// link de avaliação a oferecer) > qualquer aprovado > qualquer um (mesmo em
// análise, melhor que nada — Meta rejeita o envio até aprovar, mas fica
// pronto pra funcionar sozinho assim que aprovar).
function escolherMelhorTemplate(templates) {
  const aprovados = templates.filter((t) => t.status === 'APPROVED');
  return aprovados.find((t) => t.tem_botao_url) || aprovados[0] || templates[0] || null;
}

// A automação obrigatória (removivel=false) de WhatsApp tem que funcionar
// sozinha assim que os templates da Meta existirem — pedido do Bruno: sendo
// obrigatória, não pode depender de alguém abrir a tela de Automações e
// clicar em Salvar. Se ela ainda não tem `whatsapp_template` (nasce nula, só
// o recrutador escolhia manualmente antes disso), escolhe automaticamente o
// primeiro template aprovado do People que tenha botão de link (a
// candidatura_criada sempre tem link de avaliação a oferecer) e persiste —
// dali em diante aparece selecionado (e editável) normalmente na tela.
async function autoEscolherTemplateObrigatorio(pool, tenantId) {
  const { rows: semTemplate } = await pool.query(
    `select id from automacoes
     where tenant_id = $1 and canal = 'whatsapp' and removivel = false
       and (whatsapp_template is null or whatsapp_template = '')`,
    [tenantId]
  );
  if (!semTemplate.length) return;

  const templates = await listarTemplates();
  if (!templates.length) return; // sem credencial da Meta ainda — tenta de novo no próximo disparo

  const escolhido = escolherMelhorTemplate(templates);
  if (!escolhido) return;

  for (const automacao of semTemplate) {
    await pool.query(
      'update automacoes set whatsapp_template = $1, nome = $2, atualizado_em = now() where id = $3',
      [escolhido.nome, escolhido.nome, automacao.id]
    );
  }
}

function renderizar(texto, dados) {
  if (!texto) return texto;
  return String(texto).replace(/\{\{(\w+)\}\}/g, (m, chave) => (dados[chave] != null ? String(dados[chave]) : ''));
}

// Busca as automações candidatas pro gatilho/etapa — quando há vagaId, uma
// automação específica dessa vaga (vaga_id = vagaId) SOBREPÕE a geral
// (vaga_id null) pro mesmo canal; sem específica, cai na geral. A troca é
// por canal, não por etapa inteira: uma vaga pode ter só o WhatsApp
// sobrescrito e continuar usando o e-mail geral, por exemplo.
async function buscarAutomacoesCandidatas(pool, { tenantId, gatilho, etapaId, vagaId }) {
  const condicoes = ['tenant_id = $1', 'gatilho = $2', 'ativo = true'];
  const valores = [tenantId, gatilho];

  if (!etapaId) {
    condicoes.push('etapa_id is null');
    const { rows } = await pool.query(`select * from automacoes where ${condicoes.join(' and ')}`, valores);
    return rows;
  }

  valores.push(etapaId);
  condicoes.push(`etapa_id = $${valores.length}`);
  if (vagaId) {
    valores.push(vagaId);
    condicoes.push(`(vaga_id is null or vaga_id = $${valores.length})`);
  } else {
    condicoes.push('vaga_id is null');
  }
  const { rows } = await pool.query(`select * from automacoes where ${condicoes.join(' and ')}`, valores);
  return resolverPorCanal(rows);
}

// Entre a geral (vaga_id null) e a específica (vaga_id preenchido) do MESMO
// canal, fica só a específica — é a "sobreposição" por vaga, resolvida por
// canal (uma vaga pode sobrescrever só o WhatsApp e continuar no e-mail
// geral, por exemplo). Extraído de buscarAutomacoesCandidatas pra dar pra
// testar sem banco.
function resolverPorCanal(automacoes) {
  const porCanal = new Map();
  for (const automacao of automacoes) {
    const atual = porCanal.get(automacao.canal);
    if (!atual || automacao.vaga_id) porCanal.set(automacao.canal, automacao);
  }
  return [...porCanal.values()];
}

// Já mandou WhatsApp pra esse número nas últimas 24h (qualquer automação,
// não só a mesma) — pedido do Bruno: evita parecer spam pra Meta e pro
// candidato, mesmo que ele passe por várias etapas rápido no mesmo dia.
async function enviadoRecentemente(pool, telefoneE164) {
  const { rows } = await pool.query(
    `select 1 from whatsapp_envios where telefone_e164 = $1 and enviado_em > now() - interval '24 hours' limit 1`,
    [telefoneE164]
  );
  return rows.length > 0;
}

async function registrarEnvioWhatsapp(pool, tenantId, telefoneE164) {
  await pool.query(
    'insert into whatsapp_envios (id, tenant_id, telefone_e164) values ($1, $2, $3)',
    [crypto.randomUUID(), tenantId, telefoneE164]
  );
}

// Fase 5 do plano de travas de WhatsApp (webhook de opt-out automático,
// index.js): a Kyvvo People tem UM número só, compartilhado por todos os
// tenants — não dá pra saber de qual candidatura o candidato tá falando
// quando responde, então o opt-out é sempre global (todo tenant), não por
// tenant. Match exato (mensagem inteira, sem acento, minúscula) — não
// substring, pra não confundir "vou parar de procurar emprego" com um
// pedido de opt-out de verdade.
const PALAVRAS_OPT_OUT = ['parar', 'pare', 'sair', 'cancelar', 'stop', 'unsubscribe'];
function detectarOptOut(texto) {
  if (!texto) return false;
  const normalizado = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return PALAVRAS_OPT_OUT.includes(normalizado);
}

// Dispara as automações ativas de um gatilho pra um candidato. Best-effort:
// nunca lança — uma automação mal configurada (ou o provedor fora do ar) não
// pode derrubar a rota que a chamou (candidatura, mudança de etapa etc.).
// `etapaId`/`etapaNome`/`vagaId` só fazem sentido pra gatilho='etapa_alcancada'
// (vagaId habilita a automação específica daquela vaga sobrepor a geral).
async function dispararAutomacoes(pool, { tenantId, gatilho, etapaId, etapaNome, vagaId, candidato, vaga, linkAvaliacao }) {
  // Garante os seeds antes de qualquer disparo — cobre o tenant que nunca
  // abriu a tela de Automações (select+insert condicional, barato e idempotente).
  await garantirAutomacoesPadrao(pool, tenantId);

  const automacoes = await buscarAutomacoesCandidatas(pool, { tenantId, gatilho, etapaId, vagaId });
  if (!automacoes.length) return;

  const dados = {
    nome: candidato.nome || '',
    vaga: vaga ? vaga.nome : '',
    empresa: vaga ? (vaga.empresa || '') : '',
    etapa: etapaNome || '',
    link_avaliacao: linkAvaliacao || '',
  };

  // Carregado só se alguma automação de WhatsApp entrar no loop (evita a
  // chamada à Meta quando o gatilho só tem automação de e-mail) — uma vez
  // por chamada de dispararAutomacoes, reaproveitado por todas as
  // automações de WhatsApp desse mesmo disparo.
  let templatesWhatsapp = null;

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
        if (candidato.whatsapp_opt_out) continue; // pediu pra não receber mais — nunca manda
        if (await enviadoRecentemente(pool, candidato.telefone_e164)) {
          console.log(`[automacoes] pulado (24h) automação ${automacao.id} pra ${candidato.telefone_e164}`);
          continue;
        }
        if (templatesWhatsapp === null) templatesWhatsapp = await listarTemplates();
        const templateInfo = templatesWhatsapp.find((t) => t.nome === automacao.whatsapp_template);
        const { parametrosCorpo, parametroBotao } = montarParametrosWhatsapp(automacao.gatilho, dados, templateInfo);
        const enviado = await enviarTemplate({
          to: candidato.telefone_e164,
          templateName: automacao.whatsapp_template,
          parametrosCorpo, parametroBotao,
        });
        if (enviado) await registrarEnvioWhatsapp(pool, tenantId, candidato.telefone_e164);
      }
    } catch (err) {
      console.error(`[automacoes] Falha ao disparar automação ${automacao.id} (${automacao.gatilho}/${automacao.canal}): ${err.message}`);
    }
  }
}

module.exports = {
  garantirAutomacoesPadrao, dispararAutomacoes, renderizar, extrairTokenDoLink, escolherMelhorTemplate,
  montarParametrosWhatsapp, parametroBotaoParaTemplate, resolverPorCanal, detectarOptOut, SEEDS,
};
