// Cliente WhatsApp do People = @kyvvohq/whatsapp com `prefixo: 'people_'`
// fixo em listarTemplates.
//
// Antes desta troca (2026-09-09), este arquivo era o cliente completo —
// extraído pro pacote compartilhado porque outros produtos Kyvvo vão
// precisar do mesmo mecanismo de envio (mesmo desenho do @kyvvohq/asaas: um
// pacote, cada produto com seu wrapper fino). A mesma WABA é compartilhada
// com o Studio (templates "confirmar_agenda" etc.) — sem o filtro de
// prefixo, a lista de templates do People traria os do Studio junto.
const base = require('@kyvvohq/whatsapp');

module.exports = {
  ...base,
  listarTemplates: () => base.listarTemplates({ prefixo: 'people_' }),
};
