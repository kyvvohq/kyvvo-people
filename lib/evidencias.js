// Evidence ledger — Handoff v2, Parte 5.1. Append-only: quem chama isso
// só INSERE (ver index.js — nenhuma rota de UPDATE/DELETE existe pra
// evidências, de propósito). Corrigir uma evidência é sempre uma linha
// nova apontando a antiga via substitui_evidencia_id.

const FONTES_VALIDAS = ['formulario', 'avaliacao', 'entrevista', 'manual'];
const EFEITOS_VALIDOS = ['corrobora', 'contradiz', 'parcial', 'contexto'];
// Regra 0.1 (Art. 20 LGPD): reprovação exige ator humano identificado.
// Estendido aqui pra evidência — entrevista/manual são lançadas por uma
// pessoa (recrutador), então também exigem ator_email; formulario/avaliacao
// vêm do próprio candidato preenchendo algo, não têm "ator" no sentido da
// regra.
const FONTES_QUE_EXIGEM_ATOR = ['entrevista', 'manual'];

// Valida uma evidência antes de gravar. Devolve { erro } ou { dados }
// (texto sempre trimado) — nunca muta o objeto recebido.
function validarEvidencia(dadosOriginais) {
  const dados = { ...dadosOriginais };

  if (!FONTES_VALIDAS.includes(dados.fonte)) {
    return { erro: `Fonte inválida. Use: ${FONTES_VALIDAS.join(', ')}.` };
  }
  if (!EFEITOS_VALIDOS.includes(dados.efeito)) {
    return { erro: `Efeito inválido. Use: ${EFEITOS_VALIDOS.join(', ')}.` };
  }
  if (!dados.texto || !String(dados.texto).trim()) {
    return { erro: 'Texto da evidência é obrigatório.' };
  }
  if (FONTES_QUE_EXIGEM_ATOR.includes(dados.fonte) && !dados.ator_email) {
    return { erro: `Evidência de fonte "${dados.fonte}" exige um ator humano identificado (Art. 20 LGPD).` };
  }

  dados.texto = String(dados.texto).trim();
  return { dados };
}

// Agrupa evidências por requisito_id e sinaliza contradição quando o mesmo
// requisito tem efeitos opostos (corrobora/parcial de um lado, contradiz do
// outro) — Regra 0.4/5.1: "Contradições são sempre exibidas ao recrutador,
// nunca ocultadas ou resolvidas automaticamente." Não decide qual efeito
// "vence" — só sinaliza que existe conflito, pra UI mostrar os dois.
function detectarContradicoes(evidencias) {
  const porRequisito = new Map();
  for (const ev of evidencias) {
    if (!ev.requisito_id) continue; // observação geral não entra nessa checagem
    if (!porRequisito.has(ev.requisito_id)) porRequisito.set(ev.requisito_id, []);
    porRequisito.get(ev.requisito_id).push(ev);
  }

  const contraditorios = new Set();
  for (const [requisitoId, doRequisito] of porRequisito) {
    const temContradiz = doRequisito.some((ev) => ev.efeito === 'contradiz');
    const temApoio = doRequisito.some((ev) => ev.efeito === 'corrobora' || ev.efeito === 'parcial');
    if (temContradiz && temApoio) contraditorios.add(requisitoId);
  }
  return contraditorios;
}

module.exports = { validarEvidencia, detectarContradicoes, FONTES_VALIDAS, EFEITOS_VALIDOS, FONTES_QUE_EXIGEM_ATOR };
