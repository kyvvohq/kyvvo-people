const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarEvidencia, detectarContradicoes } = require('../lib/evidencias');

// Handoff v2, Parte 5.1 — critérios de aceite (TDD) do evidence ledger.

test('fonte inválida é rejeitada', () => {
  const { erro } = validarEvidencia({ fonte: 'chute', efeito: 'contexto', texto: 'x' });
  assert.ok(erro);
});

test('efeito inválido é rejeitado', () => {
  const { erro } = validarEvidencia({ fonte: 'manual', efeito: 'chute', texto: 'x', ator_email: 'a@b.c' });
  assert.ok(erro);
});

test('texto vazio/ausente é rejeitado', () => {
  assert.ok(validarEvidencia({ fonte: 'formulario', efeito: 'contexto', texto: '' }).erro);
  assert.ok(validarEvidencia({ fonte: 'formulario', efeito: 'contexto' }).erro);
  assert.ok(validarEvidencia({ fonte: 'formulario', efeito: 'contexto', texto: '   ' }).erro);
});

// Regra 0.1 (Art. 20 LGPD), estendida: evidência de entrevista/manual é
// lançada por uma pessoa — exige ator identificado.
test('entrevista sem ator_email é rejeitada', () => {
  const { erro } = validarEvidencia({ fonte: 'entrevista', efeito: 'corrobora', texto: 'Falou bem sobre X' });
  assert.ok(erro);
  assert.ok(erro.includes('Art. 20'));
});

test('manual sem ator_email é rejeitada', () => {
  const { erro } = validarEvidencia({ fonte: 'manual', efeito: 'contexto', texto: 'Observação livre' });
  assert.ok(erro);
});

test('entrevista com ator_email passa', () => {
  const { erro, dados } = validarEvidencia({ fonte: 'entrevista', efeito: 'corrobora', texto: 'Falou bem sobre X', ator_email: 'recrutador@empresa.com' });
  assert.equal(erro, undefined);
  assert.ok(dados);
});

test('formulario e avaliacao não exigem ator_email (vêm do próprio candidato)', () => {
  assert.equal(validarEvidencia({ fonte: 'formulario', efeito: 'contexto', texto: 'x' }).erro, undefined);
  assert.equal(validarEvidencia({ fonte: 'avaliacao', efeito: 'contexto', texto: 'x' }).erro, undefined);
});

test('texto é trimado antes de gravar', () => {
  const { dados } = validarEvidencia({ fonte: 'formulario', efeito: 'contexto', texto: '  algo  ' });
  assert.equal(dados.texto, 'algo');
});

test('não muta o objeto original recebido', () => {
  const original = { fonte: 'formulario', efeito: 'contexto', texto: '  algo  ' };
  const copia = { ...original };
  validarEvidencia(original);
  assert.deepEqual(original, copia);
});

// Regra 0.4/5.1: contradições são sempre exibidas, nunca resolvidas
// automaticamente — detectarContradicoes só SINALIZA, não decide quem vence.
test('detectarContradicoes: mesmo requisito com corrobora + contradiz é sinalizado', () => {
  const contraditorios = detectarContradicoes([
    { requisito_id: 'r1', efeito: 'corrobora' },
    { requisito_id: 'r1', efeito: 'contradiz' },
  ]);
  assert.ok(contraditorios.has('r1'));
});

test('detectarContradicoes: parcial + contradiz também conta como contradição', () => {
  const contraditorios = detectarContradicoes([
    { requisito_id: 'r1', efeito: 'parcial' },
    { requisito_id: 'r1', efeito: 'contradiz' },
  ]);
  assert.ok(contraditorios.has('r1'));
});

test('detectarContradicoes: só corrobora, sem contradiz, não é contradição', () => {
  const contraditorios = detectarContradicoes([
    { requisito_id: 'r1', efeito: 'corrobora' },
    { requisito_id: 'r1', efeito: 'corrobora' },
  ]);
  assert.equal(contraditorios.size, 0);
});

test('detectarContradicoes: requisitos diferentes não se misturam', () => {
  const contraditorios = detectarContradicoes([
    { requisito_id: 'r1', efeito: 'corrobora' },
    { requisito_id: 'r2', efeito: 'contradiz' },
  ]);
  assert.equal(contraditorios.size, 0);
});

test('detectarContradicoes: observação geral (sem requisito_id) nunca entra na checagem', () => {
  const contraditorios = detectarContradicoes([
    { requisito_id: null, efeito: 'contradiz' },
    { requisito_id: null, efeito: 'corrobora' },
  ]);
  assert.equal(contraditorios.size, 0);
});
