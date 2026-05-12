// ============== STATE ==============
let currentMonth = new Date();           // {year, month}
let currentTab = 'holders';
let currentSubtab = 'holder';            // dentro de Listas
let analiseMode = 'semana';              // 'semana' | 'mes'
let weekStart = null;                    // Date — segunda-feira da semana selecionada

let editingHolderId = null;
let editingAniversarianteId = null;
let editingConvidadoId = null;
let editingRestritaId = null;

let addListType = 'holder';              // 'holder' | 'convidado'
let addListSelectedDay = null;
let openListId = null;                   // lista expandida
let openListContext = null;              // 'holder' | 'convidado' | 'aniversariante'

const DIA_LABEL = { qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo' };

// ============== HELPERS ==============
function pad2(n) { return String(n).padStart(2, '0'); }

function ymKey(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`; }

function formatDateBR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function formatMonthLabel(date) {
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function avatarFor(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatPhone(value) {
  let n = (value || '').replace(/\D/g, '').slice(0, 11);
  if (!n) return '';
  if (n.length <= 2) return `(${n}`;
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

function formatInstagram(value) {
  if (!value) return '';
  let v = value.trim();
  v = v.replace(/^@+/, '');
  return '@' + v;
}

function attachPhoneMask(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', e => { e.target.value = formatPhone(e.target.value); });
}

function attachInstagramMask(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('focus', e => { if (!e.target.value) e.target.value = '@'; });
  el.addEventListener('input', e => {
    let v = e.target.value.replace(/\s/g, '');
    if (!v.startsWith('@')) v = '@' + v.replace(/@/g, '');
    e.target.value = v;
  });
}

async function api(path, opts) {
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (res.status === 401) { window.location.href = '/login'; return null; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
      const msg = err.error || `Erro ${res.status}`;
      showToast(msg, 'error');
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  } catch (e) {
    if (e.message !== 'Failed to fetch') throw e;
    showToast('Sem conexão com o servidor. Verifique sua internet.', 'error');
    throw e;
  }
}

function showToast(msg, type = 'info') {
  let t = document.getElementById('_toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;z-index:9999;max-width:90vw;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.25);transition:opacity .3s';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = type === 'error' ? '#ff3b3b' : '#222';
  t.style.color = '#fff';
  t.style.opacity = '1';
  clearTimeout(t._hide);
  t._hide = setTimeout(() => { t.style.opacity = '0'; }, 3500);
}

// ============== INIT ==============
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('currentDate').textContent = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'short'
  });
  buildMonthSelect();

  // Máscaras de telefone e instagram
  ['holderTelefone', 'editHolderTelefone',
   'aniversarianteTelefone', 'editAniversarianteTelefone',
   'convidadoTelefone', 'editConvidadoTelefone',
   'guestTelefone'].forEach(attachPhoneMask);

  ['holderInstagram', 'editHolderInstagram',
   'aniversarianteInstagram', 'editAniversarianteInstagram',
   'convidadoInstagram', 'editConvidadoInstagram',
   'guestInstagram'].forEach(attachInstagramMask);

  // Day chips picker (modal Nova Lista)
  document.querySelectorAll('#addListDayPicker .day-chip').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('#addListDayPicker .day-chip').forEach(x => x.classList.remove('selected'));
      c.classList.add('selected');
      addListSelectedDay = c.dataset.day;
    });
  });

  // Fechar modal clicando no fundo
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
  });

  // Preview da lista em massa
  const bulkText = document.getElementById('guestBulkText');
  if (bulkText) bulkText.addEventListener('input', updateBulkPreview);

  loadHolders();
});

// ============== TABS ==============
function changeTab(btn, tab) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
  currentTab = tab;

  const titles = {
    holders: 'Holders',
    aniversariantes: 'Aniversariantes',
    listas: 'Listas',
    convidados: 'Convidados',
    restritas: 'Pessoas Restritas',
    analise: 'Análise'
  };
  document.getElementById('pageTitle').textContent = titles[tab];

  if (tab === 'holders') loadHolders();
  if (tab === 'aniversariantes') loadAniversariantes();
  if (tab === 'listas') loadListas();
  if (tab === 'convidados') loadConvidados();
  if (tab === 'restritas') loadRestritas();
  if (tab === 'analise') loadAnalise();
}

function changeSubtab(btn, sub) {
  document.querySelectorAll('.subtab').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`sub-${sub}`).classList.add('active');
  currentSubtab = sub;
}

// ============== MONTH DROPDOWN (custom, B&W) ==============
const MONTHS_PT_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function buildMonthSelect() {
  // valor default = mês atual real
  const now = new Date();
  currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  renderMonthDropdown();
  updateMonthLabels();
}

function renderMonthDropdown() {
  const panel = document.getElementById('monthPanel');
  const now = new Date();
  const minYear = now.getFullYear() - 2;        // 2 anos pra trás
  const maxYear = now.getFullYear() + 1;        // 1 ano pra frente
  const sections = [];
  for (let y = maxYear; y >= minYear; y--) {
    sections.push(`
      <div class="year-group">
        <div class="year-label">${y}</div>
        <div class="month-grid">
          ${MONTHS_PT_SHORT.map((m, i) => {
            const isCurrent = (currentMonth.getFullYear() === y && currentMonth.getMonth() === i);
            const isFuture = (y > now.getFullYear() || (y === now.getFullYear() && i > now.getMonth() + 6));
            return `<button type="button" class="month-cell ${isCurrent ? 'current' : ''} ${isFuture ? 'disabled' : ''}"
              data-year="${y}" data-month="${i}"
              onclick="selectMonth(${y}, ${i})">${m}</button>`;
          }).join('')}
        </div>
      </div>
    `);
  }
  panel.innerHTML = sections.join('');
}

function updateMonthLabels() {
  const label = formatMonthLabel(currentMonth);
  // capitaliza primeira letra
  const cap = label.charAt(0).toUpperCase() + label.slice(1);
  document.getElementById('monthTriggerLabel').textContent = cap;
  document.getElementById('monthDisplay').textContent = cap;
}

function toggleMonthPanel(ev) {
  ev?.stopPropagation();
  const panel = document.getElementById('monthPanel');
  const trigger = document.getElementById('monthTrigger');
  const open = panel.classList.toggle('open');
  trigger.classList.toggle('open', open);
  if (open) {
    const cur = panel.querySelector('.month-cell.current');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
}

function selectMonth(year, monthIdx) {
  currentMonth = new Date(year, monthIdx, 1);
  renderMonthDropdown();
  updateMonthLabels();
  document.getElementById('monthPanel').classList.remove('open');
  document.getElementById('monthTrigger').classList.remove('open');
  if (currentTab === 'listas') loadListas();
  if (currentTab === 'aniversariantes') loadAniversariantes();
  if (currentTab === 'analise') loadAnalise();
}

// fecha dropdown ao clicar fora
document.addEventListener('click', (e) => {
  const dd = document.querySelector('.month-dropdown');
  if (dd && !dd.contains(e.target)) {
    document.getElementById('monthPanel')?.classList.remove('open');
    document.getElementById('monthTrigger')?.classList.remove('open');
  }
});

function getMonthQuery() {
  return `year=${currentMonth.getFullYear()}&month=${pad2(currentMonth.getMonth() + 1)}`;
}

// ============== MODAL UTILS ==============
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

// ============== HOLDERS ==============
async function loadHolders() {
  try {
    const rows = await api('/api/holders');
    if (!rows) return;
    const cont = document.getElementById('holdersList');
    if (!rows.length) {
      cont.innerHTML = `<div class="empty-state"><div class="ico">⭐</div><p>Nenhum holder cadastrado</p></div>`;
      return;
    }
    cont.innerHTML = rows.map(h => `
      <div class="holder-card" onclick="openEditHolder(${h.id})">
        <div class="holder-avatar">${avatarFor(h.name)}</div>
        <div class="holder-info">
          <div class="holder-name">${escapeHtml(h.name)}</div>
          <div class="holder-meta">${escapeHtml(h.instagram || '')}${h.instagram && h.telefone ? ' · ' : ''}${escapeHtml(h.telefone || '')}</div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button class="btn ghost small" onclick="event.stopPropagation(); openEditHolder(${h.id})">Editar</button>
          <button class="btn small" style="background: var(--danger);" onclick="event.stopPropagation(); deleteHolder(${h.id}, '${escapeHtml(h.name).replace(/'/g, '&#39;')}')">Excluir</button>
        </div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

function openAddHolderModal() {
  document.getElementById('holderName').value = '';
  document.getElementById('holderInstagram').value = '';
  document.getElementById('holderTelefone').value = '';
  openModal('addHolderModal');
}

async function addHolder() {
  const name = document.getElementById('holderName').value.trim();
  if (!name) return showToast('Informe o nome', 'error');
  try {
    await api('/api/holders', {
      method: 'POST',
      body: JSON.stringify({
        name,
        instagram: formatInstagram(document.getElementById('holderInstagram').value),
        telefone: document.getElementById('holderTelefone').value.trim()
      })
    });
    closeModal('addHolderModal');
    showToast('Holder adicionado!');
    loadHolders();
  } catch (_) {}
}

async function openEditHolder(id) {
  const rows = await api('/api/holders');
  const h = rows.find(x => String(x.id) === String(id));
  if (!h) return;
  editingHolderId = id;
  document.getElementById('editHolderName').value = h.name || '';
  document.getElementById('editHolderInstagram').value = h.instagram || '';
  document.getElementById('editHolderTelefone').value = h.telefone || '';
  openModal('editHolderModal');
}

async function saveHolder() {
  if (!editingHolderId) return;
  try {
    await api(`/api/holders/${editingHolderId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('editHolderName').value.trim(),
        instagram: formatInstagram(document.getElementById('editHolderInstagram').value),
        telefone: document.getElementById('editHolderTelefone').value.trim()
      })
    });
    closeModal('editHolderModal');
    editingHolderId = null;
    showToast('Holder salvo!');
    loadHolders();
  } catch (_) {}
}

async function deleteCurrentHolder() {
  if (!editingHolderId) return;
  if (!confirm('Deletar este holder? As listas dele continuarão existindo (sem dono).')) return;
  await api(`/api/holders/${editingHolderId}`, { method: 'DELETE' });
  closeModal('editHolderModal');
  editingHolderId = null;
  loadHolders();
}

async function deleteHolder(id, name) {
  if (!confirm(`Excluir o holder "${name}"? As listas dele continuarão existindo.`)) return;
  await api(`/api/holders/${id}`, { method: 'DELETE' });
  loadHolders();
}

async function deleteConvidadoDirect(id, name) {
  if (!confirm(`Excluir "${name}"?`)) return;
  await api(`/api/convidados-frequentes/${id}`, { method: 'DELETE' });
  loadConvidados();
}

async function deleteRestritaDirect(id, name) {
  if (!confirm(`Remover "${name}" da lista de restritos?`)) return;
  await api(`/api/pessoas-restritas/${id}`, { method: 'DELETE' });
  loadRestritas();
}

// ============== ANIVERSARIANTES (timeline) ==============
async function loadAniversariantes() {
  try {
    const rows = await api('/api/aniversariantes');
    if (!rows) return;
    const cont = document.getElementById('aniversariantesList');
    if (!rows.length) {
      cont.innerHTML = `<div class="empty-state"><div class="ico">🎂</div><p>Sem aniversariantes</p></div>`;
      return;
    }
    cont.innerHTML = `<div class="timeline">${rows.map(a => `
      <div class="timeline-item">
        <div class="timeline-date">${a.data_evento ? formatDateBR(a.data_evento) : 'Sem data'}</div>
        <div class="holder-card">
          <div class="holder-avatar">${avatarFor(a.nome)}</div>
          <div class="holder-info">
            <div class="holder-name">${escapeHtml(a.nome)}</div>
            <div class="holder-meta">${escapeHtml(a.instagram || '')}${a.instagram && a.telefone ? ' · ' : ''}${escapeHtml(a.telefone || '')}</div>
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            ${a.lista_id ? `<button class="btn small" onclick="openListDetail(${a.lista_id}, 'aniversariante')">Ver lista</button>` : ''}
            <button class="btn ghost small" onclick="openEditAniversariante(${a.id})">Editar</button>
            <button class="btn small" style="background: var(--danger);" onclick="deleteAniversarianteDirect(${a.id}, '${escapeHtml(a.nome).replace(/'/g, '&#39;')}')">Excluir</button>
          </div>
        </div>
        ${a.lista_id ? `<div id="listDetail-${a.lista_id}"></div>` : ''}
      </div>
    `).join('')}</div>`;
    // se uma lista estava aberta, reabre o detalhe
    if (openListId) await renderListDetail(openListId);
  } catch (e) { console.error(e); }
}

function openAddAniversarianteModal() {
  document.getElementById('aniversarianteName').value = '';
  document.getElementById('aniversarianteData').value = todayISO();
  document.getElementById('aniversarianteInstagram').value = '';
  document.getElementById('aniversarianteTelefone').value = '';
  openModal('addAniversarianteModal');
}

async function addAniversariante() {
  const nome = document.getElementById('aniversarianteName').value.trim();
  if (!nome) return showToast('Informe o nome', 'error');
  try {
    await api('/api/aniversariantes', {
      method: 'POST',
      body: JSON.stringify({
        nome,
        instagram: formatInstagram(document.getElementById('aniversarianteInstagram').value),
        telefone: document.getElementById('aniversarianteTelefone').value.trim(),
        data_evento: document.getElementById('aniversarianteData').value || null
      })
    });
    closeModal('addAniversarianteModal');
    showToast('Aniversariante adicionado!');
    loadAniversariantes();
  } catch (_) {}
}

async function openEditAniversariante(id) {
  const rows = await api('/api/aniversariantes');
  const a = rows.find(x => String(x.id) === String(id));
  if (!a) return;
  editingAniversarianteId = id;
  document.getElementById('editAniversarianteName').value = a.nome || '';
  document.getElementById('editAniversarianteData').value = a.data_evento || '';
  document.getElementById('editAniversarianteInstagram').value = a.instagram || '';
  document.getElementById('editAniversarianteTelefone').value = a.telefone || '';
  openModal('editAniversarianteModal');
}

async function saveAniversariante() {
  if (!editingAniversarianteId) return;
  try {
    await api(`/api/aniversariantes/${editingAniversarianteId}`, {
      method: 'PUT',
      body: JSON.stringify({
        nome: document.getElementById('editAniversarianteName').value.trim(),
        instagram: formatInstagram(document.getElementById('editAniversarianteInstagram').value),
        telefone: document.getElementById('editAniversarianteTelefone').value.trim(),
        data_evento: document.getElementById('editAniversarianteData').value || null
      })
    });
    closeModal('editAniversarianteModal');
    editingAniversarianteId = null;
    showToast('Aniversariante salvo!');
    loadAniversariantes();
  } catch (_) {}
}

async function deleteCurrentAniversariante() {
  if (!editingAniversarianteId) return;
  if (!confirm('Deletar este aniversariante? A lista dele também será removida.')) return;
  await api(`/api/aniversariantes/${editingAniversarianteId}`, { method: 'DELETE' });
  closeModal('editAniversarianteModal');
  editingAniversarianteId = null;
  loadAniversariantes();
}

async function deleteAniversarianteDirect(id, name) {
  if (!confirm(`Excluir "${name}"? A lista dele também será removida.`)) return;
  await api(`/api/aniversariantes/${id}`, { method: 'DELETE' });
  openListId = null;
  loadAniversariantes();
}

// ============== CONVIDADOS (cadastro) ==============
async function loadConvidados() {
  try {
    const rows = await api('/api/convidados-frequentes');
    if (!rows) return;
    const cont = document.getElementById('convidadosList');
    if (!rows.length) {
      cont.innerHTML = `<div class="empty-state"><div class="ico">👤</div><p>Nenhum convidado cadastrado</p></div>`;
      return;
    }
    cont.innerHTML = rows.map(c => `
      <div class="holder-card" onclick="openEditConvidado(${c.id})">
        <div class="holder-avatar">${avatarFor(c.nome)}</div>
        <div class="holder-info">
          <div class="holder-name">${escapeHtml(c.nome)}</div>
          <div class="holder-meta">${escapeHtml(c.instagram || '')}${c.instagram && c.telefone ? ' · ' : ''}${escapeHtml(c.telefone || '')}</div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button class="btn ghost small" onclick="event.stopPropagation(); openEditConvidado(${c.id})">Editar</button>
          <button class="btn small" style="background: var(--danger);" onclick="event.stopPropagation(); deleteConvidadoDirect(${c.id}, '${escapeHtml(c.nome).replace(/'/g, '&#39;')}')">Excluir</button>
        </div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

function openAddConvidadoModal() {
  document.getElementById('convidadoNome').value = '';
  document.getElementById('convidadoInstagram').value = '';
  document.getElementById('convidadoTelefone').value = '';
  openModal('addConvidadoModal');
}

async function addConvidado() {
  const nome = document.getElementById('convidadoNome').value.trim();
  if (!nome) return alert('Informe o nome');
  try {
    await api('/api/convidados-frequentes', {
      method: 'POST',
      body: JSON.stringify({
        nome,
        instagram: formatInstagram(document.getElementById('convidadoInstagram').value),
        telefone: document.getElementById('convidadoTelefone').value.trim()
      })
    });
    closeModal('addConvidadoModal');
    loadConvidados();
  } catch (e) { alert(e.message); }
}

async function openEditConvidado(id) {
  const rows = await api('/api/convidados-frequentes');
  const c = rows.find(x => String(x.id) === String(id));
  if (!c) return;
  editingConvidadoId = id;
  document.getElementById('editConvidadoNome').value = c.nome || '';
  document.getElementById('editConvidadoInstagram').value = c.instagram || '';
  document.getElementById('editConvidadoTelefone').value = c.telefone || '';
  openModal('editConvidadoModal');
}

async function saveConvidado() {
  if (!editingConvidadoId) return;
  try {
    await api(`/api/convidados-frequentes/${editingConvidadoId}`, {
      method: 'PUT',
      body: JSON.stringify({
        nome: document.getElementById('editConvidadoNome').value.trim(),
        instagram: formatInstagram(document.getElementById('editConvidadoInstagram').value),
        telefone: document.getElementById('editConvidadoTelefone').value.trim()
      })
    });
    closeModal('editConvidadoModal');
    editingConvidadoId = null;
    showToast('Convidado salvo!');
    loadConvidados();
  } catch (_) {}
}

async function deleteCurrentConvidado() {
  if (!editingConvidadoId) return;
  if (!confirm('Deletar este convidado?')) return;
  await api(`/api/convidados-frequentes/${editingConvidadoId}`, { method: 'DELETE' });
  closeModal('editConvidadoModal');
  editingConvidadoId = null;
  loadConvidados();
}

// ============== RESTRITAS ==============
async function loadRestritas() {
  try {
    const rows = await api('/api/pessoas-restritas');
    if (!rows) return;
    const cont = document.getElementById('restritasList');
    if (!rows.length) {
      cont.innerHTML = `<div class="empty-state"><div class="ico">🚫</div><p>Sem pessoas restritas</p></div>`;
      return;
    }
    cont.innerHTML = rows.map(r => `
      <div class="holder-card" onclick="openEditRestrita(${r.id})">
        <div class="holder-avatar" style="background: var(--danger);">!</div>
        <div class="holder-info">
          <div class="holder-name">${escapeHtml(r.nome)}</div>
          <div class="holder-meta">${escapeHtml(r.motivo || 'Sem motivo informado')}</div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button class="btn ghost small" onclick="event.stopPropagation(); openEditRestrita(${r.id})">Editar</button>
          <button class="btn small" style="background: var(--danger);" onclick="event.stopPropagation(); deleteRestritaDirect(${r.id}, '${escapeHtml(r.nome).replace(/'/g, '&#39;')}')">Excluir</button>
        </div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

function openAddRestritaModal() {
  document.getElementById('restritaNome').value = '';
  document.getElementById('restritaMotivo').value = '';
  openModal('addRestritaModal');
}

async function addRestrita() {
  const nome = document.getElementById('restritaNome').value.trim();
  if (!nome) return showToast('Informe o nome', 'error');
  try {
    await api('/api/pessoas-restritas', {
      method: 'POST',
      body: JSON.stringify({ nome, motivo: document.getElementById('restritaMotivo').value.trim() })
    });
    closeModal('addRestritaModal');
    showToast('Pessoa adicionada à lista restrita!');
    loadRestritas();
  } catch (_) {}
}

async function openEditRestrita(id) {
  const rows = await api('/api/pessoas-restritas');
  const r = rows.find(x => String(x.id) === String(id));
  if (!r) return;
  editingRestritaId = id;
  document.getElementById('editRestritaNome').value = r.nome || '';
  document.getElementById('editRestritaMotivo').value = r.motivo || '';
  openModal('editRestritaModal');
}

async function saveRestrita() {
  if (!editingRestritaId) return;
  try {
    await api(`/api/pessoas-restritas/${editingRestritaId}`, {
      method: 'PUT',
      body: JSON.stringify({
        nome: document.getElementById('editRestritaNome').value.trim(),
        motivo: document.getElementById('editRestritaMotivo').value.trim()
      })
    });
    closeModal('editRestritaModal');
    editingRestritaId = null;
    showToast('Salvo!');
    loadRestritas();
  } catch (_) {}
}

async function deleteCurrentRestrita() {
  if (!editingRestritaId) return;
  if (!confirm('Remover desta lista?')) return;
  await api(`/api/pessoas-restritas/${editingRestritaId}`, { method: 'DELETE' });
  closeModal('editRestritaModal');
  editingRestritaId = null;
  loadRestritas();
}

// ============== LISTAS ==============
async function loadListas() {
  try {
    const q = getMonthQuery();
    const [holders, convidados] = await Promise.all([
      api(`/api/listas?tipo=holder&${q}`),
      api(`/api/listas?tipo=convidado&${q}`)
    ]);
    renderListaRows('listasHoldersList', holders, 'holder');
    renderListaRows('listasConvidadosList', convidados, 'convidado');
    // se uma lista estava aberta, reabre o detalhe
    if (openListId) await renderListDetail(openListId);
  } catch (e) { console.error(e); }
}

function renderListaRows(containerId, rows, tipo) {
  const cont = document.getElementById(containerId);
  if (!rows || !rows.length) {
    cont.innerHTML = `<div class="empty-state"><div class="ico">📋</div><p>Nenhuma lista neste mês</p></div>`;
    return;
  }
  cont.innerHTML = rows.map(l => {
    const owner = l.holder_nome || l.convidado_nome || l.aniversariante_nome || 'Sem dono';
    const total = Number(l.guest_count || 0);
    const idas = Number(l.guests_attended || 0);
    const pct = total ? Math.round(idas * 100 / total) : 0;
    const dia = l.dia_semana ? `<span class="lista-pill">${DIA_LABEL[l.dia_semana] || l.dia_semana}</span>` : '';
    return `
      <div class="lista-row" onclick="openListDetail(${l.id}, '${tipo}')">
        <div class="left">
          <div class="holder-avatar">${avatarFor(owner)}</div>
          <div>
            <div class="card-title">${escapeHtml(owner)} ${dia}</div>
            <div class="card-meta">${formatDateBR(l.data)} · ${total} convidado${total === 1 ? '' : 's'}</div>
          </div>
        </div>
        <div class="lista-progress">
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <div class="progress-text">${idas}/${total} (${pct}%)</div>
        </div>
      </div>
      <div id="listDetail-${l.id}"></div>
    `;
  }).join('');
}

async function openAddListModal(tipo) {
  addListType = tipo;
  addListSelectedDay = null;
  document.querySelectorAll('#addListDayPicker .day-chip').forEach(c => c.classList.remove('selected'));
  document.getElementById('addListDate').value = todayISO();

  const selectGroup = document.getElementById('addListOwnerSelectGroup');
  const nameGroup = document.getElementById('addListOwnerNameGroup');
  const sel = document.getElementById('addListOwner');
  const nameInput = document.getElementById('addListOwnerName');

  if (tipo === 'holder') {
    document.getElementById('addListHeader').textContent = 'Nova Lista de Holder';
    document.getElementById('addListSelectLabel').textContent = 'Holder';
    const rows = await api('/api/holders');
    if (!rows.length) { alert('Cadastre um holder primeiro.'); return; }
    sel.innerHTML = rows.map(h => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('');
    selectGroup.style.display = '';
    nameGroup.style.display = 'none';
  } else {
    document.getElementById('addListHeader').textContent = 'Nova Lista de Convidado';
    nameInput.value = '';
    selectGroup.style.display = 'none';
    nameGroup.style.display = '';
  }
  openModal('addListModal');
}

async function addList() {
  const data = document.getElementById('addListDate').value;
  if (!data) return showToast('Informe a data', 'error');

  const body = { data, tipo: addListType, dia_semana: addListSelectedDay };

  if (addListType === 'holder') {
    const ownerId = document.getElementById('addListOwner').value;
    if (!ownerId) return showToast('Selecione o holder', 'error');
    body.holder_id = Number(ownerId);
  } else {
    const nome = document.getElementById('addListOwnerName').value.trim();
    if (!nome) return showToast('Informe o nome do dono da lista', 'error');
    body.convidado_nome = nome;
  }

  try {
    await api('/api/listas', { method: 'POST', body: JSON.stringify(body) });
    closeModal('addListModal');
    showToast('Lista criada!');
    loadListas();
  } catch (_) {}
}

// ============== DETALHE DA LISTA ==============
async function openListDetail(listaId, ctx) {
  // toggle: se já está aberta, fecha
  if (openListId === listaId) {
    openListId = null;
    openListContext = null;
    const old = document.getElementById(`listDetail-${listaId}`);
    if (old) old.innerHTML = '';
    return;
  }
  openListId = listaId;
  openListContext = ctx;
  await renderListDetail(listaId);
}

async function renderListDetail(listaId) {
  const guests = await api(`/api/listas/${listaId}/convidados`);
  if (!guests) return;
  const total = guests.length;
  const idas = guests.filter(g => g.chegou).length;
  const pct = total ? Math.round(idas * 100 / total) : 0;

  const html = `
    <div class="lista-detail">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <div>
          <div style="font-weight:700; font-size:14px;">Convidados</div>
          <div style="font-size:12px; color:var(--muted); margin-top:2px;">
            ${idas}/${total} chegaram (${pct}%)
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn small" onclick="openAddGuestModal(${listaId})">+ Adicionar</button>
          <button class="btn ghost small" onclick="confirmDeleteList(${listaId})">Apagar lista</button>
        </div>
      </div>
      ${total === 0 ? `<div class="empty-state" style="padding:20px"><p>Sem convidados ainda</p></div>` :
        guests.map(g => `
          <div class="guest-item">
            <input type="checkbox" class="guest-checkbox" ${g.chegou ? 'checked' : ''}
              onchange="togglePresenca(${g.id}, this.checked, ${listaId})">
            <div class="guest-info">
              <div class="guest-name ${g.chegou ? 'attended' : ''}">${escapeHtml(g.nome)}</div>
              <div class="guest-details">
                ${escapeHtml(g.instagram || '')}${g.instagram && g.telefone ? ' · ' : ''}${escapeHtml(g.telefone || '')}
                ${g.quem_convida ? ` · convidado por ${escapeHtml(g.quem_convida)}` : ''}
              </div>
            </div>
            <div class="guest-actions">
              <button class="btn ghost small" onclick="removeGuest(${g.id}, ${listaId})">Remover</button>
            </div>
          </div>
        `).join('')
      }
    </div>
  `;
  const target = document.getElementById(`listDetail-${listaId}`);
  if (target) target.innerHTML = html;
}

async function togglePresenca(guestId, chegou, listaId) {
  await api(`/api/convidados/${guestId}/presenca`, {
    method: 'PUT', body: JSON.stringify({ chegou })
  });
  await renderListDetail(listaId);
  // se estamos na aba listas, atualiza o contador da row também
  if (currentTab === 'listas') loadListas();
}

async function removeGuest(guestId, listaId) {
  if (!confirm('Remover este convidado da lista?')) return;
  await api(`/api/convidados/${guestId}`, { method: 'DELETE' });
  await renderListDetail(listaId);
  if (currentTab === 'listas') loadListas();
}

let addGuestListaId = null;
let addGuestMode = 'single';

function openAddGuestModal(listaId) {
  addGuestListaId = listaId;
  document.getElementById('guestName').value = '';
  document.getElementById('guestInstagram').value = '';
  document.getElementById('guestTelefone').value = '';
  document.getElementById('guestQuemConvida').value = '';
  document.getElementById('guestBulkText').value = '';
  document.getElementById('guestBulkQuemConvida').value = '';
  document.getElementById('guestBulkPreview').textContent = '';
  // sempre volta pra individual ao abrir
  const indivBtn = document.querySelector('#addGuestModal .subtab[data-mode="single"]');
  if (indivBtn) setGuestAddMode(indivBtn, 'single');
  openModal('addGuestModal');
}

function setGuestAddMode(btn, mode) {
  document.querySelectorAll('#addGuestModal .subtab').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  addGuestMode = mode;
  document.getElementById('guestSingleForm').style.display = mode === 'single' ? '' : 'none';
  document.getElementById('guestBulkForm').style.display = mode === 'bulk' ? '' : 'none';
  document.getElementById('guestAddBtn').textContent = mode === 'bulk' ? 'Adicionar todos' : 'Adicionar';
  if (mode === 'bulk') updateBulkPreview();
}

// Parser: extrai nome / instagram / telefone de uma linha
function parseGuestLine(raw) {
  let line = (raw || '').trim();
  if (!line) return null;
  // remove numeração inicial: "1.", "1)", "1 -", "•", "-"
  line = line.replace(/^\s*(\d+\s*[\.\)\-:]\s*|[•\-\*]\s+)/, '').trim();
  if (!line) return null;

  // extrai instagram (@algo)
  let instagram = '';
  const igMatch = line.match(/@([A-Za-z0-9_.]+)/);
  if (igMatch) {
    instagram = '@' + igMatch[1];
    line = line.replace(igMatch[0], '').trim();
  }

  // extrai telefone (sequência com parênteses/espaços/traços + 10-13 dígitos)
  let telefone = '';
  const phoneMatch = line.match(/[\+\(\d][\d\s\-().]{8,18}\d/);
  if (phoneMatch) {
    const onlyDigits = phoneMatch[0].replace(/\D/g, '');
    if (onlyDigits.length >= 10 && onlyDigits.length <= 13) {
      telefone = formatPhone(onlyDigits.slice(-11));
      line = line.replace(phoneMatch[0], '').trim();
    }
  }

  // resto = nome (limpa separadores e parênteses órfãos)
  const nome = line
    .replace(/[\-–—|,;:()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!nome) return null;
  return { nome, instagram, telefone };
}

function parseGuestList(text) {
  return (text || '').split(/\r?\n/).map(parseGuestLine).filter(Boolean);
}

function updateBulkPreview() {
  const text = document.getElementById('guestBulkText').value;
  const items = parseGuestList(text);
  const el = document.getElementById('guestBulkPreview');
  if (!items.length) {
    el.textContent = 'Nenhuma pessoa identificada ainda.';
  } else {
    el.textContent = `${items.length} pessoa${items.length === 1 ? '' : 's'} pronta${items.length === 1 ? '' : 's'} para adicionar.`;
  }
}

async function addGuestToList() {
  if (!addGuestListaId) return;

  if (addGuestMode === 'bulk') {
    const text = document.getElementById('guestBulkText').value;
    const items = parseGuestList(text);
    if (!items.length) return alert('Cole a lista de pessoas (uma por linha).');
    const quem = document.getElementById('guestBulkQuemConvida').value.trim();
    const r = await api(`/api/listas/${addGuestListaId}/convidados/bulk`, {
      method: 'POST',
      body: JSON.stringify({ items, quem_convida: quem })
    });
    closeModal('addGuestModal');
    await renderListDetail(addGuestListaId);
    if (currentTab === 'listas') loadListas();
    if (currentTab === 'aniversariantes') loadAniversariantes();
    return;
  }

  const nome = document.getElementById('guestName').value.trim();
  if (!nome) return alert('Informe o nome');
  await api(`/api/listas/${addGuestListaId}/convidados`, {
    method: 'POST',
    body: JSON.stringify({
      nome,
      instagram: formatInstagram(document.getElementById('guestInstagram').value),
      telefone: document.getElementById('guestTelefone').value.trim(),
      quem_convida: document.getElementById('guestQuemConvida').value.trim()
    })
  });
  closeModal('addGuestModal');
  await renderListDetail(addGuestListaId);
  if (currentTab === 'listas') loadListas();
  if (currentTab === 'aniversariantes') loadAniversariantes();
}

async function confirmDeleteList(listaId) {
  if (!confirm('Apagar esta lista? Holders e convidados continuam cadastrados.')) return;
  await api(`/api/listas/${listaId}`, { method: 'DELETE' });
  openListId = null;
  if (currentTab === 'listas') loadListas();
  if (currentTab === 'aniversariantes') loadAniversariantes();
}

// ============== ANÁLISE ==============
function startOfWeek(date) {
  // semana = segunda-feira → domingo
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();             // 0=dom, 1=seg, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function endOfWeek(start) {
  const e = new Date(start);
  e.setDate(start.getDate() + 6);
  return e;
}

function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function setAnaliseMode(btn, mode) {
  document.querySelectorAll('#analise .subtab').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  analiseMode = mode;
  document.getElementById('weekNav').style.display = mode === 'semana' ? 'flex' : 'none';
  document.getElementById('comparativoSection').style.display = mode === 'mes' ? 'block' : 'none';
  document.getElementById('resumoTitle').textContent = mode === 'semana' ? 'Visão geral da semana' : 'Visão geral do mês';
  loadAnalise();
}

function shiftWeek(deltaWeeks) {
  if (!weekStart) weekStart = startOfWeek(new Date());
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 7 * deltaWeeks);
  weekStart = d;
  loadAnalise();
}

function goToCurrentWeek() {
  weekStart = startOfWeek(new Date());
  loadAnalise();
}

function getAnaliseQuery() {
  if (analiseMode === 'semana') {
    if (!weekStart) weekStart = startOfWeek(new Date());
    const start = isoDate(weekStart);
    const end = isoDate(endOfWeek(weekStart));
    return { qs: `start=${start}&end=${end}`, label: `${formatDateBR(start)} → ${formatDateBR(end)}` };
  }
  const ym = `${currentMonth.getFullYear()}-${pad2(currentMonth.getMonth() + 1)}`;
  const mLabel = formatMonthLabel(currentMonth);
  return { qs: `year=${currentMonth.getFullYear()}&month=${pad2(currentMonth.getMonth() + 1)}`, label: mLabel.charAt(0).toUpperCase() + mLabel.slice(1) };
}

async function loadAnalise() {
  if (analiseMode === 'semana' && !weekStart) weekStart = startOfWeek(new Date());
  const { qs, label } = getAnaliseQuery();
  document.getElementById('periodoAtivo').textContent = `Período: ${label}`;
  try {
    const calls = [
      api(`/api/analise/resumo?${qs}`),
      api(`/api/analise/holders-performance?${qs}`),
      api(`/api/analise/alertas-pessoas?${qs}&min=2`)
    ];
    if (analiseMode === 'mes') calls.push(api(`/api/analise/comparativo-mensal?meses=6`));
    const results = await Promise.all(calls);
    renderResumo(results[0] || {});
    renderHoldersPerf(results[1] || []);
    renderAlertas(results[2] || []);
    if (analiseMode === 'mes') renderComparativo(results[3] || []);
  } catch (e) { console.error(e); }
}

function renderComparativo(rows) {
  const cont = document.getElementById('analiseComparativo');
  if (!rows.length) {
    cont.innerHTML = `<div class="empty-state"><p>Sem dados nos últimos meses.</p></div>`;
    return;
  }
  // ordena ascendente para barras esquerda→direita
  const asc = [...rows].sort((a, b) => a.ym.localeCompare(b.ym));
  const maxConv = Math.max(1, ...asc.map(r => Number(r.total_convites || 0)));
  const ymCurrent = `${currentMonth.getFullYear()}-${pad2(currentMonth.getMonth() + 1)}`;

  const bars = asc.map(r => {
    const conv = Number(r.total_convites || 0);
    const idas = Number(r.total_idas || 0);
    const taxa = r.taxa == null ? 0 : Number(r.taxa);
    const heightConv = Math.round((conv / maxConv) * 100);
    const heightIdas = conv ? Math.round((idas / conv) * heightConv) : 0;
    const [y, m] = r.ym.split('-');
    const monthName = MONTHS_PT_SHORT[Number(m) - 1] || m;
    const isCurrent = r.ym === ymCurrent;
    return `
      <div class="month-bar ${isCurrent ? 'current' : ''}">
        <div class="bar-value">${taxa}%</div>
        <div class="bar-track" title="${conv} convites · ${idas} idas">
          <div class="bar-fill" style="height:${heightConv}%; position:relative;">
            <div class="bar-fill success" style="height:${conv ? Math.round(idas * 100 / conv) : 0}%; position:absolute; bottom:0; left:0; right:0;"></div>
          </div>
        </div>
        <div class="bar-label">${monthName}/${y.slice(2)}</div>
        <div class="bar-meta">${idas}/${conv}</div>
      </div>
    `;
  }).join('');

  cont.innerHTML = `
    <div class="month-bars">${bars}</div>
    <div style="display:flex; gap:14px; margin-top:10px; font-size:11px; color:var(--muted);">
      <span><span style="display:inline-block; width:10px; height:10px; background:var(--ink); border-radius:2px; vertical-align:middle;"></span> Convites</span>
      <span><span style="display:inline-block; width:10px; height:10px; background:var(--success); border-radius:2px; vertical-align:middle;"></span> Idas</span>
    </div>
  `;
}

function renderResumo(r) {
  const total = Number(r.total_listas || 0);
  const conv = Number(r.total_convites || 0);
  const idas = Number(r.total_idas || 0);
  const taxa = r.taxa_global == null ? 0 : Number(r.taxa_global);
  document.getElementById('analiseResumo').innerHTML = `
    <div class="stat-box"><div class="stat-number">${total}</div><div class="stat-label">Listas</div></div>
    <div class="stat-box"><div class="stat-number">${conv}</div><div class="stat-label">Convites</div></div>
    <div class="stat-box"><div class="stat-number success">${idas}</div><div class="stat-label">Idas</div></div>
    <div class="stat-box"><div class="stat-number ${taxa >= 50 ? 'success' : (taxa >= 30 ? 'warning' : 'danger')}">${taxa}%</div><div class="stat-label">Taxa de ativação</div></div>
  `;
}

function renderHoldersPerf(rows) {
  const cont = document.getElementById('analiseHolders');
  if (!rows.length) {
    cont.innerHTML = `<div class="empty-state"><p>Nenhum holder com listas neste mês.</p></div>`;
    return;
  }
  cont.innerHTML = rows.map(h => {
    const conv = Number(h.total_convites || 0);
    const idas = Number(h.total_idas || 0);
    const taxa = h.taxa_ativacao == null ? 0 : Number(h.taxa_ativacao);
    const cls = taxa >= 50 ? 'success' : (taxa >= 30 ? 'warn' : 'danger');
    return `
      <div class="holder-card">
        <div class="holder-avatar">${avatarFor(h.name)}</div>
        <div class="holder-info">
          <div class="holder-name">${escapeHtml(h.name)} <span class="mini-badge ${cls}">${taxa}%</span></div>
          <div class="holder-meta">${h.total_listas} lista(s) · ${conv} convites · ${idas} idas</div>
        </div>
        <div class="lista-progress">
          <div class="progress-bar"><div class="progress-fill" style="width:${taxa}%"></div></div>
          <div class="progress-text">${idas}/${conv}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderAlertas(rows) {
  const cont = document.getElementById('analiseAlertas');
  if (!rows.length) {
    cont.innerHTML = `<div class="empty-state"><div class="ico">✅</div><p>Nenhum alerta. Convidados estão comparecendo!</p></div>`;
    return;
  }
  // alerta pesado: mais faltas que idas e total >= 2
  cont.innerHTML = rows.map(r => {
    const total = Number(r.total_vezes);
    const idas = Number(r.total_idas);
    const faltas = Number(r.total_faltas);
    const pesado = faltas >= 2 && idas === 0;
    return `
      <div class="alert-row ${pesado ? 'danger' : ''}">
        <div>
          <div class="alert-name">${escapeHtml(r.nome)}
            <span class="mini-badge ${pesado ? 'danger' : 'warn'}">${faltas} falta${faltas === 1 ? '' : 's'}</span>
          </div>
          <div class="alert-meta">
            Convidada ${total}x · ${idas} ida${idas === 1 ? '' : 's'}
            ${r.convidada_por ? ` · por ${escapeHtml(r.convidada_por)}` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}
