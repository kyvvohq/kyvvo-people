-- Achado do Bruno (2026-08-31): assinar (Pix ou cartão) virava 'ativo' no
-- mesmo instante em que a Subscription era criada na Asaas, sem esperar
-- confirmação real — Pix só confirma quando o candidato paga de fato o QR
-- code/copia-e-cola (evento assíncrono, pode nunca acontecer), e cartão
-- pode ser recusado na cobrança. Novo status 'pendente' cobre a janela
-- entre "assinatura criada" e "primeira cobrança confirmada pelo webhook".
alter table assinaturas drop constraint assinaturas_status_check;
alter table assinaturas add constraint assinaturas_status_check
  check (status in ('sem_assinatura', 'pendente', 'ativo', 'inadimplente', 'suspenso', 'cancelado'));
