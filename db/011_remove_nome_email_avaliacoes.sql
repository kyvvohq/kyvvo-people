-- Mesma classe de bug da migration 009 (candidaturas.email): a migration
-- 007 renomeou candidatos->avaliacoes mas esqueceu de derrubar nome/email,
-- que ficaram orfãos e ainda not null — nada mais escreve neles (o app já
-- lê nome/email via join com candidatos), e isso quebrava (500) qualquer
-- tentativa de criar uma avaliação nova.
alter table avaliacoes drop column nome;
alter table avaliacoes drop column email;
