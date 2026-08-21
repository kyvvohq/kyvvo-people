const PDFDocument = require('pdfkit');
const { NOMES_PERFIL } = require('./inferencia');

function linhaTitulo(doc, texto) {
  doc.moveDown(1.2).fontSize(14).fillColor('#12162a').text(texto, { underline: false });
  doc.moveDown(0.3).fontSize(10).fillColor('#444');
}

function linhaBarra(doc, label, valor) {
  const largura = 200;
  const x = doc.x;
  const y = doc.y;
  doc.fontSize(9).fillColor('#333').text(`${label}`, x, y, { continued: false });
  doc.text(`${valor}%`, x + largura + 10, y);
  doc.rect(x, y + 12, largura, 6).fill('#e5e5f0');
  doc.rect(x, y + 12, Math.max(largura * (valor / 100), 0), 6).fill('#a688ff');
  doc.moveDown(1.4);
}

function linhaLista(doc, itens) {
  for (const item of itens) {
    doc.fontSize(9).fillColor('#333').text(`• ${item}`);
  }
}

// candidato: linha da tabela `candidatos` (nome, resultado jsonb já calculado).
// resumo: saída de lib/conteudo.js#montarResumo, com o texto interpretativo.
function gerarRelatorioPdf(candidato, resumo) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const { resultado } = candidato;

  doc.fontSize(20).fillColor('#12162a').text('Relatório de Avaliação Comportamental', { align: 'left' });
  doc.moveDown(0.5).fontSize(11).fillColor('#555').text(`Candidato: ${candidato.nome}`);
  doc.text(`Data de conclusão: ${new Date(candidato.concluido_em).toLocaleDateString('pt-BR')}`);

  linhaTitulo(doc, `Perfil dominante: ${resultado.perfilDominante.nome} — ${resumo.tagline}`);
  linhaLista(doc, resumo.bulletsResumo);

  linhaTitulo(doc, 'Profiler — Rodada 1 (como eu me vejo)');
  for (const perfil of ['A', 'C', 'E', 'P']) {
    linhaBarra(doc, NOMES_PERFIL[perfil], resultado.rodada1.profiler[perfil]);
  }

  linhaTitulo(doc, 'Profiler — Rodada 2 (como os outros me veem)');
  for (const perfil of ['A', 'C', 'E', 'P']) {
    linhaBarra(doc, NOMES_PERFIL[perfil], resultado.rodada2.profiler[perfil]);
  }

  linhaTitulo(doc, 'Análise de gaps entre as rodadas');
  for (const perfil of ['A', 'C', 'E', 'P']) {
    const gap = resultado.gaps[perfil];
    doc.fontSize(10).fillColor('#333').text(`${gap.nome}: ${gap.diff > 0 ? '+' : ''}${gap.diff} pontos — ${gap.leitura}`);
  }

  linhaTitulo(doc, `Tipo MBTI: ${resultado.mbti.tipo} — ${resumo.mbtiNome}`);
  doc.fontSize(9).fillColor('#333').text(resumo.mbtiDescricao);

  linhaTitulo(doc, 'Big Five / OCEAN');
  for (const chave of Object.keys(resultado.bigFive)) {
    const t = resultado.bigFive[chave];
    doc.fontSize(9).fillColor('#333').text(`${t.nome}: ${t.percentil}% (${t.nivel})`);
  }

  linhaTitulo(doc, 'Pontos fortes');
  linhaLista(doc, resumo.pontosFortes);

  linhaTitulo(doc, 'Pontos de atenção');
  linhaLista(doc, resumo.pontosAtencao);

  linhaTitulo(doc, 'Como aproveitar melhor esse perfil');
  linhaLista(doc, resumo.comoAproveitar);

  doc.end();
  return doc;
}

module.exports = { gerarRelatorioPdf };
