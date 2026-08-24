create table if not exists vagas (
  id uuid primary key,
  tenant_id uuid not null,
  codigo text,
  nome text not null,
  descricao text not null,
  salario text,
  modalidade text,
  nivel_experiencia text not null,
  cargo text not null,
  requisitos text not null,
  competencias text not null,
  status text not null default 'nova'
    check (status in ('nova', 'em_andamento', 'pausada', 'encerrada')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists vagas_tenant_idx on vagas (tenant_id);

create table if not exists candidaturas (
  id uuid primary key,
  vaga_id uuid not null references vagas(id) on delete cascade,
  tenant_id uuid not null,
  nome text not null,
  whatsapp text not null,
  email text not null,
  linkedin text,
  curriculo_nome text not null,
  curriculo_tipo text not null,
  curriculo_arquivo bytea not null,
  criado_em timestamptz not null default now()
);
create index if not exists candidaturas_vaga_idx on candidaturas (vaga_id);
