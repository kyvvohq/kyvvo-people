-- Automações do fluxo de vaga: mensagens (e-mail/WhatsApp) disparadas em
-- eventos da candidatura. Tenant-wide (etapas também são, ver 005_etapas.sql)
-- — não existe por-vaga.
--
-- gatilho:
--   candidatura_criada    -- candidato se candidata (index.js: criarOuReutilizarCandidatura)
--   etapa_alcancada       -- candidatura chega numa etapa (etapa_id obrigatório)
--   candidatura_reprovada -- PATCH .../reprovar
--   vaga_encerrada        -- vaga muda status -> encerrada (fan-out pras candidaturas em aberto)
--
-- removivel=false trava ativo/exclusão em código (rota recusa) — hoje só o
-- WhatsApp de candidatura_criada nasce assim (ver lib/automacoes.js).
create table if not exists automacoes (
  id uuid primary key,
  tenant_id uuid not null,
  gatilho text not null check (gatilho in ('candidatura_criada', 'etapa_alcancada', 'candidatura_reprovada', 'vaga_encerrada')),
  etapa_id uuid references etapas(id) on delete cascade,
  canal text not null check (canal in ('email', 'whatsapp')),
  nome text not null,
  ativo boolean not null default true,
  removivel boolean not null default true,
  assunto text,
  corpo text not null,
  whatsapp_template text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint automacoes_etapa_so_em_etapa_alcancada check (
    (gatilho = 'etapa_alcancada' and etapa_id is not null) or
    (gatilho != 'etapa_alcancada' and etapa_id is null)
  )
);
create index if not exists automacoes_tenant_idx on automacoes (tenant_id);
create index if not exists automacoes_etapa_idx on automacoes (etapa_id);
create index if not exists automacoes_gatilho_idx on automacoes (tenant_id, gatilho);
