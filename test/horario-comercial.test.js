const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dentroDoHorario } = require('../lib/horario-comercial');

const CONFIG_PADRAO = { inicio: '09:00', fim: '18:00', dias_uteis: [1, 2, 3, 4, 5] };

// Datas em UTC — America/Sao_Paulo é UTC-3 o ano todo (sem horário de
// verão desde 2019), então 12:00 UTC = 09:00 em Brasília.
test('dentroDoHorario: dentro do horário e dia útil', () => {
  const tercaMeioDiaBrasilia = new Date('2026-09-08T15:00:00Z'); // terça, 12:00 em Brasília
  assert.equal(dentroDoHorario(tercaMeioDiaBrasilia, CONFIG_PADRAO), true);
});

test('dentroDoHorario: antes do início', () => {
  const tercaOitoHoras = new Date('2026-09-08T11:00:00Z'); // terça, 08:00 em Brasília
  assert.equal(dentroDoHorario(tercaOitoHoras, CONFIG_PADRAO), false);
});

test('dentroDoHorario: depois do fim', () => {
  const tercaDezenoveHoras = new Date('2026-09-08T22:00:00Z'); // terça, 19:00 em Brasília
  assert.equal(dentroDoHorario(tercaDezenoveHoras, CONFIG_PADRAO), false);
});

test('dentroDoHorario: fim de semana nunca é horário comercial, mesmo em horário válido', () => {
  const domingoMeioDia = new Date('2026-09-06T15:00:00Z'); // domingo, 12:00 em Brasília
  assert.equal(dentroDoHorario(domingoMeioDia, CONFIG_PADRAO), false);
});

test('dentroDoHorario: sem config (admin nunca respondeu) sempre true (fallback seguro)', () => {
  const qualquerData = new Date('2026-09-06T03:00:00Z'); // domingo de madrugada
  assert.equal(dentroDoHorario(qualquerData, null), true);
});

test('dentroDoHorario: exatamente no início conta como dentro; exatamente no fim já não conta', () => {
  const nove = new Date('2026-09-08T12:00:00Z'); // terça, 09:00 em Brasília
  const dezoito = new Date('2026-09-08T21:00:00Z'); // terça, 18:00 em Brasília
  assert.equal(dentroDoHorario(nove, CONFIG_PADRAO), true);
  assert.equal(dentroDoHorario(dezoito, CONFIG_PADRAO), false);
});
