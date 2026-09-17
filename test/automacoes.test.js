const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  renderizar, extrairTokenDoLink, escolherMelhorTemplate, montarParametrosWhatsapp, parametroBotaoParaTemplate,
  resolverPorCanal, detectarOptOut, SEEDS,
} = require('../lib/automacoes');

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

// Handoff v2 (17/09), Regra 0.6/Parte 5.2: confirmação de candidatura E
// encerramento de vaga são os dois eventos obrigatórios — antes só o
// primeiro travava o WhatsApp.
test('SEEDS: vaga_encerrada tem e-mail removível e WhatsApp não removível', () => {
  const email = SEEDS.find((s) => s.gatilho === 'vaga_encerrada' && s.canal === 'email');
  const whatsapp = SEEDS.find((s) => s.gatilho === 'vaga_encerrada' && s.canal === 'whatsapp');
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

// Achado em produção (2026-09-09): a Meta devolve 400 "(#132000) Number of
// parameters does not match" quando se manda parâmetro posicional pra um
// template com parâmetro NOMEADO no corpo — mesmo com a contagem certa.
test('montarParametrosWhatsapp: template nomeado usa os nomes reais da Meta, não posição', () => {
  const dados = { nome: 'Ana', vaga: 'Dev Backend', etapa: 'Entrevista', link_avaliacao: 'https://x/people/avaliacao/tok-1' };
  const templateInfo = { parametros_corpo: ['nome', 'vaga'], parametros_nomeados: true, tem_botao_url: true };
  const { parametrosCorpo, parametroBotao } = montarParametrosWhatsapp('etapa_alcancada', dados, templateInfo);
  assert.deepEqual(parametrosCorpo, [
    { nome: 'nome', nomeado: true, valor: 'Ana' },
    { nome: 'vaga', nomeado: true, valor: 'Dev Backend' },
  ]);
  assert.equal(parametroBotao, 'tok-1');
});

test('montarParametrosWhatsapp: alias vaga_titulo -> dados.vaga', () => {
  const dados = { nome: 'Ana', vaga: 'Dev Backend', link_avaliacao: null };
  const templateInfo = { parametros_corpo: ['nome', 'vaga_titulo'], parametros_nomeados: true, tem_botao_url: false };
  const { parametrosCorpo } = montarParametrosWhatsapp('candidatura_criada', dados, templateInfo);
  assert.equal(parametrosCorpo[1].valor, 'Dev Backend');
});

test('montarParametrosWhatsapp: sem template (lista da Meta vazia) cai no fallback posicional hardcoded', () => {
  const dados = { nome: 'Ana', vaga: 'Dev Backend', etapa: '' };
  const { parametrosCorpo, parametroBotao } = montarParametrosWhatsapp('candidatura_reprovada', dados, undefined);
  assert.deepEqual(parametrosCorpo, [{ valor: 'Ana', nomeado: false }, { valor: 'Dev Backend', nomeado: false }]);
  assert.equal(parametroBotao, null);
});

test('montarParametrosWhatsapp: template sem botão não manda parametroBotao mesmo com link disponível', () => {
  const dados = { nome: 'Ana', vaga: 'Dev', link_avaliacao: 'https://x/people/avaliacao/tok-2' };
  const templateInfo = { parametros_corpo: ['nome', 'vaga'], parametros_nomeados: true, tem_botao_url: false };
  const { parametroBotao } = montarParametrosWhatsapp('candidatura_reprovada', dados, templateInfo);
  assert.equal(parametroBotao, null);
});

// Achado em produção (2026-09-09): dos 3 templates do Bruno, dois têm o
// botão com base ".../people/avaliacao/{{1}}" (só o token completa) e um
// tem base só no domínio raiz ".../{{1}}" (precisa do caminho inteiro) —
// mandar sempre só o token quebrava o link nesse terceiro.
test('parametroBotaoParaTemplate: base do botão já termina em /avaliacao/ -> só o token', () => {
  const valor = parametroBotaoParaTemplate(
    'https://people.kyvvo.com.br/people/avaliacao/abc-123',
    'https://www.people.kyvvo.com.br/people/avaliacao/'
  );
  assert.equal(valor, 'abc-123');
});

test('parametroBotaoParaTemplate: base do botão é a raiz do domínio -> caminho inteiro', () => {
  const valor = parametroBotaoParaTemplate(
    'https://people.kyvvo.com.br/people/avaliacao/abc-123',
    'https://www.people.kyvvo.com.br/'
  );
  assert.equal(valor, 'people/avaliacao/abc-123');
});

test('parametroBotaoParaTemplate: funciona mesmo com host diferente (www vs sem www)', () => {
  const valor = parametroBotaoParaTemplate(
    'https://people.kyvvo.com.br/people/avaliacao/xyz',
    'https://www.people.kyvvo.com.br/people/avaliacao/'
  );
  assert.equal(valor, 'xyz');
});

test('parametroBotaoParaTemplate: sem prefixo do template (fallback), devolve só o token', () => {
  assert.equal(parametroBotaoParaTemplate('https://people.kyvvo.com.br/people/avaliacao/abc', null), 'abc');
});

test('parametroBotaoParaTemplate: sem link, devolve null', () => {
  assert.equal(parametroBotaoParaTemplate(null, 'https://x/'), null);
});

// Automação por vaga (2026-09-09): a específica de uma vaga sobrepõe a
// geral, mas só no canal onde ela existir.
test('resolverPorCanal: automação com vaga_id sobrepõe a geral do mesmo canal', () => {
  const geralEmail = { canal: 'email', vaga_id: null, id: 'geral-email' };
  const geralWhats = { canal: 'whatsapp', vaga_id: null, id: 'geral-whats' };
  const especificaWhats = { canal: 'whatsapp', vaga_id: 'vaga-1', id: 'especifica-whats' };
  const resultado = resolverPorCanal([geralEmail, geralWhats, especificaWhats]);
  assert.equal(resultado.find((a) => a.canal === 'email').id, 'geral-email');
  assert.equal(resultado.find((a) => a.canal === 'whatsapp').id, 'especifica-whats');
});

test('resolverPorCanal: sem automação específica, mantém a geral', () => {
  const geral = { canal: 'whatsapp', vaga_id: null, id: 'geral' };
  assert.equal(resolverPorCanal([geral])[0].id, 'geral');
});

test('resolverPorCanal: sem nenhuma automação, devolve lista vazia', () => {
  assert.deepEqual(resolverPorCanal([]), []);
});

// Fase 5: webhook de opt-out automático (o candidato responde pedindo pra
// não receber mais). Match exato da mensagem inteira, não substring — pra
// não confundir "vou parar de procurar emprego" com um pedido de verdade.
test('detectarOptOut: reconhece as palavras-chave, case/acento-insensível', () => {
  assert.equal(detectarOptOut('PARAR'), true);
  assert.equal(detectarOptOut('pare'), true);
  assert.equal(detectarOptOut('  Cancelar  '), true);
  assert.equal(detectarOptOut('SAIR'), true);
  assert.equal(detectarOptOut('Stop'), true);
  assert.equal(detectarOptOut('cancélar'), true); // acento não deveria existir aqui, mas não quebra
});

test('detectarOptOut: não confunde frase que contém a palavra com o pedido em si', () => {
  assert.equal(detectarOptOut('vou parar de procurar emprego'), false);
  assert.equal(detectarOptOut('quero cancelar minha inscrição na vaga X'), false);
});

test('detectarOptOut: mensagem normal não aciona', () => {
  assert.equal(detectarOptOut('Olá, gostaria de saber mais sobre a vaga'), false);
});

test('detectarOptOut: vazio/nulo não aciona nem lança', () => {
  assert.equal(detectarOptOut(''), false);
  assert.equal(detectarOptOut(null), false);
  assert.equal(detectarOptOut(undefined), false);
});
