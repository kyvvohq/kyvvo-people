create table if not exists etapas (
  id uuid primary key,
  tenant_id uuid not null,
  nome text not null,
  ordem integer not null,
  criado_em timestamptz not null default now()
);
create index if not exists etapas_tenant_idx on etapas (tenant_id);

alter table candidaturas add column if not exists etapa_id uuid references etapas(id) on delete set null;
create index if not exists candidaturas_etapa_idx on candidaturas (etapa_id);
