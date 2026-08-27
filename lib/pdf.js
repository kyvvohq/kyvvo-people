const PDFDocument = require('pdfkit');

// Réplica visual (cores/estrutura) do relatório em public/relatorio.html,
// pra que o PDF exportado bata com o que a psicóloga vê em tela.
const COR = {
  bg: '#F8F9FC',
  card: '#FFFFFF',
  border: '#E7EAF2',
  texto: '#0F111A',
  textoSecundario: '#2B3040',
  muted: '#6B7385',
  accent: '#7C5CFC',
  accentStrong: '#4E33C4',
  accentTint: '#F1EEFF',
  success: '#12B76A',
  successTint: '#E3F9EE',
  warning: '#F79009',
  warningText: '#B54708',
  warningTint: '#FCEEDA',
  track: '#F1F3F8',
};

const NOMES = { A: 'Analista', C: 'Comunicador', E: 'Executor', P: 'Planejador' };
const CORES_PERFIL = { A: '#7C5CFC', C: '#12B76A', E: '#F79009', P: '#0BA3CC' };
const DICOTOMIAS = [
  { chave: 'ei', neg: 'Introversão', pos: 'Extroversão' },
  { chave: 'sn', neg: 'Intuição', pos: 'Sensação' },
  { chave: 'tf', neg: 'Sentimento', pos: 'Pensamento' },
  { chave: 'jp', neg: 'Percepção', pos: 'Julgamento' },
];

const PAD = 20;
const GAP = 16;

function pintarFundo(doc) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(COR.bg);
}

function novoEstado(doc) {
  return { doc, x: doc.page.margins.left, w: doc.page.width - doc.page.margins.left - doc.page.margins.right, y: doc.page.margins.top };
}

function garantirEspaco(estado, altura) {
  const limite = estado.doc.page.height - estado.doc.page.margins.bottom;
  if (estado.y + altura > limite) {
    estado.doc.addPage();
    estado.y = estado.doc.page.margins.top;
  }
}

function alturaTexto(doc, texto, largura, fonte, tamanho, opts) {
  doc.font(fonte).fontSize(tamanho);
  return doc.heightOfString(texto, Object.assign({ width: largura }, opts));
}

function alturaLista(doc, itens, largura, tamanho) {
  doc.font('Helvetica').fontSize(tamanho);
  return itens.reduce((soma, item) => soma + doc.heightOfString(`•  ${item}`, { width: largura - 4 }) + 5, 0);
}

function desenharLista(doc, itens, x, y, largura, cor, tamanho) {
  doc.font('Helvetica').fontSize(tamanho).fillColor(cor);
  let cursorY = y;
  for (const item of itens) {
    const h = doc.heightOfString(`•  ${item}`, { width: largura - 4 });
    doc.text(`•  ${item}`, x, cursorY, { width: largura - 4 });
    cursorY += h + 5;
  }
  return cursorY - y;
}

function desenharH2(doc, texto, x, y, largura) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.muted);
  doc.text(texto.toUpperCase(), x, y, { width: largura, characterSpacing: 0.6 });
}

// Desenha o fundo (card branco arredondado) de uma seção e devolve o (x,y)
// interno onde o conteúdo deve começar. `altura` é a altura TOTAL do card
// (incluindo padding), calculada antes por quem chama.
function abrirCard(estado, altura) {
  garantirEspaco(estado, altura + GAP);
  const { doc, x, y, w } = estado;
  doc.roundedRect(x, y, w, altura, 14).fillAndStroke(COR.card, COR.border);
  const interno = { x: x + PAD, y: y + PAD, w: w - PAD * 2 };
  estado.y += altura + GAP;
  return interno;
}

function pill(doc, texto, x, y, bg, cor) {
  doc.font('Helvetica-Bold').fontSize(8.5);
  const largura = doc.widthOfString(texto) + 20;
  doc.roundedRect(x, y, largura, 20, 10).fill(bg);
  doc.fillColor(cor).text(texto, x + 10, y + 5.5);
  return largura;
}

function barraProgresso(doc, x, y, largura, altura, valorPct, corFundo, corPreenchida, opacidade) {
  doc.roundedRect(x, y, largura, altura, altura / 2).fill(corFundo);
  const w = Math.max(largura * (Math.min(valorPct, 100) / 100), altura);
  doc.save();
  if (opacidade !== undefined) doc.fillOpacity(opacidade);
  doc.roundedRect(x, y, w, altura, altura / 2).fill(corPreenchida);
  doc.restore();
}

function svgRadar(doc, x, y, largura, r1, r2) {
  const cx = x + largura / 2;
  const cy = y + 110;
  const raio = 75;
  const eixos = [
    { chave: 'A', angulo: -Math.PI / 2, ancora: 'meio' },
    { chave: 'C', angulo: 0, ancora: 'inicio' },
    { chave: 'E', angulo: Math.PI / 2, ancora: 'meio' },
    { chave: 'P', angulo: Math.PI, ancora: 'fim' },
  ];
  const ponto = (angulo, escala) => [cx + Math.cos(angulo) * raio * escala, cy + Math.sin(angulo) * raio * escala];

  // grades concêntricas
  for (const escala of [0.25, 0.5, 0.75, 1]) {
    const pontos = eixos.map((e) => ponto(e.angulo, escala));
    doc.polygon(...pontos).stroke(COR.border);
  }
  // eixos
  for (const e of eixos) {
    const [px, py] = ponto(e.angulo, 1);
    doc.moveTo(cx, cy).lineTo(px, py).stroke(COR.border);
  }

  const poligono = (dados) => eixos.map((e) => ponto(e.angulo, dados[e.chave] / 100));

  doc.save();
  doc.fillOpacity(0.16);
  doc.polygon(...poligono(r1)).fill(COR.accent);
  doc.restore();
  doc.lineWidth(2);
  doc.polygon(...poligono(r1)).stroke(COR.accent);

  doc.save();
  doc.fillOpacity(0.12);
  doc.polygon(...poligono(r2)).fill(COR.success);
  doc.restore();
  doc.dash(4, { space: 3 });
  doc.polygon(...poligono(r2)).stroke(COR.success);
  doc.undash();
  doc.lineWidth(1);

  doc.font('Helvetica').fontSize(10).fillColor(COR.muted);
  for (const e of eixos) {
    const [lx, ly] = ponto(e.angulo, 1);
    const rotulo = NOMES[e.chave];
    const lw = doc.widthOfString(rotulo);
    let tx = lx - lw / 2;
    if (e.ancora === 'inicio') tx = lx + 8;
    if (e.ancora === 'fim') tx = lx - lw - 8;
    let ty = ly - 5;
    if (e.chave === 'A') ty = ly - 18;
    if (e.chave === 'E') ty = ly + 8;
    doc.text(rotulo, tx, ty, { lineBreak: false });
  }

  return 240; // altura ocupada pelo radar dentro do card
}

// candidato: linha da tabela `candidatos` (nome, resultado jsonb já calculado).
// resumo: saída de lib/conteudo.js#montarResumo, com o texto interpretativo.
function gerarRelatorioPdf(candidato, resumo) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', autoFirstPage: true });
  doc.on('pageAdded', () => pintarFundo(doc));
  pintarFundo(doc);

  const r = candidato.resultado;
  const estado = novoEstado(doc);

  // Cabeçalho
  doc.roundedRect(estado.x, estado.y, 22, 22, 6).fill(COR.texto);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#fff').text('k', estado.x, estado.y + 4.5, { width: 22, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COR.texto).text('Kyvvo People', estado.x + 30, estado.y + 4);
  doc.font('Helvetica').fontSize(9).fillColor(COR.muted)
    .text('Relatório de avaliação comportamental', estado.x, estado.y + 5, { width: estado.w, align: 'right' });
  estado.y += 40;

  // Identificação do candidato (avatar + nome + tags)
  const cxTopo = estado.x + estado.w / 2;
  doc.circle(cxTopo, estado.y + 32, 32).fillAndStroke(COR.accentTint, COR.accent);
  doc.font('Helvetica-Bold').fontSize(18).fillColor(COR.accent)
    .text(resumo.iniciais, estado.x, estado.y + 22, { width: estado.w, align: 'center' });
  estado.y += 76;

  doc.font('Helvetica-Bold').fontSize(19).fillColor(COR.texto)
    .text(candidato.nome, estado.x, estado.y, { width: estado.w, align: 'center' });
  estado.y += 26;

  const tags = `${NOMES[r.perfilDominante.perfil]} · ${r.mbti.tipo} · OCEAN`;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COR.accent)
    .text(tags, estado.x, estado.y, { width: estado.w, align: 'center' });
  estado.y += 16;

  doc.font('Helvetica').fontSize(10).fillColor(COR.muted)
    .text(resumo.tagline, estado.x, estado.y, { width: estado.w, align: 'center' });
  estado.y += 15;

  doc.font('Helvetica').fontSize(8.5).fillColor(COR.muted)
    .text(`Concluído em ${new Date(candidato.concluido_em).toLocaleDateString('pt-BR')}`, estado.x, estado.y, { width: estado.w, align: 'center' });
  estado.y += 28;

  // Card: Perfil identificado
  {
    const pillsY = 18;
    const bulletsAltura = alturaLista(doc, resumo.bulletsResumo, estado.w - PAD * 2, 9.5);
    const alturaConteudo = pillsY + 28 + bulletsAltura;
    const altura = alturaConteudo + PAD * 2;
    const c = abrirCard(estado, altura);
    desenharH2(doc, 'Perfil identificado', c.x, c.y, c.w);
    let px = c.x;
    const py = c.y + 18;
    px += pill(doc, NOMES[r.perfilDominante.perfil], px, py, COR.accentTint, COR.accentStrong) + 8;
    px += pill(doc, `${r.mbti.tipo} — ${resumo.mbtiNome}`, px, py, COR.successTint, COR.success) + 8;
    for (const t of resumo.tracosMarcantes) {
      px += pill(doc, `${t.nome} elevado`, px, py, COR.warningTint, COR.warningText) + 8;
    }
    desenharLista(doc, resumo.bulletsResumo, c.x, py + 26, c.w, COR.textoSecundario, 9.5);
  }

  // Card: Profiler comportamental (radar)
  {
    const alturaRadar = 240;
    const alturaLegenda = 16;
    const altura = 18 + alturaRadar + alturaLegenda + PAD * 2;
    const c = abrirCard(estado, altura);
    desenharH2(doc, 'Profiler comportamental', c.x, c.y, c.w);
    svgRadar(doc, c.x, c.y + 18, c.w, r.rodada1.profiler, r.rodada2.profiler);

    const legendaY = c.y + 18 + alturaRadar - 6;
    doc.font('Helvetica').fontSize(9).fillColor(COR.muted);
    const l1 = 'Como me vejo';
    const l2 = 'Como os outros me veem';
    const l1w = doc.widthOfString(l1) + 16;
    const l2w = doc.widthOfString(l2) + 16;
    const totalW = l1w + l2w + 20;
    let lx = c.x + (c.w - totalW) / 2;
    doc.circle(lx + 4, legendaY + 5, 4).fill(COR.accent);
    doc.fillColor(COR.muted).text(l1, lx + 12, legendaY, { lineBreak: false });
    lx += l1w + 20;
    doc.circle(lx + 4, legendaY + 5, 4).fill(COR.success);
    doc.fillColor(COR.muted).text(l2, lx + 12, legendaY, { lineBreak: false });
  }

  // Card: barras comparativas por perfil (rodada 1 x rodada 2)
  {
    const linhas = Object.keys(NOMES).length;
    const alturaLinha = 34;
    const altura = alturaLinha * linhas + PAD * 2 - 8;
    const c = abrirCard(estado, altura);
    let ly = c.y;
    for (const p of Object.keys(NOMES)) {
      const v1 = r.rodada1.profiler[p];
      const v2 = r.rodada2.profiler[p];
      doc.font('Helvetica').fontSize(10.5).fillColor(COR.texto).text(NOMES[p], c.x, ly, { continued: false, lineBreak: false });
      doc.font('Helvetica').fontSize(9).fillColor(COR.muted).text(`${v1}% / ${v2}%`, c.x, ly, { width: c.w, align: 'right', lineBreak: false });
      barraProgresso(doc, c.x, ly + 16, c.w, 7, v1, COR.track, CORES_PERFIL[p]);
      barraProgresso(doc, c.x, ly + 25, c.w, 5, v2, COR.track, CORES_PERFIL[p], 0.5);
      ly += alturaLinha;
    }
  }

  // Card: análise de gaps
  {
    const alinhados = Object.values(r.gaps).filter((g) => g.leitura === 'Alinhamento');
    const divergentes = Object.values(r.gaps).filter((g) => g.leitura !== 'Alinhamento');
    const meio = alinhados.length && divergentes.length;
    const largura = meio ? (estado.w - PAD * 2 - 12) / 2 : estado.w - PAD * 2;
    const larguraTextoItem = largura - 28;

    const itensAlinhados = alinhados.map((g) => g.nome);
    const itensDivergentes = divergentes.map((g) => `${g.nome}: ${g.leitura} (${g.diff > 0 ? '+' : ''}${g.diff}%)`);
    const medirItens = (itens) => {
      doc.font('Helvetica').fontSize(9);
      return itens.reduce((soma, item) => soma + doc.heightOfString(item, { width: larguraTextoItem }) + 6, 0);
    };
    const alturaBoxes = 32 + Math.max(medirItens(itensAlinhados), medirItens(itensDivergentes)) + 10;

    const altura = 18 + alturaBoxes + PAD * 2;
    const c = abrirCard(estado, altura);
    desenharH2(doc, 'Análise de gaps', c.x, c.y, c.w);

    const desenharBox = (x, titulo, itens, bg, cor) => {
      doc.roundedRect(x, c.y + 18, largura, alturaBoxes, 10).fill(bg);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(cor).text(titulo.toUpperCase(), x + 14, c.y + 18 + 12, { characterSpacing: 0.4 });
      doc.font('Helvetica').fontSize(9).fillColor(cor);
      let iy = c.y + 18 + 32;
      for (const item of itens) {
        const h = doc.heightOfString(item, { width: larguraTextoItem });
        doc.text(item, x + 14, iy, { width: larguraTextoItem });
        iy += h + 6;
      }
    };
    let bx = c.x;
    if (alinhados.length) {
      desenharBox(bx, 'Alinhamento', itensAlinhados, COR.accentTint, COR.accentStrong);
      bx += largura + 12;
    }
    if (divergentes.length) {
      desenharBox(bx, 'Divergências', itensDivergentes, COR.warningTint, COR.warningText);
    }
  }

  // Card: MBTI detalhado
  {
    const descAltura = alturaTexto(doc, resumo.mbtiDescricao, r.mbti ? estado.w - PAD * 2 : 0, 'Helvetica', 9.5, { align: 'center' });
    const topoAltura = 34 + 16 + descAltura + 14;
    const dicotomiasAltura = DICOTOMIAS.length * 34;
    const altura = topoAltura + dicotomiasAltura + PAD * 2;
    const c = abrirCard(estado, altura);
    desenharH2(doc, 'Tipo MBTI detalhado', c.x, c.y, c.w);

    let ty = c.y + 22;
    doc.font('Helvetica-Bold').fontSize(24).fillColor(COR.accent).text(r.mbti.tipo, c.x, ty, { width: c.w, align: 'center', characterSpacing: 1 });
    ty += 30;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COR.texto).text(resumo.mbtiNome, c.x, ty, { width: c.w, align: 'center' });
    ty += 15;
    doc.font('Helvetica').fontSize(9.5).fillColor(COR.muted).text(resumo.mbtiDescricao, c.x, ty, { width: c.w, align: 'center' });
    ty += descAltura + 20;

    for (const d of DICOTOMIAS) {
      const info = r.mbti.dicotomias[d.chave];
      const posicao = ((info.normalizado + 100) / 200) * 100;
      const negAtivo = info.normalizado < 0;

      doc.font('Helvetica').fontSize(9);
      doc.fillColor(negAtivo ? COR.success : '#98A0B0').text(d.neg, c.x, ty, { lineBreak: false });
      doc.font(negAtivo ? 'Helvetica' : 'Helvetica-Bold');
      doc.fillColor(!negAtivo ? COR.success : '#98A0B0').text(d.pos, c.x, ty, { width: c.w, align: 'right', lineBreak: false });

      const trackY = ty + 16;
      doc.roundedRect(c.x, trackY, c.w, 6, 3).fill(COR.track);
      const fillW = Math.max(c.w * (posicao / 100), 6);
      doc.roundedRect(c.x, trackY, fillW, 6, 3).fill(COR.success);
      const marcadorX = c.x + (c.w * posicao) / 100;
      doc.circle(marcadorX, trackY + 3, 5).fillAndStroke(COR.accent, '#fff');

      ty += 34;
    }
  }

  // Card: Big Five / OCEAN
  {
    const chaves = Object.keys(r.bigFive);
    const cols = 2;
    const gapCol = 12;
    const colW = (estado.w - PAD * 2 - gapCol) / cols;
    doc.font('Helvetica').fontSize(8.5);
    const descAlturas = chaves.map((k) => doc.heightOfString(resumo.tracoDescricoes[k], { width: colW - 28 }));
    const linhaAltura = chaves.map((_, i) => 20 + 10 + descAlturas[i] + 16);
    const linhas = Math.ceil(chaves.length / cols);
    let alturaGrid = 0;
    for (let linha = 0; linha < linhas; linha++) {
      const idx1 = linha * cols;
      const idx2 = idx1 + 1;
      const alturasLinha = [linhaAltura[idx1], linhaAltura[idx2]].filter((v) => v !== undefined);
      alturaGrid += Math.max(...alturasLinha) + gapCol;
    }
    const altura = 18 + alturaGrid + PAD * 2 - gapCol;
    const c = abrirCard(estado, altura);
    desenharH2(doc, 'Big Five — OCEAN', c.x, c.y, c.w);

    let gy = c.y + 18;
    for (let linha = 0; linha < linhas; linha++) {
      const idxs = [linha * cols, linha * cols + 1].filter((i) => i < chaves.length);
      const alturaLinhaAtual = Math.max(...idxs.map((i) => linhaAltura[i]));
      idxs.forEach((i, col) => {
        const chave = chaves[i];
        const t = r.bigFive[chave];
        const bx = c.x + col * (colW + gapCol);
        doc.roundedRect(bx, gy, colW, alturaLinhaAtual, 10).fillAndStroke(COR.bg, COR.border);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(COR.texto).text(t.nome, bx + 14, gy + 12, { continued: false, lineBreak: false, width: colW - 60 });
        doc.font('Helvetica-Bold').fontSize(10).fillColor(COR.texto).text(`${t.percentil}%`, bx + 14, gy + 12, { width: colW - 28, align: 'right', lineBreak: false });
        barraProgresso(doc, bx + 14, gy + 30, colW - 28, 6, t.percentil, COR.track, COR.accent);
        doc.font('Helvetica').fontSize(8.5).fillColor(COR.muted).text(resumo.tracoDescricoes[chave], bx + 14, gy + 42, { width: colW - 28 });
      });
      gy += alturaLinhaAtual + gapCol;
    }
  }

  // Card: relação com o perfil (fortes / atenção / aproveitar)
  {
    const largura = estado.w - PAD * 2;
    const tituloAltura = 16;
    const hFortes = alturaLista(doc, resumo.pontosFortes, largura, 9.5);
    const hAtencao = alturaLista(doc, resumo.pontosAtencao, largura, 9.5);
    const hAproveitar = alturaLista(doc, resumo.comoAproveitar, largura, 9.5);
    const alturaConteudo = (tituloAltura + hFortes + 14) + (tituloAltura + hAtencao + 14) + (tituloAltura + hAproveitar);
    const altura = 18 + alturaConteudo + PAD * 2;
    const c = abrirCard(estado, altura);
    desenharH2(doc, 'Relação com o perfil', c.x, c.y, c.w);

    let sy = c.y + 24;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COR.success).text('Pontos fortes', c.x, sy);
    sy += tituloAltura;
    sy += desenharLista(doc, resumo.pontosFortes, c.x, sy, c.w, COR.textoSecundario, 9.5) + 14;

    doc.font('Helvetica-Bold').fontSize(10).fillColor(COR.warningText).text('Pontos de atenção', c.x, sy);
    sy += tituloAltura;
    sy += desenharLista(doc, resumo.pontosAtencao, c.x, sy, c.w, COR.textoSecundario, 9.5) + 14;

    doc.font('Helvetica-Bold').fontSize(10).fillColor(COR.accent).text('Como aproveitar melhor esse perfil', c.x, sy);
    sy += tituloAltura;
    desenharLista(doc, resumo.comoAproveitar, c.x, sy, c.w, COR.textoSecundario, 9.5);
  }

  doc.end();
  return doc;
}

module.exports = { gerarRelatorioPdf };
