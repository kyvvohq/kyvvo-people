// Shell compartilhado das telas autenticadas — auth guard, sidebar (Kyvvo
// Design System), menu de usuário e helpers de modal. Espera que a página já
// tenha no DOM: #painel-sidebar, #btn-toggle-sidebar, #cartao-usuario,
// #btn-menu-usuario, #user-menu-dropdown, #avatar-usuario, #nome-usuario,
// #btn-sair. Incluir via <script src="/people/shell.js"> no fim do <body>.

const token = localStorage.getItem('people_token');
if (!token) window.location.href = '/people/login.html';

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
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
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  kanban: '<path d="M5 3v14"/><path d="M12 3v8"/><path d="M19 3v18"/>',
  'message-circle': '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',
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

// --- Cartão de usuário (avatar + dropdown "Sair", no rodapé da sidebar) ---
const btnMenuUsuario = document.getElementById('btn-menu-usuario');
const userMenuDropdown = document.getElementById('user-menu-dropdown');

function fecharUserMenu() {
  userMenuDropdown.hidden = true;
}
btnMenuUsuario.addEventListener('click', (e) => {
  e.stopPropagation();
  const vaiAbrir = userMenuDropdown.hidden;
  fecharUserMenu();
  if (vaiAbrir) userMenuDropdown.hidden = false;
});
document.addEventListener('click', (e) => {
  if (!document.getElementById('cartao-usuario').contains(e.target)) fecharUserMenu();
});

function iniciaisNome(nomeCompleto) {
  const partes = (nomeCompleto || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

const nomeUsuario = localStorage.getItem('people_nome') || '';
document.getElementById('avatar-usuario').textContent = iniciaisNome(nomeUsuario);
document.getElementById('nome-usuario').textContent = nomeUsuario;

// E-mail só pra exibição no cabeçalho da sidebar — decodifica o payload do
// JWT sem verificar (o próprio dono do token já enxerga esse conteúdo).
const contaNomeEl = document.getElementById('conta-nome');
if (contaNomeEl) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    contaNomeEl.textContent = payload.email || '';
  } catch {
    contaNomeEl.textContent = '';
  }
}

document.getElementById('btn-sair').addEventListener('click', () => {
  localStorage.removeItem('people_token');
  localStorage.removeItem('people_nome');
  window.location.href = '/people/login.html';
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
