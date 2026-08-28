-- A migration 007 moveu nome/whatsapp/linkedin de candidaturas pra
-- candidatos (pessoa), mas esqueceu a coluna email — que ficou órfã,
-- ainda not null, e quebra toda candidatura nova (nada mais escreve nela,
-- o app já lê email via join com candidatos).
alter table candidaturas drop column email;
