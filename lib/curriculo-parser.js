// Handoff v2, #48 (decisão 2 do Bruno: "vamos de parsing", trocando a
// recomendação original do documento de adiar isso pra v1.1) — extrai
// dados estruturados de carreira (experiências, ferramentas, formação) do
// texto de um currículo via Claude Haiku, pra alimentar o motor de
// aderência (#47). Regra 0.3: ausência de evidência é neutra — falha de
// extração nunca bloqueia a candidatura, só deixa os campos vazios pro
// recrutador/candidato preencherem ou corrigirem à mão.

const SYSTEM_PROMPT = `Você extrai dados de carreira de um texto de currículo em português. Devolva APENAS um JSON válido, sem markdown e sem texto fora do JSON, exatamente neste formato:
{"experiencias":[{"cargo":"string","empresa":"string","duracao_meses":number|null}],"ferramentas":["string"],"formacao":[{"curso":"string","instituicao":"string"}]}

Regras:
- Não invente informação que não está no texto. Sem informação clara, a lista fica vazia.
- "ferramentas" é uma lista curta de tecnologias/ferramentas/softwares citados (ex.: Excel, SQL, Figma) — não inclua competências comportamentais nem soft skills.
- "duracao_meses" é sua melhor estimativa a partir das datas do texto (ex.: "jan/2020 a mar/2022" = 26); use null quando não der pra estimar.
- Nunca inclua nome, e-mail, telefone, idade, gênero, estado civil ou foto no JSON — isso não faz parte desta extração.`;

function montarPromptParsingCurriculo(textoCurriculo) {
  return {
    system: SYSTEM_PROMPT,
    // Corta o texto pra não estourar contexto/custo em currículos muito
    // longos — o suficiente pra qualquer currículo real de 1-3 páginas.
    mensagens: [{ role: 'user', content: String(textoCurriculo || '').slice(0, 12000) }],
  };
}

function linhaValida(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function normalizarExperiencia(e) {
  if (!e || typeof e !== 'object') return null;
  if (!linhaValida(e.cargo) && !linhaValida(e.empresa)) return null;
  const duracao = Number(e.duracao_meses);
  return {
    cargo: linhaValida(e.cargo) ? e.cargo.trim() : '',
    empresa: linhaValida(e.empresa) ? e.empresa.trim() : '',
    duracao_meses: Number.isFinite(duracao) && duracao > 0 ? Math.round(duracao) : null,
  };
}

function normalizarFormacao(f) {
  if (!f || typeof f !== 'object') return null;
  if (!linhaValida(f.curso) && !linhaValida(f.instituicao)) return null;
  return {
    curso: linhaValida(f.curso) ? f.curso.trim() : '',
    instituicao: linhaValida(f.instituicao) ? f.instituicao.trim() : '',
  };
}

// Aceita tanto o objeto já parseado do JSON da IA quanto um payload de
// edição manual (recrutador/candidato corrigindo o que a IA errou) e
// devolve sempre a mesma forma normalizada. Nunca lança erro: cada campo
// que não faz sentido vira lista vazia em vez de travar a gravação —
// mesmo raciocínio da Regra 0.3 (ausência de evidência é neutra).
function normalizarCurriculoEstruturado(bruto) {
  const objeto = bruto && typeof bruto === 'object' ? bruto : {};
  const experiencias = Array.isArray(objeto.experiencias)
    ? objeto.experiencias.map(normalizarExperiencia).filter(Boolean)
    : [];
  const ferramentas = Array.isArray(objeto.ferramentas)
    ? [...new Set(objeto.ferramentas.filter(linhaValida).map((f) => f.trim()))]
    : [];
  const formacao = Array.isArray(objeto.formacao)
    ? objeto.formacao.map(normalizarFormacao).filter(Boolean)
    : [];
  return { experiencias, ferramentas, formacao };
}

// Extrai o primeiro objeto JSON da resposta — a IA às vezes envolve em
// ```json apesar de instruída a não fazer isso (mesmo comportamento já
// visto no parser de intenção do bot de WhatsApp do Studio) — e normaliza.
// JSON ausente/inválido degrada pra um resultado totalmente vazio, nunca
// lança: quem chama decide o que fazer (não travar a candidatura).
function parsearRespostaParsingCurriculo(textoResposta, { log } = {}) {
  const avisar = typeof log === 'function' ? log : () => {};
  try {
    const match = String(textoResposta || '').match(/\{[\s\S]*\}/);
    const bruto = JSON.parse(match ? match[0] : textoResposta);
    return normalizarCurriculoEstruturado(bruto);
  } catch (erroParse) {
    avisar({ erro: erroParse.message, textoResposta }, 'Parser de currículo (#48) — resposta da IA não é JSON válido');
    return normalizarCurriculoEstruturado(null);
  }
}

module.exports = { montarPromptParsingCurriculo, normalizarCurriculoEstruturado, parsearRespostaParsingCurriculo };
