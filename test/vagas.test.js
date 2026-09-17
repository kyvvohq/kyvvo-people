const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarRequisitosVaga, CAMPOS_EXCLUIDOS_SCORE_DEFAULT } = require('../lib/vagas');

// Handoff v2 (17/09), Regra 0.2/4.2: "Nenhum número isolado (anos de
// experiência, formação, ferramenta) exclui candidato. Eliminatório só pode
// ser requisito legal, regulatório ou físico-logístico" — validado pela
// NATUREZA, nunca por quantidade.
test('eliminatório sem natureza é rejeitado', () => {
  const { erro, dados } = validarRequisitosVaga({
    requisitos_estruturados: [{ capacidade: 'CNH categoria B', nivel_exigido: 'eliminatorio' }],
  });
  assert.ok(erro);
  assert.ok(erro.includes('CNH categoria B'));
  assert.equal(dados, undefined);
});

test('eliminatório com natureza inválida (não é legal/regulatório/físico-logístico) é rejeitado', () => {
  const { erro } = validarRequisitosVaga({
    requisitos_estruturados: [{ capacidade: '5 anos de experiência', nivel_exigido: 'eliminatorio', natureza: 'experiencia' }],
  });
  assert.ok(erro);
});

test('eliminatório com natureza legal/regulatória/físico-logística passa', () => {
  for (const natureza of ['legal', 'regulatorio', 'fisico_logistico']) {
    const { erro, dados } = validarRequisitosVaga({
      requisitos_estruturados: [{ capacidade: 'Registro no CRC', nivel_exigido: 'eliminatorio', natureza }],
    });
    assert.equal(erro, undefined, `natureza "${natureza}" deveria passar`);
    assert.ok(dados);
  }
});

test('não existe mais limite de QUANTIDADE de eliminatórios — só a natureza importa', () => {
  const requisitos = Array.from({ length: 5 }, (_, i) => ({
    capacidade: `Requisito ${i}`, nivel_exigido: 'eliminatorio', natureza: 'legal',
  }));
  const { erro } = validarRequisitosVaga({ requisitos_estruturados: requisitos });
  assert.equal(erro, undefined);
});

test('importante/desejável não exigem natureza', () => {
  const { erro, dados } = validarRequisitosVaga({
    requisitos_estruturados: [
      { capacidade: 'Excel avançado', nivel_exigido: 'importante' },
      { capacidade: 'Inglês fluente', nivel_exigido: 'desejavel' },
    ],
  });
  assert.equal(erro, undefined);
  assert.equal(dados.requisitos_estruturados.length, 2);
});

test('requisito de experiência com anos_minimos ganha curva linear automática', () => {
  const { dados } = validarRequisitosVaga({
    requisitos_estruturados: [{ capacidade: 'Backend', categoria: 'experiencia', nivel_exigido: 'importante', anos_minimos: 3 }],
  });
  assert.deepEqual(dados.requisitos_estruturados[0].curva_experiencia, {
    tipo: 'linear_auto',
    pontos: [{ anos: 0, score: 0 }, { anos: 3, score: 1 }],
    penaliza_excesso: false,
  });
});

test('requisito de experiência que já tem curva_experiencia não é sobrescrito', () => {
  const curvaOriginal = { tipo: 'custom', pontos: [{ anos: 0, score: 0.2 }], penaliza_excesso: true };
  const { dados } = validarRequisitosVaga({
    requisitos_estruturados: [{ capacidade: 'Backend', categoria: 'experiencia', nivel_exigido: 'importante', anos_minimos: 3, curva_experiencia: curvaOriginal }],
  });
  assert.deepEqual(dados.requisitos_estruturados[0].curva_experiencia, curvaOriginal);
});

test('pesos são normalizados pra somar 1.0', () => {
  const { dados } = validarRequisitosVaga({ pesos: { tecnica: 2, experiencia: 2, entrevista: 1 } });
  const soma = Object.values(dados.pesos).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(soma - 1) < 0.001);
  assert.equal(dados.pesos.tecnica, 0.4);
});

test('pesos somando 0 não são normalizados (evita divisão por zero)', () => {
  const { dados } = validarRequisitosVaga({ pesos: { tecnica: 0, experiencia: 0 } });
  assert.deepEqual(dados.pesos, { tecnica: 0, experiencia: 0 });
});

test('campos_excluidos_score: defaults nunca são removidos, só ampliados', () => {
  const { dados } = validarRequisitosVaga({ campos_excluidos_score: ['idade', 'time_de_futebol'] });
  for (const campo of CAMPOS_EXCLUIDOS_SCORE_DEFAULT) {
    assert.ok(dados.campos_excluidos_score.includes(campo), `default "${campo}" deveria continuar presente`);
  }
  assert.ok(dados.campos_excluidos_score.includes('time_de_futebol'));
});

test('sem requisitos_estruturados/pesos/campos_excluidos_score, devolve dados como vieram', () => {
  const { erro, dados } = validarRequisitosVaga({ nome: 'Dev Backend' });
  assert.equal(erro, undefined);
  assert.equal(dados.nome, 'Dev Backend');
});

test('não muta o objeto original recebido', () => {
  const original = { requisitos_estruturados: [{ capacidade: 'X', nivel_exigido: 'importante' }] };
  const copia = JSON.parse(JSON.stringify(original));
  validarRequisitosVaga(original);
  assert.deepEqual(original, copia);
});
