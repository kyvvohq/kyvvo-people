// Envio de e-mail via Resend — mesmo padrão usado pelo Kyvvo principal
// (server/panel/token-service.js: chamada HTTP direta a api.resend.com),
// mas com env vars próprias deste serviço (RESEND_API_KEY/RESEND_FROM),
// nunca compartilhadas com o painel principal. Sem API key configurada,
// cai em modo de log — útil em dev sem depender do provedor externo.
async function enviarLinkAvaliacao({ email, nome, link }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Kyvvo People <no-reply@kyvvo.com.br>';

  if (!apiKey) {
    console.log(`[email] (dev) link de avaliação para ${email} (${nome}): ${link}`);
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Você foi convidado para uma avaliação comportamental',
        html: emailHtml(nome, link),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[email] Resend respondeu ${res.status} ao enviar para ${email}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[email] Falha ao enviar e-mail para ${email}: ${err.message}`);
    return false;
  }
}

function emailHtml(nome, link) {
  const saudacao = nome ? `Olá, ${nome}!` : 'Olá!';
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#080b14;padding:32px;color:#f2f2f7">
    <div style="max-width:480px;margin:0 auto;background:#12162a;border:1px solid #232847;border-radius:16px;padding:32px">
      <div style="font-size:22px;font-weight:800;letter-spacing:-.03em;margin-bottom:24px">
        ky<span style="color:#a688ff">vv</span>o people
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
        Você vai precisar informar seu CPF para acessar. O link só pode ser usado uma vez.
      </p>
    </div>
  </div>`;
}

module.exports = { enviarLinkAvaliacao };
