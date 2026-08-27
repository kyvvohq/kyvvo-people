alter table candidaturas add column if not exists status text not null default 'nova'
  check (status in ('nova', 'reprovada', 'aprovada'));
create index if not exists candidaturas_status_idx on candidaturas (status);
