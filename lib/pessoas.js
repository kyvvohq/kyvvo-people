const crypto = require('crypto');
const { paraE164 } = require('./telefone');

const VALIDADE_AVALIACAO_MESES = 6;

// Dedup: telefone é a chave primária (é o que já se precisa pro WhatsApp),
// e-mail é a secundária. Nunca pede CPF aqui — CPF só existe no gate da
// avaliação (lib/inferencia.js flow), não é dado de identidade da pessoa.
async function encontrarOuCriarPessoa(pool, tenantId, { nome, email, telefone, linkedin }) {
  const telefoneE164 = paraE164(telefone);

  if (telefoneE164) {
    const { rows } = await pool.query(
      'select * from candidatos where tenant_id = $1 and telefone_e164 = $2',
      [tenantId, telefoneE164]
    );
    if (rows[0]) return rows[0];
  }
  if (email) {
    const { rows } = await pool.query(
      'select * from candidatos where tenant_id = $1 and email = $2',
      [tenantId, email]
    );
    if (rows[0]) return rows[0];
  }

  const id = crypto.randomUUID();
  const { rows } = await pool.query(
    `insert into candidatos (id, tenant_id, nome, telefone_e164, email, linkedin)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [id, tenantId, nome, telefoneE164, email || null, linkedin || null]
  );
  return rows[0];
}

// Última avaliação concluída da pessoa, se ainda estiver dentro da validade
// (perfil comportamental é razoavelmente estável — 6 meses é um corte
// defensável, não uma verdade absoluta). Retorna null se não houver uma
// reaproveitável.
async function avaliacaoReaproveitavel(pool, candidatoId) {
  const { rows } = await pool.query(
    `select * from avaliacoes
     where candidato_id = $1 and status = 'concluido'
       and concluido_em > now() - interval '${VALIDADE_AVALIACAO_MESES} months'
     order by concluido_em desc limit 1`,
    [candidatoId]
  );
  return rows[0] || null;
}

async function registrarEvento(pool, { tenantId, candidaturaId, tipo, de, para, atorEmail, payload }) {
  await pool.query(
    `insert into eventos (id, tenant_id, candidatura_id, tipo, de, para, ator_email, payload)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [crypto.randomUUID(), tenantId, candidaturaId || null, tipo, de || null, para || null, atorEmail || null, payload ? JSON.stringify(payload) : null]
  );
}

// Score de aderência = média ponderada dos componentes que o recrutador
// preencher manualmente (0-100 cada). Não existe hoje um motor de matching
// automático (currículo x descritivo) — os pesos só definem como os
// componentes lançados à mão se combinam num "geral" comparável entre
// candidaturas da mesma vaga.
function calcularScore(pesos, componentes) {
  const chaves = Object.keys(pesos).filter((k) => componentes[k] != null);
  if (!chaves.length) return null;
  const somaPesos = chaves.reduce((s, k) => s + pesos[k], 0);
  if (!somaPesos) return null;
  const geral = chaves.reduce((s, k) => s + componentes[k] * pesos[k], 0) / somaPesos;
  return { ...componentes, geral: Math.round(geral * 100) / 100 };
}

module.exports = { encontrarOuCriarPessoa, avaliacaoReaproveitavel, registrarEvento, calcularScore, VALIDADE_AVALIACAO_MESES };
