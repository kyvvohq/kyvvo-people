-- Evidence ledger — Handoff v2 (17/09), Parte 5.1. Append-only de verdade:
-- nenhuma rota de UPDATE/DELETE é registrada pra esta tabela (ver
-- lib/evidencias.js) — corrigir uma evidência é sempre uma linha NOVA,
-- apontando a antiga em substitui_evidencia_id, nunca um UPDATE por cima.
--
-- ator_email (não ator_id): este schema não tem um id de usuário estável —
-- o JWT do People só carrega tenant_id/email/nome (login via kyvvo-platform,
-- ver POST /people/api/login), mesma convenção já usada em eventos.ator_email
-- (007_pessoa_candidatura.sql). Regra 0.1 (Art. 20 LGPD): evidência de
-- entrevista/manual exige ator humano identificado — aqui é o e-mail de quem
-- estava logado.
create table evidencias (
  id uuid primary key,
  tenant_id uuid not null,
  candidatura_id uuid not null references candidaturas(id) on delete cascade,
  requisito_id uuid, -- nulo = observação geral (não vinculada a um requisito específico)
  fonte text not null check (fonte in ('formulario', 'avaliacao', 'entrevista', 'manual')),
  efeito text not null check (efeito in ('corrobora', 'contradiz', 'parcial', 'contexto')),
  texto text not null,
  substitui_evidencia_id uuid references evidencias(id),
  ator_email text,
  criado_em timestamptz not null default now(),
  constraint evidencias_ator_obrigatorio_entrevista_manual check (
    fonte not in ('entrevista', 'manual') or ator_email is not null
  )
);
create index evidencias_candidatura_idx on evidencias (candidatura_id);
create index evidencias_tenant_idx on evidencias (tenant_id);
create index evidencias_requisito_idx on evidencias (requisito_id);
