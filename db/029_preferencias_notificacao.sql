-- Preferências de notificação por e-mail do recrutador (dono da conta),
-- Configurações > Notificações. Diferente de automações (lib/automacoes.js),
-- que notifica o CANDIDATO — isto é pro recrutador saber de eventos na
-- própria conta. email é cacheado no login (não existe tabela local de
-- usuarios/tenants — identidade vive no kyvvo-platform) e refrescado a cada
-- login, pra sempre ter um destino válido sem precisar consultar o platform
-- na hora de notificar.
create table if not exists preferencias_notificacao (
  tenant_id uuid primary key,
  email text not null,
  nova_candidatura boolean not null default true,
  atualizado_em timestamptz not null default now()
);
