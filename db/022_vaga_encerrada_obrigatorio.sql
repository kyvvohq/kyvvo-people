-- Handoff v2 (17/09) — Regra 0.6/Parte 5.2: "confirmação de candidatura e
-- encerramento da vaga" são os dois eventos obrigatórios (a priori), o
-- recrutador não pode desativar nenhum dos dois. candidatura_criada/whatsapp
-- já nascia removivel=false (019_automacoes.sql); vaga_encerrada/whatsapp
-- nascia removivel=true — o seed (lib/automacoes.js) já foi corrigido pra
-- tenants novos, isto aqui é o backfill dos tenants que já tinham a linha
-- antiga gravada.
update automacoes set removivel = false
where gatilho = 'vaga_encerrada' and canal = 'whatsapp' and removivel = true;
