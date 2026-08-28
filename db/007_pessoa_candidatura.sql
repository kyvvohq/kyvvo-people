-- Separa PESSOA de CANDIDATURA (ver nota de arquitetura 2026-08-28): a
-- tabela "candidatos" original sempre foi na verdade a AVALIAÇÃO (CPF-gated,
-- Profiler/MBTI/Big Five) — vira "avaliacoes". Uma nova "candidatos" nasce
-- como a pessoa de verdade, existindo fora de qualquer vaga.

alter table candidatos rename to avaliacoes;
alter table candidatos_historico rename to avaliacoes_historico;
alter table avaliacoes_historico rename column candidato_id to avaliacao_id;

-- Renomeia os índices/constraints herdados do nome antigo — senão colidem
-- com os de mesmo nome que a nova tabela `candidatos` (pessoa) vai criar
-- logo abaixo.
alter index candidatos_pkey rename to avaliacoes_pkey;
alter index candidatos_status_idx rename to avaliacoes_status_idx;
alter index candidatos_tenant_idx rename to avaliacoes_tenant_idx;
alter table avaliacoes rename constraint candidatos_token_key to avaliacoes_token_key;
alter index candidatos_historico_pkey rename to avaliacoes_historico_pkey;
alter index candidatos_historico_candidato_idx rename to avaliacoes_historico_avaliacao_idx;
alter table avaliacoes_historico rename constraint candidatos_historico_candidato_id_fkey to avaliacoes_historico_avaliacao_id_fkey;

create table candidatos (
  id uuid primary key,
  tenant_id uuid,
  nome text not null,
  telefone_e164 text,
  email text,
  linkedin text,
  consentimento_whatsapp boolean not null default false,
  consentimento_em timestamptz,
  criado_em timestamptz not null default now(),
  anonimizado_em timestamptz,
  unique (tenant_id, telefone_e164),
  unique (tenant_id, email)
);
create index candidatos_tenant_idx on candidatos (tenant_id);

-- Backfill: 1 pessoa por (tenant_id, email) distinto já visto em avaliações
-- (email é not null lá, cobre 100% das linhas).
insert into candidatos (id, tenant_id, nome, email, criado_em)
select (md5(random()::text || clock_timestamp()::text))::uuid, tenant_id, min(nome), email, min(criado_em)
from avaliacoes
group by tenant_id, email;

alter table avaliacoes add column candidato_id uuid references candidatos(id);
update avaliacoes a set candidato_id = c.id
from candidatos c
where c.email = a.email and (c.tenant_id = a.tenant_id or (c.tenant_id is null and a.tenant_id is null));
alter table avaliacoes alter column candidato_id set not null;
create index avaliacoes_candidato_idx on avaliacoes (candidato_id);

-- Backfill de pessoas vindas de candidaturas que ainda não têm par em
-- avaliações (mesmo tenant/e-mail).
insert into candidatos (id, tenant_id, nome, email, telefone_e164, linkedin, criado_em)
select (md5(random()::text || clock_timestamp()::text))::uuid, c.tenant_id, min(c.nome), c.email, min(c.whatsapp), min(c.linkedin), min(c.criado_em)
from candidaturas c
where not exists (
  select 1 from candidatos p
  where p.email = c.email and (p.tenant_id = c.tenant_id or (p.tenant_id is null and c.tenant_id is null))
)
group by c.tenant_id, c.email;

alter table candidaturas add column candidato_id uuid references candidatos(id);
update candidaturas c set candidato_id = p.id
from candidatos p
where p.email = c.email and (p.tenant_id = c.tenant_id or (p.tenant_id is null and c.tenant_id is null));
alter table candidaturas alter column candidato_id set not null;

-- Completa telefone/linkedin de pessoas criadas via avaliação (que não tem
-- esses campos) usando o que a candidatura correspondente já tinha.
update candidatos p set telefone_e164 = c.whatsapp
from candidaturas c
where c.candidato_id = p.id and p.telefone_e164 is null and c.whatsapp is not null;
update candidatos p set linkedin = c.linkedin
from candidaturas c
where c.candidato_id = p.id and p.linkedin is null and c.linkedin is not null;

alter table candidaturas drop column nome;
alter table candidaturas drop column whatsapp;
alter table candidaturas drop column linkedin;

alter table candidaturas add column avaliacao_id uuid references avaliacoes(id);
alter table candidaturas add column score jsonb;
alter table candidaturas add column pesos_snapshot jsonb;
alter table candidaturas add column motivo_reprovacao text;
alter table candidaturas add column origem text not null default 'link';
alter table candidaturas add column token_privado uuid not null default (md5(random()::text || clock_timestamp()::text))::uuid;
alter table candidaturas add constraint candidaturas_token_privado_key unique (token_privado);
alter table candidaturas add constraint candidaturas_candidato_vaga_key unique (candidato_id, vaga_id);
create index candidaturas_candidato_idx on candidaturas (candidato_id);

alter table vagas add column pesos jsonb not null default '{"tecnica":0.4,"experiencia":0.4,"entrevista":0.2}'::jsonb;

create table eventos (
  id uuid primary key,
  tenant_id uuid not null,
  candidatura_id uuid references candidaturas(id) on delete cascade,
  tipo text not null,
  de text,
  para text,
  ator_email text,
  payload jsonb,
  criado_em timestamptz not null default now()
);
create index eventos_candidatura_idx on eventos (candidatura_id);
create index eventos_tenant_idx on eventos (tenant_id);
