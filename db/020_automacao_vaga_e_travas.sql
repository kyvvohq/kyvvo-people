-- Fase 1 do plano de travas de WhatsApp (2026-09-09): escopo por vaga,
-- opt-out e log pra bloqueio de 24h. Fila/horário comercial ficam pra uma
-- migration futura (dependem do kyvvo-admin, fase separada).

-- etapa_alcancada com vaga_id preenchido = só essa vaga (sobrepõe a geral,
-- que continua com vaga_id nulo); outros gatilhos nunca têm vaga_id, mesmo
-- padrão de etapa_id em 019_automacoes.sql.
alter table automacoes add column if not exists vaga_id uuid references vagas(id) on delete cascade;
create index if not exists automacoes_vaga_idx on automacoes (vaga_id);
alter table automacoes add constraint automacoes_vaga_so_em_etapa_alcancada check (
  vaga_id is null or gatilho = 'etapa_alcancada'
);

-- Opt-out: candidato que pediu pra não receber mais (manual pelo recrutador
-- nesta fase; detecção automática por palavra-chave via webhook é fase 5).
alter table candidatos add column if not exists whatsapp_opt_out boolean not null default false;
alter table candidatos add column if not exists whatsapp_opt_out_em timestamptz;

-- Log de envio de WhatsApp — só pra sustentar o bloqueio de 24h (e-mail não
-- tem essa trava). Uma linha por envio bem-sucedido, não por tentativa.
create table if not exists whatsapp_envios (
  id uuid primary key,
  tenant_id uuid not null,
  telefone_e164 text not null,
  enviado_em timestamptz not null default now()
);
create index if not exists whatsapp_envios_telefone_idx on whatsapp_envios (telefone_e164, enviado_em desc);
