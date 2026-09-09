-- Fase 4 do plano de travas de WhatsApp (2026-09-09): fila pra disparo fora
-- do horário comercial (config por produto, ver kyvvo-admin). Só quem caiu
-- fora do horário entra aqui — candidatura_criada nunca (sempre instantânea,
-- pedido do Bruno) e quem já foi enviado na hora também não.
create table if not exists whatsapp_fila (
  id uuid primary key,
  tenant_id uuid not null,
  telefone_e164 text not null,
  template_nome text not null,
  parametros_corpo jsonb not null,
  parametro_botao text,
  criado_em timestamptz not null default now(),
  processado_em timestamptz
);
create index if not exists whatsapp_fila_pendentes_idx on whatsapp_fila (criado_em) where processado_em is null;
