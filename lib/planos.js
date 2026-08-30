// Catálogo de planos do People — lido de GET /api/planos/people no Kyvvo
// principal (mesmo servidor que já valida login/acesso ao módulo, ver
// KYVVO_APP_URL em index.js), nunca hardcoded aqui. Preço é editado só pelo
// admin da Kyvvo, no mesmo lugar onde já edita os planos do Studio (seção
// 10 da especificação + pedido do Bruno em 2026-08-30: "conforme o portal
// studio.kyvvo.com.br"). Sem cache — a tela de cobrança é baixo tráfego,
// não vale a complexidade de invalidação; cada leitura busca o valor atual.
async function buscarPlanos(kyvvoAppUrl) {
  const res = await fetch(`${kyvvoAppUrl}/api/planos/people`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Kyvvo respondeu ${res.status} ao buscar planos`);
  return res.json();
}

async function buscarPlano(kyvvoAppUrl, chave) {
  const planos = await buscarPlanos(kyvvoAppUrl);
  return planos.find((p) => p.chave === chave) || null;
}

module.exports = { buscarPlanos, buscarPlano };
