-- Multi-tenant: qualquer usuário Kyvvo com o módulo "people" ativo passa a
-- poder logar (ver index.js#login), não fica mais restrito a 1 e-mail fixo.
-- Nullable por enquanto — o candidato já existente ("Bruno Alves", de teste)
-- fica sem tenant_id até decidirmos o que fazer com ele; novas linhas sempre
-- gravam tenant_id (aplicação exige, não o schema).
alter table candidatos add column if not exists tenant_id uuid;

create index if not exists candidatos_tenant_idx on candidatos (tenant_id);
