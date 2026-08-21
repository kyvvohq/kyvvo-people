function normalizar(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}

function digitoVerificador(base) {
  let soma = 0;
  let peso = base.length + 1;
  for (const char of base) {
    soma += Number(char) * peso;
    peso -= 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

// Valida os dígitos verificadores (não apenas o tamanho) e rejeita sequências
// repetidas (ex: 111.111.111-11), que passariam no checksum mas não são CPFs
// reais.
function validarCpf(cpf) {
  const digitos = normalizar(cpf);
  if (digitos.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  const d1 = digitoVerificador(digitos.slice(0, 9));
  const d2 = digitoVerificador(digitos.slice(0, 9) + String(d1));
  return digitos === digitos.slice(0, 9) + String(d1) + String(d2);
}

module.exports = { normalizar, validarCpf };
