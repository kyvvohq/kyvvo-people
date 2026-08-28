// Normaliza telefone brasileiro pra E.164 (+55DDNNNNNNNNN) — chave de dedup
// primária de pessoa (ver nota de arquitetura 2026-08-28). Best-effort: não
// valida DDD nem tamanho rígido, só normaliza o formato pra permitir
// comparação consistente entre "(11) 98765-4321", "11987654321" etc.
function paraE164(telefone) {
  if (!telefone) return null;
  let digitos = String(telefone).replace(/\D/g, '');
  if (!digitos) return null;

  if (digitos.startsWith('55') && digitos.length > 11) {
    // já tem o 55 do país
  } else if (digitos.length === 10 || digitos.length === 11) {
    digitos = `55${digitos}`;
  } else if (!digitos.startsWith('55')) {
    return `+${digitos}`;
  }
  return `+${digitos}`;
}

module.exports = { paraE164 };
