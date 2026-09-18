// Handoff v2, #47 — motor de aderência gradual (curvas em vez de corte
// binário) + percentil relativo ao pool da vaga. Substitui, aos poucos, o
// calcularScore() 100% manual de lib/pessoas.js.
//
// Pure/testável, sem acesso a banco. Estruturalmente incapaz de reprovar
// ninguém (Regra 0.1): nenhuma função aqui devolve um campo tipo
// "aprovado"/"reprovado"/"status" — só "score" (número) e "sinal"
// (string informativa). Reprovação continua exclusivamente pela rota
// PATCH /candidaturas/:id/reprovar (index.js), que exige ator humano.
//
// Ainda não integrado em index.js/rotas — depende de #46 (evidencias,
// PR #56) estar mergeado antes de dar pra ler evidências reais do banco.
// Esta é a fundação testável, unlock antecipado do trabalho que não
// depende da migração.

// eliminatorio tem peso 0 — nunca entra na média ponderada, só vira sinal
// via calcularSinalEliminatorio. É a garantia estrutural da Regra 0.1: só
// nível importante/desejável participam do score.
const PESO_NIVEL = { eliminatorio: 0, importante: 2, desejavel: 1 };

// "contexto" é observação geral (não é evidência de aderência a um
// requisito específico) — nunca entra em score nem em sinal, mesma leitura
// de "ausência é neutra" aplicada a evidência que não fala sobre atender
// ou não atender.
const PESO_EFEITO = { corrobora: 1, parcial: 0.6, contradiz: 0.15, contexto: null };

// Interpolação linear na curva_experiencia de um requisito (já existe
// desde #43, só linear — sigmoide fica pra depois do MVP, fora de escopo
// aqui). Fora do range dos pontos, clampa nas pontas. Não tem ligação
// automática com curriculo_estruturado ainda (não existe hoje matching de
// "qual experiência do currículo corresponde a qual requisito" em lugar
// nenhum do sistema) — é um bloco de fundação exportado, não uma
// integração fim-a-fim.
function interpolarCurva(curva, valor) {
  if (!curva || !Array.isArray(curva.pontos) || !curva.pontos.length || valor == null) return null;
  const pontos = [...curva.pontos].sort((a, b) => a.anos - b.anos);
  if (valor <= pontos[0].anos) return pontos[0].score;
  const ultimo = pontos[pontos.length - 1];
  if (valor >= ultimo.anos) return ultimo.score;
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i];
    const b = pontos[i + 1];
    if (valor >= a.anos && valor <= b.anos) {
      const fracao = (valor - a.anos) / (b.anos - a.anos || 1);
      return a.score + fracao * (b.score - a.score);
    }
  }
  return ultimo.score;
}

function agruparEvidenciasPorRequisito(evidencias) {
  const mapa = new Map();
  for (const ev of evidencias || []) {
    if (!ev.requisito_id) continue;
    if (!mapa.has(ev.requisito_id)) mapa.set(ev.requisito_id, []);
    mapa.get(ev.requisito_id).push(ev);
  }
  return mapa;
}

// Score 0..1 de UM requisito importante/desejável a partir das evidências
// ligadas a ele. Sem evidência relevante → { score: null } (fica de fora
// de qualquer média — nunca é penalização). Corroboração e parcial puxam
// pra cima, "atende" (1.0) é teto mesmo com várias evidências favoráveis.
// Contradição + apoio no mesmo requisito nunca é resolvida silenciosamente
// — o campo `contraditorio` fica true e quem exibe isso pro recrutador
// mostra as evidências brutas dos dois lados (Regra 0.4: nunca ocultar).
function calcularScoreRequisito(evidenciasDoRequisito) {
  const relevantes = (evidenciasDoRequisito || []).filter((e) => e.efeito !== 'contexto');
  if (!relevantes.length) return { score: null, contraditorio: false, motivo: 'sem_evidencia' };

  const temContradiz = relevantes.some((e) => e.efeito === 'contradiz');
  const temApoio = relevantes.some((e) => e.efeito === 'corrobora' || e.efeito === 'parcial');
  const contraditorio = temContradiz && temApoio;

  const valores = relevantes.map((e) => PESO_EFEITO[e.efeito]).filter((v) => v != null);
  const media = valores.reduce((s, v) => s + v, 0) / valores.length;
  const score = Math.min(1, media);
  return { score, contraditorio, motivo: null };
}

// Sinal (não decisão) de um requisito ELIMINATÓRIO. Nunca aprova/reprova —
// só descreve o que as evidências indicam, pro recrutador decidir. Ver
// nota de topo do arquivo sobre a Regra 0.1.
function calcularSinalEliminatorio(requisito, evidenciasDoRequisito) {
  const relevantes = (evidenciasDoRequisito || []).filter((e) => e.efeito !== 'contexto');
  const base = { requisitoId: requisito.id, capacidade: requisito.capacidade, natureza: requisito.natureza };
  if (!relevantes.length) return { ...base, sinal: 'sem_evidencia' };
  const temContradiz = relevantes.some((e) => e.efeito === 'contradiz');
  const temApoio = relevantes.some((e) => e.efeito === 'corrobora' || e.efeito === 'parcial');
  if (temContradiz && temApoio) return { ...base, sinal: 'conflitante' };
  return { ...base, sinal: temApoio ? 'atende' : 'nao_atende' };
}

// Score geral 0..1 de UMA candidatura, isolado. Nunca deve ser exibido
// sozinho pro recrutador — Regra 4.4 (percentil no pool é o número
// principal); calcularPercentisPool abaixo é quem transforma isto em algo
// comparável. Requisitos sem evidência ficam fora da média (nunca
// penalizam); se NENHUM requisito importante/desejável tem evidência, o
// resultado é null — sem dado é sem dado, não é zero.
function calcularAderenciaCandidatura({ requisitosEstruturados, evidencias }) {
  const porRequisito = agruparEvidenciasPorRequisito(evidencias);
  const porRequisitoDetalhe = [];
  const eliminatorios = [];
  const contraditorios = [];
  let somaPesos = 0;
  let somaPonderada = 0;

  for (const requisito of requisitosEstruturados || []) {
    const evidenciasDoRequisito = porRequisito.get(requisito.id) || [];
    if (requisito.nivel_exigido === 'eliminatorio') {
      eliminatorios.push(calcularSinalEliminatorio(requisito, evidenciasDoRequisito));
      continue;
    }
    const { score, contraditorio } = calcularScoreRequisito(evidenciasDoRequisito);
    if (contraditorio) contraditorios.push(requisito.id);
    porRequisitoDetalhe.push({
      requisitoId: requisito.id,
      capacidade: requisito.capacidade,
      nivelExigido: requisito.nivel_exigido,
      score,
      contraditorio,
    });
    if (score == null) continue;
    const peso = PESO_NIVEL[requisito.nivel_exigido] || 1;
    somaPesos += peso;
    somaPonderada += peso * score;
  }

  return {
    scoreGeral: somaPesos > 0 ? somaPonderada / somaPesos : null,
    porRequisito: porRequisitoDetalhe,
    eliminatorios,
    contraditorios,
  };
}

// Converte os scores absolutos (0..1 ou null) de todas as candidaturas de
// UMA vaga num percentil relativo ao pool — "como este candidato se
// compara aos demais desta vaga" (Regra 4.4), nunca um corte isolado.
// Normalização por rank (min-max): o pior score do pool fica em 0, o
// melhor em 100, os demais espaçados por posição; empates dividem o rank
// (rank médio). Candidatura sem score (nenhuma evidência ainda) fica com
// percentil null, nunca é penalizada por omissão — só sai da lista quando
// comparada.
function calcularPercentisPool(candidaturas) {
  const comScore = candidaturas.filter((c) => c.scoreGeral != null);
  const n = comScore.length;
  if (n === 0) return candidaturas.map((c) => ({ ...c, percentil: null }));
  if (n === 1) return candidaturas.map((c) => ({ ...c, percentil: c.scoreGeral == null ? null : 100 }));

  const ordenado = [...comScore].sort((a, b) => a.scoreGeral - b.scoreGeral);
  const rankPorCandidatura = new Map();
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && ordenado[j + 1].scoreGeral === ordenado[i].scoreGeral) j++;
    const rankMedio = (i + j) / 2 + 1; // 1-indexado
    for (let k = i; k <= j; k++) rankPorCandidatura.set(ordenado[k], rankMedio);
    i = j + 1;
  }

  return candidaturas.map((c) => {
    if (c.scoreGeral == null) return { ...c, percentil: null };
    const rank = rankPorCandidatura.get(c);
    return { ...c, percentil: Math.round(((rank - 1) / (n - 1)) * 100) };
  });
}

module.exports = {
  interpolarCurva,
  calcularScoreRequisito,
  calcularSinalEliminatorio,
  calcularAderenciaCandidatura,
  calcularPercentisPool,
};
