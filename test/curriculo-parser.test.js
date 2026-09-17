const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizarCurriculoEstruturado,
  parsearRespostaParsingCurriculo,
  montarPromptParsingCurriculo,
} = require('../lib/curriculo-parser');

test('normaliza um objeto bem formado', () => {
  const resultado = normalizarCurriculoEstruturado({
    experiencias: [{ cargo: 'Dev Backend', empresa: 'Acme', duracao_meses: 18 }],
    ferramentas: ['SQL', 'Excel'],
    formacao: [{ curso: 'Ciência da Computação', instituicao: 'UFMG' }],
  });
  assert.deepEqual(resultado, {
    experiencias: [{ cargo: 'Dev Backend', empresa: 'Acme', duracao_meses: 18 }],
    ferramentas: ['SQL', 'Excel'],
    formacao: [{ curso: 'Ciência da Computação', instituicao: 'UFMG' }],
  });
});

test('objeto vazio/null vira listas vazias, nunca lança', () => {
  assert.deepEqual(normalizarCurriculoEstruturado(null), { experiencias: [], ferramentas: [], formacao: [] });
  assert.deepEqual(normalizarCurriculoEstruturado(undefined), { experiencias: [], ferramentas: [], formacao: [] });
  assert.deepEqual(normalizarCurriculoEstruturado({}), { experiencias: [], ferramentas: [], formacao: [] });
  assert.deepEqual(normalizarCurriculoEstruturado('string qualquer'), { experiencias: [], ferramentas: [], formacao: [] });
});

test('experiência sem cargo nem empresa é descartada', () => {
  const resultado = normalizarCurriculoEstruturado({
    experiencias: [{ duracao_meses: 12 }, { cargo: 'Analista', empresa: '', duracao_meses: null }],
  });
  assert.equal(resultado.experiencias.length, 1);
  assert.equal(resultado.experiencias[0].cargo, 'Analista');
});

test('duracao_meses inválida (negativa, zero, não numérica) vira null', () => {
  const resultado = normalizarCurriculoEstruturado({
    experiencias: [
      { cargo: 'A', duracao_meses: -5 },
      { cargo: 'B', duracao_meses: 0 },
      { cargo: 'C', duracao_meses: 'muito tempo' },
    ],
  });
  assert.deepEqual(resultado.experiencias.map((e) => e.duracao_meses), [null, null, null]);
});

test('ferramentas: remove vazias/não-string e deduplica', () => {
  const resultado = normalizarCurriculoEstruturado({ ferramentas: ['SQL', '', null, 'SQL', 42, 'Excel'] });
  assert.deepEqual(resultado.ferramentas, ['SQL', 'Excel']);
});

test('formação sem curso nem instituição é descartada', () => {
  const resultado = normalizarCurriculoEstruturado({ formacao: [{}, { curso: 'MBA' }] });
  assert.equal(resultado.formacao.length, 1);
});

test('parsearRespostaParsingCurriculo: JSON puro é aceito', () => {
  const resultado = parsearRespostaParsingCurriculo('{"experiencias":[],"ferramentas":["Git"],"formacao":[]}');
  assert.deepEqual(resultado.ferramentas, ['Git']);
});

test('parsearRespostaParsingCurriculo: JSON envolvido em ```json ainda é extraído', () => {
  const resultado = parsearRespostaParsingCurriculo('```json\n{"experiencias":[],"ferramentas":["Node"],"formacao":[]}\n```');
  assert.deepEqual(resultado.ferramentas, ['Node']);
});

test('parsearRespostaParsingCurriculo: JSON malformado degrada pra vazio, nunca lança', () => {
  let avisado = false;
  const resultado = parsearRespostaParsingCurriculo('isso não é um JSON', { log: () => { avisado = true; } });
  assert.deepEqual(resultado, { experiencias: [], ferramentas: [], formacao: [] });
  assert.ok(avisado);
});

test('parsearRespostaParsingCurriculo: resposta vazia degrada pra vazio', () => {
  assert.deepEqual(parsearRespostaParsingCurriculo(''), { experiencias: [], ferramentas: [], formacao: [] });
  assert.deepEqual(parsearRespostaParsingCurriculo(undefined), { experiencias: [], ferramentas: [], formacao: [] });
});

test('montarPromptParsingCurriculo: corta texto muito longo e devolve system+mensagens', () => {
  const { system, mensagens } = montarPromptParsingCurriculo('a'.repeat(20000));
  assert.ok(system.includes('JSON'));
  assert.equal(mensagens.length, 1);
  assert.equal(mensagens[0].content.length, 12000);
});
