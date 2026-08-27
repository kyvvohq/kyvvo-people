// Conteúdo interpretativo do relatório — texto de apresentação (nomes/descrições
// MBTI, taglines e insights por perfil), autoral, NÃO faz parte da matriz de
// pesos validada pelo usuário (essa é só em lib/inferencia.js). Pode ser
// editado livremente sem afetar o cálculo.
//
// Ordem de prioridade dos 3 modelos (decisão do usuário, 2026-08-27): o
// Big Five é o modelo condutor da interpretação final — Profiler e MBTI
// existem pra agregar informação e nuance a ele, não pra competir com ele.
// Isso se reflete em montarResumo(): pontosFortes/pontosAtencao partem dos
// traços de Big Five mais extremos do candidato, e só depois somam o que o
// Profiler e o MBTI acrescentam.
const { NOMES_PERFIL } = require('./inferencia');

const MBTI_TIPOS = {
  ISTJ: {
    nome: 'O Inspetor',
    descricao: 'Responsável, metódico, leal e orientado a fatos.',
    comoComunica: 'Direto e factual, prefere comunicar com dados e exemplos concretos a discursos abstratos.',
    comoDecide: 'Decide com base em experiência prévia, regras estabelecidas e fatos verificáveis.',
    comoReagePressao: 'Mantém a rotina e se apega a processos conhecidos para dar conta da pressão.',
    comoLidera: 'Lidera pelo exemplo e pela consistência, cobrando cumprimento de prazos e padrões.',
    comoAprende: 'Aprende melhor com prática estruturada, manuais claros e repetição.',
  },
  ISFJ: {
    nome: 'O Protetor',
    descricao: 'Dedicado, atencioso e comprometido em cuidar dos outros.',
    comoComunica: 'Comunica-se com cuidado e tato, atento a como a mensagem afeta o outro.',
    comoDecide: 'Decide priorizando o impacto nas pessoas envolvidas e a experiência acumulada do time.',
    comoReagePressao: 'Sob pressão, tende a se sobrecarregar tentando dar conta de tudo sozinho.',
    comoLidera: 'Lidera de forma discreta e protetora, sustentando o time nos bastidores.',
    comoAprende: 'Aprende observando exemplos práticos e replicando o que já deu certo antes.',
  },
  INFJ: {
    nome: 'O Idealista',
    descricao: 'Intuitivo, empático e movido por propósito.',
    comoComunica: 'Comunica com profundidade e propósito, prefere conversas significativas a bate-papo superficial.',
    comoDecide: 'Decide alinhando valores pessoais, intuição sobre pessoas e uma visão de longo prazo.',
    comoReagePressao: 'Sob pressão, tende a se isolar para processar antes de agir.',
    comoLidera: 'Lidera inspirando por um propósito compartilhado, mais que por autoridade formal.',
    comoAprende: 'Aprende melhor conectando o conteúdo a um significado ou causa maior.',
  },
  INTJ: {
    nome: 'O Estrategista',
    descricao: 'Analítico, independente e focado em visão de longo prazo.',
    comoComunica: 'Comunica de forma direta e estruturada, focado em argumentos e conclusões.',
    comoDecide: 'Decide com base em análise estratégica e visão de longo prazo, pouco influenciável por opinião externa.',
    comoReagePressao: 'Sob pressão, isola-se para repensar a estratégia com mais controle.',
    comoLidera: 'Lidera com uma visão clara de onde quer chegar, delegando a execução.',
    comoAprende: 'Aprende sozinho, testando teorias e construindo seus próprios modelos mentais.',
  },
  ISTP: {
    nome: 'O Artesão',
    descricao: 'Prático, observador e hábil em resolver problemas concretos.',
    comoComunica: 'Comunica-se de forma econômica e prática, prefere mostrar a explicar.',
    comoDecide: 'Decide testando na prática o que funciona, sem se prender à teoria.',
    comoReagePressao: 'Mantém a calma sob pressão, agindo com pragmatismo no momento da crise.',
    comoLidera: 'Lidera resolvendo problemas concretos, deixando o time livre para atuar.',
    comoAprende: 'Aprende fazendo, por tentativa e erro direto com a mão na massa.',
  },
  ISFP: {
    nome: 'O Artista',
    descricao: 'Sensível, discreto e guiado por valores pessoais.',
    comoComunica: 'Comunica-se de forma suave e autêntica, evita confronto direto.',
    comoDecide: 'Decide guiado por valores pessoais e pelo que sente ser certo no momento.',
    comoReagePressao: 'Sob pressão, tende a recuar e precisar de espaço para se recompor.',
    comoLidera: 'Lidera pelo exemplo silencioso e pela sensibilidade às necessidades individuais do time.',
    comoAprende: 'Aprende de forma sensorial e prática, no seu próprio ritmo, sem pressa.',
  },
  INFP: {
    nome: 'O Mediador',
    descricao: 'Idealista, empático e fiel aos próprios valores.',
    comoComunica: 'Comunica com autenticidade e cuidado, mas pode evitar posicionamentos diretos em conflitos.',
    comoDecide: 'Decide de acordo com seus valores internos, mesmo quando isso vai contra a maioria.',
    comoReagePressao: 'Sob pressão, pode se fechar e ruminar antes de conseguir agir.',
    comoLidera: 'Lidera pelo exemplo de valores e pela defesa genuína do time.',
    comoAprende: 'Aprende melhor em temas que conectam com seus interesses e propósito pessoal.',
  },
  INTP: {
    nome: 'O Pensador',
    descricao: 'Curioso, lógico e movido pela busca de entendimento.',
    comoComunica: 'Comunica-se com precisão lógica, às vezes deixando o tom emocional em segundo plano.',
    comoDecide: 'Decide analisando o problema por todos os ângulos antes de se comprometer.',
    comoReagePressao: 'Sob pressão, tende a analisar em excesso antes de conseguir agir.',
    comoLidera: 'Lidera propondo ideias e frameworks, delegando a execução prática ao time.',
    comoAprende: 'Aprende explorando conceitos abstratos e questionando o porquê das coisas.',
  },
  ESTP: {
    nome: 'O Empreendedor',
    descricao: 'Ágil, direto e orientado para a ação imediata.',
    comoComunica: 'Comunica-se de forma direta, rápida e cheia de energia.',
    comoDecide: 'Decide rápido, confiando no instinto e na leitura da situação em tempo real.',
    comoReagePressao: 'Prospera sob pressão — ganha energia justamente em momentos de urgência.',
    comoLidera: 'Lidera pela ação, resolvendo obstáculos na frente e arrastando o time junto.',
    comoAprende: 'Aprende fazendo, testando na prática, com pouca paciência para teoria.',
  },
  ESFP: {
    nome: 'O Animador',
    descricao: 'Espontâneo, sociável e entusiasmado com a vida.',
    comoComunica: 'Comunica com entusiasmo e calor humano, envolve as pessoas com facilidade.',
    comoDecide: 'Decide olhando o impacto imediato nas pessoas e no clima do time.',
    comoReagePressao: 'Sob pressão, busca apoio social e pode perder o foco se ficar isolado.',
    comoLidera: 'Lidera energizando o ambiente e motivando pelo exemplo espontâneo.',
    comoAprende: 'Aprende melhor na prática, interagindo com outras pessoas e experimentando ao vivo.',
  },
  ENFP: {
    nome: 'O Inspirador',
    descricao: 'Criativo, caloroso e cheio de possibilidades.',
    comoComunica: 'Comunica-se com entusiasmo e calor, conecta ideias e pessoas com facilidade.',
    comoDecide: 'Decide seguindo possibilidades e valores, buscando o que gera mais significado.',
    comoReagePressao: 'Sob pressão, pode se dispersar entre muitas opções antes de conseguir focar em uma.',
    comoLidera: 'Lidera inspirando o time com visão e energia, mais que com controle.',
    comoAprende: 'Aprende explorando várias frentes ao mesmo tempo, motivado pela curiosidade.',
  },
  ENTP: {
    nome: 'O Inovador',
    descricao: 'Engenhoso, argumentativo e aberto a novas ideias.',
    comoComunica: 'Comunica-se de forma argumentativa e provocadora, gosta de debater ideias.',
    comoDecide: 'Decide depois de explorar alternativas e questionar o status quo.',
    comoReagePressao: 'Sob pressão, usa o humor e a improvisação para encontrar saídas criativas.',
    comoLidera: 'Lidera desafiando o time a pensar diferente e testar novas abordagens.',
    comoAprende: 'Aprende debatendo e testando ideias, prefere discussão a leitura passiva.',
  },
  ESTJ: {
    nome: 'O Organizador',
    descricao: 'Direto, estruturado e orientado para resultados.',
    comoComunica: 'Comunica-se de forma direta e objetiva, focado em fatos e resultados.',
    comoDecide: 'Decide rápido com base em regras claras, dados e experiência prática.',
    comoReagePressao: 'Sob pressão, assume o controle e reforça estrutura e prazos.',
    comoLidera: 'Lidera de forma direta, cobrando execução e organização do time.',
    comoAprende: 'Aprende com conteúdo prático e aplicável, prefere método a teoria solta.',
  },
  ESFJ: {
    nome: 'O Anfitrião',
    descricao: 'Cooperativo, caloroso e atento às necessidades do grupo.',
    comoComunica: 'Comunica-se de forma calorosa e atenta, cuida do clima da conversa.',
    comoDecide: 'Decide considerando o consenso do grupo e o impacto nas relações.',
    comoReagePressao: 'Sob pressão, busca apoio da equipe e pode se preocupar em agradar a todos.',
    comoLidera: 'Lidera cuidando do time como um todo, mantendo harmonia e cooperação.',
    comoAprende: 'Aprende melhor em grupo, com interação e aplicação prática imediata.',
  },
  ENFJ: {
    nome: 'O Mobilizador',
    descricao: 'Carismático, empático e habilidoso em engajar pessoas.',
    comoComunica: 'Comunica-se com carisma e empatia, engaja as pessoas ao redor dele.',
    comoDecide: 'Decide equilibrando lógica com o impacto humano da decisão no time.',
    comoReagePressao: 'Sob pressão, foca em manter o time coeso e motivado.',
    comoLidera: 'Lidera mobilizando pessoas em torno de um objetivo comum, com forte carisma.',
    comoAprende: 'Aprende bem em contextos colaborativos, ensinando enquanto aprende.',
  },
  ENTJ: {
    nome: 'O Comandante',
    descricao: 'Decidido, estratégico e natural na liderança.',
    comoComunica: 'Comunica-se de forma assertiva e direta, focado em objetivos e resultados.',
    comoDecide: 'Decide rápido, com visão estratégica e pouca hesitação diante da pressão.',
    comoReagePressao: 'Sob pressão, assume o comando e acelera a tomada de decisão.',
    comoLidera: 'Lidera naturalmente, define direção clara e cobra alto desempenho do time.',
    comoAprende: 'Aprende rápido, focado em aplicar o conhecimento a metas concretas.',
  },
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
    ambienteIdeal: 'Ambientes que valorizam qualidade, rigor técnico e tempo adequado para análise antes de decidir.',
    ambienteRisco: 'Rotinas com decisões apressadas, metas voláteis e pouca tolerância a questionamentos técnicos.',
    estiloLideranca: 'Responde melhor a gestores que dão clareza de critérios e respeitam o tempo de análise antes da entrega.',
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
    ambienteIdeal: 'Ambientes dinâmicos, com interação constante, liberdade para propor ideias e reconhecimento público.',
    ambienteRisco: 'Rotinas isoladas, com pouca interação social e processos rígidos demais para se expressar.',
    estiloLideranca: 'Responde melhor a gestores acessíveis, que dão espaço para participação e valorizam suas ideias.',
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
    ambienteIdeal: 'Ambientes dinâmicos, com autonomia, metas claras e liberdade para decidir e agir rápido.',
    ambienteRisco: 'Rotinas excessivamente burocráticas, com baixa autonomia e processos lentos demais.',
    estiloLideranca: 'Responde melhor a gestores objetivos e orientados para resultado, que definem a meta e saem do caminho.',
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
    ambienteIdeal: 'Ambientes estáveis, com processos claros, previsibilidade e tempo para se adaptar a mudanças.',
    ambienteRisco: 'Mudanças constantes e abruptas de prioridade, sem tempo de adaptação ou clareza de processo.',
    estiloLideranca: 'Responde melhor a gestores consistentes, que comunicam mudanças com antecedência e valorizam a estabilidade que ele traz.',
  },
};

// Big Five — modelo condutor da interpretação (prioridade 2026-08-27).
// TRACO_DESCRICAO: rótulo curto (usado em chips/tabelas).
// TRACO_IMPACTO: parágrafo sobre o efeito prático no trabalho (corpo do relatório).
// TRACO_SINTESE: uma frase de "ponto forte" (nível elevado) e uma de "ponto de
// atenção" (nível baixo), usadas pra montar a síntese final do relatório.
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

const TRACO_IMPACTO = {
  o: {
    elevado: 'Tende a propor ideias novas e se adaptar bem a mudanças de rumo. Pode se beneficiar de projetos que envolvam inovação, mas precisa de foco para não se dispersar entre muitas frentes.',
    médio: 'Equilibra tradição e novidade conforme a situação pede. Consegue tanto seguir um processo estabelecido quanto propor melhorias, sem grandes resistências.',
    baixo: 'Prefere métodos testados e comprovados a experimentar o desconhecido. Tende a performar melhor em funções com processo bem definido do que em ambientes muito ambíguos.',
  },
  c: {
    elevado: 'Cumpre prazos com consistência e mantém um padrão alto de organização. É uma referência de confiabilidade, mas pode se cobrar demais diante de imprevistos.',
    médio: 'Equilibra estrutura e flexibilidade conforme o contexto. Organiza-se bem sem se tornar rígido diante de mudanças de plano.',
    baixo: 'Tende a ser mais espontâneo, podendo ter dificuldade com prazos rígidos e planejamento de longo prazo. Se beneficia de estrutura externa e checkpoints frequentes.',
  },
  ex: {
    elevado: 'Ganha energia em interações sociais e se sente à vontade em ambientes de grande contato com pessoas. Pode ter mais dificuldade em tarefas solitárias e prolongadas.',
    médio: 'Transita bem entre momentos de interação social e momentos de trabalho individual, sem depender fortemente de nenhum dos dois.',
    baixo: 'Prefere ambientes mais calmos, com menos estímulo social, e rende melhor em trabalho focado e individual. Reuniões longas ou muito sociais podem desgastar mais rápido.',
  },
  ag: {
    elevado: 'Facilita a cooperação e o trabalho em equipe, sendo uma referência de empatia no time. Pode evitar conflitos necessários para não desagradar.',
    médio: 'Equilibra cooperação com posicionamento firme quando necessário, sem abrir mão fácil das próprias posições nem gerar atrito desnecessário.',
    baixo: 'Tende a ser mais direto e orientado a fatos do que a consenso, o que ajuda em decisões difíceis mas pode gerar atrito se não for calibrado.',
  },
  ne: {
    elevado: 'Mantém a calma sob pressão e se recupera rápido de contratempos. É uma referência de estabilidade em momentos de crise do time.',
    médio: 'Reage às pressões do dia a dia de forma equilibrada, sem grandes oscilações emocionais na maior parte do tempo.',
    baixo: 'Pode absorver a pressão do trabalho com mais intensidade e sentir mais o impacto de conflitos contínuos. Se beneficia de um ambiente com feedback claro, metas bem definidas e menos exposição a conflito constante.',
  },
};

const TRACO_SINTESE = {
  o: {
    forte: 'Traz ideias novas e se adapta bem a mudanças de direção',
    atencao: 'Pode ter mais dificuldade se adaptando a mudanças rápidas ou ambientes pouco estruturados',
  },
  c: {
    forte: 'Cumpre o que promete com consistência e organização',
    atencao: 'Pode ter dificuldade com prazos e planejamento sem apoio externo de processo',
  },
  ex: {
    forte: 'Se energiza em ambientes de alto contato social e trabalho em equipe',
    atencao: 'Pode se desgastar em rotinas com muita exposição social ou reuniões longas',
  },
  ag: {
    forte: 'Facilita a cooperação e mantém um bom clima no time',
    atencao: 'Tende a ser mais direto e pode gerar atrito se não calibrar a comunicação',
  },
  ne: {
    forte: 'Mantém a calma e a estabilidade mesmo sob pressão',
    atencao: 'Pode absorver a pressão do trabalho com mais intensidade e sofrer mais em contextos de conflito contínuo',
  },
};

// Monta o texto de apresentação do relatório a partir do `resultado` já
// calculado (lib/inferencia.js) — puramente derivado, não recalcula nada.
// Big Five lidera a síntese final (pontosFortes/pontosAtencao); Profiler e
// MBTI entram como camadas de apoio que agregam detalhe àquela leitura.
function montarResumo(resultado, nome) {
  const perfil = resultado.perfilDominante.perfil;
  const perfilInfo = PERFIL_INSIGHTS[perfil];
  const mbtiInfo = MBTI_TIPOS[resultado.mbti.tipo] || { nome: '', descricao: '', comoComunica: '', comoDecide: '', comoReagePressao: '', comoLidera: '', comoAprende: '' };

  const tracosPorRelevancia = Object.keys(resultado.bigFive)
    .map((chave) => ({ chave, ...resultado.bigFive[chave], afastamento: Math.abs(resultado.bigFive[chave].percentil - 50) }))
    .sort((a, b) => b.afastamento - a.afastamento);

  const tracosElevados = tracosPorRelevancia.filter((t) => t.nivel === 'elevado');
  const tracosBaixos = tracosPorRelevancia.filter((t) => t.nivel === 'baixo');
  const tracosOrdenados = tracosElevados.slice(0, 2); // mantido pra compatibilidade com o topo do relatório

  const bullets = [];
  if (tracosElevados.length) {
    const nomesElevados = tracosElevados.slice(0, 2).map((t) => t.nome).join(' e ');
    bullets.push(`Traços mais marcantes do Big Five: ${nomesElevados} — ${TRACO_IMPACTO[tracosElevados[0].chave][tracosElevados[0].nivel]}`);
  } else {
    bullets.push('Nenhum traço do Big Five apareceu em nível elevado — perfil equilibrado entre os cinco fatores.');
  }
  bullets.push(`O Profiler agrega que esse é um perfil ${NOMES_PERFIL[perfil].toLowerCase()}: ${PERFIL_TAGLINE[perfil]}.`);
  bullets.push(`O MBTI (${resultado.mbti.tipo} — ${mbtiInfo.nome}) agrega o estilo de comunicação e decisão: ${mbtiInfo.descricao}`);
  bullets.push(`Os três modelos convergem para um profissional ${PERFIL_CONVERGENCIA[perfil]}.`);

  const tracoDescricoes = {};
  const tracoImpactos = {};
  for (const chave of Object.keys(resultado.bigFive)) {
    const nivel = resultado.bigFive[chave].nivel;
    tracoDescricoes[chave] = TRACO_DESCRICAO[chave][nivel];
    tracoImpactos[chave] = TRACO_IMPACTO[chave][nivel];
  }

  // Síntese final: Big Five primeiro (pontos fortes/atenção mais extremos),
  // Profiler e MBTI agregam o restante.
  const pontosFortes = [
    ...tracosElevados.slice(0, 2).map((t) => TRACO_SINTESE[t.chave].forte),
    ...perfilInfo.pontosFortes.slice(0, 2),
  ];
  const pontosAtencao = [
    ...tracosBaixos.slice(0, 2).map((t) => TRACO_SINTESE[t.chave].atencao),
    ...perfilInfo.pontosAtencao.slice(0, 1),
  ];
  const comoAproveitar = [
    ...perfilInfo.comoAproveitar.slice(0, 2),
    `Aproveite o estilo de liderança: ${mbtiInfo.comoLidera}`,
  ];

  return {
    iniciais: iniciaisDoNome(nome),
    tagline: PERFIL_TAGLINE[perfil],
    mbtiNome: mbtiInfo.nome,
    mbtiDescricao: mbtiInfo.descricao,
    mbtiDimensoes: {
      comoComunica: mbtiInfo.comoComunica,
      comoDecide: mbtiInfo.comoDecide,
      comoReagePressao: mbtiInfo.comoReagePressao,
      comoLidera: mbtiInfo.comoLidera,
      comoAprende: mbtiInfo.comoAprende,
    },
    bulletsResumo: bullets,
    tracosMarcantes: tracosOrdenados,
    tracoDescricoes,
    tracoImpactos,
    ambienteIdeal: perfilInfo.ambienteIdeal,
    ambienteRisco: perfilInfo.ambienteRisco,
    estiloLideranca: perfilInfo.estiloLideranca,
    pontosFortes,
    pontosAtencao,
    comoAproveitar,
  };
}

function iniciaisDoNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

module.exports = { MBTI_TIPOS, PERFIL_TAGLINE, PERFIL_CONVERGENCIA, PERFIL_INSIGHTS, TRACO_DESCRICAO, TRACO_IMPACTO, TRACO_SINTESE, montarResumo };
