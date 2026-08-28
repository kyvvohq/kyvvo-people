-- A migration 007 copiou telefone_e164 direto do texto livre de
-- candidaturas.whatsapp pra completar pessoas vindas de avaliação — mas a
-- normalização pra E.164 só existe em lib/telefone.js (JS), SQL puro não
-- passa por ela. Sem isso, dedup por telefone quebra pra quem já tinha
-- registro antes dessa migration (o número gravado não bate com o formato
-- que o app normaliza em cadastros novos).
update candidatos
set telefone_e164 = '+55' || regexp_replace(telefone_e164, '\D', '', 'g')
where telefone_e164 is not null
  and telefone_e164 !~ '^\+';
