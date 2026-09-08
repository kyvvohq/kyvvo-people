// Envio de WhatsApp via Meta Cloud API — mesmo padrão de dev-mode do
// lib/email.js (sem credencial configurada, loga e segue em vez de tentar a
// chamada real e depender de um provedor externo em dev).
//
// Diferente de e-mail, isto é sempre mensagem PROATIVA (o candidato nunca
// escreveu antes pro número da Kyvvo People) — texto livre só é aceito pela
// Meta dentro da janela de 24h de uma conversa que o destinatário iniciou, o
// que nunca é o caso aqui. Por isso o envio é sempre por `template` (nome
// aprovado previamente no Meta Business Manager), nunca por texto livre — ver
// server/panel/meta-whatsapp-service.js no kyvvo-studio, mesmo modelo.
//
// `parametros` é a lista posicional que preenche {{1}}, {{2}}... do template
// aprovado (a ordem é definida na hora de submeter o template pra aprovação,
// não tem como o código descobrir sozinho — cada automação carrega o nome do
// template e a lib de automações monta a lista na mesma ordem documentada
// pro gatilho, ver lib/automacoes.js).
const GRAPH_API_VERSION = 'v22.0';

async function enviarTemplate({ to, templateName, parametros = [], idioma = 'pt_BR' }) {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.log(`[whatsapp] (dev) template "${templateName}" para ${to}: ${JSON.stringify(parametros)}`);
    return false;
  }
  if (!templateName) {
    console.error(`[whatsapp] Automação sem whatsapp_template configurado — envio pra ${to} abortado.`);
    return false;
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: idioma },
          components: parametros.length
            ? [{ type: 'body', parameters: parametros.map((texto) => ({ type: 'text', text: String(texto) })) }]
            : undefined,
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const erro = await res.json().catch(() => ({}));
      console.error(`[whatsapp] Meta respondeu ${res.status} ao enviar template "${templateName}" pra ${to}: ${(erro.error && erro.error.message) || ''}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[whatsapp] Falha ao enviar template "${templateName}" pra ${to}: ${err.message}`);
    return false;
  }
}

module.exports = { enviarTemplate };
