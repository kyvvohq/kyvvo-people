// Motor de inferência do Kyvvo People — matriz das 48 características e fórmulas
// fornecidas pelo usuário (fonte da verdade validada psicometricamente). Não
// alterar pesos/fórmulas aqui sem validação explícita de quem forneceu a matriz.

// perfil: A = Analista, C = Comunicador, E = Executor, P = Planejador
// ei/sn/tf/jp: pesos de tipo psicológico por dicotomia (+1 = E/S/T/J, -1 = I/N/F/P)
// o/c/ex/ag/ne: pesos OCEAN (ne já invertido — +1 = mais estável)
const CARACTERISTICAS = [
  { id: 1, caracteristica: 'Detalhista', perfil: 'A', ei: 0, sn: 1, tf: 0, jp: 1, o: 0, c: 1, ex: 0, ag: 0, ne: -1 },
  { id: 2, caracteristica: 'Crítico', perfil: 'A', ei: 0, sn: 0, tf: 1, jp: 0, o: 0, c: 1, ex: 0, ag: -1, ne: 0 },
  { id: 3, caracteristica: 'Cuidadoso', perfil: 'A', ei: 0, sn: 1, tf: 0, jp: 1, o: 0, c: 1, ex: 0, ag: 1, ne: -1 },
  { id: 4, caracteristica: 'Exigente', perfil: 'A', ei: 0, sn: 0, tf: 1, jp: 1, o: 0, c: 1, ex: 0, ag: -1, ne: 0 },
  { id: 5, caracteristica: 'Preciso', perfil: 'A', ei: 0, sn: 1, tf: 1, jp: 1, o: 0, c: 1, ex: 0, ag: 0, ne: -1 },
  { id: 6, caracteristica: 'Organizado tecnicamente', perfil: 'A', ei: -1, sn: 1, tf: 1, jp: 1, o: 0, c: 1, ex: -1, ag: 0, ne: -1 },
  { id: 7, caracteristica: 'Perfeccionista', perfil: 'A', ei: 0, sn: 1, tf: 1, jp: 1, o: 0, c: 1, ex: 0, ag: 0, ne: 0 },
  { id: 8, caracteristica: 'Investigativo', perfil: 'A', ei: -1, sn: 0, tf: 1, jp: 0, o: 1, c: 0, ex: -1, ag: 0, ne: 0 },
  { id: 9, caracteristica: 'Sistemático', perfil: 'A', ei: 0, sn: 1, tf: 1, jp: 1, o: 0, c: 1, ex: 0, ag: 0, ne: -1 },
  { id: 10, caracteristica: 'Cauteloso', perfil: 'A', ei: -1, sn: 1, tf: 0, jp: 1, o: 0, c: 1, ex: -1, ag: 0, ne: 0 },
  { id: 11, caracteristica: 'Criterioso', perfil: 'A', ei: 0, sn: 1, tf: 1, jp: 1, o: 0, c: 1, ex: 0, ag: 0, ne: -1 },
  { id: 12, caracteristica: 'Objetivo', perfil: 'A', ei: 0, sn: 1, tf: 1, jp: 0, o: 0, c: 1, ex: 0, ag: 0, ne: -1 },

  { id: 13, caracteristica: 'Comunicativo', perfil: 'C', ei: 1, sn: 0, tf: 0, jp: 0, o: 1, c: 0, ex: 1, ag: 1, ne: 0 },
  { id: 14, caracteristica: 'Entusiasmado', perfil: 'C', ei: 1, sn: 0, tf: 0, jp: -1, o: 1, c: 0, ex: 1, ag: 1, ne: -1 },
  { id: 15, caracteristica: 'Empático', perfil: 'C', ei: 0, sn: 0, tf: -1, jp: 0, o: 1, c: 0, ex: 0, ag: 1, ne: 0 },
  { id: 16, caracteristica: 'Persuasivo', perfil: 'C', ei: 1, sn: 0, tf: 0, jp: 0, o: 1, c: 0, ex: 1, ag: 0, ne: 0 },
  { id: 17, caracteristica: 'Sociável', perfil: 'C', ei: 1, sn: 0, tf: 0, jp: 0, o: 1, c: 0, ex: 1, ag: 1, ne: -1 },
  { id: 18, caracteristica: 'Expressivo', perfil: 'C', ei: 1, sn: 0, tf: 0, jp: -1, o: 1, c: 0, ex: 1, ag: 0, ne: 0 },
  { id: 19, caracteristica: 'Inspirador', perfil: 'C', ei: 1, sn: 0, tf: -1, jp: 0, o: 1, c: 0, ex: 1, ag: 1, ne: -1 },
  { id: 20, caracteristica: 'Carismático', perfil: 'C', ei: 1, sn: 0, tf: 0, jp: -1, o: 1, c: 0, ex: 1, ag: 1, ne: -1 },
  { id: 21, caracteristica: 'Otimista', perfil: 'C', ei: 1, sn: 0, tf: 0, jp: 0, o: 1, c: 0, ex: 1, ag: 1, ne: -1 },
  { id: 22, caracteristica: 'Acolhedor', perfil: 'C', ei: 0, sn: 0, tf: -1, jp: 0, o: 0, c: 0, ex: 0, ag: 1, ne: -1 },
  { id: 23, caracteristica: 'Animado', perfil: 'C', ei: 1, sn: 0, tf: 0, jp: -1, o: 1, c: 0, ex: 1, ag: 1, ne: -1 },
  { id: 24, caracteristica: 'Criativo', perfil: 'C', ei: 0, sn: -1, tf: 0, jp: -1, o: 1, c: 0, ex: 1, ag: 0, ne: 0 },

  { id: 25, caracteristica: 'Decidido', perfil: 'E', ei: 0, sn: 1, tf: 1, jp: -1, o: 0, c: 1, ex: 1, ag: 0, ne: -1 },
  { id: 26, caracteristica: 'Rápido', perfil: 'E', ei: 0, sn: 1, tf: 0, jp: -1, o: 0, c: 0, ex: 1, ag: 0, ne: 0 },
  { id: 27, caracteristica: 'Determinado', perfil: 'E', ei: 0, sn: 1, tf: 1, jp: 1, o: 0, c: 1, ex: 1, ag: 0, ne: -1 },
  { id: 28, caracteristica: 'Competitivo', perfil: 'E', ei: 0, sn: 1, tf: 1, jp: 0, o: 0, c: 1, ex: 1, ag: -1, ne: 0 },
  { id: 29, caracteristica: 'Direto', perfil: 'E', ei: 0, sn: 1, tf: 1, jp: 0, o: 0, c: 0, ex: 1, ag: -1, ne: 0 },
  { id: 30, caracteristica: 'Corajoso', perfil: 'E', ei: 0, sn: 0, tf: 1, jp: -1, o: 1, c: 0, ex: 1, ag: 0, ne: -1 },
  { id: 31, caracteristica: 'Ousado', perfil: 'E', ei: 1, sn: -1, tf: 1, jp: -1, o: 1, c: 0, ex: 1, ag: 0, ne: -1 },
  { id: 32, caracteristica: 'Independente', perfil: 'E', ei: -1, sn: 0, tf: 1, jp: 0, o: 1, c: 0, ex: 0, ag: 0, ne: -1 },
  { id: 33, caracteristica: 'Prático', perfil: 'E', ei: 0, sn: 1, tf: 1, jp: 0, o: -1, c: 1, ex: 0, ag: 0, ne: -1 },
  { id: 34, caracteristica: 'Assertivo', perfil: 'E', ei: 0, sn: 1, tf: 1, jp: 0, o: 0, c: 1, ex: 1, ag: -1, ne: -1 },
  { id: 35, caracteristica: 'Resiliente', perfil: 'E', ei: 0, sn: 1, tf: 1, jp: 0, o: 0, c: 1, ex: 0, ag: 0, ne: -1 },
  { id: 36, caracteristica: 'Enérgico', perfil: 'E', ei: 1, sn: 0, tf: 0, jp: -1, o: 0, c: 0, ex: 1, ag: 0, ne: -1 },

  { id: 37, caracteristica: 'Metódico', perfil: 'P', ei: -1, sn: 1, tf: 1, jp: 1, o: -1, c: 1, ex: -1, ag: 0, ne: -1 },
  { id: 38, caracteristica: 'Estável', perfil: 'P', ei: 0, sn: 1, tf: 0, jp: 1, o: -1, c: 1, ex: 0, ag: 1, ne: -1 },
  { id: 39, caracteristica: 'Paciente', perfil: 'P', ei: -1, sn: 0, tf: 0, jp: 1, o: 0, c: 1, ex: -1, ag: 1, ne: -1 },
  { id: 40, caracteristica: 'Leal', perfil: 'P', ei: 0, sn: 0, tf: -1, jp: 1, o: 0, c: 1, ex: 0, ag: 1, ne: -1 },
  { id: 41, caracteristica: 'Persistente', perfil: 'P', ei: 0, sn: 1, tf: 1, jp: 1, o: 0, c: 1, ex: 0, ag: 0, ne: -1 },
  { id: 42, caracteristica: 'Consistente', perfil: 'P', ei: 0, sn: 1, tf: 1, jp: 1, o: -1, c: 1, ex: 0, ag: 0, ne: -1 },
  { id: 43, caracteristica: 'Confiável', perfil: 'P', ei: 0, sn: 1, tf: 0, jp: 1, o: 0, c: 1, ex: 0, ag: 1, ne: -1 },
  { id: 44, caracteristica: 'Disciplinado', perfil: 'P', ei: -1, sn: 1, tf: 1, jp: 1, o: 0, c: 1, ex: -1, ag: 0, ne: -1 },
  { id: 45, caracteristica: 'Tranquilo', perfil: 'P', ei: -1, sn: 0, tf: 0, jp: 1, o: 0, c: 1, ex: -1, ag: 1, ne: -1 },
  { id: 46, caracteristica: 'Previsível', perfil: 'P', ei: 0, sn: 1, tf: 0, jp: 1, o: -1, c: 1, ex: 0, ag: 1, ne: -1 },
  { id: 47, caracteristica: 'Diplomático', perfil: 'P', ei: 0, sn: 0, tf: -1, jp: 1, o: 0, c: 0, ex: 0, ag: 1, ne: -1 },
  { id: 48, caracteristica: 'Cooperativo', perfil: 'P', ei: 0, sn: 0, tf: -1, jp: 0, o: 0, c: 0, ex: 0, ag: 1, ne: -1 },
];

const PERFIS = ['A', 'C', 'E', 'P'];
const NOMES_PERFIL = { A: 'Analista', C: 'Comunicador', E: 'Executor', P: 'Planejador' };
const DICOTOMIAS = [
  { chave: 'ei', positivo: 'E', negativo: 'I' },
  { chave: 'sn', positivo: 'S', negativo: 'N' },
  { chave: 'tf', positivo: 'T', negativo: 'F' },
  { chave: 'jp', positivo: 'J', negativo: 'P' },
];
const TRACOS_OCEAN = [
  { chave: 'o', nome: 'Abertura' },
  { chave: 'c', nome: 'Conscienciosidade' },
  { chave: 'ex', nome: 'Extroversão' },
  { chave: 'ag', nome: 'Amabilidade' },
  { chave: 'ne', nome: 'Estabilidade emocional' },
];
const LIMIAR_GAP = 12;

function porId(id) {
  const item = CARACTERISTICAS.find((c) => c.id === id);
  if (!item) throw new Error(`inferencia: característica inválida (id ${id})`);
  return item;
}

function calcularProfiler(selecionadas) {
  const itens = selecionadas.map(porId);
  const scores = {};
  for (const perfil of PERFIS) {
    const doPerfil = itens.filter((i) => i.perfil === perfil).length;
    scores[perfil] = Math.round((doPerfil / 12) * 10000) / 100;
  }
  return scores;
}

function calcularMbti(selecionadas) {
  const itens = selecionadas.map(porId);
  const total = itens.length;
  const resultado = {};
  let tipo = '';
  for (const { chave, positivo, negativo } of DICOTOMIAS) {
    const soma = itens.reduce((acc, i) => acc + i[chave], 0);
    const normalizado = total > 0 ? (soma / total) * 100 : 0;
    const polo = normalizado >= 0 ? positivo : negativo;
    resultado[chave] = { normalizado: Math.round(normalizado * 100) / 100, polo };
    tipo += polo;
  }
  return { tipo, dicotomias: resultado };
}

function calcularOcean(selecionadas) {
  const itens = selecionadas.map(porId);
  const total = itens.length;
  const resultado = {};
  for (const { chave, nome } of TRACOS_OCEAN) {
    const soma = itens.reduce((acc, i) => acc + i[chave], 0);
    const media = total > 0 ? soma / total : 0;
    const percentil = ((media + 1) / 2) * 100;
    let nivel = 'médio';
    if (percentil > 55) nivel = 'elevado';
    else if (percentil < 45) nivel = 'baixo';
    resultado[chave] = { nome, percentil: Math.round(percentil * 100) / 100, nivel };
  }
  return resultado;
}

function perfilDominante(scoresRodada1, scoresRodada2) {
  const maiorR1 = Math.max(...PERFIS.map((p) => scoresRodada1[p]));
  const empatados = PERFIS.filter((p) => scoresRodada1[p] === maiorR1);
  const vencedor = empatados.length === 1
    ? empatados[0]
    : empatados.reduce((melhor, p) => (scoresRodada2[p] > scoresRodada2[melhor] ? p : melhor), empatados[0]);
  return { perfil: vencedor, nome: NOMES_PERFIL[vencedor] };
}

function calcularGaps(scoresRodada1, scoresRodada2) {
  const gaps = {};
  for (const perfil of PERFIS) {
    const diff = Math.round((scoresRodada2[perfil] - scoresRodada1[perfil]) * 100) / 100;
    let leitura = 'Alinhamento';
    if (diff > LIMIAR_GAP) leitura = 'Os outros te veem mais assim';
    else if (diff < -LIMIAR_GAP) leitura = 'Você se vê mais assim';
    gaps[perfil] = { nome: NOMES_PERFIL[perfil], diff, leitura };
  }
  return gaps;
}

// selecionadasRodada1/2: array de ids (1–48) marcados pelo candidato em cada rodada.
function calcularResultado(selecionadasRodada1, selecionadasRodada2) {
  if (!Array.isArray(selecionadasRodada1) || !selecionadasRodada1.length) {
    throw new Error('inferencia: respostas da rodada 1 vazias ou inválidas');
  }
  if (!Array.isArray(selecionadasRodada2) || !selecionadasRodada2.length) {
    throw new Error('inferencia: respostas da rodada 2 vazias ou inválidas');
  }

  const profilerR1 = calcularProfiler(selecionadasRodada1);
  const profilerR2 = calcularProfiler(selecionadasRodada2);

  // Profiler compara as 2 rodadas (é o que sustenta a análise de gaps —
  // diferencial do produto). Tipo psicológico e Big Five, por decisão do
  // usuário, viram um resultado único a partir só da rodada 1 (como o
  // candidato se vê) — não há uma versão "rodada 2" desses dois modelos.
  // A chave `mbti` abaixo é interna (ver nota em lib/conteudo.js) — nunca
  // aparece com esse nome em texto visível ao usuário.
  return {
    rodada1: { profiler: profilerR1 },
    rodada2: { profiler: profilerR2 },
    mbti: calcularMbti(selecionadasRodada1),
    bigFive: calcularOcean(selecionadasRodada1),
    perfilDominante: perfilDominante(profilerR1, profilerR2),
    gaps: calcularGaps(profilerR1, profilerR2),
  };
}

module.exports = {
  CARACTERISTICAS,
  PERFIS,
  NOMES_PERFIL,
  LIMIAR_GAP,
  calcularProfiler,
  calcularMbti,
  calcularOcean,
  perfilDominante,
  calcularGaps,
  calcularResultado,
};
