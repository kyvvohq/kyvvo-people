require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const Fastify = require('fastify');
const fastifyJwt = require('@fastify/jwt');
const fastifyStatic = require('@fastify/static');
const fastifyMultipart = require('@fastify/multipart');

const { pool, migrar } = require('./lib/db');
const { calcularResultado, CARACTERISTICAS } = require('./lib/inferencia');
const { montarResumo } = require('./lib/conteudo');
const { enviarLinkAvaliacao } = require('./lib/email');
const { gerarRelatorioPdf } = require('./lib/pdf');
const { extrairTexto, extrairCamposDoTexto } = require('./lib/curriculo');
const { encontrarOuCriarPessoa, avaliacaoReaproveitavel, registrarEvento, calcularScore } = require('./lib/pessoas');
const { mascararNome, mascararEmail, mascararTelefone } = require('./lib/mascarar');
const asaas = require('./lib/asaas');
const planosPeople = require('./lib/planos');

const PORT = process.env.PORT || 3002;
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://people.kyvvo.com.br';
// Identidade/sessão saiu do painel do Studio pro serviço kyvvo-platform
// (corte P3). Default = endereço interno na rede do compose (sem hairpin
// pela internet). O login do People passa a não depender do painel do Studio
// estar no ar.
const PLATFORM_URL = process.env.PLATFORM_URL || 'http://platform:3003';
// Ainda o painel do Studio: catálogo de planos do People (GET /api/planos/people,
// editado no admin do Studio) — não migrou pro platform ainda.
const KYVVO_APP_URL = process.env.KYVVO_APP_URL || 'https://studio.kyvvo.com.br';

// Lista pública das características (sem os pesos de tipo psicológico/OCEAN — só o que o
// candidato precisa ver na tela de avaliação).
const CARACTERISTICAS_PUBLICAS = CARACTERISTICAS.map((c) => ({ id: c.id, texto: c.caracteristica }));

async function build() {
  const fastify = Fastify({ logger: true });

  fastify.register(fastifyJwt, { secret: process.env.PEOPLE_JWT_SECRET });

  // Mesmo padrão do `authenticateAdmin` do painel principal (server/panel/index.js):
  // secret próprio, sem lookup em banco por request — adequado pra 1 usuário fixo.
  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Não autenticado' });
    }
  });

  fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/people/',
  });

  // Tokens do design system, servidos crus de node_modules (não há bundler).
  fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'node_modules', '@kyvvohq', 'design-system'),
    prefix: '/ds/',
    decorateReply: false,
  });

  fastify.register(fastifyMultipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });

  // Landing page (marketing, pública) — mesmo padrão de reply.sendFile já
  // usado por /people/avaliacao/:token, ignora o prefixo /people/ do
  // registro acima (sendFile resolve pelo `root`, não pela rota).
  fastify.get('/', async (request, reply) => reply.sendFile('index.html'));

  // --- Auth: valida contra o serviço kyvvo-platform (identidade/sessão) em
  // vez de credencial fixa — qualquer usuário Kyvvo com o módulo "people"
  // ativo pode entrar. O People nunca vê/toca usuarios/tenants: só confia numa
  // checagem servidor-a-servidor (POST /api/auth/login + GET
  // /api/auth/people/acesso na plataforma) e emite seu próprio JWT interno
  // (12h, PEOPLE_JWT_SECRET) depois.
  fastify.post('/people/api/login', async (request, reply) => {
    const { email, senha } = request.body || {};
    if (!email || !senha) {
      return reply.code(400).send({ error: 'E-mail e senha são obrigatórios' });
    }

    let loginRes;
    try {
      loginRes = await fetch(`${PLATFORM_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      request.log.error(`Falha ao contatar o serviço de identidade (kyvvo-platform): ${err.message}`);
      return reply.code(502).send({ error: 'Não foi possível validar o login agora. Tente novamente em instantes.' });
    }
    if (!loginRes.ok) {
      const dados = await loginRes.json().catch(() => ({}));
      return reply.code(401).send({ error: dados.error || 'E-mail ou senha inválidos' });
    }
    const { token: kyvvoToken, nome } = await loginRes.json();

    let acessoRes;
    try {
      acessoRes = await fetch(`${PLATFORM_URL}/api/auth/people/acesso`, {
        headers: { Authorization: `Bearer ${kyvvoToken}` },
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      request.log.error(`Falha ao checar acesso ao módulo people: ${err.message}`);
      return reply.code(502).send({ error: 'Não foi possível validar o login agora. Tente novamente em instantes.' });
    }
    if (!acessoRes.ok) {
      return reply.code(403).send({ error: 'Sua conta Kyvvo não tem acesso ao módulo People.' });
    }
    const { tenantId } = await acessoRes.json();

    // Cria a linha de assinatura (status 'sem_assinatura' por padrão — o
    // People não tem teste grátis, ver migration 014) no primeiro login do
    // tenant. ON CONFLICT DO NOTHING: idempotente, login seguinte não mexe.
    await pool.query('insert into assinaturas (tenant_id) values ($1) on conflict (tenant_id) do nothing', [tenantId]);

    const token = fastify.jwt.sign({ tenantId, email, nome }, { expiresIn: '12h' });
    return { token, nome };
  });

  // --- Pagamentos / Asaas (seção 10 da especificação) ---
  // Preço lido de GET /api/planos/people no Kyvvo principal (admin edita lá,
  // mesmo lugar que já edita os planos do Studio) — nunca hardcoded aqui.
  const CARTAO_FINAL_REGEX = /^\d{4}$/;
  // A Asaas exige CPF (11 dígitos) ou CNPJ (14) do Customer pra emitir
  // cobrança — mesma exigência descoberta pelo time do Studio ao testar com
  // uma chave de API real.
  const CPF_CNPJ_REGEX = /^\d{11}$|^\d{14}$/;
  const UF_VALIDAS = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR',
    'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
  ];
  // Anual = valor da parcela mensal × 10 (2 meses de desconto), sempre
  // calculado aqui a partir de planoInfo.preco_mensal — nunca aceito do
  // cliente. `cycle` já sai no formato que a API da Asaas espera.
  const MULTIPLICADOR_CICLO = { mensal: 1, anual: 10 };
  const CICLO_ASAAS = { mensal: 'MONTHLY', anual: 'YEARLY' };
  function montarResumoPagamento(a) {
    if (!a) return null;
    return {
      plano: a.plano,
      ciclo: a.ciclo,
      status: a.status,
      asaas_meio_pagamento: a.asaas_meio_pagamento,
      asaas_cartao_final: a.asaas_cartao_final,
      cpf_cnpj: a.cpf_cnpj,
      contato_telefone: a.contato_telefone,
      tem_assinatura: Boolean(a.asaas_subscription_id),
      cancelado_em: a.cancelado_em,
      acesso_ate: a.acesso_ate,
    };
  }

  fastify.get('/people/api/pagamentos', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query('select * from assinaturas where tenant_id = $1', [request.user.tenantId]);
    if (!rows[0]) return reply.code(404).send({ error: 'Assinatura não encontrada' });
    return montarResumoPagamento(rows[0]);
  });

  fastify.get('/people/api/pagamentos/planos', { preHandler: fastify.authenticate }, async (request, reply) => {
    try {
      return await planosPeople.buscarPlanos(KYVVO_APP_URL);
    } catch (err) {
      request.log.error(`Falha ao buscar planos do People: ${err.message}`);
      return reply.code(502).send({ error: 'Não foi possível carregar os planos agora. Tente novamente em instantes.' });
    }
  });

  // Orquestra Customer + Subscription no Asaas — cria na primeira vez; se o
  // tenant já tem assinatura, só troca o meio de pagamento (atualiza, nunca
  // cancela). Cartão: número/validade/CVV chegam brutos (via HTTPS) e são
  // tokenizados neste handler, nunca armazenados nem logados — só repassados
  // à Asaas e descartados.
  fastify.post('/people/api/pagamentos/cadastrar', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { tenantId, email, nome } = request.user;
    const {
      plano: planoChave,
      meio,
      ciclo: cicloBruto,
      cpf_cnpj: cpfCnpjBruto,
      cartao_numero: cartaoNumeroBruto,
      cartao_nome: cartaoNome,
      cartao_validade_mes: cartaoValidadeMes,
      cartao_validade_ano: cartaoValidadeAno,
      cartao_cvv: cartaoCvv,
      telefone: telefoneBruto,
      endereco: enderecoBruto,
    } = request.body || {};

    if (!['pix', 'cartao'].includes(meio)) {
      return reply.code(400).send({ error: 'Campo "meio" deve ser "pix" ou "cartao"' });
    }

    const cartaoNumeroLimpo = String(cartaoNumeroBruto || '').replace(/\D/g, '');
    if (meio === 'cartao') {
      if (!CARTAO_FINAL_REGEX.test(cartaoNumeroLimpo.slice(-4))) {
        return reply.code(400).send({ error: 'Informe um número de cartão válido.' });
      }
      if (!(cartaoNome || '').trim()) {
        return reply.code(400).send({ error: 'Informe o nome impresso no cartão.' });
      }
      if (!/^\d{1,2}$/.test(cartaoValidadeMes || '') || !/^\d{4}$/.test(cartaoValidadeAno || '')) {
        return reply.code(400).send({ error: 'Informe a validade do cartão (MM/AAAA).' });
      }
      if (!/^\d{3,4}$/.test(cartaoCvv || '')) {
        return reply.code(400).send({ error: 'Informe o CVV do cartão.' });
      }
    }

    const { rows } = await pool.query('select * from assinaturas where tenant_id = $1', [tenantId]);
    const assinatura = rows[0];
    if (!assinatura) return reply.code(404).send({ error: 'Assinatura não encontrada' });

    const ciclo = ['mensal', 'anual'].includes(cicloBruto) ? cicloBruto : (assinatura.ciclo || 'mensal');

    const cpfCnpjLimpo = String(cpfCnpjBruto || '').replace(/\D/g, '') || assinatura.cpf_cnpj;
    if (!assinatura.asaas_customer_id && !CPF_CNPJ_REGEX.test(cpfCnpjLimpo || '')) {
      return reply.code(400).send({ error: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.' });
    }

    // A Asaas exige o telefone (celular, DDD + 9 dígitos) do titular do
    // cartão pra tokenizar — "Informe o número de contato com DDD do
    // titular do cartão" se faltar. Reaproveita o valor já salvo (mesmo
    // padrão do CPF/CNPJ) pra não pedir de novo em toda troca de cartão.
    const telefoneLimpo = String(telefoneBruto || '').replace(/\D/g, '') || assinatura.contato_telefone;
    if (meio === 'cartao' && !/^\d{10,11}$/.test(telefoneLimpo || '')) {
      return reply.code(400).send({ error: 'Informe o telefone (com DDD) do titular do cartão.' });
    }

    let endereco = {
      cep: assinatura.endereco_cep,
      logradouro: assinatura.endereco_logradouro,
      numero: assinatura.endereco_numero,
      complemento: assinatura.endereco_complemento,
      bairro: assinatura.endereco_bairro,
      cidade: assinatura.endereco_cidade,
      uf: assinatura.endereco_uf,
    };
    if (meio === 'cartao') {
      if (enderecoBruto) {
        const { cep, logradouro, numero, complemento, bairro, cidade, uf } = enderecoBruto;
        const cepLimpo = String(cep || '').replace(/\D/g, '');
        const enderecoValido =
          /^\d{8}$/.test(cepLimpo) &&
          (logradouro || '').trim() &&
          (numero || '').trim() &&
          (bairro || '').trim() &&
          (cidade || '').trim() &&
          UF_VALIDAS.includes(String(uf || '').toUpperCase());
        if (!enderecoValido) {
          return reply.code(400).send({ error: 'Preencha todos os campos do endereço.' });
        }
        endereco = {
          cep: cepLimpo, logradouro: logradouro.trim(), numero: numero.trim(),
          complemento: (complemento || '').trim() || null, bairro: bairro.trim(),
          cidade: cidade.trim(), uf: String(uf).toUpperCase(),
        };
      } else if (!(endereco.cep && endereco.numero)) {
        return reply.code(400).send({ error: 'Informe seu endereço para cadastrar um cartão.' });
      }
    }

    const chavePlano = assinatura.plano || planoChave;
    if (!chavePlano) return reply.code(400).send({ error: 'Escolha um plano.' });
    let planoInfo;
    try {
      planoInfo = await planosPeople.buscarPlano(KYVVO_APP_URL, chavePlano);
    } catch (err) {
      request.log.error(`Falha ao buscar plano ${chavePlano}: ${err.message}`);
      return reply.code(502).send({ error: 'Não foi possível confirmar o plano agora. Tente novamente em instantes.' });
    }
    if (!planoInfo) return reply.code(400).send({ error: 'Plano não encontrado.' });

    const billingType = meio === 'pix' ? 'PIX' : 'CREDIT_CARD';
    const cartaoFinal = meio === 'cartao' ? cartaoNumeroLimpo.slice(-4) : null;

    let customer;
    let subscriptionId;
    let assinaturaNova = false;
    try {
      customer = await asaas.criarOuRecuperarCustomer({
        tenantId, nome, email, cpfCnpj: cpfCnpjLimpo, asaasCustomerId: assinatura.asaas_customer_id,
      });

      let creditCardToken;
      if (meio === 'cartao') {
        const tokenizado = await asaas.tokenizarCartao({
          customerId: customer.id,
          holderName: cartaoNome.trim(),
          number: cartaoNumeroLimpo,
          expiryMonth: cartaoValidadeMes,
          expiryYear: cartaoValidadeAno,
          ccv: cartaoCvv,
          holderInfo: {
            name: nome,
            email,
            cpfCnpj: cpfCnpjLimpo,
            postalCode: endereco.cep,
            addressNumber: endereco.numero,
            addressComplement: endereco.complemento || undefined,
            mobilePhone: telefoneLimpo,
          },
          remoteIp: request.ip,
        });
        creditCardToken = tokenizado.creditCardToken;
      }

      const valorCiclo = Number(planoInfo.preco_mensal) * MULTIPLICADOR_CICLO[ciclo];

      if (assinatura.asaas_subscription_id && assinatura.status !== 'cancelado') {
        await asaas.atualizarSubscription({
          subscriptionId: assinatura.asaas_subscription_id, billingType, creditCardToken,
          valor: valorCiclo, cycle: CICLO_ASAAS[ciclo], planoNome: planoInfo.nome, tenantId,
        });
        subscriptionId = assinatura.asaas_subscription_id;
      } else {
        const subscription = await asaas.criarSubscription({
          customerId: customer.id, billingType, valor: valorCiclo, planoNome: planoInfo.nome,
          nextDueDate: new Date().toISOString().slice(0, 10), creditCardToken, tenantId, cycle: CICLO_ASAAS[ciclo],
        });
        subscriptionId = subscription.id;
        assinaturaNova = true;
      }
    } catch (erro) {
      request.log.error(`Falha na integração com a Asaas para tenant ${tenantId}: ${erro.message}`);
      return reply.code(400).send({ error: 'Não foi possível processar o pagamento agora. Tente novamente em instantes.' });
    }

    // Criar a Subscription não significa que já foi paga — Pix só confirma
    // quando o candidato de fato paga o QR code/copia-e-cola (evento
    // assíncrono, pode nunca acontecer), e cartão pode ser recusado na
    // cobrança da primeira fatura. Correção: 'ativo' só quando o webhook
    // confirmar de verdade (PAYMENT_CONFIRMED/PAYMENT_RECEIVED) — até lá
    // fica 'pendente'. Só se aplica a assinatura NOVA; trocar de forma de
    // pagamento numa assinatura já ativa não mexe no status atual (não é
    // uma cobrança nova acontecendo agora, é só atualização de cadastro).
    const novoStatus = assinaturaNova ? 'pendente' : assinatura.status;

    const { rows: atualizado } = await pool.query(
      `update assinaturas set
         asaas_customer_id = $2, asaas_subscription_id = $3, plano = $4, status = $5,
         asaas_meio_pagamento = $6, asaas_cartao_final = $7, cpf_cnpj = $8,
         endereco_cep = $9, endereco_logradouro = $10, endereco_numero = $11, endereco_complemento = $12,
         endereco_bairro = $13, endereco_cidade = $14, endereco_uf = $15, contato_telefone = $16, ciclo = $17,
         cancelado_em = null, acesso_ate = null, status_alterado_em = now(), atualizado_em = now()
       where tenant_id = $1
       returning *`,
      [
        tenantId, customer.id, subscriptionId, planoInfo.chave, novoStatus, meio,
        meio === 'cartao' ? cartaoFinal : null, cpfCnpjLimpo,
        endereco.cep, endereco.logradouro, endereco.numero, endereco.complemento, endereco.bairro, endereco.cidade, endereco.uf,
        telefoneLimpo || null, ciclo,
      ]
    );

    return montarResumoPagamento(atualizado[0]);
  });

  fastify.patch('/people/api/pagamentos/plano', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { tenantId } = request.user;
    const { plano: planoChave, ciclo: cicloBruto } = request.body || {};

    let planoInfo;
    try {
      planoInfo = await planosPeople.buscarPlano(KYVVO_APP_URL, planoChave);
    } catch (err) {
      request.log.error(`Falha ao buscar plano ${planoChave}: ${err.message}`);
      return reply.code(502).send({ error: 'Não foi possível confirmar o plano agora. Tente novamente em instantes.' });
    }
    if (!planoInfo) return reply.code(400).send({ error: 'Plano inválido ou não disponível.' });

    const { rows } = await pool.query('select * from assinaturas where tenant_id = $1', [tenantId]);
    const assinatura = rows[0];
    if (!assinatura || !assinatura.asaas_subscription_id || assinatura.status === 'cancelado') {
      return reply.code(400).send({ error: 'Nenhuma assinatura ativa pra trocar de plano. Cadastre uma forma de pagamento primeiro.' });
    }
    const ciclo = ['mensal', 'anual'].includes(cicloBruto) ? cicloBruto : assinatura.ciclo;
    if (assinatura.plano === planoInfo.chave && assinatura.ciclo === ciclo) {
      return reply.code(400).send({ error: 'Você já está nesse plano.' });
    }

    const valorCiclo = Number(planoInfo.preco_mensal) * MULTIPLICADOR_CICLO[ciclo];
    try {
      await asaas.atualizarSubscription({
        subscriptionId: assinatura.asaas_subscription_id, valor: valorCiclo, cycle: CICLO_ASAAS[ciclo],
        planoNome: planoInfo.nome, tenantId,
      });
    } catch (erro) {
      request.log.error(`Falha ao trocar plano do tenant ${tenantId} para ${planoInfo.chave}/${ciclo}: ${erro.message}`);
      return reply.code(400).send({ error: 'Não foi possível trocar de plano agora. Tente novamente em instantes.' });
    }

    const { rows: atualizado } = await pool.query(
      'update assinaturas set plano = $2, ciclo = $3, atualizado_em = now() where tenant_id = $1 returning *',
      [tenantId, planoInfo.chave, ciclo]
    );
    return montarResumoPagamento(atualizado[0]);
  });

  fastify.delete('/people/api/pagamentos/assinatura', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { tenantId } = request.user;
    const { rows } = await pool.query('select * from assinaturas where tenant_id = $1', [tenantId]);
    const assinatura = rows[0];
    if (!assinatura) return reply.code(404).send({ error: 'Assinatura não encontrada' });
    // 'pendente' inclui de propósito — cancelar antes da 1ª confirmação
    // (ex: desistiu de pagar o Pix) precisa ser possível, não só depois de
    // já estar 'ativo'.
    if (!['ativo', 'pendente', 'inadimplente'].includes(assinatura.status)) {
      return reply.code(400).send({ error: 'Não há assinatura em cobrança pra cancelar.' });
    }
    if (!assinatura.asaas_subscription_id) {
      return reply.code(400).send({ error: 'Nenhuma assinatura encontrada para cancelar.' });
    }

    let acessoAte;
    try {
      const subscription = await asaas.buscarSubscription(assinatura.asaas_subscription_id);
      acessoAte = subscription ? subscription.nextDueDate : null;
      await asaas.cancelarSubscription({ subscriptionId: assinatura.asaas_subscription_id, tenantId });
    } catch (erro) {
      request.log.error(`Falha ao cancelar assinatura na Asaas para tenant ${tenantId}: ${erro.message}`);
      return reply.code(400).send({ error: 'Não foi possível cancelar a assinatura agora. Tente novamente em instantes.' });
    }

    await pool.query(
      `update assinaturas set status = 'cancelado', cancelado_em = now(), acesso_ate = $2, status_alterado_em = now(), atualizado_em = now() where tenant_id = $1`,
      [tenantId, acessoAte]
    );
    return { cancelado: true, acesso_ate: acessoAte };
  });

  // Webhook da Asaas: atualiza o status da assinatura conforme o evento da
  // cobrança. Sem fastify.authenticate — quem chama é a Asaas, não um
  // usuário logado; a validação é pelo token no header.
  // SUBSCRIPTION_CANCELLED não existe na API da Asaas (achado 2026-08-31
  // consultando GET /v3/webhooks — a lista de eventos que a conta realmente
  // dispara não tem esse nome) — o evento certo pra assinatura removida via
  // DELETE /subscriptions/:id (mesma chamada que cancelarSubscription faz)
  // é SUBSCRIPTION_DELETED. server/panel/routes/pagamentos.js do Kyvvo
  // principal tem esse mesmo mapeamento errado — não corrigido lá agora,
  // só aqui.
  // PAYMENT_REFUNDED/PAYMENT_CHARGEBACK_REQUESTED faltavam (achado
  // 2026-08-31: Bruno estornou um Pix de teste e a assinatura continuou
  // 'ativo', porque nenhum dos dois eventos tinha mapeamento — a Asaas
  // pode até ter disparado certinho, meu código simplesmente ignorava por
  // não reconhecer o evento).
  const ASAAS_EVENTO_PARA_STATUS = {
    PAYMENT_CONFIRMED: 'ativo',
    PAYMENT_RECEIVED: 'ativo',
    PAYMENT_OVERDUE: 'inadimplente',
    PAYMENT_DELETED: 'suspenso',
    PAYMENT_REFUNDED: 'suspenso',
    PAYMENT_CHARGEBACK_REQUESTED: 'suspenso',
    SUBSCRIPTION_DELETED: 'cancelado',
  };

  fastify.post('/people/webhooks/asaas', async (request, reply) => {
    const tokenEsperado = process.env.ASAAS_WEBHOOK_TOKEN;
    const tokenRecebido = request.headers['asaas-access-token'];
    if (!tokenEsperado || tokenRecebido !== tokenEsperado) {
      return reply.code(401).send({ error: 'Token de webhook inválido' });
    }

    const { event, payment, subscription } = request.body || {};
    const novoStatus = ASAAS_EVENTO_PARA_STATUS[event];
    if (!novoStatus) {
      // Loga em vez de só ignorar — foi assim que PAYMENT_REFUNDED passou
      // batido antes (evento sem mapeamento nunca deixava rastro nenhum).
      request.log.info(`Webhook Asaas: evento "${event}" sem mapeamento, ignorado`);
      return { ok: true };
    }
    const subscriptionId = (payment && payment.subscription) || (subscription && subscription.id);
    if (!subscriptionId) return { ok: true };

    await pool.query(
      `update assinaturas set status = $2, status_alterado_em = now(), atualizado_em = now()
       where asaas_subscription_id = $1 and status is distinct from $2`,
      [subscriptionId, novoStatus]
    );
    return { ok: true };
  });

  // --- Portal da psicóloga (autenticado) ---

  // Lista TODOS os candidatos (pessoa) da conta, não só quem já tem
  // avaliação — cada linha traz a avaliação mais recente (se houver) via
  // LEFT JOIN LATERAL, pra tela de Avaliações poder encaminhar o convite
  // pra quem ainda não tem uma. `status`/`id` continuam no formato que
  // painel.html e avaliacoes.html já esperavam (id = avaliação, quando
  // existir) — id do candidato vai à parte em `candidato_id`.
  fastify.get('/people/api/avaliacoes', { preHandler: fastify.authenticate }, async (request) => {
    const { rows } = await pool.query(
      `select p.id as candidato_id, p.nome, p.email, p.telefone_e164 as whatsapp, p.criado_em,
              av.id, av.status, av.concluido_em
       from candidatos p
       left join lateral (
         select * from avaliacoes a2 where a2.candidato_id = p.id order by a2.criado_em desc limit 1
       ) av on true
       where p.tenant_id = $1 and p.anonimizado_em is null
       order by p.criado_em desc`,
      [request.user.tenantId]
    );
    return rows;
  });

  // Encaminha (ou reenvia) o convite de avaliação pra um candidato já
  // cadastrado — não pede nenhum dado de novo, já tem tudo pelo
  // candidato_id. O gate de acesso ao link não é mais CPF, é o e-mail já
  // cadastrado no perfil (candidatos.email) — ver validar-email abaixo.
  // Se já existe uma avaliação pendente/em andamento, reenvia o mesmo
  // link em vez de criar uma nova.
  fastify.post('/people/api/candidatos/:id/enviar-avaliacao', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows: pessoaRows } = await pool.query(
      'select id, nome, email, anonimizado_em from candidatos where id = $1 and tenant_id = $2',
      [request.params.id, request.user.tenantId]
    );
    const pessoa = pessoaRows[0];
    if (!pessoa) return reply.code(404).send({ error: 'Candidato não encontrado' });
    if (pessoa.anonimizado_em) return reply.code(409).send({ error: 'Candidato está mascarado — reverta antes de enviar avaliação' });
    if (!pessoa.email) return reply.code(409).send({ error: 'Candidato não tem e-mail cadastrado' });

    const { rows: abertasRows } = await pool.query(
      "select id, token from avaliacoes where candidato_id = $1 and status in ('pendente', 'iniciado') order by criado_em desc limit 1",
      [pessoa.id]
    );
    if (abertasRows[0]) {
      const link = `${PUBLIC_URL}/people/avaliacao/${abertasRows[0].token}`;
      await enviarLinkAvaliacao({ email: pessoa.email, nome: pessoa.nome, link });
      return reply.code(200).send({ id: abertasRows[0].id, link, reenviada: true });
    }

    const reaproveitavel = await avaliacaoReaproveitavel(pool, pessoa.id);
    if (reaproveitavel) {
      return reply.code(200).send({ id: reaproveitavel.id, reaproveitada: true, concluido_em: reaproveitavel.concluido_em });
    }

    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    await pool.query(
      'insert into avaliacoes (id, tenant_id, candidato_id, token) values ($1, $2, $3, $4)',
      [id, request.user.tenantId, pessoa.id, token]
    );
    const link = `${PUBLIC_URL}/people/avaliacao/${token}`;
    await enviarLinkAvaliacao({ email: pessoa.email, nome: pessoa.nome, link });
    return reply.code(201).send({ id, link, reaproveitada: false });
  });

  fastify.get('/people/api/avaliacoes/:id/relatorio', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query(
      `select a.*, p.nome from avaliacoes a join candidatos p on p.id = a.candidato_id
       where a.id = $1 and a.tenant_id = $2`,
      [request.params.id, request.user.tenantId]
    );
    const avaliacao = rows[0];
    if (!avaliacao) return reply.code(404).send({ error: 'Avaliação não encontrada' });
    if (avaliacao.status !== 'concluido') {
      return reply.code(409).send({ error: 'Avaliação ainda não foi concluída' });
    }
    return { ...avaliacao, resumo: montarResumo(avaliacao.resultado, avaliacao.nome) };
  });

  fastify.get('/people/api/avaliacoes/:id/relatorio.pdf', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query(
      `select a.*, p.nome from avaliacoes a join candidatos p on p.id = a.candidato_id
       where a.id = $1 and a.tenant_id = $2`,
      [request.params.id, request.user.tenantId]
    );
    const avaliacao = rows[0];
    if (!avaliacao) return reply.code(404).send({ error: 'Avaliação não encontrada' });
    if (avaliacao.status !== 'concluido') {
      return reply.code(409).send({ error: 'Avaliação ainda não foi concluída' });
    }

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="relatorio-${avaliacao.nome.replace(/\s+/g, '-')}.pdf"`);
    const resumo = montarResumo(avaliacao.resultado, avaliacao.nome);
    const doc = gerarRelatorioPdf(avaliacao, resumo);
    return reply.send(doc);
  });

  // Arquiva a tentativa atual em `avaliacoes_historico` e reseta a avaliação
  // pra 'pendente', mantendo o mesmo token/link — decisão da psicóloga, o
  // candidato não pode se autodestravar depois de concluído.
  fastify.post('/people/api/avaliacoes/:id/refazer', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query('select * from avaliacoes where id = $1 and tenant_id = $2', [request.params.id, request.user.tenantId]);
    const avaliacao = rows[0];
    if (!avaliacao) return reply.code(404).send({ error: 'Avaliação não encontrada' });
    if (avaliacao.status !== 'concluido') {
      return reply.code(409).send({ error: 'Só é possível refazer uma avaliação já concluída' });
    }

    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into avaliacoes_historico (id, avaliacao_id, respostas_rodada1, respostas_rodada2, resultado, concluido_em)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          crypto.randomUUID(),
          avaliacao.id,
          JSON.stringify(avaliacao.respostas_rodada1),
          JSON.stringify(avaliacao.respostas_rodada2),
          JSON.stringify(avaliacao.resultado),
          avaliacao.concluido_em,
        ]
      );
      await client.query(
        `update avaliacoes
         set status = 'pendente', respostas_rodada1 = null, respostas_rodada2 = null,
             resultado = null, iniciado_em = null, concluido_em = null
         where id = $1`,
        [avaliacao.id]
      );
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }

    return { ok: true, link: `${PUBLIC_URL}/people/avaliacao/${avaliacao.token}` };
  });

  // --- Vagas (autenticado) ---
  // Redesenho do formulário (2026-08-31): código/cargo/competências saíram
  // (colunas continuam no banco pra não perder dado de vaga antiga, só não
  // são mais coletadas); nível de experiência deixou de ser obrigatório.
  const CAMPOS_VAGA_OBRIGATORIOS = ['nome', 'descricao', 'requisitos'];
  const CAMPOS_VAGA_EDITAVEIS = [
    'nome', 'empresa', 'cidade', 'descricao', 'salario', 'modalidade', 'tipo_vaga',
    'nivel_experiencia', 'requisitos', 'status', 'pesos',
    'requisitos_estruturados', 'limites', 'campos_excluidos_score',
  ];
  const CAMPOS_VAGA_JSONB = ['pesos', 'requisitos_estruturados', 'limites', 'campos_excluidos_score'];
  const STATUS_VAGA_VALIDOS = ['rascunho', 'nova', 'em_andamento', 'pausada', 'encerrada'];
  const TIPO_VAGA_VALIDOS = ['CLT', 'PJ', 'Estágio', 'Integral', 'Meio período'];

  // Lista fixa do que o motor de match nunca deve considerar — o
  // recrutador só pode ADICIONAR itens, nunca remover os defaults
  // (seção 3.1/9.3 da especificação, evita viés indireto no score).
  const CAMPOS_EXCLUIDOS_SCORE_DEFAULT = [
    'idade', 'ano_formatura', 'genero', 'estado_civil', 'nome', 'foto',
    'endereco_completo', 'gaps_temporais_nao_justificados',
  ];

  // Valida e normaliza os campos estruturados de match antes de gravar
  // (mutando `dados` in place) — regras obrigatórias da seção 3.1 da
  // especificação (2026-08-28): eliminatórios limitados, curva de
  // experiência sempre presente quando há anos_minimos (aqui gerada
  // automaticamente como linear — não existe ainda editor de curva no
  // front, é fundação pro motor de match, não o motor em si), pesos
  // somando 1.0, campos excluídos do score nunca reduzidos.
  function validarRequisitosVaga(dados) {
    if (dados.requisitos_estruturados) {
      const limites = dados.limites || { max_eliminatorios: 3 };
      const eliminatorios = dados.requisitos_estruturados.filter((r) => r.nivel_exigido === 'eliminatorio');
      if (eliminatorios.length > (limites.max_eliminatorios ?? 3)) {
        return `Máximo de ${limites.max_eliminatorios ?? 3} requisitos eliminatórios (tem ${eliminatorios.length}) — rebaixe o mais fraco pra "importante"`;
      }
      dados.requisitos_estruturados = dados.requisitos_estruturados.map((r) => {
        if (r.categoria === 'experiencia' && r.anos_minimos != null && !r.curva_experiencia) {
          return {
            ...r,
            curva_experiencia: {
              tipo: 'linear_auto',
              pontos: [{ anos: 0, score: 0 }, { anos: r.anos_minimos, score: 1 }],
              penaliza_excesso: false,
            },
          };
        }
        return r;
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
    return null;
  }

  fastify.post('/people/api/vagas', { preHandler: fastify.authenticate }, async (request, reply) => {
    const dados = request.body || {};
    if (!dados.nome) return reply.code(400).send({ error: 'Nome da vaga é obrigatório' });

    const rascunho = Boolean(dados.rascunho);
    if (!rascunho) {
      const faltando = CAMPOS_VAGA_OBRIGATORIOS.filter((campo) => !dados[campo]);
      if (faltando.length) {
        return reply.code(400).send({ error: `Campos obrigatórios faltando: ${faltando.join(', ')}` });
      }
    }
    if (dados.tipo_vaga && !TIPO_VAGA_VALIDOS.includes(dados.tipo_vaga)) {
      return reply.code(400).send({ error: 'Tipo de vaga inválido' });
    }
    const erroValidacao = validarRequisitosVaga(dados);
    if (erroValidacao) return reply.code(400).send({ error: erroValidacao });

    const id = crypto.randomUUID();
    const camposOpcionais = ['pesos', 'requisitos_estruturados', 'limites', 'campos_excluidos_score'].filter((c) => dados[c] !== undefined);
    const colunas = ['id', 'tenant_id', 'nome', 'empresa', 'cidade', 'descricao', 'salario', 'modalidade', 'tipo_vaga', 'nivel_experiencia', 'requisitos', 'status', ...camposOpcionais];
    const valoresBase = [
      id, request.user.tenantId, dados.nome, dados.empresa || null, dados.cidade || null, dados.descricao || null,
      dados.salario || null, dados.modalidade || null, dados.tipo_vaga || null, dados.nivel_experiencia || null,
      dados.requisitos || null,
      rascunho ? 'rascunho' : 'nova',
    ];
    const valoresOpcionais = camposOpcionais.map((c) => JSON.stringify(dados[c]));
    const placeholders = colunas.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(`insert into vagas (${colunas.join(', ')}) values (${placeholders})`, [...valoresBase, ...valoresOpcionais]);
    return reply.code(201).send({ id });
  });

  // "Em andamento" aqui é por etapa, não pelo status de 3 valores da
  // candidatura (nova/reprovada/aprovada — não tem meio-termo nesse
  // campo): novo = ainda na coluna fixa "Nova" do quadro (etapa_id nulo);
  // em andamento = já foi movido pra alguma etapa e continua ativo
  // (status ainda 'nova'); reprovada/aprovada não contam em nenhum dos
  // dois totais (já saíram do funil).
  fastify.get('/people/api/vagas', { preHandler: fastify.authenticate }, async (request) => {
    const { rows } = await pool.query(
      `select v.id, v.codigo, v.nome, v.cargo, v.status, v.criado_em,
              count(c.id) as total_candidatos,
              count(c.id) filter (where c.status = 'nova' and c.etapa_id is not null) as total_em_andamento
       from vagas v
       left join candidaturas c on c.vaga_id = v.id
       where v.tenant_id = $1
       group by v.id
       order by v.criado_em desc`,
      [request.user.tenantId]
    );
    return rows.map((v) => ({ ...v, total_candidatos: Number(v.total_candidatos), total_em_andamento: Number(v.total_em_andamento) }));
  });

  fastify.get('/people/api/vagas/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query('select * from vagas where id = $1 and tenant_id = $2', [request.params.id, request.user.tenantId]);
    if (!rows[0]) return reply.code(404).send({ error: 'Vaga não encontrada' });
    return rows[0];
  });

  fastify.patch('/people/api/vagas/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const dados = request.body || {};
    const campos = Object.keys(dados).filter((campo) => CAMPOS_VAGA_EDITAVEIS.includes(campo));
    if (!campos.length) {
      return reply.code(400).send({ error: 'Nenhum campo válido para atualizar' });
    }
    if (dados.status && !STATUS_VAGA_VALIDOS.includes(dados.status)) {
      return reply.code(400).send({ error: 'Status inválido' });
    }
    if (dados.tipo_vaga && !TIPO_VAGA_VALIDOS.includes(dados.tipo_vaga)) {
      return reply.code(400).send({ error: 'Tipo de vaga inválido' });
    }
    const erroValidacao = validarRequisitosVaga(dados);
    if (erroValidacao) return reply.code(400).send({ error: erroValidacao });

    const sets = campos.map((campo, i) => `${campo} = $${i + 3}`).join(', ');
    const valores = campos.map((campo) => (CAMPOS_VAGA_JSONB.includes(campo) ? JSON.stringify(dados[campo]) : dados[campo]));
    const { rows } = await pool.query(
      `update vagas set ${sets}, atualizado_em = now() where id = $1 and tenant_id = $2 returning id`,
      [request.params.id, request.user.tenantId, ...valores]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Vaga não encontrada' });
    return { ok: true };
  });

  fastify.get('/people/api/vagas/:id/candidaturas', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows: vagaRows } = await pool.query('select id from vagas where id = $1 and tenant_id = $2', [request.params.id, request.user.tenantId]);
    if (!vagaRows[0]) return reply.code(404).send({ error: 'Vaga não encontrada' });

    const { rows } = await pool.query(
      `select c.id, p.nome, p.telefone_e164 as whatsapp, p.email, p.linkedin, c.curriculo_nome, c.criado_em
       from candidaturas c join candidatos p on p.id = c.candidato_id
       where c.vaga_id = $1 order by c.criado_em desc`,
      [request.params.id]
    );
    return rows;
  });

  // Lista todas as candidaturas do tenant (todas as vagas juntas) — usada
  // pela tela "Candidatos" (distinta de "Avaliações", que é sobre a
  // avaliação comportamental). Nome/e-mail/whatsapp vêm da PESSOA agora —
  // a candidatura em si não guarda mais identidade (ver nota 2026-08-28).
  fastify.get('/people/api/candidaturas', { preHandler: fastify.authenticate }, async (request) => {
    const { rows } = await pool.query(
      `select c.id, c.candidato_id, c.vaga_id, p.nome, p.email, p.telefone_e164 as whatsapp, p.anonimizado_em,
              c.status, c.criado_em, v.nome as vaga_nome, v.status as vaga_status
       from candidaturas c
       join candidatos p on p.id = c.candidato_id
       join vagas v on v.id = c.vaga_id
       where v.tenant_id = $1
       order by c.criado_em desc`,
      [request.user.tenantId]
    );
    return rows;
  });

  fastify.get('/people/api/candidaturas/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query(
      `select c.id, c.candidato_id, p.nome, p.email, p.telefone_e164 as whatsapp, p.linkedin, p.anonimizado_em,
              c.status, c.etapa_id, c.vaga_id, c.avaliacao_id, c.score, c.pesos_snapshot,
              c.motivo_reprovacao, c.origem, c.curriculo_nome, c.curriculo_tipo, c.criado_em, v.nome as vaga_nome
       from candidaturas c
       join candidatos p on p.id = c.candidato_id
       join vagas v on v.id = c.vaga_id
       where c.id = $1 and v.tenant_id = $2`,
      [request.params.id, request.user.tenantId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Candidatura não encontrada' });
    return rows[0];
  });

  fastify.get('/people/api/candidaturas/:id/curriculo', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query(
      `select c.curriculo_nome, c.curriculo_tipo, c.curriculo_arquivo
       from candidaturas c join vagas v on v.id = c.vaga_id
       where c.id = $1 and v.tenant_id = $2`,
      [request.params.id, request.user.tenantId]
    );
    const candidatura = rows[0];
    if (!candidatura) return reply.code(404).send({ error: 'Currículo não encontrado' });

    reply.header('Content-Type', candidatura.curriculo_tipo);
    reply.header('Content-Disposition', `attachment; filename="${candidatura.curriculo_nome}"`);
    return reply.send(candidatura.curriculo_arquivo);
  });

  // Mesmo arquivo do endpoint acima, mas com Content-Disposition: inline —
  // usado pelo <iframe> do painel de detalhe do candidato (só funciona
  // embutido pra PDF; DOCX não tem visualização nativa no navegador).
  fastify.get('/people/api/candidaturas/:id/curriculo/visualizar', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query(
      `select c.curriculo_nome, c.curriculo_tipo, c.curriculo_arquivo
       from candidaturas c join vagas v on v.id = c.vaga_id
       where c.id = $1 and v.tenant_id = $2`,
      [request.params.id, request.user.tenantId]
    );
    const candidatura = rows[0];
    if (!candidatura) return reply.code(404).send({ error: 'Currículo não encontrado' });

    reply.header('Content-Type', candidatura.curriculo_tipo);
    reply.header('Content-Disposition', `inline; filename="${candidatura.curriculo_nome}"`);
    return reply.send(candidatura.curriculo_arquivo);
  });

  // Reprovar exige ação humana registrada (Art. 20 LGPD) — não existe
  // caminho automático pra esse status em nenhuma rota deste arquivo.
  fastify.patch('/people/api/candidaturas/:id/reprovar', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { motivo } = request.body || {};
    const { rows } = await pool.query(
      `update candidaturas c set status = 'reprovada', motivo_reprovacao = $3
       from vagas v
       where c.vaga_id = v.id and c.id = $1 and v.tenant_id = $2
       returning c.id, c.tenant_id, c.status as status_anterior`,
      [request.params.id, request.user.tenantId, motivo || null]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Candidatura não encontrada' });
    await registrarEvento(pool, {
      tenantId: request.user.tenantId, candidaturaId: rows[0].id, tipo: 'candidatura_reprovada',
      de: rows[0].status_anterior, para: 'reprovada', atorEmail: request.user.email, payload: motivo ? { motivo } : null,
    });
    return { ok: true };
  });

  // Avança a candidatura pra próxima etapa (por `ordem`) a partir da etapa
  // atual — se ela não estiver em nenhuma, a próxima é a primeira etapa
  // cadastrada. Se não houver uma próxima etapa configurada, devolve
  // `semProximaEtapa: true` (não é erro) pro front oferecer cadastrar uma.
  fastify.patch('/people/api/candidaturas/:id/avancar-etapa', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows: candidaturaRows } = await pool.query(
      `select c.id, c.etapa_id
       from candidaturas c join vagas v on v.id = c.vaga_id
       where c.id = $1 and v.tenant_id = $2`,
      [request.params.id, request.user.tenantId]
    );
    const candidatura = candidaturaRows[0];
    if (!candidatura) return reply.code(404).send({ error: 'Candidatura não encontrada' });

    const { rows: etapas } = await pool.query(
      'select id, nome from etapas where tenant_id = $1 order by ordem',
      [request.user.tenantId]
    );
    if (!etapas.length) return { ok: true, semProximaEtapa: true };

    const indiceAtual = candidatura.etapa_id ? etapas.findIndex((e) => e.id === candidatura.etapa_id) : -1;
    const proxima = etapas[indiceAtual + 1];
    if (!proxima) return { ok: true, semProximaEtapa: true };

    await pool.query('update candidaturas set etapa_id = $1 where id = $2', [proxima.id, candidatura.id]);
    const etapaAnteriorNome = indiceAtual >= 0 ? etapas[indiceAtual].nome : 'Nova';
    await registrarEvento(pool, {
      tenantId: request.user.tenantId, candidaturaId: candidatura.id, tipo: 'etapa_alterada',
      de: etapaAnteriorNome, para: proxima.nome, atorEmail: request.user.email,
    });
    return { ok: true, etapa: proxima };
  });

  // Score de aderência: componentes lançados à mão (0-100), combinados pelos
  // pesos congelados no momento em que a candidatura foi criada
  // (`pesos_snapshot`) — não muda se o recrutador reajustar os pesos da
  // vaga depois, pra não tornar os scores já calculados incomparáveis.
  fastify.patch('/people/api/candidaturas/:id/score', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query(
      `select c.id, c.tenant_id, c.pesos_snapshot from candidaturas c join vagas v on v.id = c.vaga_id
       where c.id = $1 and v.tenant_id = $2`,
      [request.params.id, request.user.tenantId]
    );
    const candidatura = rows[0];
    if (!candidatura) return reply.code(404).send({ error: 'Candidatura não encontrada' });
    if (!candidatura.pesos_snapshot) return reply.code(409).send({ error: 'Essa candidatura não tem pesos definidos (foi criada antes do recurso de score)' });

    const componentes = request.body || {};
    const score = calcularScore(candidatura.pesos_snapshot, componentes);
    if (!score) return reply.code(400).send({ error: 'Informe ao menos um componente de score' });

    await pool.query('update candidaturas set score = $1 where id = $2', [JSON.stringify(score), candidatura.id]);
    await registrarEvento(pool, {
      tenantId: request.user.tenantId, candidaturaId: candidatura.id, tipo: 'score_calculado', atorEmail: request.user.email, payload: score,
    });
    return { ok: true, score };
  });

  // Pessoa entra numa vaga nova reaproveitando o histórico já existente
  // ("banco de talentos") — mesma regra de dedup por candidato_id+vaga_id.
  fastify.post('/people/api/candidaturas/banco-de-talentos', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { candidato_id, vaga_id } = request.body || {};
    if (!candidato_id || !vaga_id) return reply.code(400).send({ error: 'candidato_id e vaga_id são obrigatórios' });

    const { rows: pessoaRows } = await pool.query('select id from candidatos where id = $1 and tenant_id = $2', [candidato_id, request.user.tenantId]);
    if (!pessoaRows[0]) return reply.code(404).send({ error: 'Candidato não encontrado' });
    const { rows: vagaRows } = await pool.query('select id from vagas where id = $1 and tenant_id = $2', [vaga_id, request.user.tenantId]);
    if (!vagaRows[0]) return reply.code(404).send({ error: 'Vaga não encontrada' });

    const resultado = await criarOuReutilizarCandidatura({
      vagaId: vaga_id, tenantId: request.user.tenantId, candidatoId: candidato_id, origem: 'banco_de_talentos', atorEmail: request.user.email,
    });
    return reply.code(201).send({ id: resultado.candidatura.id, reaproveitada: resultado.reaproveitada });
  });

  // Mascara a pessoa (nome/e-mail/telefone truncados, LinkedIn removido),
  // preserva candidaturas e avaliações como agregados. Reversível a pedido
  // do Bruno (2026-08-28) — o valor original fica em `dados_originais`.
  // Nota: por ser reversível, isto é pseudonimização, não anonimização —
  // deixou de sustentar sozinho a exceção da LGPD Art. 12 (dado
  // verdadeiramente anonimizado sai do escopo da lei); o dado seguem
  // sendo dado pessoal enquanto `dados_originais` existir.
  fastify.post('/people/api/candidatos/:id/anonimizar', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows: atuais } = await pool.query(
      'select nome, email, telefone_e164, linkedin from candidatos where id = $1 and tenant_id = $2',
      [request.params.id, request.user.tenantId]
    );
    const original = atuais[0];
    if (!original) return reply.code(404).send({ error: 'Candidato não encontrado' });

    await pool.query(
      `update candidatos set nome = $3, email = $4, telefone_e164 = $5, linkedin = null,
              anonimizado_em = now(), dados_originais = $6
       where id = $1 and tenant_id = $2`,
      [
        request.params.id, request.user.tenantId,
        mascararNome(original.nome),
        original.email ? mascararEmail(original.email) : null,
        original.telefone_e164 ? mascararTelefone(original.telefone_e164) : null,
        JSON.stringify(original),
      ]
    );
    return { ok: true };
  });

  fastify.post('/people/api/candidatos/:id/reverter-anonimizacao', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query(
      'select dados_originais from candidatos where id = $1 and tenant_id = $2',
      [request.params.id, request.user.tenantId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Candidato não encontrado' });
    const original = rows[0].dados_originais;
    if (!original) return reply.code(409).send({ error: 'Este candidato não está mascarado' });

    await pool.query(
      `update candidatos set nome = $3, email = $4, telefone_e164 = $5, linkedin = $6,
              anonimizado_em = null, dados_originais = null
       where id = $1 and tenant_id = $2`,
      [request.params.id, request.user.tenantId, original.nome, original.email, original.telefone_e164, original.linkedin]
    );
    return { ok: true };
  });

  // Cria (ou devolve, se já existir) a candidatura de uma pessoa numa vaga —
  // usado pelo formulário público, cadastro manual, importação de currículo
  // e banco de talentos. Sempre passa por dedup de pessoa (telefone
  // primeiro, e-mail depois) e reaproveita a última avaliação concluída
  // válida, se houver — ver nota de arquitetura 2026-08-28. UNIQUE
  // (candidato_id, vaga_id) no banco garante que "clicar duas vezes no
  // link" nunca duplica: a segunda chamada só devolve a candidatura já
  // criada na primeira.
  async function criarOuReutilizarCandidatura({ vagaId, tenantId, candidatoId, nome, email, telefone, linkedin, origem, curriculo, atorEmail }) {
    const pessoa = candidatoId
      ? (await pool.query('select * from candidatos where id = $1 and tenant_id = $2', [candidatoId, tenantId])).rows[0]
      : await encontrarOuCriarPessoa(pool, tenantId, { nome, email, telefone, linkedin });
    if (!pessoa) throw new Error('Pessoa não encontrada');

    const { rows: existentes } = await pool.query(
      'select * from candidaturas where candidato_id = $1 and vaga_id = $2',
      [pessoa.id, vagaId]
    );
    if (existentes[0]) return { candidatura: existentes[0], pessoa, reaproveitada: true };

    const { rows: vagaRows } = await pool.query('select pesos from vagas where id = $1', [vagaId]);
    const pesosSnapshot = vagaRows[0] ? vagaRows[0].pesos : null;
    const avaliacaoExistente = await avaliacaoReaproveitavel(pool, pessoa.id);

    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `insert into candidaturas
         (id, vaga_id, tenant_id, candidato_id, avaliacao_id, origem, pesos_snapshot,
          curriculo_nome, curriculo_tipo, curriculo_arquivo)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning *`,
      [
        id, vagaId, tenantId, pessoa.id, avaliacaoExistente ? avaliacaoExistente.id : null, origem,
        pesosSnapshot ? JSON.stringify(pesosSnapshot) : null,
        curriculo ? curriculo.nome : 'sem-arquivo', curriculo ? curriculo.tipo : 'application/octet-stream',
        curriculo ? curriculo.buffer : Buffer.alloc(0),
      ]
    );
    const candidatura = rows[0];
    await registrarEvento(pool, { tenantId, candidaturaId: candidatura.id, tipo: 'candidatura_criada', para: 'nova', atorEmail, payload: { origem } });
    if (avaliacaoExistente) {
      await registrarEvento(pool, { tenantId, candidaturaId: candidatura.id, tipo: 'avaliacao_reaproveitada', payload: { avaliacao_id: avaliacaoExistente.id } });
    }
    // Vaga "nova" que recebe a primeira candidatura já é evidência de que
    // o processo começou de verdade — some pro status "em_andamento"
    // sozinha (só a partir de 'nova', nunca mexe em rascunho/pausada/
    // encerrada, que são decisões deliberadas do recrutador).
    await pool.query("update vagas set status = 'em_andamento' where id = $1 and status = 'nova'", [vagaId]);
    return { candidatura, pessoa, reaproveitada: false };
  }

  // Cadastro manual de candidato (sem passar pelo link público da vaga) —
  // currículo é opcional aqui; o botão "Importar currículo" da tela usa o
  // mesmo endpoint depois de pré-preencher os campos via /extrair-curriculo.
  fastify.post('/people/api/candidaturas', { preHandler: fastify.authenticate }, async (request, reply) => {
    const campos = {};
    let arquivo = null;
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        const extensao = path.extname(part.filename || '').toLowerCase();
        if (!EXTENSOES_CURRICULO_ACEITAS.includes(extensao)) {
          return reply.code(400).send({ error: 'Currículo deve ser PDF ou DOCX' });
        }
        arquivo = { nome: part.filename, tipo: part.mimetype, buffer: await part.toBuffer() };
      } else {
        campos[part.fieldname] = part.value;
      }
    }

    if (!campos.vaga_id || !campos.nome || !campos.whatsapp || !campos.email) {
      return reply.code(400).send({ error: 'vaga_id, nome, whatsapp e email são obrigatórios' });
    }
    const { rows: vagaRows } = await pool.query('select id from vagas where id = $1 and tenant_id = $2', [campos.vaga_id, request.user.tenantId]);
    if (!vagaRows[0]) return reply.code(404).send({ error: 'Vaga não encontrada' });

    const resultado = await criarOuReutilizarCandidatura({
      vagaId: campos.vaga_id, tenantId: request.user.tenantId, nome: campos.nome, email: campos.email,
      telefone: campos.whatsapp, linkedin: campos.linkedin || null, origem: 'manual', curriculo: arquivo, atorEmail: request.user.email,
    });
    return reply.code(201).send({ id: resultado.candidatura.id, reaproveitada: resultado.reaproveitada });
  });

  // Lê um currículo enviado e devolve nome/e-mail/whatsapp encontrados no
  // texto por regex/heurística (não é IA) — só sugere valores pro
  // formulário de "Importar currículo", nada é salvo aqui.
  fastify.post('/people/api/candidaturas/extrair-curriculo', { preHandler: fastify.authenticate }, async (request, reply) => {
    let arquivo = null;
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        const extensao = path.extname(part.filename || '').toLowerCase();
        if (!EXTENSOES_CURRICULO_ACEITAS.includes(extensao)) {
          return reply.code(400).send({ error: 'Currículo deve ser PDF ou DOCX' });
        }
        arquivo = { nome: part.filename, tipo: part.mimetype, buffer: await part.toBuffer() };
      }
    }
    if (!arquivo) return reply.code(400).send({ error: 'Envie um arquivo' });

    try {
      const texto = await extrairTexto(arquivo.buffer, arquivo.tipo, arquivo.nome);
      const campos = extrairCamposDoTexto(texto);
      return { ...campos, arquivoBase64: arquivo.buffer.toString('base64'), curriculoNome: arquivo.nome, curriculoTipo: arquivo.tipo };
    } catch (err) {
      request.log.error(err);
      return reply.code(422).send({ error: 'Não foi possível ler esse arquivo. Preencha os campos manualmente.' });
    }
  });

  // --- Quadro Kanban: etapas (colunas, tenant-wide) + candidaturas movendo entre elas ---
  fastify.post('/people/api/etapas', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { nome } = request.body || {};
    if (!nome) return reply.code(400).send({ error: 'nome é obrigatório' });

    const { rows } = await pool.query(
      'select coalesce(max(ordem), 0) + 1 as proxima from etapas where tenant_id = $1',
      [request.user.tenantId]
    );
    const id = crypto.randomUUID();
    await pool.query(
      'insert into etapas (id, tenant_id, nome, ordem) values ($1, $2, $3, $4)',
      [id, request.user.tenantId, nome, rows[0].proxima]
    );
    return reply.code(201).send({ id, nome, ordem: rows[0].proxima });
  });

  fastify.get('/people/api/etapas', { preHandler: fastify.authenticate }, async (request) => {
    const { rows } = await pool.query(
      'select id, nome, ordem from etapas where tenant_id = $1 order by ordem',
      [request.user.tenantId]
    );
    return rows;
  });

  fastify.patch('/people/api/etapas/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { nome } = request.body || {};
    if (!nome) return reply.code(400).send({ error: 'nome é obrigatório' });
    const { rows } = await pool.query(
      'update etapas set nome = $1 where id = $2 and tenant_id = $3 returning id',
      [nome, request.params.id, request.user.tenantId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Etapa não encontrada' });
    return { ok: true };
  });

  // Reordena as etapas de acordo com a lista de ids recebida (arrastar e
  // soltar o cabeçalho da coluna no quadro) — reescreve a `ordem` de todas
  // de uma vez, mais simples e robusto que mover uma por uma.
  fastify.patch('/people/api/etapas/reordenar', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { ids } = request.body || {};
    if (!Array.isArray(ids) || !ids.length) {
      return reply.code(400).send({ error: 'ids deve ser uma lista não vazia' });
    }

    const { rows } = await pool.query('select id from etapas where tenant_id = $1', [request.user.tenantId]);
    const idsValidos = new Set(rows.map((r) => r.id));
    if (ids.length !== idsValidos.size || !ids.every((id) => idsValidos.has(id))) {
      return reply.code(400).send({ error: 'A lista deve conter exatamente as etapas do tenant' });
    }

    const client = await pool.connect();
    try {
      await client.query('begin');
      for (let i = 0; i < ids.length; i++) {
        await client.query('update etapas set ordem = $1 where id = $2 and tenant_id = $3', [i + 1, ids[i], request.user.tenantId]);
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
    return { ok: true };
  });

  fastify.delete('/people/api/etapas/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { rows } = await pool.query(
      'delete from etapas where id = $1 and tenant_id = $2 returning id',
      [request.params.id, request.user.tenantId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Etapa não encontrada' });
    return { ok: true };
  });

  // Payload único com tudo que o quadro precisa pra montar o grid raia×coluna —
  // filtro por vaga/etapa fica client-side (volume pequeno, evita ida e volta
  // a cada clique no filtro).
  fastify.get('/people/api/kanban', { preHandler: fastify.authenticate }, async (request) => {
    const [vagas, etapas, candidaturas] = await Promise.all([
      pool.query('select id, nome from vagas where tenant_id = $1 order by criado_em desc', [request.user.tenantId]),
      pool.query('select id, nome, ordem from etapas where tenant_id = $1 order by ordem', [request.user.tenantId]),
      pool.query(
        `select c.id, p.nome, c.vaga_id, c.etapa_id, c.status, c.criado_em
         from candidaturas c
         join candidatos p on p.id = c.candidato_id
         join vagas v on v.id = c.vaga_id
         where v.tenant_id = $1
         order by c.criado_em desc`,
        [request.user.tenantId]
      ),
    ]);
    return { vagas: vagas.rows, etapas: etapas.rows, candidaturas: candidaturas.rows };
  });

  fastify.patch('/people/api/candidaturas/:id/etapa', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { etapa_id } = request.body || {};
    const { rows } = await pool.query(
      `update candidaturas c set etapa_id = $1
       from vagas v
       where c.vaga_id = v.id and c.id = $2 and v.tenant_id = $3
       returning c.id, c.tenant_id`,
      [etapa_id || null, request.params.id, request.user.tenantId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Candidatura não encontrada' });
    await registrarEvento(pool, {
      tenantId: request.user.tenantId, candidaturaId: rows[0].id, tipo: 'etapa_alterada', para: etapa_id || 'Nova', atorEmail: request.user.email,
    });
    return { ok: true };
  });

  // --- Vaga pública (candidato, sem login) ---
  const EXTENSOES_CURRICULO_ACEITAS = ['.pdf', '.docx'];

  fastify.get('/people/vaga/:id', async (request, reply) => {
    return reply.sendFile('vaga.html');
  });

  fastify.get('/people/api/vaga-publica/:id', async (request, reply) => {
    const { rows } = await pool.query(
      `select nome, empresa, cidade, descricao, salario, modalidade, tipo_vaga, nivel_experiencia, cargo, requisitos, competencias, status
       from vagas where id = $1`,
      [request.params.id]
    );
    const vaga = rows[0];
    if (!vaga || vaga.status === 'encerrada' || vaga.status === 'rascunho') {
      return reply.code(404).send({ error: 'Vaga não encontrada ou encerrada' });
    }
    return vaga;
  });

  fastify.post('/people/api/vaga-publica/:id/candidatar', async (request, reply) => {
    const { rows: vagaRows } = await pool.query("select id, tenant_id, status from vagas where id = $1", [request.params.id]);
    const vaga = vagaRows[0];
    if (!vaga || vaga.status === 'encerrada' || vaga.status === 'rascunho') {
      return reply.code(404).send({ error: 'Vaga não encontrada ou encerrada' });
    }

    const campos = {};
    let arquivo = null;
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        const extensao = path.extname(part.filename || '').toLowerCase();
        if (!EXTENSOES_CURRICULO_ACEITAS.includes(extensao)) {
          return reply.code(400).send({ error: 'Currículo deve ser PDF ou DOCX' });
        }
        arquivo = { nome: part.filename, tipo: part.mimetype, buffer: await part.toBuffer() };
      } else {
        campos[part.fieldname] = part.value;
      }
    }

    if (!campos.nome || !campos.whatsapp || !campos.email) {
      return reply.code(400).send({ error: 'nome, whatsapp e email são obrigatórios' });
    }
    if (!arquivo) {
      return reply.code(400).send({ error: 'Currículo é obrigatório' });
    }

    // Mesma pessoa clicando duas vezes no link não duplica: dedup por
    // telefone/e-mail + UNIQUE(candidato_id, vaga_id) devolvem a candidatura
    // já existente em vez de criar outra.
    await criarOuReutilizarCandidatura({
      vagaId: vaga.id, tenantId: vaga.tenant_id, nome: campos.nome, email: campos.email,
      telefone: campos.whatsapp, linkedin: campos.linkedin || null, origem: 'link', curriculo: arquivo,
    });

    return reply.code(201).send({ ok: true });
  });

  // --- Avaliação pública (candidato, sem login — gate por e-mail cadastrado) ---
  fastify.get('/people/avaliacao/:token', async (request, reply) => {
    return reply.sendFile('avaliacao.html');
  });

  fastify.get('/people/api/avaliacao/:token', async (request, reply) => {
    const { rows } = await pool.query(
      `select a.status, p.nome from avaliacoes a join candidatos p on p.id = a.candidato_id where a.token = $1`,
      [request.params.token]
    );
    const avaliacao = rows[0];
    if (!avaliacao) return reply.code(404).send({ error: 'Link inválido' });
    return { status: avaliacao.status, nome: avaliacao.nome };
  });

  // Gate de acesso ao link: o candidato confirma o mesmo e-mail já
  // cadastrado no perfil dele (candidatos.email), não mais CPF (troca
  // pedida pelo Bruno em 2026-08-28 — CPF nunca foi necessário pra
  // identificar a pessoa, só servia como segredo de destrave do link).
  fastify.post('/people/api/avaliacao/:token/validar-email', async (request, reply) => {
    const { email } = request.body || {};
    const { rows } = await pool.query(
      `select a.id, a.status, p.email as email_cadastrado
       from avaliacoes a join candidatos p on p.id = a.candidato_id
       where a.token = $1`,
      [request.params.token]
    );
    const avaliacao = rows[0];
    if (!avaliacao) return reply.code(404).send({ error: 'Link inválido' });
    if (avaliacao.status === 'concluido') {
      return reply.code(403).send({ error: 'Esta avaliação já foi concluída e não pode ser refeita' });
    }
    const emailConfere = (email || '').trim().toLowerCase() === (avaliacao.email_cadastrado || '').trim().toLowerCase();
    if (!emailConfere) {
      return reply.code(401).send({ error: 'E-mail não confere' });
    }

    if (avaliacao.status === 'pendente') {
      await pool.query("update avaliacoes set status = 'iniciado', iniciado_em = now() where id = $1", [avaliacao.id]);
    }

    return { ok: true, caracteristicas: CARACTERISTICAS_PUBLICAS };
  });

  fastify.post('/people/api/avaliacao/:token/rodada1', async (request, reply) => {
    const { selecionadas } = request.body || {};
    const avaliacao = await buscarPorTokenEmAndamento(request.params.token, reply);
    if (!avaliacao) return;
    if (!Array.isArray(selecionadas) || !selecionadas.length) {
      return reply.code(400).send({ error: 'selecionadas deve ser uma lista de ids não vazia' });
    }

    await pool.query('update avaliacoes set respostas_rodada1 = $1 where id = $2', [JSON.stringify(selecionadas), avaliacao.id]);
    return { ok: true };
  });

  fastify.post('/people/api/avaliacao/:token/rodada2', async (request, reply) => {
    const { selecionadas } = request.body || {};
    const avaliacao = await buscarPorTokenEmAndamento(request.params.token, reply);
    if (!avaliacao) return;
    if (!Array.isArray(selecionadas) || !selecionadas.length) {
      return reply.code(400).send({ error: 'selecionadas deve ser uma lista de ids não vazia' });
    }
    if (!avaliacao.respostas_rodada1) {
      return reply.code(409).send({ error: 'Rodada 1 ainda não foi respondida' });
    }

    const resultado = calcularResultado(avaliacao.respostas_rodada1, selecionadas);
    await pool.query(
      `update avaliacoes
       set respostas_rodada2 = $1, resultado = $2, status = 'concluido', concluido_em = now()
       where id = $3`,
      [JSON.stringify(selecionadas), JSON.stringify(resultado), avaliacao.id]
    );

    // Se alguma candidatura estava esperando essa avaliação, registra o
    // evento na jornada dela (best-effort: uma avaliação pode ter sido
    // reaproveitada por mais de uma candidatura).
    const { rows: candidaturasLigadas } = await pool.query('select id, tenant_id from candidaturas where avaliacao_id = $1', [avaliacao.id]);
    for (const c of candidaturasLigadas) {
      await registrarEvento(pool, { tenantId: c.tenant_id, candidaturaId: c.id, tipo: 'avaliacao_concluida' });
    }

    return { ok: true };
  });

  // Busca uma avaliação pelo token garantindo que está em andamento (e-mail
  // já validado, ainda não concluída) — usado pelas rotas de rodada 1/2 pra
  // impedir salvar respostas fora do fluxo (token errado, já concluído, ou
  // nunca iniciado).
  async function buscarPorTokenEmAndamento(token, reply) {
    const { rows } = await pool.query('select * from avaliacoes where token = $1', [token]);
    const avaliacao = rows[0];
    if (!avaliacao) {
      reply.code(404).send({ error: 'Link inválido' });
      return null;
    }
    if (avaliacao.status === 'concluido') {
      reply.code(403).send({ error: 'Esta avaliação já foi concluída e não pode ser refeita' });
      return null;
    }
    if (avaliacao.status === 'pendente') {
      reply.code(403).send({ error: 'Valide seu e-mail antes de responder' });
      return null;
    }
    return avaliacao;
  }

  return fastify;
}

async function start() {
  await migrar();
  const fastify = await build();
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
}

if (require.main === module) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { build };
