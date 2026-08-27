const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calcularResultado, CARACTERISTICAS } = require('../lib/inferencia');
const { montarResumo, TIPOS_PSICOLOGICOS } = require('../lib/conteudo');

test('montarResumo cobre os 16 tipos psicológicos', () => {
  assert.equal(Object.keys(TIPOS_PSICOLOGICOS).length, 16);
});

test('montarResumo monta iniciais, tagline e bullets a partir de um resultado real', () => {
  const idsAnalista = CARACTERISTICAS.filter((c) => c.perfil === 'A').map((c) => c.id);
  const idsComunicador = CARACTERISTICAS.filter((c) => c.perfil === 'C').slice(0, 6).map((c) => c.id);
  const resultado = calcularResultado(idsAnalista, idsComunicador);

  const resumo = montarResumo(resultado, 'Bruno Alves');

  assert.equal(resumo.iniciais, 'BA');
  assert.equal(resumo.tagline, 'Precisão, qualidade e pensamento crítico');
  assert.ok(resumo.bulletsResumo.length >= 3);
  assert.ok(resumo.pontosFortes.length > 0);
  assert.ok(resumo.pontosAtencao.length > 0);
  assert.ok(resumo.comoAproveitar.length > 0);
  assert.ok(TIPOS_PSICOLOGICOS[resultado.mbti.tipo]);
});

test('montarResumo com nome de uma palavra só usa as 2 primeiras letras', () => {
  const idsAnalista = CARACTERISTICAS.filter((c) => c.perfil === 'A').map((c) => c.id);
  const resultado = calcularResultado(idsAnalista, idsAnalista);
  const resumo = montarResumo(resultado, 'Madonna');
  assert.equal(resumo.iniciais, 'MA');
});
