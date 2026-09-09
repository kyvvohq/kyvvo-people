const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderizar, extrairTokenDoLink, escolherMelhorTemplate, SEEDS } = require('../lib/automacoes');

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

test('extrairTokenDoLink: pega o último segmento da URL da avaliação', () => {
  assert.equal(extrairTokenDoLink('https://people.kyvvo.com.br/people/avaliacao/abc-123'), 'abc-123');
});

test('extrairTokenDoLink: ignora barra final', () => {
  assert.equal(extrairTokenDoLink('https://people.kyvvo.com.br/people/avaliacao/abc-123/'), 'abc-123');
});

test('extrairTokenDoLink: nulo/vazio devolve null', () => {
  assert.equal(extrairTokenDoLink(null), null);
  assert.equal(extrairTokenDoLink(''), null);
});

test('escolherMelhorTemplate: prefere aprovado com botão de link', () => {
  const templates = [
    { nome: 'a', status: 'APPROVED', tem_botao_url: false },
    { nome: 'b', status: 'APPROVED', tem_botao_url: true },
    { nome: 'c', status: 'PENDING', tem_botao_url: true },
  ];
  assert.equal(escolherMelhorTemplate(templates).nome, 'b');
});

test('escolherMelhorTemplate: sem botão, cai pro primeiro aprovado', () => {
  const templates = [
    { nome: 'a', status: 'APPROVED', tem_botao_url: false },
    { nome: 'b', status: 'PENDING', tem_botao_url: true },
  ];
  assert.equal(escolherMelhorTemplate(templates).nome, 'a');
});

test('escolherMelhorTemplate: sem nenhum aprovado, cai pro primeiro da lista', () => {
  const templates = [{ nome: 'a', status: 'PENDING', tem_botao_url: false }];
  assert.equal(escolherMelhorTemplate(templates).nome, 'a');
});

test('escolherMelhorTemplate: lista vazia devolve null', () => {
  assert.equal(escolherMelhorTemplate([]), null);
});
