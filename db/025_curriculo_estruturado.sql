-- Handoff v2 (17/09), #48: dados de carreira extraídos do currículo via
-- Claude Haiku (experiências/ferramentas/formação), pra alimentar o motor
-- de aderência (#47). Fica null até a extração rodar (best-effort,
-- assíncrona, nunca bloqueia a criação da candidatura) e pode ser
-- corrigido depois pelo recrutador (revisado_em/revisado_por registram
-- essa revisão humana, sem exigi-la).
alter table candidaturas add column curriculo_estruturado jsonb;
alter table candidaturas add column curriculo_estruturado_revisado_em timestamptz;
alter table candidaturas add column curriculo_estruturado_revisado_por text;
