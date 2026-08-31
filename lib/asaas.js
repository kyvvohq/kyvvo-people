// Integração com a Asaas pra cobrança recorrente (Pix ou cartão) — seção 10
// da especificação. Mesmo padrão do server/panel/asaas-service.js do Kyvvo
// principal (Studio já usa isso em produção; aqui é o mesmo serviço,
// reimplementado porque são repositórios/deploys separados, não porque o
// desenho mudou). Sem as variáveis de ambiente configuradas, cai em modo de
// log (devolve um id fake) — útil em dev sem depender de conta real na
// Asaas. `ASAAS_ENV` escolhe sandbox/produção, nunca aponta pra produção
// por acidente sem a variável explícita.
const BASE_URL_SANDBOX = 'https://sandbox.asaas.com/api/v3';
const BASE_URL_PRODUCTION = 'https://www.asaas.com/api/v3';

function ambiente() {
  return process.env.ASAAS_ENV === 'production' ? 'production' : 'sandbox';
}

function baseUrl() {
  return ambiente() === 'production' ? BASE_URL_PRODUCTION : BASE_URL_SANDBOX;
}

function apiKey() {
  return ambiente() === 'production' ? process.env.ASAAS_API_KEY_PRODUCTION : process.env.ASAAS_API_KEY_SANDBOX;
}

function modoDev() {
  return !apiKey();
}

async function chamar(metodo, caminho, corpo) {
  const res = await fetch(`${baseUrl()}${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', access_token: apiKey() },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) {
    const mensagem = (dados.errors && dados.errors[0] && dados.errors[0].description) || `Asaas respondeu ${res.status}`;
    throw new Error(mensagem);
  }
  return dados;
}

// Cria (ou recupera, se já existir) o Customer no Asaas pro tenant. Em modo
// dev, devolve um id fake e loga em vez de chamar a API.
async function criarOuRecuperarCustomer({ tenantId, nome, email, whatsapp, cpfCnpj, asaasCustomerId }) {
  if (asaasCustomerId) return { id: asaasCustomerId };

  if (modoDev()) {
    const idFake = `cus_dev_${tenantId}`;
    console.log(`[asaas] (dev) customer para tenant ${tenantId} — id: ${idFake}`);
    return { id: idFake };
  }

  return chamar('POST', '/customers', {
    name: nome,
    email,
    phone: whatsapp || undefined,
    cpfCnpj,
    externalReference: tenantId,
  });
}

// Tokeniza o cartão de crédito — a Asaas não tem tokenização client-side,
// só um endpoint de servidor (POST /creditCard/tokenize), então o dado do
// cartão passa (só de passagem, nunca armazenado/logado) pelo backend do
// People antes de virar token. Em modo dev, devolve um token fake.
async function tokenizarCartao({ customerId, holderName, number, expiryMonth, expiryYear, ccv, holderInfo, remoteIp }) {
  if (modoDev()) {
    console.log(`[asaas] (dev) tokeniza cartão do customer ${customerId}`);
    return { creditCardToken: `card_dev_${customerId}` };
  }

  return chamar('POST', '/creditCard/tokenize', {
    customer: customerId,
    creditCard: { holderName, number, expiryMonth, expiryYear, ccv },
    creditCardHolderInfo: holderInfo,
    remoteIp,
  });
}

// Cria a Subscription no Asaas (Pix ou cartão). `valor`/`planoNome` sempre
// vêm do chamador (catálogo lido de GET /api/planos/people no Kyvvo
// principal, nunca hardcoded aqui). Em modo dev, devolve um id fake.
async function criarSubscription({ customerId, billingType, valor, planoNome, nextDueDate, creditCardToken, tenantId, cycle }) {
  if (modoDev()) {
    const idFake = `sub_dev_${tenantId}`;
    console.log(`[asaas] (dev) subscription ${billingType} para tenant ${tenantId} — id: ${idFake}, valor: ${valor}, ciclo: ${cycle || 'MONTHLY'}`);
    return { id: idFake };
  }

  return chamar('POST', '/subscriptions', {
    customer: customerId,
    billingType,
    value: valor,
    cycle: cycle || 'MONTHLY',
    nextDueDate,
    description: `Kyvvo People — Plano ${planoNome}`,
    creditCardToken: billingType === 'CREDIT_CARD' ? creditCardToken : undefined,
  });
}

// Troca o meio de pagamento, o valor (troca de plano) e/ou o ciclo
// (mensal/anual) de uma assinatura existente. A Asaas não faz cálculo
// proporcional nem retroage cobranças já pendentes por padrão
// (updatePendingPayments não é enviado) — o valor/ciclo novo só vale a
// partir da próxima cobrança. Em modo dev, só loga.
async function atualizarSubscription({ subscriptionId, billingType, creditCardToken, valor, cycle, planoNome, tenantId }) {
  if (modoDev()) {
    console.log(`[asaas] (dev) atualiza subscription ${subscriptionId} do tenant ${tenantId}${billingType ? ` para ${billingType}` : ''}${valor != null ? `, valor ${valor}` : ''}${cycle ? `, ciclo ${cycle}` : ''}`);
    return { id: subscriptionId };
  }

  return chamar('PUT', `/subscriptions/${subscriptionId}`, {
    billingType,
    creditCardToken: billingType === 'CREDIT_CARD' ? creditCardToken : undefined,
    value: valor,
    cycle,
    // Sem isso a description fica presa no nome do plano da criação —
    // achado 2026-08-31 testando troca Start→Professional, o painel da
    // Asaas continuava mostrando "Plano Start" depois da troca.
    description: planoNome ? `Kyvvo People — Plano ${planoNome}` : undefined,
  });
}

// Cancela a Subscription no Asaas (self-service, pelo próprio tenant). Em
// modo dev, só loga.
async function cancelarSubscription({ subscriptionId, tenantId }) {
  if (modoDev()) {
    console.log(`[asaas] (dev) cancela subscription ${subscriptionId} do tenant ${tenantId}`);
    return { deleted: true };
  }
  return chamar('DELETE', `/subscriptions/${subscriptionId}`);
}

// Próxima cobrança (data + valor) da assinatura. Em modo dev, devolve null.
async function buscarSubscription(subscriptionId) {
  if (modoDev() || !subscriptionId) return null;
  return chamar('GET', `/subscriptions/${subscriptionId}`);
}

module.exports = {
  ambiente,
  modoDev,
  criarOuRecuperarCustomer,
  tokenizarCartao,
  criarSubscription,
  atualizarSubscription,
  cancelarSubscription,
  buscarSubscription,
};
