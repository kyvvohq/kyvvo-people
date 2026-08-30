-- Kyvvo People não tem teste grátis (correção do Bruno, 2026-08-30 — a
-- seção 10.2 da especificação mencionava trial de 14 dias, mas isso não se
-- aplica ao People). Remove o status 'trial' e a coluna que sustentava o
-- cálculo do fim do trial; quem ainda não assinou fica em 'sem_assinatura'
-- em vez de entrar automaticamente num período de teste.
-- A constraint precisa aceitar 'sem_assinatura' ANTES do UPDATE abaixo
-- gravar esse valor — só depois é seguro tirar 'trial' da lista permitida.
alter table assinaturas drop constraint assinaturas_status_check;
alter table assinaturas add constraint assinaturas_status_check
  check (status in ('trial', 'sem_assinatura', 'ativo', 'inadimplente', 'suspenso', 'cancelado'));

update assinaturas set status = 'sem_assinatura' where status = 'trial';

alter table assinaturas drop constraint assinaturas_status_check;
alter table assinaturas add constraint assinaturas_status_check
  check (status in ('sem_assinatura', 'ativo', 'inadimplente', 'suspenso', 'cancelado'));

alter table assinaturas alter column status set default 'sem_assinatura';
alter table assinaturas drop column trial_iniciado_em;
