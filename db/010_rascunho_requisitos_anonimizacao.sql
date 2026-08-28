-- Rascunho de vaga: só "nome" continua sempre obrigatório, o resto vira
-- opcional pra permitir salvar incompleto (sair sem preencher tudo pede
-- pra salvar como rascunho, feito no app).
alter table vagas alter column descricao drop not null;
alter table vagas alter column nivel_experiencia drop not null;
alter table vagas alter column cargo drop not null;
alter table vagas alter column requisitos drop not null;
alter table vagas alter column competencias drop not null;
alter table vagas drop constraint vagas_status_check;
alter table vagas add constraint vagas_status_check
  check (status = any (array['rascunho', 'nova', 'em_andamento', 'pausada', 'encerrada']));

-- Fundação do motor de match (seção 3.1 da especificação) — schema de
-- requisitos estruturados convivendo com o campo `requisitos` texto livre
-- já existente (descritivo legível pro candidato). O motor de cálculo de
-- score a partir disso é trabalho futuro, não construído nesta rodada.
alter table vagas add column requisitos_estruturados jsonb not null default '[]'::jsonb;
alter table vagas add column limites jsonb not null default '{"max_eliminatorios": 3}'::jsonb;
alter table vagas add column campos_excluidos_score jsonb not null default
  '["idade","ano_formatura","genero","estado_civil","nome","foto","endereco_completo","gaps_temporais_nao_justificados"]'::jsonb;

-- Anonimizar vira truncar+reversível (decisão do Bruno em 2026-08-28,
-- ciente que isso deixa de ser anonimização de verdade pra LGPD Art. 12 —
-- vira pseudonimização, dado original é preservado pra permitir reverter).
alter table candidatos add column dados_originais jsonb;

-- Unicidade de telefone/e-mail só entre pessoas ativas: com o truncamento
-- os valores mascarados deixaram de ser garantidamente distintos entre
-- pessoas diferentes (antes o campo virava null, que nunca colide em
-- UNIQUE). Pessoa mascarada já não participa de dedup mesmo, então tirar
-- ela da constraint não abre brecha nenhuma.
alter table candidatos drop constraint candidatos_tenant_id_email_key;
alter table candidatos drop constraint candidatos_tenant_id_telefone_e164_key;
create unique index candidatos_email_ativo_idx on candidatos (tenant_id, email) where anonimizado_em is null;
create unique index candidatos_telefone_ativo_idx on candidatos (tenant_id, telefone_e164) where anonimizado_em is null;
