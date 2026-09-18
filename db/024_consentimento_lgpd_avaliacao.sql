-- Handoff v2 (17/09), Parte 5.3: "Consentimento LGPD explícito antes da
-- Rodada 1, informando que a avaliação é usada como contexto e não como
-- critério de corte." Timestamp gravado no banco (não só um checkbox
-- client-side) — é o que prova que o consentimento existiu.
alter table avaliacoes add column consentimento_lgpd_em timestamptz;

-- Grandfather clause: avaliações que já estavam em andamento (ou concluídas)
-- antes desta migração passaram pelo gate de e-mail sem a tela de
-- consentimento explícito — não dá pra pedir retroativamente. Usa
-- iniciado_em como marco (é o momento em que o candidato de fato entrou no
-- fluxo), só pra não travar quem já estava no meio da avaliação. Daqui pra
-- frente, todo novo consentimento é explícito de verdade (ver index.js).
update avaliacoes set consentimento_lgpd_em = iniciado_em where iniciado_em is not null;
