// Validação/normalização dos campos estruturados de match de uma vaga —
// extraído de index.js (Handoff v2, 17/09) pra virar testável sem precisar
// de banco. Regra central (0.2/4.2): "Nenhum número isolado (anos de
// experiência, formação, ferramenta) exclui candidato. Eliminatório só pode
// ser requisito legal, regulatório ou físico-logístico."
const crypto = require('crypto');

// Lista fixa do que o motor de match nunca deve considerar — o recrutador
// só pode ADICIONAR itens, nunca remover os defaults (evita viés indireto
// no score: idade, gênero etc. nunca entram no cálculo de aderência).
const CAMPOS_EXCLUIDOS_SCORE_DEFAULT = [
  'idade', 'ano_formatura', 'genero', 'estado_civil', 'nome', 'foto',
  'endereco_completo', 'gaps_temporais_nao_justificados',
];

// Naturezas válidas pra um requisito eliminatório. Substitui o limite de
// QUANTIDADE (max_eliminatorios) que existia antes da Handoff v2 — a
// validação antiga barrava pela contagem de eliminatórios, não pela
// natureza deles, o que deixava passar exatamente o que a regra proíbe
// (ex.: "5 anos de experiência" marcado eliminatório, contanto que fossem
// só 3 no total).
const NATUREZAS_ELIMINATORIO_VALIDAS = ['legal', 'regulatorio', 'fisico_logistico'];

// Valida e normaliza os campos estruturados de match antes de gravar.
// Devolve { erro } (dados inalterados) quando algo é inválido, ou
// { dados } com a versão normalizada (curva de experiência preenchida,
// pesos somando 1.0, campos excluídos com os defaults garantidos) — nunca
// muta o objeto recebido.
function validarRequisitosVaga(dadosOriginais) {
  const dados = { ...dadosOriginais };

  if (dados.requisitos_estruturados) {
    const eliminatorioSemNatureza = dados.requisitos_estruturados.find(
      (r) => r.nivel_exigido === 'eliminatorio' && !NATUREZAS_ELIMINATORIO_VALIDAS.includes(r.natureza)
    );
    if (eliminatorioSemNatureza) {
      return {
        erro: `Requisito eliminatório "${eliminatorioSemNatureza.capacidade || '(sem nome)'}" precisa de natureza legal, regulatória ou físico-logística — nenhuma outra razão pode excluir um candidato.`,
      };
    }
    // id estável por requisito — o formulário (public/vagas.html) não gera
    // um; sem isso, evidencias.requisito_id (lib/evidencias.js) não teria o
    // que referenciar. Gerado uma vez só: requisito que já tem id (veio de
    // uma edição anterior) mantém o mesmo, senão uma evidência antiga
    // ficaria "órfã" — apontando pra um id que a vaga não tem mais.
    //
    // Curva de experiência sempre presente quando há anos_minimos — gerada
    // automaticamente como linear (não existe ainda editor de curva no
    // front; é fundação pro motor de match, não o motor em si).
    dados.requisitos_estruturados = dados.requisitos_estruturados.map((r) => {
      const comId = r.id ? r : { ...r, id: crypto.randomUUID() };
      if (comId.categoria === 'experiencia' && comId.anos_minimos != null && !comId.curva_experiencia) {
        return {
          ...comId,
          curva_experiencia: {
            tipo: 'linear_auto',
            pontos: [{ anos: 0, score: 0 }, { anos: comId.anos_minimos, score: 1 }],
            penaliza_excesso: false,
          },
        };
      }
      return comId;
    });
  }

  if (dados.pesos) {
    const soma = Object.values(dados.pesos).reduce((s, v) => s + Number(v || 0), 0);
    if (soma > 0 && Math.abs(soma - 1) > 0.001) {
      dados.pesos = Object.fromEntries(
        Object.entries(dados.pesos).map(([k, v]) => [k, Math.round((Number(v || 0) / soma) * 1000) / 1000])
      );
    }
  }

  if (dados.campos_excluidos_score) {
    const extras = dados.campos_excluidos_score.filter((c) => !CAMPOS_EXCLUIDOS_SCORE_DEFAULT.includes(c));
    dados.campos_excluidos_score = [...CAMPOS_EXCLUIDOS_SCORE_DEFAULT, ...extras];
  }

  return { dados };
}

module.exports = { validarRequisitosVaga, CAMPOS_EXCLUIDOS_SCORE_DEFAULT, NATUREZAS_ELIMINATORIO_VALIDAS };
