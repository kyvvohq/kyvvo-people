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
// Achado em produção (2026-09-09): os templates que o Bruno submeteu usam
// parâmetros NOMEADOS no corpo (`{{nome}}`, `{{vaga}}`), não posicionais
// (`{{1}}`, `{{2}}`) — a Meta manda esses nomes de volta em
// `components[].example.body_text_named_params` na listagem. Mandar como
// posicional (sem `parameter_name`) faz a Meta devolver 400 "(#132000)
// Number of parameters does not match the expected number of params", mesmo
// com a contagem certa. `parametrosCorpo` aqui é `[{ nome?, valor, nomeado }]`
// — `nomeado:true` manda `parameter_name`, `nomeado:false` manda posicional
// puro (suporte a template antigo que ainda use `{{1}}`/`{{2}}`).
//
// O botão de URL dinâmica continua sempre posicional (é assim que a Meta
// define botão, nomeado ou não o corpo) — `parametroBotao` preenche o
// `{{1}}` da URL do botão, só o trecho dinâmico (a base já está fixa no
// template aprovado).
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
    components.push({
      type: 'body',
      parameters: parametrosCorpo.map((p) => (p.nomeado
        ? { type: 'text', parameter_name: p.nome, text: String(p.valor) }
        : { type: 'text', text: String(p.valor) })),
    });
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

// Prefixo dos templates do People na WABA — a mesma WABA/número é
// compartilhada com o Kyvvo Studio (templates "confirmar_agenda",
// "apresentacao_kyvvo" etc.), então sem filtrar por nome a lista traria
// templates de outro produto, irrelevantes aqui.
const PREFIXO_TEMPLATE_PEOPLE = 'people_';

// Lista os templates do People cadastrados na WABA — usado pela tela de
// Automações pra virar um <select> em vez do recrutador digitar o nome (e
// errar) na mão, E pelo disparo de verdade (dispararAutomacoes em
// lib/automacoes.js) pra saber os nomes exatos dos parâmetros do corpo.
// Sem credencial, devolve lista vazia — o front cai pro campo de texto
// manual, e o disparo cai no fallback posicional antigo.
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
    return (data || [])
      .filter((t) => t.name.startsWith(PREFIXO_TEMPLATE_PEOPLE))
      .map((t) => {
        const corpo = (t.components || []).find((c) => c.type === 'BODY');
        const botoes = (t.components || []).find((c) => c.type === 'BUTTONS');
        const botaoUrl = botoes && botoes.buttons && botoes.buttons.find((b) => b.type === 'URL' && /\{\{\d+\}\}/.test(b.url || ''));

        // Nomeado (`{{nome}}`, `{{vaga}}`): a Meta devolve os nomes em
        // body_text_named_params. Sem isso, é template antigo/posicional
        // (`{{1}}`, `{{2}}`) — sintetiza nomes "1", "2"... só pra contar.
        const nomeadosInfo = corpo && corpo.example && corpo.example.body_text_named_params;
        const parametrosNomeados = !!(nomeadosInfo && nomeadosInfo.length);
        const parametrosCorpo = parametrosNomeados
          ? nomeadosInfo.map((p) => p.param_name)
          : Array.from({ length: corpo && corpo.text ? (corpo.text.match(/\{\{\d+\}\}/g) || []).length : 0 }, (_, i) => String(i + 1));

        return {
          nome: t.name, status: t.status, idioma: t.language, corpo: corpo ? corpo.text : '',
          parametros_corpo: parametrosCorpo, parametros_nomeados: parametrosNomeados,
          tem_botao_url: !!botaoUrl, botao_texto: botaoUrl ? botaoUrl.text : null,
        };
      });
  } catch (err) {
    console.error(`[whatsapp] Falha ao listar templates: ${err.message}`);
    return [];
  }
}

module.exports = { enviarTemplate, listarTemplates };
