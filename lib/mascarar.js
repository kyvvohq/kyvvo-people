// Mascaramento reversível pro botão "Anonimizar" — troca de nome/e-mail/
// telefone completos por uma versão truncada, preservando o original em
// `candidatos.dados_originais` pra permitir reverter (ver migration 010).
function mascararNome(nome) {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return `${partes[0][0]}***`;
  return `${partes[0]} ${partes.slice(1).map((p) => `${p[0]}.`).join(' ')}`;
}

function mascararEmail(email) {
  const [usuario, dominio] = email.split('@');
  if (!dominio) return '***';
  const visivel = usuario.slice(0, 2);
  return `${visivel}${'*'.repeat(Math.max(usuario.length - visivel.length, 3))}@${dominio}`;
}

function mascararTelefone(telefone) {
  if (!telefone) return telefone;
  const final = telefone.slice(-2);
  const inicio = telefone.slice(0, Math.max(telefone.length - 6, 3));
  return `${inicio}****${final}`;
}

module.exports = { mascararNome, mascararEmail, mascararTelefone };
