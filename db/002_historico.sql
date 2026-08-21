create table if not exists candidatos_historico (
  id uuid primary key,
  candidato_id uuid not null references candidatos(id) on delete cascade,
  respostas_rodada1 jsonb,
  respostas_rodada2 jsonb,
  resultado jsonb,
  concluido_em timestamptz,
  arquivado_em timestamptz not null default now()
);

create index if not exists candidatos_historico_candidato_idx on candidatos_historico (candidato_id);
