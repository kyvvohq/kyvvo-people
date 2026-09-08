const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paraE164 } = require('../lib/telefone');

test('paraE164: entradas vazias ou só pontuação retornam null', () => {
  assert.equal(paraE164(null), null);
  assert.equal(paraE164(undefined), null);
  assert.equal(paraE164(''), null);
  assert.equal(paraE164('()-'), null);
});

test('paraE164: celular (11 díg) com ou sem formatação vira +55DDNNNNNNNNN', () => {
  assert.equal(paraE164('(11) 98765-4321'), '+5511987654321');
  assert.equal(paraE164('11987654321'), '+5511987654321');
});

test('paraE164: fixo (10 díg) recebe o 55 do país', () => {
  assert.equal(paraE164('1132654321'), '+551132654321');
});

test('paraE164: já com 55 e mais de 11 dígitos não duplica o país', () => {
  assert.equal(paraE164('5511987654321'), '+5511987654321');
});

test('paraE164: 12 dígitos começando em 55 é tratado como já ter o país', () => {
  assert.equal(paraE164('551198765432'), '+551198765432');
});

test('paraE164: fora de 10-11 dígitos e sem começar com 55 faz passthrough com +', () => {
  assert.equal(paraE164('123456789'), '+123456789');
});

test('paraE164: é idempotente para os casos válidos', () => {
  const validos = [
    '(11) 98765-4321',
    '11987654321',
    '1132654321',
    '5511987654321',
    '551198765432',
    '123456789',
  ];
  for (const valor of validos) {
    const primeira = paraE164(valor);
    assert.equal(paraE164(primeira), primeira);
  }
});
