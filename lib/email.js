// Envio pelo serviço de e-mail da plataforma (lib/email-platform.js — SES
// central no kyvvo-platform; sem PLATFORM_EMAIL_TOKEN cai na Resend como
// antes, e sem nenhum dos dois em modo log). Aqui ficam só os templates.
const { enviarEmail } = require('./email-platform');

async function enviar({ email, assunto, html, tag }) {
  // fromName mantém o remetente "Kyvvo People" de antes (o endereço é o da platform).
  return enviarEmail({ to: email, subject: assunto, html, tag, fromName: 'Kyvvo People' });
}

async function enviarLinkAvaliacao({ email, nome, link }) {
  return enviar({ email, assunto: 'Você foi convidado para uma avaliação comportamental', html: emailHtml(nome, link), tag: 'convite_avaliacao' });
}

// E-mail de automação (lib/automacoes.js) — assunto/corpo já vêm prontos
// (placeholders já substituídos), só embrulha no mesmo layout visual.
async function enviarEmailAutomacao({ email, assunto, corpo }) {
  return enviar({ email, assunto, html: automacaoHtml(corpo), tag: 'automacao' });
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

module.exports = { enviarLinkAvaliacao, enviarEmailAutomacao };
