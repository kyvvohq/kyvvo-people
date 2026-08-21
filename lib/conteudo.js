// Conteúdo interpretativo do relatório — texto de apresentação (nomes/descrições
// MBTI, taglines e insights por perfil), autoral, NÃO faz parte da matriz de
// pesos validada pelo usuário (essa é só em lib/inferencia.js). Pode ser
// editado livremente sem afetar o cálculo.
const { NOMES_PERFIL } = require('./inferencia');

const MBTI_TIPOS = {
  ISTJ: { nome: 'O Inspetor', descricao: 'Responsável, metódico, leal e orientado a fatos.' },
  ISFJ: { nome: 'O Protetor', descricao: 'Dedicado, atencioso e comprometido em cuidar dos outros.' },
  INFJ: { nome: 'O Idealista', descricao: 'Intuitivo, empático e movido por propósito.' },
  INTJ: { nome: 'O Estrategista', descricao: 'Analítico, independente e focado em visão de longo prazo.' },
  ISTP: { nome: 'O Artesão', descricao: 'Prático, observador e hábil em resolver problemas concretos.' },
  ISFP: { nome: 'O Artista', descricao: 'Sensível, discreto e guiado por valores pessoais.' },
  INFP: { nome: 'O Mediador', descricao: 'Idealista, empático e fiel aos próprios valores.' },
  INTP: { nome: 'O Pensador', descricao: 'Curioso, lógico e movido pela busca de entendimento.' },
  ESTP: { nome: 'O Empreendedor', descricao: 'Ágil, direto e orientado para a ação imediata.' },
  ESFP: { nome: 'O Animador', descricao: 'Espontâneo, sociável e entusiasmado com a vida.' },
  ENFP: { nome: 'O Inspirador', descricao: 'Criativo, caloroso e cheio de possibilidades.' },
  ENTP: { nome: 'O Inovador', descricao: 'Engenhoso, argumentativo e aberto a novas ideias.' },
  ESTJ: { nome: 'O Organizador', descricao: 'Direto, estruturado e orientado para resultados.' },
  ESFJ: { nome: 'O Anfitrião', descricao: 'Cooperativo, caloroso e atento às necessidades do grupo.' },
  ENFJ: { nome: 'O Mobilizador', descricao: 'Carismático, empático e habilidoso em engajar pessoas.' },
  ENTJ: { nome: 'O Comandante', descricao: 'Decidido, estratégico e natural na liderança.' },
};

const PERFIL_TAGLINE = {
  A: 'Precisão, qualidade e pensamento crítico',
  C: 'Entusiasmo, conexão e influência genuína',
  E: 'Agilidade, decisão e foco em resultado',
  P: 'Consistência, cuidado e confiabilidade',
};

const PERFIL_CONVERGENCIA = {
  A: 'analítico e criterioso',
  C: 'comunicativo e envolvente',
  E: 'decidido e orientado a resultados',
  P: 'confiável e consistente',
};

const PERFIL_INSIGHTS = {
  A: {
    pontosFortes: [
      'Analisa situações com profundidade antes de agir',
      'Entrega trabalho de alta qualidade e precisão',
      'Identifica falhas que outros não percebem',
      'Referência de confiabilidade e rigor técnico',
    ],
    pontosAtencao: [
      'Pode travar decisões por excesso de análise',
      'Dificuldade em aceitar mudanças rápidas',
      'Tende a ser muito crítico consigo e com os outros',
    ],
    comoAproveitar: [
      'Coloque como responsável por qualidade e padrões',
      'Envolva em processos de melhoria contínua',
      'Dê tempo adequado para análise',
    ],
  },
  C: {
    pontosFortes: [
      'Cria conexão genuína e rapidamente com pessoas',
      'Comunica ideias de forma clara e envolvente',
      'Contagia o time com entusiasmo e energia positiva',
      'Facilita negociações e resolve conflitos interpessoais',
    ],
    pontosAtencao: [
      'Pode priorizar aprovação social em vez de dados',
      'Tende a se dispersar entre muitas ideias ao mesmo tempo',
      'Pode evitar conversas difíceis pra não gerar atrito',
    ],
    comoAproveitar: [
      'Coloque em papéis de relacionamento com clientes e time',
      'Envolva em apresentações e comunicação de mudanças',
      'Dê liberdade para propor ideias, com prazos claros',
    ],
  },
  E: {
    pontosFortes: [
      'Toma decisões rápidas mesmo sob pressão',
      'Foca em resultado e remove obstáculos com agilidade',
      'Assume riscos calculados quando necessário',
      'Mantém o ritmo do time voltado para entrega',
    ],
    pontosAtencao: [
      'Pode passar por cima de detalhes importantes na pressa',
      'Tende a ser direto demais em momentos que pedem tato',
      'Pode perder paciência com processos mais lentos',
    ],
    comoAproveitar: [
      'Coloque à frente de entregas com prazo apertado',
      'Dê autonomia para decidir dentro de limites claros',
      'Use para destravar projetos parados',
    ],
  },
  P: {
    pontosFortes: [
      'Mantém consistência e previsibilidade na execução',
      'Constrói confiança pela lealdade e constância',
      'Cuida dos detalhes que garantem estabilidade do time',
      'É paciente e confiável em processos de longo prazo',
    ],
    pontosAtencao: [
      'Pode resistir a mudanças bruscas de plano',
      'Tende a evitar conflito mesmo quando necessário',
      'Pode demorar mais para se adaptar a um novo contexto',
    ],
    comoAproveitar: [
      'Coloque em funções que exigem constância e cuidado',
      'Dê tempo de adaptação antes de mudanças grandes',
      'Valorize publicamente a estabilidade que ele traz ao time',
    ],
  },
};

// Monta o texto de apresentação do relatório a partir do `resultado` já
// calculado (lib/inferencia.js) — puramente derivado, não recalcula nada.
function montarResumo(resultado, nome) {
  const perfil = resultado.perfilDominante.perfil;
  const mbtiInfo = MBTI_TIPOS[resultado.mbti.tipo] || { nome: '', descricao: '' };

  const tracosOrdenados = Object.values(resultado.bigFive)
    .filter((t) => t.nivel === 'elevado')
    .sort((a, b) => b.percentil - a.percentil)
    .slice(0, 2);

  const bullets = [
    `${NOMES_PERFIL[perfil]}: ${PERFIL_TAGLINE[perfil]}`,
    `${resultado.mbti.tipo} (${mbtiInfo.nome}): ${mbtiInfo.descricao}`,
  ];
  if (tracosOrdenados.length) {
    const nomesTracos = tracosOrdenados.map((t) => t.nome).join(' e ');
    bullets.push(`Traços mais marcantes: ${nomesTracos} — combinação que reforça o perfil ${NOMES_PERFIL[perfil]}`);
  }
  bullets.push(`Os três modelos convergem para um profissional ${PERFIL_CONVERGENCIA[perfil]}`);

  const tracoDescricoes = {};
  for (const chave of Object.keys(resultado.bigFive)) {
    tracoDescricoes[chave] = TRACO_DESCRICAO[chave][resultado.bigFive[chave].nivel];
  }

  return {
    iniciais: iniciaisDoNome(nome),
    tagline: PERFIL_TAGLINE[perfil],
    mbtiNome: mbtiInfo.nome,
    mbtiDescricao: mbtiInfo.descricao,
    bulletsResumo: bullets,
    tracosMarcantes: tracosOrdenados,
    tracoDescricoes,
    ...PERFIL_INSIGHTS[perfil],
  };
}

const TRACO_DESCRICAO = {
  o: {
    elevado: 'Criativo, curioso e aberto a novas experiências.',
    médio: 'Equilíbrio entre tradição e novidade, conforme a situação.',
    baixo: 'Prefere o familiar e o comprovado ao invés do experimental.',
  },
  c: {
    elevado: 'Organizado, disciplinado e orientado a metas.',
    médio: 'Equilibra estrutura e flexibilidade conforme o contexto.',
    baixo: 'Mais espontâneo e flexível, menos preso a planos rígidos.',
  },
  ex: {
    elevado: 'Sociável, assertivo e energizado pelo convívio social.',
    médio: 'Transita bem entre momentos sociais e momentos reservados.',
    baixo: 'Reservado, prefere ambientes calmos e menos estimulantes.',
  },
  ag: {
    elevado: 'Cooperativo, empático e orientado às pessoas.',
    médio: 'Equilibra cooperação com posicionamento firme quando necessário.',
    baixo: 'Mais direto e competitivo, prioriza fatos sobre consenso.',
  },
  ne: {
    elevado: 'Calmo, resiliente e estável mesmo sob pressão.',
    médio: 'Reage às pressões do dia a dia de forma equilibrada.',
    baixo: 'Sensível e reativo — sente emoções com intensidade.',
  },
};

function iniciaisDoNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

module.exports = { MBTI_TIPOS, PERFIL_TAGLINE, PERFIL_CONVERGENCIA, PERFIL_INSIGHTS, TRACO_DESCRICAO, montarResumo };
