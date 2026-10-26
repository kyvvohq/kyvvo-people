// Envio pelo serviço de e-mail da plataforma (lib/email-platform.js — SES
// central no kyvvo-platform; sem PLATFORM_EMAIL_TOKEN cai na Resend como
// antes, e sem nenhum dos dois em modo log). Aqui ficam só os templates.
const { enviarEmail } = require('./email-platform');

// `modelo` + `variaveis` + `layout`: textos editáveis no admin (E-mail >
// Modelos > People) e identidade Kyvvo aplicados pela plataforma; o `html`
// daqui segue junto como fallback.
async function enviar({ email, assunto, html, tag, modelo, variaveis, layout }) {
  // fromName mantém o remetente "Kyvvo People" de antes (o endereço é o da platform).
  return enviarEmail({ to: email, subject: assunto, html, tag, fromName: 'Kyvvo People', modelo, variaveis, layout });
}

async function enviarLinkAvaliacao({ email, nome, link }) {
  return enviar({
    email,
    assunto: 'Você foi convidado para uma avaliação comportamental',
    html: emailHtml(nome, link),
    tag: 'convite_avaliacao',
    modelo: 'convite_avaliacao',
    variaveis: { nome: nome || '' },
    layout: {
      tipo: 'convite',
      titulo: 'Você foi convidado para uma avaliação',
      saudacao: nome ? `Olá, ${nome}!` : 'Olá!',
      paragrafos: ['Você foi convidado a participar de uma avaliação comportamental como parte de um processo seletivo. Leva poucos minutos e não é necessário criar conta.'],
      cta: { texto: 'Iniciar avaliação', url: link },
      motivo: 'Você vai precisar confirmar o e-mail para o qual este convite foi enviado. O link só pode ser usado uma vez.',
    },
  });
}

// E-mail de automação (lib/automacoes.js) — assunto/corpo já vêm prontos
// (placeholders já substituídos). `empresa` (da vaga) vira o "Enviado por".
async function enviarEmailAutomacao({ email, assunto, corpo, empresa }) {
  return enviar({
    email,
    assunto,
    html: automacaoHtml(corpo),
    tag: 'automacao',
    modelo: 'automacao',
    variaveis: { assunto, corpo, empresa: empresa || '' },
    layout: {
      tipo: 'mensagem',
      titulo: assunto,
      corpoTexto: corpo,
      remetenteNome: empresa || undefined,
      motivo: 'Você recebeu esta mensagem porque está participando de um processo seletivo.',
    },
  });
}

// corpo é texto escrito pelo recrutador na tela de Automações (com
// placeholders já substituídos) — escapa antes de embutir no HTML e
// linkifica URLs cruas (ex.: {{link_avaliacao}}), já que o editor é texto
// simples, não HTML.
function automacaoHtml(corpo) {
  const escapado = String(corpo)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#a688ff">$1</a>');
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#080b14;padding:32px;color:#f2f2f7">
    <div style="max-width:480px;margin:0 auto;background:#12162a;border:1px solid #232847;border-radius:16px;padding:32px">
      <div style="font-size:22px;font-weight:800;letter-spacing:-.03em;margin-bottom:24px">
        ky<span style="color:#a688ff;border-bottom:2px solid #7c5cfc">vv</span>o people
      </div>
      <div style="color:#a1a5c4;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapado}</div>
    </div>
  </div>`;
}

function emailHtml(nome, link) {
  const saudacao = nome ? `Olá, ${nome}!` : 'Olá!';
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#080b14;padding:32px;color:#f2f2f7">
    <div style="max-width:480px;margin:0 auto;background:#12162a;border:1px solid #232847;border-radius:16px;padding:32px">
      <div style="font-size:22px;font-weight:800;letter-spacing:-.03em;margin-bottom:24px">
        ky<span style="color:#a688ff;border-bottom:2px solid #7c5cfc">vv</span>o people
      </div>
      <h1 style="font-size:18px;margin:0 0 12px">${saudacao}</h1>
      <p style="color:#a1a5c4;font-size:14px;line-height:1.6;margin:0 0 24px">
        Você foi convidado a participar de uma avaliação comportamental como parte de um processo seletivo.
        Leva poucos minutos e não é necessário criar conta.
      </p>
      <a href="${link}" style="display:inline-block;background:#a688ff;color:#080b14;font-weight:700;text-decoration:none;padding:14px 24px;border-radius:10px;font-size:14px">
        Iniciar avaliação
      </a>
      <p style="color:#6b7094;font-size:12px;line-height:1.6;margin:24px 0 0">
        Você vai precisar confirmar o e-mail para o qual este convite foi enviado. O link só pode ser usado uma vez.
      </p>
    </div>
  </div>`;
}

// Notificação pro recrutador (dono da conta), não pro candidato — Config. >
// Notificações. tipo 'notificacao' (vs. 'mensagem'/'convite') dá o rodapé
// "por que recebeu + como desativar" específico pra alerta de sistema.
async function enviarNotificacaoNovaCandidatura({ email, nomeCandidato, nomeVaga, link }) {
  const assunto = `Nova candidatura em "${nomeVaga}"`;
  return enviar({
    email,
    assunto,
    html: automacaoHtml(`${nomeCandidato} se candidatou para a vaga "${nomeVaga}".`),
    tag: 'notificacao_nova_candidatura',
    modelo: 'notificacao_nova_candidatura',
    variaveis: { nome_candidato: nomeCandidato, nome_vaga: nomeVaga },
    layout: {
      tipo: 'notificacao',
      notificacao: 'nova candidatura',
      titulo: assunto,
      paragrafos: [`${nomeCandidato} se candidatou para a vaga "${nomeVaga}".`],
      cta: link ? { texto: 'Ver candidatura', url: link } : undefined,
    },
  });
}

module.exports = { enviarLinkAvaliacao, enviarEmailAutomacao, enviarNotificacaoNovaCandidatura };
