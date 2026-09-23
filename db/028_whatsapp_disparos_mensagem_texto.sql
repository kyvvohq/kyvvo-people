-- Espelha kyvvo-studio/server/db/081_whatsapp_disparos_mensagem_texto.sql —
-- coluna nova pra tela de Disparos mostrar o texto de fato enviado (com os
-- parâmetros já substituídos). Até aqui só se gravava o nome do template,
-- nunca o texto renderizado. Nullable: linhas antigas ficam sem esse texto
-- (a tela mostra "—").
alter table whatsapp_disparos add column mensagem_texto text;

-- whatsapp_fila guarda o item entre "decidiu enfileirar" (fora do horário
-- comercial) e "processou de fato" — precisa carregar o texto já calculado
-- no momento do enfileiramento.
alter table whatsapp_fila add column mensagem_texto text;
