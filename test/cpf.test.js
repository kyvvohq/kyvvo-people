const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarCpf, normalizar } = require('../lib/cpf');

test('normalizar remove pontuação', () => {
  assert.equal(normalizar('123.456.789-09'), '12345678909');
});

test('valida um CPF com dígitos verificadores corretos', () => {
  assert.equal(validarCpf('111.444.777-35'), true);
});

test('rejeita CPF com dígito verificador errado', () => {
  assert.equal(validarCpf('111.444.777-36'), false);
});

test('rejeita CPF com sequência repetida mesmo com tamanho certo', () => {
  assert.equal(validarCpf('111.111.111-11'), false);
});

test('rejeita CPF com tamanho errado', () => {
  assert.equal(validarCpf('123.456.789'), false);
});

test('rejeita entrada vazia/nula', () => {
  assert.equal(validarCpf(''), false);
  assert.equal(validarCpf(null), false);
});
