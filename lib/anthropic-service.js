// Cliente HTTP puro pra Anthropic API — mesmo padrão de
// kyvvo-studio/server/panel/anthropic-service.js (sem SDK, sem dependência
// de pool/DB). Monta o prompt é responsabilidade de quem chama; este
// módulo só faz a chamada HTTP e devolve o texto da resposta.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Mesmo modelo usado no bot de WhatsApp do Studio — custo/latência
// adequados pra uma extração pontual por candidatura, não por mensagem.
const MODELO = 'claude-haiku-4-5-20251001';

async function chamarClaude({ system, mensagens, maxTokens = 1024 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY não configurada no servidor.');
  }
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: maxTokens,
      system,
      messages: mensagens,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) {
    const mensagem = (dados.error && dados.error.message) || `Anthropic API respondeu ${res.status}`;
    throw new Error(mensagem);
  }
  const bloco = (dados.content || []).find((b) => b.type === 'text');
  return {
    texto: bloco ? bloco.text : '',
    tokensEntrada: (dados.usage && dados.usage.input_tokens) || null,
    tokensSaida: (dados.usage && dados.usage.output_tokens) || null,
  };
}

module.exports = { chamarClaude, MODELO };
