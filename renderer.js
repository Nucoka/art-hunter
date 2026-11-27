'use strict';

const U = window.SearchUtils;
const $ = id => document.getElementById(id);
const SOURCES = [
  { id: 'pinterest', name: 'Pinterest', color: '#f472b6' },
  { id: 'yandex', name: 'Яндекс Картинки', color: '#ffcc4d' },
  { id: 'ddg', name: 'DuckDuckGo', color: '#60a5fa' },
  { id: 'bing', name: 'Bing', color: '#34d399' },
  { id: 'deviantart', name: 'DeviantArt', color: '#7ee787' },
  { id: 'artstation', name: 'ArtStation', color: '#8ab4f8' },
  { id: 'openverse', name: 'Openverse', color: '#fbbf24' },
  { id: 'commons', name: 'Wikimedia', color: '#c4b5fd' }
];
const SOURCE_NAMES = Object.fromEntries(SOURCES.map(s => [s.id, s.name]));
const DEFAULT_SETTINGS = {
  sources: Object.fromEntries(SOURCES.map(s => [s.id, true])),
  folder: '',
  smart: true
};
const DEFAULT_THEME = {
  bg: '#12121a', panel: '#1c1c2a', accent: '#a970ff', accent2: '#ff85bf',
  panelAlpha: 100, topAlpha: 86, radius: 10, cell: 175, fit: 'contain', line: 1.8,
  windowAlpha: 100, windowRadius: 14
};
const THEME_PRESETS = {
  dark: { ...DEFAULT_THEME },
  light: { ...DEFAULT_THEME, bg: '#eceef4', panel: '#ffffff', accent: '#6d4aff', accent2: '#e2569b', panelAlpha: 98, topAlpha: 94, radius: 12, line: 1.7 },
  neon: { ...DEFAULT_THEME, bg: '#080816', panel: '#12102a', accent: '#39ffd0', accent2: '#ff4fd8', panelAlpha: 92, topAlpha: 80, radius: 14 },
  berry: { ...DEFAULT_THEME, bg: '#1c0e18', panel: '#2a1424', accent: '#ff6b9d', accent2: '#ffc371', panelAlpha: 96, topAlpha: 88 },
  mint: { ...DEFAULT_THEME, bg: '#0e1a18', panel: '#152824', accent: '#5eead4', accent2: '#a3e635', panelAlpha: 96, topAlpha: 88 },
  graphite: { ...DEFAULT_THEME, bg: '#151515', panel: '#222222', accent: '#b8b8b8', accent2: '#8ab4f8', panelAlpha: 100, topAlpha: 92, radius: 6, line: 1.6 }
};
const THEME_FIELDS = {
  thBg: 'bg', thPanel: 'panel', thAccent: 'accent', thAccent2: 'accent2',
  thPanelAlpha: 'panelAlpha', thTopAlpha: 'topAlpha', thRadius: 'radius',
  thCell: 'cell', thFit: 'fit', thLine: 'line',
  thWindowAlpha: 'windowAlpha', thWindowRadius: 'windowRadius'
};

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* хранилище недоступно */ }
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

const state = {
  query: '',
  parsed: null,
  page: 0,
  items: [],
  visible: [],
  filtered: [],
  favs: load('arthunter.favs', []),
  hidden: load('arthunter.hidden', []),
  history: load('arthunter.history', []),
  settings: { ...DEFAULT_SETTINGS, ...load('arthunter.settings', {}) },
  theme: { ...DEFAULT_THEME, ...load('arthunter.theme', {}) },
  selectedTags: new Set(),
  view: 'find',
  loading: false,
  hasMore: false,
  lbIndex: -1
};
state.settings.sources = { ...DEFAULT_SETTINGS.sources, ...(state.settings.sources || {}) };

let toastTimer = null;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

function hexToRgba(hex, alpha) {
  const value = String(hex || '').replace('#', '');
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(28,28,42,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function applyTheme() {
  const root = document.documentElement.style;
  const t = state.theme;
  root.setProperty('--bg', t.bg);
  root.setProperty('--panel', t.panel);
  root.setProperty('--accent', t.accent);
  root.setProperty('--accent-2', t.accent2);
  root.setProperty('--panel-bg', hexToRgba(t.panel, t.panelAlpha / 100));
  root.setProperty('--topbar-bg', hexToRgba(t.panel, t.topAlpha / 100));
  root.setProperty('--radius', `${t.radius}px`);
  root.setProperty('--cell', `${t.cell}px`);
  root.setProperty('--fit', t.fit);
  root.setProperty('--line-width', t.line);
  root.setProperty('--window-radius', `${t.windowRadius}px`);
  window.api.setOpacity(t.windowAlpha / 100);
}

function syncThemeInputs() {
  for (const [id, key] of Object.entries(THEME_FIELDS)) {
    $(id).value = state.theme[key];
    const label = $(id + 'Val');
    if (label) {
      const unit = ['thRadius', 'thCell', 'thWindowRadius'].includes(id) ? ' px' : (id.includes('Alpha') ? '%' : '');
      label.textContent = `${state.theme[key]}${unit}`;
    }
  }
}

function bindTheme() {
  for (const [id, key] of Object.entries(THEME_FIELDS)) {
    $(id).addEventListener('input', () => {
      const el = $(id);
      state.theme[key] = el.type === 'range' ? Number(el.value) : el.value;
      save('arthunter.theme', state.theme);
      syncThemeInputs();
      applyTheme();
    });
  }
  document.querySelectorAll('[data-preset]').forEach(button => {
    button.addEventListener('click', () => {
      state.theme = { ...THEME_PRESETS[button.dataset.preset] };
      save('arthunter.theme', state.theme);
      syncThemeInputs();
      applyTheme();
      toast(`Тема: ${button.textContent}`);
    });
  });
  $('resetTheme').addEventListener('click', () => {
    state.theme = { ...DEFAULT_THEME };
    save('arthunter.theme', state.theme);
    syncThemeInputs();
    applyTheme();
    toast('Оформление сброшено');
  });
  syncThemeInputs();
  applyTheme();
}

/* Sources and settings */
function renderSources() {
  const html = SOURCES.map(s => `
    <label class="source-item">
      <input type="checkbox" data-source="${s.id}" ${state.settings.sources[s.id] ? 'checked' : ''}>
      <span>${s.name}</span><span class="source-dot" style="background:${s.color}"></span>
    </label>`).join('');
  $('sourceFilters').innerHTML = html;
}

$('smartSearch').checked = state.settings.smart !== false;
$('smartSearch').addEventListener('change', event => {
  state.settings.smart = event.target.checked;
  save('arthunter.settings', state.settings);
  applyFilters();
});

document.addEventListener('change', event => {
  const input = event.target.closest('input[data-source]');
  if (!input) return;
  state.settings.sources[input.dataset.source] = input.checked;
  save('arthunter.settings', state.settings);
});

$('btnFilters').addEventListener('click', () => {
  const open = !$('drawer').classList.contains('open');
  $('drawer').classList.toggle('open', open);
  $('drawerBackdrop').classList.toggle('open', open);
});
function closeDrawer() {
  $('drawer').classList.remove('open');
  $('drawerBackdrop').classList.remove('open');
}
$('closeFilters').addEventListener('click', closeDrawer);
$('drawerBackdrop').addEventListener('click', closeDrawer);

document.querySelectorAll('[data-win]').forEach(btn => {
  btn.addEventListener('click', () => window.api.windowAction(btn.dataset.win));
});
$('topbar').addEventListener('dblclick', event => {
  if (!event.target.closest('input, button, .search-wrap, .tools, .win-controls')) window.api.windowAction('max');
});
function syncWindowState(max) {
  $('winMax').classList.toggle('is-max', max);
  document.querySelector('.app').classList.toggle('maximized', max);
}
window.api.onWindowState(syncWindowState);
window.api.windowAction('state').then(syncWindowState);

$('btnSettings').addEventListener('click', () => {
  $('folderInput').value = state.settings.folder || '';
  $('settingsModal').classList.remove('hidden');
});
$('closeSettings').addEventListener('click', () => $('settingsModal').classList.add('hidden'));
$('saveSettings').addEventListener('click', () => {
  state.settings.folder = $('folderInput').value.trim();
  save('arthunter.settings', state.settings);
  $('settingsModal').classList.add('hidden');
  toast('Настройки сохранены');
});
$('pickFolder').addEventListener('click', async () => {
  const folder = await window.api.pickFolder();
  if (folder) $('folderInput').value = folder;
});
$('clearHistory').addEventListener('click', () => {
  state.history = [];
  save('arthunter.history', []);
  renderHistory();
  toast('История очищена');
});

/* Search */
$('searchForm').addEventListener('submit', event => {
  event.preventDefault();
  runSearch($('searchInput').value);
});

function runSearch(raw) {
  const query = String(raw || '').trim();
  if (!query) return;
  const parsed = U.parseQuery(query);
  state.query = query;
  state.parsed = parsed;
  state.page = 0;
  state.items = [];
  state.selectedTags.clear();
  state.view = 'find';
  setActiveView();
  $('searchInput').value = query;
  const hint = parsed.expanded.join(' ') !== parsed.include.join(' ') ? `Умный поиск: ${parsed.remoteQuery}` : '';
  $('queryHint').textContent = hint;
  $('queryHint').classList.toggle('hidden', !hint);
  state.history = [query, ...state.history.filter(h => h !== query)].slice(0, 15);
  save('arthunter.history', state.history);
  renderHistory();
  hideSuggestions();
  loadPage(1).then(primePages);
}

async function primePages() {
  for (let page = 2; page <= 8 && state.hasMore; page++) await loadPage(page);
}

async function loadPage(page) {
  if (state.loading) return;
  state.loading = true;
  $('loader').classList.remove('hidden');
  $('loadMore').classList.add('hidden');
  const sources = SOURCES.filter(s => state.settings.sources[s.id]).map(s => s.id);
  try {
    const result = await window.api.search({ query: state.parsed?.remoteQuery || state.query, sources, page });
    const fresh = U.dedupeItems([...state.items, ...result.items]);
    state.items = fresh;
    state.page = page;
    state.hasMore = result.items.length > 0 && page < 40;
    $('errorLine').textContent = result.errors.length && !result.items.length ? `Источники недоступны: ${result.errors.join('; ')}` : '';
    applyFilters();
  } catch (err) {
    $('errorLine').textContent = 'Ошибка поиска: ' + err.message;
    state.hasMore = false;
  } finally {
    state.loading = false;
    $('loader').classList.add('hidden');
    if (state.hasMore && state.view === 'find') $('loadMore').classList.remove('hidden');
    updateStatus();
  }
}

$('loadMore').addEventListener('click', () => loadPage(state.page + 1));
const observer = new IntersectionObserver(entries => {
  if (entries.some(e => e.isIntersecting) && !state.loading && state.hasMore && state.view === 'find') {
    loadPage(state.page + 1);
  }
}, { root: document.querySelector('.content'), rootMargin: '900px' });
observer.observe($('loadMore'));

/* Filters and rendering */
function filterOptions() {
  return {
    parsed: state.parsed,
    tags: [...state.selectedTags],
    minWidth: Number($('minWidth').value) || 0,
    orientation: $('orientation').value,
    format: $('format').value
  };
}

function applyFilters() {
  const base = U.smartFilter(state.items, state.parsed, state.hidden, state.settings.smart !== false);
  state.filtered = U.sortItems(U.filterItems(base, filterOptions()), $('sort').value, state.parsed);
  renderTagCloud();
  render();
}

$('restoreHidden').addEventListener('click', () => {
  state.hidden = [];
  save('arthunter.hidden', []);
  applyFilters();
  toast('Скрытые картинки возвращены');
});

['minWidth', 'orientation', 'format', 'sort'].forEach(id => {
  $(id).addEventListener('change', () => { if (state.view === 'find') applyFilters(); });
});
$('resetFilters').addEventListener('click', () => {
  $('minWidth').value = '0';
  $('orientation').value = 'any';
  $('format').value = 'any';
  $('sort').value = 'relevance';
  state.selectedTags.clear();
  applyFilters();
});

function setActiveView() {
  $('viewFind').classList.toggle('active', state.view === 'find');
  $('viewFav').classList.toggle('active', state.view === 'favs');
  $('loadMore').classList.toggle('hidden', !(state.view === 'find' && state.hasMore && !state.loading));
}
$('viewFind').classList.add('active');
$('viewFind').addEventListener('click', () => { state.view = 'find'; setActiveView(); applyFilters(); });
$('viewFav').addEventListener('click', () => { state.view = 'favs'; setActiveView(); render(); });

function updateStatus() {
  const shown = state.view === 'favs' ? state.favs.length : state.filtered.length;
  const total = state.view === 'favs' ? state.favs.length : state.items.length;
  $('status').textContent = state.query
    ? `«${state.query}» · загружено ${total} · показано ${shown} · убрано ${total - shown}` + (state.hasMore ? ' · загружаю ещё…' : '')
    : 'Введите запрос и нажмите «Найти»';
  $('favCount').textContent = state.favs.length;
  $('restoreHidden').textContent = `Вернуть скрытое (${state.hidden.length})`;
}

function renderTagCloud() {
  const counts = new Map();
  for (const item of state.items) {
    for (const tag of U.extractTags(item)) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  const top = [...counts.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]).slice(0, 24);
  $('tagCount').textContent = counts.size ? `(${counts.size})` : '';
  $('tagCloud').innerHTML = top.map(([tag, count]) =>
    `<button class="tag ${state.selectedTags.has(tag) ? 'active' : ''}" data-tag="${esc(tag)}">${esc(tag)}<b>${count}</b></button>`
  ).join('');
}
$('tagCloud').addEventListener('click', event => {
  const btn = event.target.closest('[data-tag]');
  if (!btn) return;
  const tag = btn.dataset.tag;
  if (state.selectedTags.has(tag)) state.selectedTags.delete(tag);
  else state.selectedTags.add(tag);
  applyFilters();
});

function isFav(item) { return state.favs.some(f => f.url === item.url); }

function render() {
  const items = state.view === 'favs' ? state.favs : state.filtered;
  state.visible = items;
  $('grid').innerHTML = items.map((item, index) => `
    <article class="card" style="animation-delay:${Math.min(index, 24) * 18}ms">
      <img src="${esc(item.thumb || item.url)}" alt="${esc(item.title)}" loading="lazy"
           onerror="this.style.opacity='0.15'">
      <span class="badge">${esc(SOURCE_NAMES[item.source] || item.source || '')}</span>
      <div class="thumb-actions">
        <button class="card-action" data-act="hide" data-index="${index}" title="Скрыть"><svg><use href="#i-close"/></svg></button>
        <button class="card-action fav ${isFav(item) ? 'active' : ''}" data-act="fav" data-index="${index}" title="В избранное"><svg><use href="#i-heart"/></svg></button>
        <button class="card-action" data-act="download" data-index="${index}" title="Скачать"><svg><use href="#i-download"/></svg></button>
        <button class="card-action" data-act="open" data-index="${index}" title="Открыть источник"><svg><use href="#i-external"/></svg></button>
      </div>
      <div class="card-overlay"><div class="card-title" title="${esc(item.title)}">${esc(item.title || 'Без названия')}</div></div>
    </article>`).join('');
  $('empty').classList.toggle('hidden', items.length > 0);
  updateStatus();
}

$('grid').addEventListener('click', event => {
  const btn = event.target.closest('[data-act]');
  if (btn) {
    const item = state.visible[Number(btn.dataset.index)];
    if (!item) return;
    if (btn.dataset.act === 'fav') toggleFav(item);
    if (btn.dataset.act === 'download') downloadItem(item);
    if (btn.dataset.act === 'hide') hideItem(item);
    if (btn.dataset.act === 'open' && item.page) window.api.openExternal(item.page);
    return;
  }
  const card = event.target.closest('.card');
  if (card && event.target.closest('img')) openLightbox([...$('grid').children].indexOf(card));
});

function toggleFav(item) {
  const exists = isFav(item);
  state.favs = exists ? state.favs.filter(f => f.url !== item.url) : [item, ...state.favs];
  save('arthunter.favs', state.favs);
  toast(exists ? 'Удалено из избранного' : 'Добавлено в избранное');
  render();
}

function hideItem(item) {
  const key = U.titleKey(item);
  if (!item.url && !key) return;
  state.hidden.push({ url: item.url, title: key });
  state.favs = state.favs.filter(f => f.url !== item.url && (!key || U.titleKey(f) !== key));
  save('arthunter.hidden', state.hidden);
  save('arthunter.favs', state.favs);
  toast('Скрыто — больше не появится');
  applyFilters();
}

async function downloadItem(item) {
  try {
    const target = await window.api.download({
      url: item.url,
      name: item.title || `art-${Date.now()}`,
      folder: state.settings.folder
    });
    toast('Скачано: ' + target.split(/[\\/]/).pop());
  } catch (err) {
    toast('Не удалось скачать: ' + err.message);
  }
}

/* Lightbox */
function openLightbox(index) {
  state.lbIndex = index;
  $('lightbox').classList.remove('hidden');
  updateLightbox();
}
function closeLightbox() {
  state.lbIndex = -1;
  $('lightbox').classList.add('hidden');
}
function updateLightbox() {
  const item = state.visible[state.lbIndex];
  if (!item) return closeLightbox();
  $('lbImg').src = item.url;
  $('lbTitle').textContent = item.title || 'Без названия';
  $('lbTags').innerHTML = U.extractTags(item).slice(0, 18).map(t => `<span>${esc(t)}</span>`).join('');
  $('lbFav').innerHTML = `<svg><use href="#i-heart"/></svg> ${isFav(item) ? 'В избранном' : 'В избранное'}`;
}
function moveLightbox(step) {
  const next = state.lbIndex + step;
  if (next >= 0 && next < state.visible.length) { state.lbIndex = next; updateLightbox(); }
}
$('lbClose').addEventListener('click', closeLightbox);
$('lbPrev').addEventListener('click', () => moveLightbox(-1));
$('lbNext').addEventListener('click', () => moveLightbox(1));
$('lbDownload').addEventListener('click', () => { if (state.visible[state.lbIndex]) downloadItem(state.visible[state.lbIndex]); });
$('lbFav').addEventListener('click', () => { if (state.visible[state.lbIndex]) { toggleFav(state.visible[state.lbIndex]); updateLightbox(); } });
$('lbOpen').addEventListener('click', () => {
  const item = state.visible[state.lbIndex];
  if (item?.page) window.api.openExternal(item.page);
});
$('lbSimilar').addEventListener('click', () => {
  const item = state.visible[state.lbIndex];
  if (!item) return;
  closeLightbox();
  const words = U.tokenize(String(item.title || '').split('|')[0]).slice(0, 3);
  if (words.length) runSearch(words.join(' '));
});
$('lightbox').addEventListener('click', event => { if (event.target === $('lightbox')) closeLightbox(); });

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!$('lightbox').classList.contains('hidden')) closeLightbox();
    else if (!$('settingsModal').classList.contains('hidden')) $('settingsModal').classList.add('hidden');
    else if ($('drawer').classList.contains('open')) closeDrawer();
    else hideSuggestions();
  }
  if (!$('lightbox').classList.contains('hidden')) {
    if (event.key === 'ArrowLeft') moveLightbox(-1);
    if (event.key === 'ArrowRight') moveLightbox(1);
  }
});

/* Suggestions */
function hideSuggestions() { $('suggestions').classList.add('hidden'); }
$('searchInput').addEventListener('input', () => {
  const value = $('searchInput').value.trim().toLowerCase();
  if (!value) return hideSuggestions();
  const fromHistory = state.history.filter(h => h.toLowerCase().includes(value)).slice(0, 4).map(h => ({ text: h, icon: 'i-search' }));
  const fromSynonyms = Object.keys(U.SYNONYMS)
    .filter(k => k.includes(value) && !fromHistory.some(x => x.text === k))
    .slice(0, 4).map(k => ({ text: `${k} → ${U.SYNONYMS[k].join(', ')}`, icon: 'i-spark', query: k }));
  const items = [...fromHistory, ...fromSynonyms];
  if (!items.length) return hideSuggestions();
  $('suggestions').innerHTML = items.map(i =>
    `<div class="suggestion" data-query="${esc(i.query || i.text)}"><svg><use href="#${i.icon}"/></svg>${esc(i.text)}</div>`
  ).join('');
  $('suggestions').classList.remove('hidden');
});
$('suggestions').addEventListener('mousedown', event => {
  const item = event.target.closest('[data-query]');
  if (item) runSearch(item.dataset.query);
});
document.addEventListener('click', event => {
  if (!event.target.closest('.search-wrap')) hideSuggestions();
});

function renderHistory() {
  $('history').innerHTML = state.history.map(h => `<button class="history-item" data-q="${esc(h)}">${esc(h)}</button>`).join('');
}
$('history').addEventListener('click', event => {
  const btn = event.target.closest('[data-q]');
  if (btn) runSearch(btn.dataset.q);
});

bindTheme();
renderSources();
renderHistory();
render();
