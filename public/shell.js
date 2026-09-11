// Shell compartilhado das telas autenticadas — auth guard, cabeçalho (logo +
// menu de perfil + tema), sidebar de navegação e helpers de modal. Espera que
// a página já tenha no DOM: #painel-sidebar, #btn-toggle-sidebar,
// #topo-perfil, #topo-perfil-gatilho, #menu-perfil, elementos com classe
// .js-avatar-usuario/.js-nome-usuario/.js-email-usuario/.btn-sair/.toggle-tema.
// Incluir via <script src="/people/shell.js"> no fim do <body>, depois de um
// snippet inline no <head> que já tenha aplicado data-tema no <html> (evita
// flash do tema errado).

const token = localStorage.getItem('people_token');
if (!token) window.location.href = '/people/login.html';

async function apiFetch(url, opts = {}) {
  const headers = { Authorization: `Bearer ${token}`, ...(opts.headers || {}) };
  // Content-Type só entra quando há corpo — mandar esse header com corpo
  // vazio (ex: DELETE sem body) faz o Fastify rejeitar com
  // FST_ERR_CTP_EMPTY_JSON_BODY antes mesmo de rodar o handler.
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    localStorage.removeItem('people_token');
    localStorage.removeItem('people_nome');
    window.location.href = '/people/login.html';
    throw new Error('Sessão expirada');
  }
  return res;
}

// --- Ícones (Lucide, inline — sem dependência de CDN) ---
const ICON_PATHS = {
  'layout-dashboard': '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  brain: '<path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/>',
  'calendar-days': '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M8 13h.01"/><path d="M12 13h.01"/><path d="M16 13h.01"/><path d="M8 17h.01"/><path d="M12 17h.01"/><path d="M16 17h.01"/>',
  'file-text': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  funnel: '<path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/>',
  settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  ellipsis: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  menu: '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  kanban: '<path d="M5 3v14"/><path d="M12 3v8"/><path d="M19 3v18"/>',
  'message-circle': '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',
  'sun-moon': '<path d="M12 2v2"/><path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715"/><path d="M16 12a4 4 0 0 0-4-4"/><path d="m19 5-1.256 1.256"/><path d="M20 12h2"/>',
  'log-out': '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  'zap-off': '<path d="M10.513 4.856 13.12 2.17a.5.5 0 0 1 .86.46l-1.377 4.317"/><path d="M15.656 10H20a1 1 0 0 1 .78 1.63l-2.257 2.26"/><path d="M16 17.93a1 1 0 0 1-.78-.293L12.36 21.8a.5.5 0 0 1-.86-.46l1.42-4.421"/><path d="M8 8 3.9 12.63A1 1 0 0 0 4.68 14H10"/><path d="m2 2 20 20"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.986L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
};

function icon(name, size = 18) {
  const inner = ICON_PATHS[name] || '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

// Substitui qualquer <span data-icon="nome" data-size="18"></span> estático
// no HTML da página pelo SVG correspondente — evita duplicar os paths em
// cada página, só shell.js precisa conhecer os ícones.
document.querySelectorAll('[data-icon]').forEach((el) => {
  el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 18);
});

// --- Sidebar colapsável ---
const painelSidebar = document.getElementById('painel-sidebar');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
function aplicarSidebarOculta(oculta) {
  painelSidebar.classList.toggle('sidebar-oculta', oculta);
  btnToggleSidebar.textContent = oculta ? '>' : '<';
  const rotulo = oculta ? 'Exibir menu' : 'Ocultar menu';
  btnToggleSidebar.setAttribute('aria-label', rotulo);
  btnToggleSidebar.title = rotulo;
}
aplicarSidebarOculta(localStorage.getItem('people_sidebar_oculta') === '1');
btnToggleSidebar.addEventListener('click', () => {
  const oculta = !painelSidebar.classList.contains('sidebar-oculta');
  aplicarSidebarOculta(oculta);
  localStorage.setItem('people_sidebar_oculta', oculta ? '1' : '0');
});

// Marca o item ativo pela URL atual (páginas separadas, não SPA).
document.querySelectorAll('.menu-item[href]').forEach((item) => {
  if (item.getAttribute('href') === window.location.pathname) item.classList.add('active');
});

// --- Submenu expansível (ex: Configurações > Geral / Plano e Cobrança) ---
document.querySelectorAll('.menu-item-toggle').forEach((btn) => {
  btn.addEventListener('click', () => btn.closest('.menu-item-grupo').classList.toggle('expandido'));
});
// Abre e destaca o grupo automaticamente quando a página atual é um dos filhos.
document.querySelectorAll('.menu-submenu .menu-item.active').forEach((item) => {
  const grupo = item.closest('.menu-item-grupo');
  if (grupo) grupo.classList.add('expandido', 'tem-filho-ativo');
});

// --- Tema claro/escuro ---
// Aplicado o mais cedo possível por um snippet inline no <head> de cada
// página (evita flash do tema errado); aqui só sincronizamos os controles
// visuais (toggle, texto, logos) com o que já foi aplicado no <html>.
// Tema via atributo data-theme no <html> (padrão do @kyvvohq/design-system).
// A chave de localStorage segue sendo `people_tema`; o snippet no <head>
// mapeia os valores antigos ('escuro'/'claro') pros novos ('dark'/'light').
function temaAtual() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
function aplicarLogos() {
  const escuro = temaAtual() === 'dark';
  document.querySelectorAll('.topo-logo-img').forEach((img) => {
    img.src = escuro ? '/people/images/logo-kyvvo-escuro.svg' : '/people/images/logo-kyvvo.svg';
  });
}
function sincronizarToggleTema() {
  const escuro = temaAtual() === 'dark';
  document.querySelectorAll('.toggle-tema').forEach((btn) => {
    btn.classList.toggle('ligado', escuro);
    btn.setAttribute('aria-checked', String(escuro));
  });
  document.querySelectorAll('.toggle-tema-estado').forEach((el) => {
    el.textContent = escuro ? 'Escuro' : 'Claro';
  });
  aplicarLogos();
}
function definirTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  localStorage.setItem('people_tema', tema);
  sincronizarToggleTema();
}
document.querySelectorAll('.toggle-tema').forEach((btn) => {
  btn.addEventListener('click', () => definirTema(temaAtual() === 'dark' ? 'light' : 'dark'));
});
sincronizarToggleTema();

// --- Menu de perfil (cabeçalho, canto superior direito) ---
const topoPerfilGatilho = document.getElementById('topo-perfil-gatilho');
const menuPerfil = document.getElementById('menu-perfil');

function fecharMenuPerfil() {
  if (menuPerfil) menuPerfil.hidden = true;
}
if (topoPerfilGatilho && menuPerfil) {
  topoPerfilGatilho.addEventListener('click', (e) => {
    e.stopPropagation();
    const vaiAbrir = menuPerfil.hidden;
    fecharMenuPerfil();
    if (vaiAbrir) menuPerfil.hidden = false;
  });
  document.addEventListener('click', (e) => {
    if (!document.getElementById('topo-perfil').contains(e.target)) fecharMenuPerfil();
  });
}

function iniciaisNome(nomeCompleto) {
  const partes = (nomeCompleto || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

const nomeUsuario = localStorage.getItem('people_nome') || '';
document.querySelectorAll('.js-avatar-usuario').forEach((el) => { el.textContent = iniciaisNome(nomeUsuario); });
document.querySelectorAll('.js-nome-usuario').forEach((el) => { el.textContent = nomeUsuario; });

// E-mail só pra exibição no menu de perfil — decodifica o payload do JWT
// sem verificar (o próprio dono do token já enxerga esse conteúdo).
let emailUsuario = '';
try {
  emailUsuario = JSON.parse(atob(token.split('.')[1])).email || '';
} catch {
  emailUsuario = '';
}
document.querySelectorAll('.js-email-usuario').forEach((el) => { el.textContent = emailUsuario; });

document.querySelectorAll('.btn-sair').forEach((btn) => {
  btn.addEventListener('click', () => {
    localStorage.removeItem('people_token');
    localStorage.removeItem('people_nome');
    window.location.href = '/people/login.html';
  });
});

// --- Modal genérico (mesmo padrão do painel principal: abrirModal/fecharModal) ---
function fecharModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.remove();
  document.removeEventListener('keydown', escFecharModal);
}
function escFecharModal(e) {
  if (e.key === 'Escape') fecharModal();
}
function abrirModal(tituloHtml, conteudoHtml, classeExtra) {
  fecharModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card${classeExtra ? ` ${classeExtra}` : ''}">
      <button class="modal-close" id="modal-close" aria-label="Fechar" type="button">${icon('x', 15)}</button>
      ${tituloHtml}
      ${conteudoHtml}
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('modal-close').addEventListener('click', fecharModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharModal(); });
  document.addEventListener('keydown', escFecharModal);
  return overlay;
}
function avisar(titulo, mensagem) {
  abrirModal(
    `<h3>${titulo}</h3>`,
    `
      <p class="modal-texto">${mensagem}</p>
      <div class="modal-acoes">
        <button type="button" class="btn" id="btn-ok-aviso">OK</button>
      </div>
    `
  );
  document.getElementById('btn-ok-aviso').addEventListener('click', fecharModal);
}

// --- Aviso de assinatura não fechada ainda (backend bloqueia toda escrita
// nesse estado, ver index.js#authenticate) — banner injetado via JS em vez
// de markup em cada página, pra não duplicar HTML nas 8 telas autenticadas.
// "Até fechar a licença" (não dispensável de vez): sem a lógica de
// sessionStorage do Studio — aqui o aviso é sobre algo que ainda falta
// fazer, não um estado degradado que a pessoa já está ciente, então
// reaparece em toda navegação até resolver.
const BANNER_ASSINATURA_MENSAGEM = {
  sem_assinatura: 'Finalize sua assinatura para começar a usar o Kyvvo People.',
  pendente: 'Assinatura em confirmação — assim que o pagamento for aprovado, seu acesso libera automaticamente.',
};
if (!window.location.pathname.endsWith('/plano-cobranca.html')) {
  apiFetch('/people/api/pagamentos').then(async (res) => {
    if (!res.ok) return;
    const dados = await res.json();
    const mensagem = BANNER_ASSINATURA_MENSAGEM[dados.status];
    if (!mensagem) return;
    const banner = document.createElement('div');
    banner.className = 'banner-assinatura';
    banner.innerHTML = `<span>${mensagem}</span><a href="/people/plano-cobranca.html">Ir para Plano e Cobrança →</a>`;
    const main = document.querySelector('.painel-main');
    if (main) main.prepend(banner);
  }).catch(() => {});
}

// --- Mensagens/anúncios do admin da Kyvvo (Produtos > People > Mensagens,
// ou "Kyvvo inteira") — mesmo raciocínio de injeção via JS do banner de
// assinatura acima, pra não duplicar HTML em cada tela. Dispensável (ao
// contrário do banner de assinatura, que é sobre algo pendente de resolver)
// — guarda os ids fechados no localStorage, sobrevive a navegação/reload.
function escapeHtmlMensagemAdmin(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function idsMensagensAdminDispensadas() {
  try {
    return JSON.parse(localStorage.getItem('people_mensagens_dispensadas') || '[]');
  } catch (e) {
    return [];
  }
}
function dispensarMensagemAdmin(id) {
  const atuais = idsMensagensAdminDispensadas();
  if (!atuais.includes(id)) atuais.push(id);
  localStorage.setItem('people_mensagens_dispensadas', JSON.stringify(atuais));
  const item = document.querySelector(`[data-mensagem-admin-id="${id}"]`);
  if (item) item.remove();
}
apiFetch('/people/api/mensagens-ativas').then(async (res) => {
  if (!res.ok) return;
  const dados = await res.json();
  const dispensadas = new Set(idsMensagensAdminDispensadas());
  const visiveis = (dados.mensagens || []).filter((m) => !dispensadas.has(m.id));
  if (!visiveis.length) return;
  const main = document.querySelector('.painel-main');
  if (!main) return;
  visiveis.reverse().forEach((m) => {
    const item = document.createElement('div');
    item.className = `mensagem-admin-item mensagem-admin-${m.severidade}`;
    item.dataset.mensagemAdminId = m.id;
    item.innerHTML = `<span>${escapeHtmlMensagemAdmin(m.texto)}</span><button type="button" class="mensagem-admin-fechar" aria-label="Fechar aviso">×</button>`;
    item.querySelector('.mensagem-admin-fechar').addEventListener('click', () => dispensarMensagemAdmin(m.id));
    main.prepend(item);
  });
}).catch(() => {});
