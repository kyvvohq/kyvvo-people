const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  calcularProfiler,
  calcularGaps,
  calcularResultado,
  CARACTERISTICAS,
} = require('../lib/inferencia');

test('profiler: selecionar todas as 12 características de um perfil dá score 100', () => {
  const idsAnalista = CARACTERISTICAS.filter((c) => c.perfil === 'A').map((c) => c.id);
  const scores = calcularProfiler(idsAnalista);
  assert.equal(scores.A, 100);
  assert.equal(scores.C, 0);
  assert.equal(scores.E, 0);
  assert.equal(scores.P, 0);
});

test('profiler: seleção mista entre perfis divide a proporção corretamente', () => {
  // 6 de Analista (metade) + 3 de Comunicador (um quarto)
  const idsAnalista = CARACTERISTICAS.filter((c) => c.perfil === 'A').slice(0, 6).map((c) => c.id);
  const idsComunicador = CARACTERISTICAS.filter((c) => c.perfil === 'C').slice(0, 3).map((c) => c.id);
  const scores = calcularProfiler([...idsAnalista, ...idsComunicador]);
  assert.equal(scores.A, 50);
  assert.equal(scores.C, 25);
  assert.equal(scores.E, 0);
  assert.equal(scores.P, 0);
});

test('gaps: diferença dentro de 12 pontos é Alinhamento', () => {
  const gaps = calcularGaps({ A: 50, C: 0, E: 0, P: 0 }, { A: 58, C: 0, E: 0, P: 0 });
  assert.equal(gaps.A.leitura, 'Alinhamento');
});

test('gaps: rodada 2 mais alta que a 1 em mais de 12 pontos', () => {
  const gaps = calcularGaps({ A: 30, C: 0, E: 0, P: 0 }, { A: 60, C: 0, E: 0, P: 0 });
  assert.equal(gaps.A.leitura, 'Os outros te veem mais assim');
});

test('gaps: rodada 1 mais alta que a 2 em mais de 12 pontos', () => {
  const gaps = calcularGaps({ A: 60, C: 0, E: 0, P: 0 }, { A: 30, C: 0, E: 0, P: 0 });
  assert.equal(gaps.A.leitura, 'Você se vê mais assim');
});

test('calcularResultado: monta o objeto completo com as 2 rodadas, perfil dominante e gaps', () => {
  const idsAnalista = CARACTERISTICAS.filter((c) => c.perfil === 'A').map((c) => c.id);
  const idsComunicador = CARACTERISTICAS.filter((c) => c.perfil === 'C').map((c) => c.id);
  const resultado = calcularResultado(idsAnalista, idsComunicador);

  assert.equal(resultado.rodada1.profiler.A, 100);
  assert.equal(resultado.rodada2.profiler.C, 100);
  assert.ok(resultado.rodada1.mbti.tipo.length === 4);
  assert.ok(resultado.rodada1.bigFive.o.nivel);
  assert.equal(resultado.perfilDominante.perfil, 'A');
  assert.equal(resultado.gaps.A.leitura, 'Você se vê mais assim');
});

test('calcularResultado: lança erro se alguma rodada vier vazia', () => {
  assert.throws(() => calcularResultado([], [1, 2, 3]));
  assert.throws(() => calcularResultado([1, 2, 3], []));
});
