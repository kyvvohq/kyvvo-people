-- Redesenho do formulário de vaga (2026-08-31): código/cargo/competências
-- saem do formulário (colunas ficam no banco, só não são mais coletadas —
-- vagas antigas continuam com o dado, nada é apagado); nível de experiência
-- deixa de ser obrigatório (já era nullable desde a migration 010, só muda
-- a validação em index.js). Campos novos: empresa, cidade e tipo de vaga
-- (CLT/PJ/Estágio/Integral/Meio período).
alter table vagas add column empresa text;
alter table vagas add column cidade text;
alter table vagas add column tipo_vaga text
  check (tipo_vaga is null or tipo_vaga in ('CLT', 'PJ', 'Estágio', 'Integral', 'Meio período'));
