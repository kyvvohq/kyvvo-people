const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extrairCamposDoTexto } = require('../lib/curriculo');

test('extrai nome, e-mail, whatsapp e linkedin de um texto típico', () => {
  const texto = [
    'Maria Oliveira Souza',
    'maria.oliveira@example.com',
    '(31) 99876-5432',
    'linkedin.com/in/maria-oliveira-souza',
    'Experiência',
    'Analista de RH — Acme Ltda',
  ].join('\n');
  const campos = extrairCamposDoTexto(texto);
  assert.equal(campos.nome, 'Maria Oliveira Souza');
  assert.equal(campos.email, 'maria.oliveira@example.com');
  assert.equal(campos.whatsapp, '31998765432');
  assert.equal(campos.linkedin, 'https://linkedin.com/in/maria-oliveira-souza');
});

test('linkedin com protocolo e www é mantido como veio', () => {
  const campos = extrairCamposDoTexto('Contato: https://www.linkedin.com/in/joao123');
  assert.equal(campos.linkedin, 'https://www.linkedin.com/in/joao123');
});

test('sem linkedin no texto devolve string vazia, nunca null/undefined', () => {
  const campos = extrairCamposDoTexto('Currículo sem nenhum link de rede social.');
  assert.equal(campos.linkedin, '');
});
