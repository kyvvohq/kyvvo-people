// Cliente Asaas do People = @kyvvohq/asaas com `produtoNome` fixo em
// 'Kyvvo People'.
//
// Antes desta troca, este arquivo era uma reimplementação da mesma lógica que
// o server/panel/asaas-service.js do Studio (repos/deploys separados, não
// porque o desenho mudou). Agora os dois consomem o pacote único; a única
// diferença do People é o nome do produto na `description` da subscription.
const base = require('@kyvvohq/asaas');

module.exports = {
  ...base,
  criarSubscription: (args) => base.criarSubscription({ produtoNome: 'Kyvvo People', ...args }),
  atualizarSubscription: (args) => base.atualizarSubscription({ produtoNome: 'Kyvvo People', ...args }),
};
