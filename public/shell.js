// Shell compartilhado das telas autenticadas — auth guard, sidebar
// colapsável, menu de usuário e helpers de modal. Espera que a página já
// tenha no DOM: #painel-sidebar, #btn-toggle-sidebar, #user-menu,
// #user-menu-toggle, #user-menu-dropdown, #user-menu-avatar,
// #user-menu-nome, #btn-sair. Incluir via <script src="/people/shell.js">
// no fim do <body>, depois desses elementos.

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

// --- Sidebar colapsável (mesmo padrão do painel principal: < oculta, > exibe) ---
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
document.querySelectorAll('.menu-item').forEach((item) => {
  if (item.getAttribute('href') === window.location.pathname) item.classList.add('active');
});

// --- Menu de usuário (avatar + dropdown) ---
const userMenuToggle = document.getElementById('user-menu-toggle');
const userMenuDropdown = document.getElementById('user-menu-dropdown');

function fecharUserMenu() {
  userMenuDropdown.hidden = true;
  userMenuToggle.classList.remove('aberto');
}
userMenuToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const vaiAbrir = userMenuDropdown.hidden;
  fecharUserMenu();
  if (vaiAbrir) {
    userMenuDropdown.hidden = false;
    userMenuToggle.classList.add('aberto');
  }
});
document.addEventListener('click', (e) => {
  if (!document.getElementById('user-menu').contains(e.target)) fecharUserMenu();
});

function iniciaisNome(nomeCompleto) {
  const partes = (nomeCompleto || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

const nomeUsuario = localStorage.getItem('people_nome') || '';
document.getElementById('user-menu-avatar').textContent = iniciaisNome(nomeUsuario);
document.getElementById('user-menu-nome').textContent = nomeUsuario;

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
      <button class="modal-close" id="modal-close" aria-label="Fechar" type="button">✕</button>
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
