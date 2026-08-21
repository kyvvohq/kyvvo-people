create table if not exists candidatos (
  id uuid primary key,
  nome text not null,
  email text not null,
  cpf text not null,
  token text not null unique,
  status text not null default 'pendente'
    check (status in ('pendente', 'iniciado', 'concluido')),
  respostas_rodada1 jsonb,
  respostas_rodada2 jsonb,
  resultado jsonb,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists candidatos_status_idx on candidatos (status);
