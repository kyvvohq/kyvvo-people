const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

async function extrairTexto(buffer, tipo, nomeArquivo) {
  const ehPdf = tipo === 'application/pdf' || /\.pdf$/i.test(nomeArquivo || '');
  if (ehPdf) {
    const parser = new PDFParse({ data: buffer });
    try {
      const resultado = await parser.getText();
      return resultado.text || '';
    } finally {
      await parser.destroy();
    }
  }
  const resultado = await mammoth.extractRawText({ buffer });
  return resultado.value || '';
}

const REGEX_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const REGEX_TELEFONE = /(?:\+?55\s*)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/;

// Extração por regex/heurística de texto puro — não é IA, é um best-effort
// pra poupar digitação do recrutador. O formulário sempre fica editável
// antes de salvar, então um acerto parcial (ex: só o e-mail) já ajuda.
function extrairCamposDoTexto(texto) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const email = (texto.match(REGEX_EMAIL) || [])[0] || '';
  const telefone = (texto.match(REGEX_TELEFONE) || [])[0] || '';

  // Heurística de nome: primeira linha "razoável" nas primeiras linhas do
  // documento — sem @, sem sequência longa de dígitos, 2 a 6 palavras.
  let nome = '';
  for (const linha of linhas.slice(0, 8)) {
    if (linha.includes('@')) continue;
    if (/\d{4,}/.test(linha)) continue;
    const palavras = linha.split(/\s+/).filter(Boolean);
    if (palavras.length >= 2 && palavras.length <= 6 && linha.length <= 60) {
      nome = linha;
      break;
    }
  }

  return { nome, email, whatsapp: telefone.replace(/[^\d+]/g, '') };
}

module.exports = { extrairTexto, extrairCamposDoTexto };
