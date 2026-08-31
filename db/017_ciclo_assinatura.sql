-- Pagamento anual (2026-08-30): assinatura pode ser cobrada mensal ou anual
-- (anual = valor da parcela mensal × 10 — 2 meses de desconto, calculado
-- sempre no servidor a partir de planos.preco_mensal, nunca enviado pelo
-- cliente). Default 'mensal' preserva o comportamento de todas as
-- assinaturas já existentes.
alter table assinaturas add column ciclo text not null default 'mensal' check (ciclo in ('mensal', 'anual'));
