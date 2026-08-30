-- O gate de acesso ao link de avaliação deixou de ser CPF e virou o
-- e-mail já cadastrado no perfil do candidato (candidatos.email) —
-- decisão do Bruno em 2026-08-28. CPF nunca identificava a pessoa (isso
-- já era telefone/e-mail via dedup), só servia de segredo de destrave;
-- com o e-mail cumprindo esse papel, a coluna fica sem uso.
alter table avaliacoes drop column cpf;
