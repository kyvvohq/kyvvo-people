const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderizar, SEEDS } = require('../lib/automacoes');

test('renderizar: substitui todos os placeholders presentes', () => {
  const resultado = renderizar('Olá, {{nome}}! Vaga: {{vaga}}.', { nome: 'Ana', vaga: 'Dev Backend' });
  assert.equal(resultado, 'Olá, Ana! Vaga: Dev Backend.');
});

test('renderizar: placeholder sem valor correspondente vira string vazia, não quebra', () => {
  const resultado = renderizar('Olá, {{nome}}! Link: {{link_avaliacao}}', { nome: 'Ana' });
  assert.equal(resultado, 'Olá, Ana! Link: ');
});

test('renderizar: texto sem placeholder passa direto', () => {
  assert.equal(renderizar('Sem placeholders aqui', {}), 'Sem placeholders aqui');
});

test('renderizar: texto vazio/nulo não lança', () => {
  assert.equal(renderizar(null, {}), null);
  assert.equal(renderizar('', {}), '');
});

test('SEEDS: candidatura_criada tem e-mail removível e WhatsApp não removível', () => {
  const email = SEEDS.find((s) => s.gatilho === 'candidatura_criada' && s.canal === 'email');
  const whatsapp = SEEDS.find((s) => s.gatilho === 'candidatura_criada' && s.canal === 'whatsapp');
  assert.equal(email.removivel, true);
  assert.equal(whatsapp.removivel, false);
});

test('SEEDS: todo seed tem gatilho, canal, nome e corpo', () => {
  for (const seed of SEEDS) {
    assert.ok(seed.gatilho, 'gatilho ausente');
    assert.ok(seed.canal, 'canal ausente');
    assert.ok(seed.nome, 'nome ausente');
    assert.ok(seed.corpo, 'corpo ausente');
  }
});

test('SEEDS: nenhum gatilho é etapa_alcancada (não há como saber a etapa de antemão)', () => {
  assert.ok(!SEEDS.some((s) => s.gatilho === 'etapa_alcancada'));
});
