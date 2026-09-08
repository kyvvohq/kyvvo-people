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
// `parametrosCorpo` preenche {{1}}, {{2}}... do corpo do template.
// `parametroBotao`, quando o template tem um botão de URL dinâmica (ex.: o
// link da avaliação), preenche o {{1}} da URL do botão — na prática só o
// trecho dinâmico (o token), nunca a URL inteira: a base da URL já está fixa
// no template aprovado.
const GRAPH_API_VERSION = 'v22.0';

async function enviarTemplate({ to, templateName, parametrosCorpo = [], parametroBotao, idioma = 'pt_BR' }) {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.log(`[whatsapp] (dev) template "${templateName}" para ${to}: corpo=${JSON.stringify(parametrosCorpo)} botao=${parametroBotao || '-'}`);
    return false;
  }
  if (!templateName) {
    console.error(`[whatsapp] Automação sem whatsapp_template configurado — envio pra ${to} abortado.`);
    return false;
  }

  const components = [];
  if (parametrosCorpo.length) {
    components.push({ type: 'body', parameters: parametrosCorpo.map((texto) => ({ type: 'text', text: String(texto) })) });
  }
  if (parametroBotao) {
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(parametroBotao) }] });
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
        template: { name: templateName, language: { code: idioma }, components: components.length ? components : undefined },
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

// Lista os templates cadastrados na WABA da Kyvvo People — usado pela tela de
// Automações pra virar um <select> em vez do recrutador digitar o nome (e
// errar) na mão. Sem credencial, devolve lista vazia — o front cai pro campo
// de texto manual.
async function listarTemplates() {
  const token = process.env.META_WHATSAPP_TOKEN;
  const wabaId = process.env.META_WABA_ID;
  if (!token || !wabaId) return [];

  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/message_templates`);
    url.searchParams.set('fields', 'name,status,language,components');
    url.searchParams.set('limit', '100');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      const erro = await res.json().catch(() => ({}));
      console.error(`[whatsapp] Meta respondeu ${res.status} ao listar templates: ${(erro.error && erro.error.message) || ''}`);
      return [];
    }
    const { data } = await res.json();
    return (data || []).map((t) => {
      const corpo = (t.components || []).find((c) => c.type === 'BODY');
      const botoes = (t.components || []).find((c) => c.type === 'BUTTONS');
      const temBotaoUrl = !!(botoes && botoes.buttons && botoes.buttons.some((b) => b.type === 'URL' && /\{\{\d+\}\}/.test(b.url || '')));
      const qtdParametrosCorpo = corpo && corpo.text ? (corpo.text.match(/\{\{\d+\}\}/g) || []).length : 0;
      return {
        nome: t.name, status: t.status, idioma: t.language,
        corpo: corpo ? corpo.text : '', qtd_parametros_corpo: qtdParametrosCorpo, tem_botao_url: temBotaoUrl,
      };
    });
  } catch (err) {
    console.error(`[whatsapp] Falha ao listar templates: ${err.message}`);
    return [];
  }
}

module.exports = { enviarTemplate, listarTemplates };
