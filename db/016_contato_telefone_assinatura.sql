-- Achado do Bruno (2026-08-31): pagamento por cartão falhava com "Informe
-- o número de contato com DDD do titular do cartão" — a Asaas exige
-- mobilePhone no holderInfo da tokenização, e o People não guarda telefone
-- do tenant em lugar nenhum (só de candidatos). Guarda aqui pra não pedir
-- de novo em cada tentativa/troca de cartão.
alter table assinaturas add column contato_telefone text;
