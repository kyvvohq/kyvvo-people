-- Seção 10 da especificação — assinatura/cobrança recorrente via Asaas,
-- própria do People (o People não tem acesso à tabela `tenants` do Kyvvo
-- principal, então guarda seu próprio estado de assinatura aqui, chaveado
-- por tenant_id). Mesmo desenho de campos usado pelo Studio
-- (server/panel: tenants.asaas_*/status/endereco_*), só que numa tabela
-- própria em vez de colunas soltas — o People não tem uma tabela de tenant
-- pra anexar essas colunas.
create table assinaturas (
  tenant_id uuid primary key,
  plano text,
  status text not null default 'trial' check (status in ('trial', 'ativo', 'inadimplente', 'suspenso', 'cancelado')),
  trial_iniciado_em timestamptz not null default now(),
  status_alterado_em timestamptz not null default now(),
  asaas_customer_id text,
  asaas_subscription_id text,
  asaas_meio_pagamento text,
  asaas_cartao_final text,
  cpf_cnpj text,
  endereco_cep text,
  endereco_logradouro text,
  endereco_numero text,
  endereco_complemento text,
  endereco_bairro text,
  endereco_cidade text,
  endereco_uf text,
  cancelado_em timestamptz,
  acesso_ate timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index assinaturas_asaas_subscription_idx on assinaturas (asaas_subscription_id);
