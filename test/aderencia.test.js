const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  interpolarCurva,
  calcularScoreRequisito,
  calcularSinalEliminatorio,
  calcularAderenciaCandidatura,
  calcularPercentisPool,
} = require('../lib/aderencia');

// --- interpolarCurva ---

test('interpolarCurva: valor abaixo do primeiro ponto clampa no primeiro', () => {
  const curva = { pontos: [{ anos: 2, score: 0.3 }, { anos: 5, score: 1 }] };
  assert.equal(interpolarCurva(curva, 0), 0.3);
});

test('interpolarCurva: valor acima do último ponto clampa no último', () => {
  const curva = { pontos: [{ anos: 0, score: 0 }, { anos: 3, score: 1 }] };
  assert.equal(interpolarCurva(curva, 10), 1);
});

test('interpolarCurva: interpola linearmente entre dois pontos', () => {
  const curva = { pontos: [{ anos: 0, score: 0 }, { anos: 4, score: 1 }] };
  assert.equal(interpolarCurva(curva, 2), 0.5);
});

test('interpolarCurva: curva/valor ausente devolve null, nunca lança', () => {
  assert.equal(interpolarCurva(null, 3), null);
  assert.equal(interpolarCurva({ pontos: [] }, 3), null);
  assert.equal(interpolarCurva({ pontos: [{ anos: 0, score: 0 }] }, null), null);
});

// --- calcularScoreRequisito ---

test('calcularScoreRequisito: sem evidência relevante devolve score null (nunca penaliza)', () => {
  assert.deepEqual(calcularScoreRequisito([]), { score: null, contraditorio: false, motivo: 'sem_evidencia' });
  assert.deepEqual(calcularScoreRequisito([{ efeito: 'contexto' }]), { score: null, contraditorio: false, motivo: 'sem_evidencia' });
});

test('calcularScoreRequisito: só corrobora dá score 1, sem contradição', () => {
  const r = calcularScoreRequisito([{ efeito: 'corrobora' }]);
  assert.equal(r.score, 1);
  assert.equal(r.contraditorio, false);
});

test('calcularScoreRequisito: só parcial dá 0.6', () => {
  const r = calcularScoreRequisito([{ efeito: 'parcial' }]);
  assert.equal(r.score, 0.6);
});

test('calcularScoreRequisito: várias corroborações não passam de 1.0 (atende é teto)', () => {
  const r = calcularScoreRequisito([{ efeito: 'corrobora' }, { efeito: 'corrobora' }, { efeito: 'corrobora' }]);
  assert.equal(r.score, 1);
});

test('calcularScoreRequisito: contradiz + corrobora no mesmo requisito é sinalizado, não resolvido silenciosamente', () => {
  const r = calcularScoreRequisito([{ efeito: 'corrobora' }, { efeito: 'contradiz' }]);
  assert.equal(r.contraditorio, true);
  assert.ok(r.score != null);
});

test('calcularScoreRequisito: só contradiz não é marcado contraditório (não há conflito, há só evidência contrária)', () => {
  const r = calcularScoreRequisito([{ efeito: 'contradiz' }]);
  assert.equal(r.contraditorio, false);
  assert.equal(r.score, 0.15);
});

// --- calcularSinalEliminatorio: nunca decide, só sinaliza ---

test('calcularSinalEliminatorio: nunca devolve campo de decisão (aprovado/reprovado/status)', () => {
  const requisito = { id: 'r1', capacidade: 'CNH B', natureza: 'legal' };
  for (const evidencias of [[], [{ efeito: 'corrobora' }], [{ efeito: 'contradiz' }], [{ efeito: 'corrobora' }, { efeito: 'contradiz' }]]) {
    const r = calcularSinalEliminatorio(requisito, evidencias);
    assert.ok(!('aprovado' in r));
    assert.ok(!('reprovado' in r));
    assert.ok(!('status' in r));
    assert.ok(typeof r.sinal === 'string');
  }
});

test('calcularSinalEliminatorio: sem evidência, só apoio, só contradição, e conflito', () => {
  const requisito = { id: 'r1', capacidade: 'CNH B', natureza: 'legal' };
  assert.equal(calcularSinalEliminatorio(requisito, []).sinal, 'sem_evidencia');
  assert.equal(calcularSinalEliminatorio(requisito, [{ efeito: 'corrobora' }]).sinal, 'atende');
  assert.equal(calcularSinalEliminatorio(requisito, [{ efeito: 'contradiz' }]).sinal, 'nao_atende');
  assert.equal(calcularSinalEliminatorio(requisito, [{ efeito: 'corrobora' }, { efeito: 'contradiz' }]).sinal, 'conflitante');
});

// --- calcularAderenciaCandidatura ---

test('ausência de evidência não reduz o score (prova explícita do critério de aceite de #47)', () => {
  const requisitosComEvidencia = [
    { id: 'r1', nivel_exigido: 'importante', capacidade: 'A' },
  ];
  const requisitosComExtraSemEvidencia = [
    { id: 'r1', nivel_exigido: 'importante', capacidade: 'A' },
    { id: 'r2', nivel_exigido: 'importante', capacidade: 'B (sem evidência nenhuma)' },
  ];
  const evidencias = [{ requisito_id: 'r1', efeito: 'corrobora' }];

  const semExtra = calcularAderenciaCandidatura({ requisitosEstruturados: requisitosComEvidencia, evidencias });
  const comExtra = calcularAderenciaCandidatura({ requisitosEstruturados: requisitosComExtraSemEvidencia, evidencias });
  assert.equal(semExtra.scoreGeral, comExtra.scoreGeral);
  assert.equal(comExtra.scoreGeral, 1);
});

test('nenhum requisito com evidência ainda => scoreGeral null (sem dado não é zero)', () => {
  const r = calcularAderenciaCandidatura({
    requisitosEstruturados: [{ id: 'r1', nivel_exigido: 'importante', capacidade: 'A' }],
    evidencias: [],
  });
  assert.equal(r.scoreGeral, null);
});

test('eliminatório nunca entra na média, mesmo com contradição forte', () => {
  const r = calcularAderenciaCandidatura({
    requisitosEstruturados: [
      { id: 'e1', nivel_exigido: 'eliminatorio', capacidade: 'CNH B', natureza: 'legal' },
      { id: 'r1', nivel_exigido: 'importante', capacidade: 'A' },
    ],
    evidencias: [
      { requisito_id: 'e1', efeito: 'contradiz' },
      { requisito_id: 'r1', efeito: 'corrobora' },
    ],
  });
  assert.equal(r.scoreGeral, 1);
  assert.equal(r.eliminatorios.length, 1);
  assert.equal(r.eliminatorios[0].sinal, 'nao_atende');
});

test('importante pesa mais que desejável na média ponderada', () => {
  const r = calcularAderenciaCandidatura({
    requisitosEstruturados: [
      { id: 'r1', nivel_exigido: 'importante', capacidade: 'A' },
      { id: 'r2', nivel_exigido: 'desejavel', capacidade: 'B' },
    ],
    evidencias: [
      { requisito_id: 'r1', efeito: 'corrobora' }, // score 1, peso 2
      { requisito_id: 'r2', efeito: 'contradiz' }, // score 0.15, peso 1
    ],
  });
  // média ponderada: (1*2 + 0.15*1) / 3 = 0.7166...
  assert.ok(Math.abs(r.scoreGeral - 0.7166666666666667) < 1e-9);
});

test('contraditorios lista os ids dos requisitos com apoio E contradição simultâneos', () => {
  const r = calcularAderenciaCandidatura({
    requisitosEstruturados: [{ id: 'r1', nivel_exigido: 'importante', capacidade: 'A' }],
    evidencias: [
      { requisito_id: 'r1', efeito: 'corrobora' },
      { requisito_id: 'r1', efeito: 'contradiz' },
    ],
  });
  assert.deepEqual(r.contraditorios, ['r1']);
});

test('calcularAderenciaCandidatura nunca devolve campo de decisão de reprovação (Regra 0.1)', () => {
  const r = calcularAderenciaCandidatura({
    requisitosEstruturados: [{ id: 'e1', nivel_exigido: 'eliminatorio', capacidade: 'X', natureza: 'legal' }],
    evidencias: [{ requisito_id: 'e1', efeito: 'contradiz' }],
  });
  assert.ok(!('aprovado' in r));
  assert.ok(!('reprovado' in r));
  assert.ok(!('status' in r));
});

// --- calcularPercentisPool ---

test('calcularPercentisPool: pool vazio devolve lista vazia', () => {
  assert.deepEqual(calcularPercentisPool([]), []);
});

test('calcularPercentisPool: candidatura única com score vira percentil 100', () => {
  const r = calcularPercentisPool([{ id: 'c1', scoreGeral: 0.5 }]);
  assert.equal(r[0].percentil, 100);
});

test('calcularPercentisPool: todos sem score => todos com percentil null', () => {
  const r = calcularPercentisPool([{ id: 'c1', scoreGeral: null }, { id: 'c2', scoreGeral: null }]);
  assert.deepEqual(r.map((c) => c.percentil), [null, null]);
});

test('calcularPercentisPool: candidatura sem score fica com percentil null mesmo com pool pontuado, sem penalizar os demais', () => {
  const r = calcularPercentisPool([
    { id: 'c1', scoreGeral: 0.9 },
    { id: 'c2', scoreGeral: 0.1 },
    { id: 'c3', scoreGeral: null },
  ]);
  const porId = Object.fromEntries(r.map((c) => [c.id, c.percentil]));
  assert.equal(porId.c3, null);
  assert.equal(porId.c1, 100);
  assert.equal(porId.c2, 0);
});

test('calcularPercentisPool: empates dividem o percentil ao meio', () => {
  const r = calcularPercentisPool([
    { id: 'c1', scoreGeral: 0.5 },
    { id: 'c2', scoreGeral: 0.5 },
  ]);
  // 2 candidatos empatados: menores=0, iguais=2 => (0 + 2/2)/2 * 100 = 50 pra ambos
  assert.equal(r[0].percentil, 50);
  assert.equal(r[1].percentil, 50);
});

test('calcularPercentisPool: ranking correto com 4 scores distintos', () => {
  const r = calcularPercentisPool([
    { id: 'c1', scoreGeral: 0.2 },
    { id: 'c2', scoreGeral: 0.4 },
    { id: 'c3', scoreGeral: 0.6 },
    { id: 'c4', scoreGeral: 0.8 },
  ]);
  const porId = Object.fromEntries(r.map((c) => [c.id, c.percentil]));
  assert.equal(porId.c1, 0);
  assert.equal(porId.c2, 33);
  assert.equal(porId.c3, 67);
  assert.equal(porId.c4, 100);
});
