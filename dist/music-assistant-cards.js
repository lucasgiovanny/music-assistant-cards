/* Music Assistant Cards
 * Lovelace cards drawn to sit beside the Daylight Calendar Card and the Shopping List
 * Card: a playlist cover grid, a now-playing panel, the play queue with search and mood buttons.
 * Licensed under MIT. See LICENSE.
 */

const VERSION = '0.3.0';
const LONG_PRESS_MS = 500;
const SEARCH_DEBOUNCE_MS = 400;
// Lets the helpers be imported by the Node tests, where there is no DOM.
const ElementBase = typeof HTMLElement === 'undefined' ? class {} : HTMLElement;

const STRINGS = {
  en: {
    playlists: 'Playlists',
    no_playlists: 'No playlists',
    loading: 'Loading…',
    unavailable: 'Music Assistant is unavailable',
    play_now: 'Play now',
    play_next: 'Play next',
    add_queue: 'Add to queue',
    cancel: 'Cancel',
    nothing_playing: 'Nothing playing',
    missing_entity: 'Set a media_player entity',
    missing_moods: 'Add moods to the card',
    queue: 'Up next',
    queue_empty: 'The queue is empty',
    queue_missing: 'Install the Music Assistant Queue Actions integration (mass_queue)',
    now: 'Now',
    remove: 'Remove from queue',
    more_in_queue: '+{n} more in the queue',
    move_up: 'Move up',
    move_down: 'Move down',
    search: 'Search songs, artists…',
    tracks: 'Songs',
    albums: 'Albums',
    artists: 'Artists',
    no_results: 'Nothing found',
    radio: 'Radio',
    more_like_this: 'More like this',
    queued_next: 'Up next: {name}',
    queued_end: 'Added to the queue: {name}',
    playing: 'Playing {name}',
    radio_started: 'Radio from {name}',
    recent: 'Recent',
    favorites: 'Favourites',
    empty: 'Nothing here yet'
  },
  pt: {
    playlists: 'Playlists',
    no_playlists: 'Nenhuma playlist',
    loading: 'Carregando…',
    unavailable: 'Music Assistant indisponível',
    play_now: 'Tocar agora',
    play_next: 'Tocar a seguir',
    add_queue: 'Adicionar ao fim',
    cancel: 'Cancelar',
    nothing_playing: 'Nada tocando',
    missing_entity: 'Defina uma entidade media_player',
    missing_moods: 'Adicione moods ao card',
    queue: 'A seguir',
    queue_empty: 'A fila está vazia',
    queue_missing: 'Instale a integração Music Assistant Queue Actions (mass_queue)',
    now: 'Agora',
    remove: 'Remover da fila',
    more_in_queue: '+{n} na fila',
    move_up: 'Subir',
    move_down: 'Descer',
    search: 'Pesquisar músicas, artistas…',
    tracks: 'Músicas',
    albums: 'Álbuns',
    artists: 'Artistas',
    no_results: 'Nada encontrado',
    radio: 'Rádio',
    more_like_this: 'Mais como esta',
    queued_next: 'A seguir: {name}',
    queued_end: 'No fim da fila: {name}',
    playing: 'Tocando {name}',
    radio_started: 'Rádio a partir de {name}',
    recent: 'Recentes',
    favorites: 'Favoritas',
    empty: 'Nada aqui ainda'
  }
};

export function resolveLanguage(hass) {
  const raw = String(hass?.locale?.language || hass?.language || 'en').toLowerCase();
  return raw.startsWith('pt') ? 'pt' : 'en';
}

export function t(lang, key) {
  return (STRINGS[lang] || STRINGS.en)[key] ?? STRINGS.en[key] ?? key;
}

function normalizeName(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Library playlists filtered to `include` (by name or URI) plus `extra` ones, sorted by name.
export function selectPlaylists(libraryItems, { include, extra } = {}) {
  const wanted = Array.isArray(include) && include.length ? include.map(normalizeName) : null;
  const fromLibrary = (libraryItems || [])
    .filter((item) => item && item.uri)
    .filter((item) => !wanted || wanted.includes(normalizeName(item.name)) || wanted.includes(normalizeName(item.uri)))
    .map((item) => ({ name: item.name, uri: item.uri, image: item.image || null, media_type: 'playlist' }));
  const extras = (Array.isArray(extra) ? extra : [])
    .filter((item) => item && item.uri)
    .map((item) => ({ name: item.name || item.uri, uri: item.uri, image: item.image || null, media_type: 'playlist' }));
  const seen = new Set();
  return [...fromLibrary, ...extras]
    .filter((item) => (seen.has(item.uri) ? false : seen.add(item.uri)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function isActiveMood(mood, stateValue) {
  if (!mood || stateValue == null) return false;
  return normalizeName(mood.mood ?? mood.name) === normalizeName(stateValue);
}

// Queue items from the current one onwards; the current item is flagged and kept first.
export function upcomingItems(items, currentId, limit) {
  const list = Array.isArray(items) ? items.filter((item) => item && item.queue_item_id) : [];
  const start = Math.max(0, list.findIndex((item) => item.queue_item_id === currentId));
  return list.slice(start, start + Math.max(1, Number(limit) || 1)).map((item) => ({ ...item, current: item.queue_item_id === currentId }));
}

// A plain-HTTP image (Music Assistant's own server) would be blocked on an HTTPS page.
export function safeImage(url, secure) {
  const value = typeof url === 'string' ? url : url?.path || '';
  if (!value || (secure && value.startsWith('http://'))) return null;
  return value;
}

// Prefers the image mass_queue already encoded.
export function queueImage(item, secure) {
  const encoded = item?.local_image_encoded;
  if (encoded) return String(encoded).startsWith('data:') ? encoded : `data:image;base64,${encoded}`;
  return safeImage(item?.media_image, secure);
}

// A Music Assistant library or search item as a display row.
export function mediaRow(item, fallbackType) {
  return {
    name: item.name,
    uri: item.uri,
    media_type: item.media_type || fallbackType,
    image: item.image || item.album?.image || null,
    subtitle: (item.artists || []).map((artist) => artist.name).filter(Boolean).join(', ') || item.owner || ''
  };
}

const SEARCH_TYPES = ['tracks', 'albums', 'artists', 'playlists'];

// Search results grouped by type, without empty groups.
export function searchGroups(response, limit = 8) {
  const groups = {};
  for (const type of SEARCH_TYPES) {
    const items = (response?.[type] || []).filter((item) => item && item.uri).slice(0, limit).map((item) => mediaRow(item, type.slice(0, -1)));
    if (items.length) groups[type] = items;
  }
  return groups;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const BASE_STYLES = `
  :host { display: block; }
  ha-card { background: none; box-shadow: none; border: none; padding: 0; color: var(--primary-text-color); position: relative; }
  .tile { background: var(--mac-item-background, rgba(127, 127, 127, 0.16)); border-radius: 10px; }
  .warning { padding: 12px; color: var(--warning-color, #ffa600); font-size: 14px; }
  .muted { color: var(--secondary-text-color); }
  .pad { padding: 12px 4px; font-size: 14px; }
  .header { font-size: 16px; font-weight: 500; padding: 4px 2px 12px; }
  button { font: inherit; color: inherit; }
  .tabs { display: flex; flex-wrap: wrap; gap: 8px; padding: 2px 2px 12px; }
  .chip { border: none; cursor: pointer; padding: 6px 12px; border-radius: 16px; background: rgba(127,127,127,0.16); font-size: 13px; font-weight: 500; }
  .chip.on { background: var(--mac-accent); color: var(--text-primary-color, #fff); }
  .overlay { position: fixed; inset: 0; z-index: 9; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; padding: 16px; }
  .menu { width: 100%; max-width: 320px; background: var(--card-background-color, #1c1f24); border-radius: 14px; padding: 8px; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
  .menu h3 { margin: 8px 12px 6px; font-size: 15px; font-weight: 500; }
  .menu button { border: none; background: none; text-align: left; padding: 12px; border-radius: 8px; cursor: pointer; font-size: 14px; }
  .menu button:hover { background: rgba(127,127,127,0.16); }
  .menu .cancel { color: var(--secondary-text-color); }
  .toast { position: absolute; left: 50%; bottom: 12px; transform: translate(-50%, 8px); opacity: 0; pointer-events: none; transition: opacity 0.2s, transform 0.2s; background: var(--mac-accent); color: var(--text-primary-color, #fff); font-size: 13px; font-weight: 500; padding: 8px 14px; border-radius: 18px; max-width: 90%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; z-index: 2; }
  .toast.show { opacity: 1; transform: translate(-50%, 0); }
`;

const ROW_STYLES = `
  .list { padding: 6px; }
  .row { display: flex; align-items: center; gap: 12px; padding: 6px; border-radius: 8px; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  .row:hover { background: rgba(127,127,127,0.12); }
  .row.current .name { color: var(--mac-accent); }
  .thumb { flex: 0 0 auto; width: 44px; height: 44px; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: rgba(127,127,127,0.18); color: var(--secondary-text-color); --mdc-icon-size: 22px; }
  .thumb.round { border-radius: 50%; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .text { flex: 1; min-width: 0; }
  .name { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .artist { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; background: var(--mac-accent); color: var(--text-primary-color, #fff); }
`;

function fireMoreInfo(node, entityId) {
  node.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
}

// A short tap runs the default action, a long press opens the menu.
function bindPress(el, onTap, onLong) {
  let timer = null;
  let longPressed = false;
  const cancel = () => clearTimeout(timer);
  el.addEventListener('pointerdown', () => {
    longPressed = false;
    timer = setTimeout(() => {
      longPressed = true;
      onLong();
    }, LONG_PRESS_MS);
  });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('contextmenu', (event) => event.preventDefault());
  el.addEventListener('click', () => {
    if (!longPressed) onTap();
  });
}

function fallbackImages(root, icon) {
  root.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => {
    img.replaceWith(Object.assign(document.createElement('ha-icon'), { icon }));
  }, { once: true }));
}

function showToast(root, text) {
  let toast = root.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    root.querySelector('ha-card')?.appendChild(toast);
  }
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

function playMedia(hass, entityId, item, enqueue, radio = false) {
  const data = { media_id: item.uri, media_type: item.media_type, enqueue };
  if (radio) data.radio_mode = true;
  return hass.callService('music_assistant', 'play_media', data, { entity_id: entityId });
}

// Media menu entries: label key, enqueue mode, radio.
const MEDIA_MENU = [['play_now', 'play', false], ['play_next', 'next', false], ['add_queue', 'add', false], ['radio', 'replace', true]];
const ENQUEUE_TOAST = { play: 'playing', replace: 'playing', next: 'queued_next', add: 'queued_end' };

export function toastFor(lang, item, enqueue, radio = false) {
  return t(lang, radio ? 'radio_started' : ENQUEUE_TOAST[enqueue]).replace('{name}', item?.name || '');
}

function menuHtml(lang, title, entries) {
  return `
    <div class="overlay"><div class="menu" role="menu">
      <h3>${escapeHtml(title)}</h3>
      ${entries.map(([key], index) => `<button data-entry="${index}">${escapeHtml(t(lang, key))}</button>`).join('')}
      <button class="cancel" data-close>${escapeHtml(t(lang, 'cancel'))}</button>
    </div></div>`;
}

function bindMenu(host, entries, onPick, onClose) {
  const overlay = host.querySelector('.overlay');
  if (!overlay) return;
  overlay.addEventListener('click', (event) => event.target === overlay && onClose());
  overlay.querySelector('[data-close]').addEventListener('click', onClose);
  overlay.querySelectorAll('[data-entry]').forEach((button) => button.addEventListener('click', () => onPick(entries[Number(button.dataset.entry)])));
}

async function configEntryId(hass, config) {
  if (config.config_entry_id) return config.config_entry_id;
  const entry = await hass.callWS({ type: 'config/entity_registry/get', entity_id: config.entity });
  return entry?.config_entry_id;
}

function isSecure() {
  return typeof location !== 'undefined' && location.protocol === 'https:';
}

/* ---------------------------------------------------------------- */
/* Playlist grid                                                     */
/* ---------------------------------------------------------------- */

const GRID_TABS = ['playlists', 'recent', 'favorites'];
const TRACK_QUERIES = { recent: { order_by: 'last_played_desc' }, favorites: { favorite: true } };

class MaPlaylistGrid extends ElementBase {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._library = null;
    this._tracks = {};
    this._error = false;
    this._menu = null;
    this._lastUri = null;
    this._tab = 'playlists';
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass?.states || {}).find((id) => id.startsWith('media_player.')) || '';
    return { entity };
  }

  setConfig(config) {
    if (!config?.entity) throw new Error('entity is required');
    this._config = { shuffle: true, ...config };
    const tabs = (Array.isArray(config.tabs) ? config.tabs : []).filter((tab) => GRID_TABS.includes(tab));
    this._tabs = tabs.length ? tabs : ['playlists'];
    this._tab = this._tabs[0];
    try { this._lastUri = localStorage.getItem(`ma-playlist-grid:${config.entity}`); } catch (e) { /* storage blocked */ }
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._load();
    else if (!this._menu) this._updateActive();
  }

  getCardSize() {
    return 4;
  }

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_columns: 4 };
  }

  async _libraryItems(entryId, mediaType, extra) {
    const result = await this._hass.callWS({
      type: 'call_service',
      domain: 'music_assistant',
      service: 'get_library',
      service_data: { config_entry_id: entryId, media_type: mediaType, ...extra },
      return_response: true
    });
    return result?.response?.items || [];
  }

  async _load() {
    try {
      const entryId = await configEntryId(this._hass, this._config);
      const trackTabs = this._tabs.filter((tab) => TRACK_QUERIES[tab]);
      const [playlists, ...tracks] = await Promise.all([
        this._libraryItems(entryId, 'playlist', { limit: 500 }),
        ...trackTabs.map((tab) => this._libraryItems(entryId, 'track', { limit: 18, ...TRACK_QUERIES[tab] }))
      ]);
      this._library = playlists;
      trackTabs.forEach((tab, index) => { this._tracks[tab] = tracks[index].map((item) => mediaRow(item, 'track')); });
      this._error = false;
    } catch (e) {
      this._error = true;
      setTimeout(() => this._load(), 30000);
    }
    this._render();
  }

  // Tabs with something to show; playlists always stays.
  _visibleTabs() {
    return this._tabs.filter((tab) => tab === 'playlists' || (this._tracks[tab] || []).length);
  }

  _items() {
    if (this._tab === 'playlists') return this._library ? selectPlaylists(this._library, this._config) : [];
    return this._tracks[this._tab] || [];
  }

  _playPlaylist(uri) {
    const entityId = this._config.entity;
    this._hass.callService('music_assistant', 'play_media', { media_id: uri, media_type: 'playlist', enqueue: 'replace' }, { entity_id: entityId })
      .then(() => {
        if (this._config.shuffle) this._hass.callService('media_player', 'shuffle_set', { shuffle: true }, { entity_id: entityId });
      });
    this._lastUri = uri;
    try { localStorage.setItem(`ma-playlist-grid:${entityId}`, uri); } catch (e) { /* storage blocked */ }
    const moodEntity = this._config.mood_entity;
    if (moodEntity && this._config.mood_reset_option) {
      this._hass.callService('input_select', 'select_option', { option: this._config.mood_reset_option }, { entity_id: moodEntity });
    }
    this._updateActive();
  }

  _pick(item, enqueue, radio = false) {
    if (item.media_type === 'playlist' && enqueue === 'play' && !radio) {
      this._playPlaylist(item.uri);
      return;
    }
    playMedia(this._hass, this._config.entity, item, enqueue, radio);
    showToast(this.shadowRoot, toastFor(resolveLanguage(this._hass), item, enqueue, radio));
  }

  _isPlaying() {
    const state = this._hass?.states?.[this._config.entity]?.state;
    return state === 'playing' || state === 'paused';
  }

  _updateActive() {
    const active = this._isPlaying() ? this._lastUri : null;
    this.shadowRoot.querySelectorAll('.cover').forEach((el) => el.classList.toggle('active', el.dataset.uri === active));
  }

  _render() {
    if (!this._config) return;
    const lang = resolveLanguage(this._hass);
    const accent = this._config.color || 'var(--primary-color)';
    const columns = Number(this._config.columns) || 0;
    const secure = isSecure();
    const tabs = this._visibleTabs();
    if (!tabs.includes(this._tab)) this._tab = tabs[0];
    const items = this._items();
    const isPlaylists = this._tab === 'playlists';
    let body;
    if (this._error) body = `<div class="warning">${escapeHtml(t(lang, 'unavailable'))}</div>`;
    else if (!this._library) body = `<div class="muted pad">${escapeHtml(t(lang, 'loading'))}</div>`;
    else if (!items.length) body = `<div class="muted pad">${escapeHtml(t(lang, isPlaylists ? 'no_playlists' : 'empty'))}</div>`;
    else {
      const icon = isPlaylists ? 'mdi:playlist-music' : 'mdi:music-note';
      body = `<div class="grid">${items.map((item, index) => {
        const image = safeImage(item.image, secure);
        return `
        <div class="cover" data-index="${index}" data-uri="${escapeHtml(item.uri)}" title="${escapeHtml(item.name)}">
          <div class="art tile">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : `<ha-icon icon="${icon}"></ha-icon>`}</div>
          <div class="label">${escapeHtml(item.name)}</div>
          ${item.subtitle ? `<div class="sub muted">${escapeHtml(item.subtitle)}</div>` : ''}
        </div>`;
      }).join('')}</div>`;
    }
    const title = this._config.title ?? t(lang, 'playlists');
    const header = tabs.length > 1
      ? `<div class="tabs">${tabs.map((tab) => `<button class="chip ${tab === this._tab ? 'on' : ''}" data-tab="${tab}">${escapeHtml(t(lang, tab))}</button>`).join('')}</div>`
      : (title ? `<div class="header">${escapeHtml(title)}</div>` : '');
    this.shadowRoot.innerHTML = `
      <style>${BASE_STYLES}
        .grid { display: grid; gap: 14px; grid-template-columns: ${columns ? `repeat(${columns}, minmax(0, 1fr))` : 'repeat(auto-fill, minmax(130px, 1fr))'}; }
        .cover { cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
        .art { position: relative; aspect-ratio: 1; overflow: hidden; display: flex; align-items: center; justify-content: center; --mdc-icon-size: 40px; color: var(--secondary-text-color); outline: 2px solid transparent; outline-offset: 2px; transition: outline-color 0.2s, transform 0.1s; }
        .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .cover:active .art { transform: scale(0.98); }
        .cover.active .art { outline-color: var(--mac-accent); }
        .cover.active .label { color: var(--mac-accent); }
        .label { margin-top: 8px; font-size: 13px; font-weight: 500; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .sub { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      </style>
      <ha-card style="--mac-accent: ${escapeHtml(accent)}">
        ${header}
        ${body}
        ${this._menu ? menuHtml(lang, this._menu.name, MEDIA_MENU) : ''}
      </ha-card>`;
    this._bind(items);
    this._updateActive();
  }

  _bind(items) {
    const root = this.shadowRoot;
    fallbackImages(root, this._tab === 'playlists' ? 'mdi:playlist-music' : 'mdi:music-note');
    root.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
      this._tab = button.dataset.tab;
      this._render();
    }));
    root.querySelectorAll('.cover').forEach((el) => {
      const item = items[Number(el.dataset.index)];
      // A playlist replaces the queue; a single song joins it, jukebox style.
      bindPress(el, () => this._pick(item, item.media_type === 'playlist' ? 'play' : 'next'), () => {
        this._menu = item;
        this._render();
      });
    });
    const close = () => {
      this._menu = null;
      this._render();
    };
    bindMenu(root, MEDIA_MENU, ([, enqueue, radio]) => {
      const item = this._menu;
      close();
      this._pick(item, enqueue, radio);
    }, close);
  }
}

/* ---------------------------------------------------------------- */
/* Now playing                                                       */
/* ---------------------------------------------------------------- */

class MaNowPlaying extends ElementBase {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._signature = null;
    this._dragging = false;
    this._ticker = null;
  }

  static getStubConfig(hass) {
    return MaPlaylistGrid.getStubConfig(hass);
  }

  setConfig(config) {
    if (!config?.entity) throw new Error('entity is required');
    this._config = { ...config };
    this._signature = null;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  connectedCallback() {
    this._ticker = setInterval(() => this._updateProgress(), 1000);
  }

  disconnectedCallback() {
    clearInterval(this._ticker);
  }

  getCardSize() {
    return this._config?.compact ? 2 : 4;
  }

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_columns: 4 };
  }

  get _stateObj() {
    return this._hass?.states?.[this._config?.entity];
  }

  _call(service, data = {}) {
    this._hass.callService('media_player', service, data, { entity_id: this._config.entity });
  }

  _position(stateObj) {
    const a = stateObj.attributes;
    if (a.media_position == null) return null;
    let position = Number(a.media_position);
    if (stateObj.state === 'playing' && a.media_position_updated_at) {
      position += (Date.now() - new Date(a.media_position_updated_at).getTime()) / 1000;
    }
    return Math.min(position, Number(a.media_duration) || position);
  }

  _updateProgress() {
    const stateObj = this._stateObj;
    const bar = this.shadowRoot?.querySelector('.progress span');
    if (!stateObj || !bar) return;
    const duration = Number(stateObj.attributes.media_duration) || 0;
    const position = this._position(stateObj);
    if (!duration || position == null) return;
    bar.style.width = `${Math.min(100, (position / duration) * 100)}%`;
    const now = this.shadowRoot.querySelector('.time-now');
    if (now) now.textContent = formatDuration(position);
  }

  _render() {
    if (!this._config) return;
    const lang = resolveLanguage(this._hass);
    const stateObj = this._stateObj;
    const a = stateObj?.attributes || {};
    const compact = !!this._config.compact;
    const signature = JSON.stringify([stateObj?.state, a.media_title, a.media_artist, a.entity_picture_local, a.entity_picture, a.volume_level, a.shuffle, a.repeat, a.is_volume_muted, a.media_duration, compact, lang]);
    if (signature === this._signature || this._dragging) {
      this._updateProgress();
      return;
    }
    this._signature = signature;

    const accent = this._config.color || 'var(--primary-color)';
    const off = !stateObj || ['off', 'unavailable', 'unknown', 'standby'].includes(stateObj.state);
    const idle = !a.media_title;
    const playing = stateObj?.state === 'playing';
    const title = idle ? t(lang, 'nothing_playing') : a.media_title;
    const artist = idle ? (this._config.name || a.friendly_name || '') : [a.media_artist, a.media_album_name].filter(Boolean).join(' · ');
    // The HA proxy URL works over HTTPS and away from home; the raw Music Assistant URL is plain LAN HTTP.
    const picture = idle ? null : (a.entity_picture_local || a.entity_picture || null);
    const volume = Math.round((Number(a.volume_level) || 0) * 100);
    const repeatIcon = a.repeat === 'one' ? 'mdi:repeat-once' : (a.repeat === 'all' ? 'mdi:repeat' : 'mdi:repeat-off');
    const duration = Number(a.media_duration) || 0;
    const radio = !compact && this._config.radio && !idle && a.media_content_id;

    let body;
    if (!stateObj) {
      body = `<div class="warning">${escapeHtml(t(lang, 'missing_entity'))}</div>`;
    } else {
      body = `
        <div class="panel tile ${compact ? 'compact' : ''}">
          <div class="art" data-action="more-info">${picture ? `<img src="${escapeHtml(picture)}" alt="">` : '<ha-icon icon="mdi:music"></ha-icon>'}</div>
          <div class="info">
            <div class="title">${escapeHtml(title)}</div>
            <div class="artist muted">${escapeHtml(artist)}</div>
            ${!compact && duration ? `<div class="progress"><span></span></div><div class="times muted"><span class="time-now">0:00</span><span>${formatDuration(duration)}</span></div>` : ''}
            <div class="controls">
              ${compact ? '' : `<button class="ctl small ${a.shuffle ? 'on' : ''}" data-action="shuffle" ${off ? 'disabled' : ''}><ha-icon icon="mdi:shuffle-variant"></ha-icon></button>`}
              <button class="ctl" data-action="previous" ${off ? 'disabled' : ''}><ha-icon icon="mdi:skip-previous"></ha-icon></button>
              <button class="ctl main" data-action="play_pause" ${off ? 'disabled' : ''}><ha-icon icon="${playing ? 'mdi:pause' : 'mdi:play'}"></ha-icon></button>
              <button class="ctl" data-action="next" ${off ? 'disabled' : ''}><ha-icon icon="mdi:skip-next"></ha-icon></button>
              ${compact ? '' : `<button class="ctl small ${a.repeat && a.repeat !== 'off' ? 'on' : ''}" data-action="repeat" ${off ? 'disabled' : ''}><ha-icon icon="${repeatIcon}"></ha-icon></button>`}
              ${radio ? `<button class="ctl small" data-action="radio" title="${escapeHtml(t(lang, 'more_like_this'))}"><ha-icon icon="mdi:radio-tower"></ha-icon></button>` : ''}
            </div>
            <div class="volume">
              <button class="ctl small" data-action="mute" ${off ? 'disabled' : ''}><ha-icon icon="${a.is_volume_muted ? 'mdi:volume-off' : 'mdi:volume-high'}"></ha-icon></button>
              <input type="range" min="0" max="100" step="1" value="${volume}" ${off ? 'disabled' : ''}>
              <span class="muted vol-label">${volume}%</span>
            </div>
          </div>
        </div>`;
    }

    this.shadowRoot.innerHTML = `
      <style>${BASE_STYLES}
        .panel { display: flex; gap: 18px; padding: 16px; align-items: center; }
        .art { flex: 0 0 auto; width: 132px; aspect-ratio: 1; border-radius: 8px; overflow: hidden; cursor: pointer; display: flex; align-items: center; justify-content: center; background: rgba(127,127,127,0.18); --mdc-icon-size: 44px; color: var(--secondary-text-color); }
        .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
        .title { font-size: 17px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .artist { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .progress { height: 4px; border-radius: 2px; background: rgba(127,127,127,0.25); overflow: hidden; margin-top: 6px; }
        .progress span { display: block; height: 100%; width: 0; background: var(--mac-accent); transition: width 1s linear; }
        .times { display: flex; justify-content: space-between; font-size: 11px; }
        .controls { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
        .ctl { border: none; cursor: pointer; width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: none; --mdc-icon-size: 24px; }
        .ctl:hover:not([disabled]) { background: rgba(127,127,127,0.18); }
        .ctl[disabled] { opacity: 0.35; cursor: default; }
        .ctl.main { width: 48px; height: 48px; background: var(--mac-accent); color: var(--text-primary-color, #fff); --mdc-icon-size: 28px; }
        .ctl.small { width: 34px; height: 34px; --mdc-icon-size: 20px; color: var(--secondary-text-color); }
        .ctl.small.on { color: var(--mac-accent); }
        .volume { display: flex; align-items: center; gap: 8px; }
        .volume input { flex: 1; min-width: 0; accent-color: var(--mac-accent); }
        .vol-label { font-size: 12px; width: 36px; text-align: right; }
        .compact { padding: 12px; gap: 14px; }
        .compact .art { width: 72px; }
        .compact .title { font-size: 15px; }
        .compact .controls { margin-top: 0; }
        @container (max-width: 380px) { .panel:not(.compact) { flex-direction: column; align-items: stretch; } .panel:not(.compact) .art { width: 100%; } }
        ha-card { container-type: inline-size; }
      </style>
      <ha-card style="--mac-accent: ${escapeHtml(accent)}">${body}</ha-card>`;
    this._bind();
    this._updateProgress();
  }

  _bind() {
    const root = this.shadowRoot;
    const a = this._stateObj?.attributes || {};
    root.querySelector('[data-action="more-info"]')?.addEventListener('click', () => fireMoreInfo(this, this._config.entity));
    root.querySelectorAll('button[data-action]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'play_pause') this._call('media_play_pause');
      else if (action === 'previous') this._call('media_previous_track');
      else if (action === 'next') this._call('media_next_track');
      else if (action === 'shuffle') this._call('shuffle_set', { shuffle: !a.shuffle });
      else if (action === 'repeat') this._call('repeat_set', { repeat: a.repeat === 'off' || !a.repeat ? 'all' : (a.repeat === 'all' ? 'one' : 'off') });
      else if (action === 'mute') this._call('volume_mute', { is_volume_muted: !a.is_volume_muted });
      else if (action === 'radio') {
        // Keeps the current song and swaps what comes after it for similar ones.
        const item = { uri: a.media_content_id, media_type: 'track', name: a.media_title };
        playMedia(this._hass, this._config.entity, item, 'replace_next', true);
        showToast(root, toastFor(resolveLanguage(this._hass), item, 'replace', true));
      }
    }));
    const slider = root.querySelector('.volume input');
    const label = root.querySelector('.vol-label');
    slider?.addEventListener('input', () => {
      this._dragging = true;
      label.textContent = `${slider.value}%`;
    });
    slider?.addEventListener('change', () => {
      this._dragging = false;
      this._call('volume_set', { volume_level: Number(slider.value) / 100 });
    });
  }
}

/* ---------------------------------------------------------------- */
/* Queue and search                                                  */
/* ---------------------------------------------------------------- */

// Queue menu entries: label key, mass_queue service.
const QUEUE_MENU = [['play_now', 'play_queue_item'], ['play_next', 'move_queue_item_next'], ['move_up', 'move_queue_item_up'], ['move_down', 'move_queue_item_down'], ['remove', 'remove_queue_item']];

class MaQueue extends ElementBase {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._items = null;
    this._total = 0;
    this._error = null;
    this._menu = null;
    this._trackSignature = null;
    this._loading = false;
    this._timer = null;
    this._query = '';
    this._results = null;
    this._searching = false;
    this._searchTab = null;
    this._searchSeq = 0;
    this._debounce = null;
    this._shell = false;
  }

  static getStubConfig(hass) {
    return MaPlaylistGrid.getStubConfig(hass);
  }

  setConfig(config) {
    if (!config?.entity) throw new Error('entity is required');
    this._config = { limit: 25, search: false, ...config };
    this._trackSignature = null;
    this._shell = false;
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._render();
    const a = hass?.states?.[this._config?.entity]?.attributes || {};
    const signature = JSON.stringify([a.media_content_id, a.media_title, a.shuffle, a.active_queue]);
    if (signature !== this._trackSignature) {
      this._trackSignature = signature;
      this._load();
    }
  }

  connectedCallback() {
    this._timer = setInterval(() => this._load(), 60000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_columns: 4 };
  }

  get _searchActive() {
    return this._query.trim().length >= 2;
  }

  async _service(domain, service, data, response = false, target = undefined) {
    const message = { type: 'call_service', domain, service, service_data: data };
    if (target) message.target = target;
    if (response) message.return_response = true;
    return this._hass.callWS(message);
  }

  async _load() {
    if (!this._hass || !this._config || this._loading) return;
    const entity = this._config.entity;
    if (!this._hass.services?.mass_queue) {
      this._error = 'queue_missing';
      this._renderBody();
      return;
    }
    this._loading = true;
    try {
      const queue = (await this._service('music_assistant', 'get_queue', {}, true, { entity_id: entity }).catch(() => null))?.response?.[entity];
      const current = queue?.current_item?.queue_item_id || null;
      const limit = Number(this._config.limit) || 25;
      const index = Math.max(0, Number(queue?.current_index) || 0);
      const result = await this._service('mass_queue', 'get_queue_items', { entity, offset: index, limit: limit + 1 }, true);
      this._items = upcomingItems(result?.response?.[entity] || [], current, limit + 1);
      this._total = Math.max(0, (Number(queue?.items) || 0) - index);
      this._error = null;
    } catch (e) {
      this._error = 'unavailable';
    }
    this._loading = false;
    if (!this._searchActive) this._renderBody();
  }

  async _search() {
    if (!this._searchActive) {
      this._results = null;
      this._renderBody();
      return;
    }
    const seq = ++this._searchSeq;
    this._searching = true;
    this._renderBody();
    let results = {};
    try {
      const entryId = await configEntryId(this._hass, this._config);
      const result = await this._service('music_assistant', 'search', { config_entry_id: entryId, name: this._query.trim(), limit: 8 }, true);
      results = searchGroups(result?.response);
    } catch (e) {
      results = {};
    }
    if (seq !== this._searchSeq) return;
    this._results = results;
    this._searching = false;
    if (!results[this._searchTab]) this._searchTab = Object.keys(results)[0] || null;
    this._renderBody();
  }

  _clearSearch() {
    this._query = '';
    this._results = null;
    this._searchSeq++;
    const input = this.shadowRoot.querySelector('input');
    if (input) input.value = '';
    this._renderBody();
    this._load();
  }

  async _queueAction(service, item) {
    await this._service('mass_queue', service, { entity: this._config.entity, queue_item_id: item.queue_item_id }).catch(() => null);
    this._load();
  }

  _enqueue(item, enqueue, radio = false) {
    playMedia(this._hass, this._config.entity, item, enqueue, radio);
    showToast(this.shadowRoot, toastFor(resolveLanguage(this._hass), item, enqueue, radio));
    setTimeout(() => this._load(), 1500);
  }

  // The search box lives outside the body so typing never loses focus on re-render.
  _render() {
    if (!this._config) return;
    if (!this._shell) {
      const accent = this._config.color || 'var(--primary-color)';
      this.shadowRoot.innerHTML = `
        <style>${BASE_STYLES}${ROW_STYLES}
          .search { display: flex; align-items: center; gap: 8px; padding: 0 6px 0 12px; height: 44px; margin-bottom: 12px; color: var(--secondary-text-color); --mdc-icon-size: 20px; }
          .search input { flex: 1; min-width: 0; border: none; outline: none; background: none; font: inherit; font-size: 14px; color: var(--primary-text-color); }
          .search input::-webkit-search-cancel-button { display: none; }
          .search .clear { border: none; background: none; cursor: pointer; width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: var(--secondary-text-color); }
          .search .clear[hidden] { display: none; }
          .scroll { overflow-y: auto; }
          .more { font-size: 12px; text-align: center; padding: 8px 0 4px; }
        </style>
        <ha-card style="--mac-accent: ${escapeHtml(accent)}">
          ${this._config.search ? `
            <label class="search tile">
              <ha-icon icon="mdi:magnify"></ha-icon>
              <input type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false">
              <button class="clear" hidden><ha-icon icon="mdi:close"></ha-icon></button>
            </label>` : ''}
          <div class="header" hidden></div>
          <div class="body"></div>
          <div class="menu-host"></div>
        </ha-card>`;
      this._shell = true;
      this._bindSearch();
    }
    this._renderBody();
  }

  _bindSearch() {
    const input = this.shadowRoot.querySelector('input');
    const clear = this.shadowRoot.querySelector('.clear');
    if (!input) return;
    input.value = this._query;
    ['keyup', 'keypress'].forEach((type) => input.addEventListener(type, (event) => event.stopPropagation()));
    input.addEventListener('input', () => {
      this._query = input.value;
      clear.hidden = !input.value;
      clearTimeout(this._debounce);
      this._debounce = setTimeout(() => this._search(), SEARCH_DEBOUNCE_MS);
      if (!this._searchActive) this._search();
    });
    input.addEventListener('keydown', (event) => {
      // Home Assistant binds single-letter shortcuts (a, c, e, m) on the document.
      event.stopPropagation();
      if (event.key === 'Escape') {
        clear.hidden = true;
        this._clearSearch();
      } else if (event.key === 'Enter') {
        clearTimeout(this._debounce);
        this._search();
        input.blur();
      }
    });
    clear.addEventListener('click', (event) => {
      event.preventDefault();
      clear.hidden = true;
      this._clearSearch();
    });
  }

  _rowHtml(item, index, image, extra = '') {
    const round = item.media_type === 'artist';
    return `
      <div class="row ${item.current ? 'current' : ''}" data-index="${index}">
        <div class="thumb ${round ? 'round' : ''}">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : '<ha-icon icon="mdi:music-note"></ha-icon>'}</div>
        <div class="text">
          <div class="name">${escapeHtml(item.name ?? item.media_title)}</div>
          <div class="artist muted">${escapeHtml(item.subtitle ?? item.media_artist)}</div>
        </div>
        ${extra}
      </div>`;
  }

  _renderBody() {
    const root = this.shadowRoot;
    const body = root?.querySelector('.body');
    if (!body) return;
    const lang = resolveLanguage(this._hass);
    const secure = isSecure();
    const header = root.querySelector('.header');
    const title = this._config.title ?? t(lang, 'queue');
    header.textContent = title;
    header.hidden = !title || this._searchActive;
    const input = root.querySelector('input');
    if (input) input.placeholder = t(lang, 'search');
    const scroll = this._config.max_height ? `style="max-height: ${escapeHtml(this._config.max_height)}"` : '';

    let html;
    let rows = [];
    if (this._searchActive) {
      const groups = this._results || {};
      const types = Object.keys(groups);
      if (!this._results) html = `<div class="muted pad">${escapeHtml(t(lang, 'loading'))}</div>`;
      else if (!types.length) html = `<div class="muted pad">${escapeHtml(t(lang, this._searching ? 'loading' : 'no_results'))}</div>`;
      else {
        rows = groups[this._searchTab] || [];
        html = `
          <div class="tabs">${types.map((type) => `<button class="chip ${type === this._searchTab ? 'on' : ''}" data-tab="${type}">${escapeHtml(t(lang, type))}</button>`).join('')}</div>
          <div class="list tile scroll" ${scroll}>${rows.map((item, index) => this._rowHtml(item, index, safeImage(item.image, secure))).join('')}</div>`;
      }
    } else if (this._error) {
      html = `<div class="warning">${escapeHtml(t(lang, this._error))}</div>`;
    } else if (!this._items) {
      html = `<div class="muted pad">${escapeHtml(t(lang, 'loading'))}</div>`;
    } else if (!this._items.length) {
      html = `<div class="muted pad">${escapeHtml(t(lang, 'queue_empty'))}</div>`;
    } else {
      rows = this._items;
      const rest = this._total - rows.length;
      html = `<div class="list tile scroll" ${scroll}>
        ${rows.map((item, index) => this._rowHtml(item, index, queueImage(item, secure), item.current ? `<span class="badge">${escapeHtml(t(lang, 'now'))}</span>` : '')).join('')}
        ${rest > 0 ? `<div class="more muted">${escapeHtml(t(lang, 'more_in_queue').replace('{n}', rest))}</div>` : ''}
      </div>`;
    }
    body.innerHTML = html;
    fallbackImages(body, 'mdi:music-note');
    body.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
      this._searchTab = button.dataset.tab;
      this._renderBody();
    }));
    const searching = this._searchActive;
    body.querySelectorAll('.row').forEach((el) => {
      const item = rows[Number(el.dataset.index)];
      if (searching) {
        bindPress(el, () => this._enqueue(item, 'next'), () => this._openMenu({ kind: 'media', item }));
      } else {
        bindPress(el, () => !item.current && this._queueAction('play_queue_item', item), () => this._openMenu({ kind: 'queue', item }));
      }
    });
  }

  _openMenu(menu) {
    const host = this.shadowRoot.querySelector('.menu-host');
    const lang = resolveLanguage(this._hass);
    const close = () => { host.innerHTML = ''; };
    if (menu.kind === 'media') {
      host.innerHTML = menuHtml(lang, menu.item.name, MEDIA_MENU);
      bindMenu(host, MEDIA_MENU, ([, enqueue, radio]) => {
        close();
        this._enqueue(menu.item, enqueue, radio);
      }, close);
    } else {
      host.innerHTML = menuHtml(lang, menu.item.media_title, QUEUE_MENU);
      bindMenu(host, QUEUE_MENU, ([, service]) => {
        close();
        this._queueAction(service, menu.item);
      }, close);
    }
  }
}

/* ---------------------------------------------------------------- */
/* Mood buttons                                                      */
/* ---------------------------------------------------------------- */

class MoodButtons extends ElementBase {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._signature = null;
  }

  static getStubConfig() {
    return { moods: [{ name: 'Relax', icon: 'mdi:sofa', color: '#26A69A', script: 'script.relax' }] };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.moods)) throw new Error('moods is required');
    this._config = { ...config };
    this._signature = null;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_columns: 4 };
  }

  _render() {
    if (!this._config) return;
    const lang = resolveLanguage(this._hass);
    const moodState = this._config.mood_entity ? this._hass?.states?.[this._config.mood_entity]?.state : null;
    const signature = JSON.stringify([moodState, lang]);
    if (signature === this._signature) return;
    this._signature = signature;
    const moods = this._config.moods;
    const columns = Number(this._config.columns) || Math.min(Math.max(moods.length, 1), 4);
    const body = moods.length
      ? `<div class="grid">${moods.map((mood, index) => `
          <button class="mood tile ${isActiveMood(mood, moodState) ? 'active' : ''}" data-index="${index}" style="--mood-color: ${escapeHtml(mood.color || 'var(--primary-color)')}">
            <span class="icon"><ha-icon icon="${escapeHtml(mood.icon || 'mdi:palette')}"></ha-icon></span>
            <span class="name">${escapeHtml(mood.name)}</span>
          </button>`).join('')}</div>`
      : `<div class="warning">${escapeHtml(t(lang, 'missing_moods'))}</div>`;
    const title = this._config.title;
    this.shadowRoot.innerHTML = `
      <style>${BASE_STYLES}
        .grid { display: grid; gap: 10px; grid-template-columns: repeat(${columns}, minmax(0, 1fr)); }
        @container (max-width: 360px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        ha-card { container-type: inline-size; }
        .mood { position: relative; border: none; cursor: pointer; padding: 16px 10px 14px; display: flex; flex-direction: column; align-items: center; gap: 10px; outline: 2px solid transparent; outline-offset: 2px; transition: outline-color 0.2s, transform 0.1s; }
        .mood:active { transform: scale(0.97); }
        .mood .icon { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--mood-color) 22%, transparent); color: var(--mood-color); --mdc-icon-size: 26px; }
        .mood .name { font-size: 14px; font-weight: 500; }
        .mood.active { outline-color: var(--mood-color); }
        .mood.active .icon { background: var(--mood-color); color: var(--text-primary-color, #fff); }
      </style>
      <ha-card>${title ? `<div class="header">${escapeHtml(title)}</div>` : ''}${body}</ha-card>`;
    this.shadowRoot.querySelectorAll('.mood').forEach((button) => button.addEventListener('click', () => {
      const mood = moods[Number(button.dataset.index)];
      if (!mood?.script) return;
      this._hass.callService('script', 'turn_on', { entity_id: mood.script });
    }));
  }
}

if (typeof customElements !== 'undefined') {
  const cards = [
    ['ma-playlist-grid', MaPlaylistGrid, 'MA Playlist Grid', 'Music Assistant playlists, recent and favourite songs as a grid of covers.'],
    ['ma-now-playing', MaNowPlaying, 'MA Now Playing', 'What is playing, with controls and volume.'],
    ['ma-queue', MaQueue, 'MA Queue', 'The play queue from the current track on, with optional search that adds songs to it.'],
    ['mood-buttons', MoodButtons, 'Mood Buttons', 'Big buttons that run a script and show the active mood.']
  ];
  window.customCards = window.customCards || [];
  for (const [type, element, name, description] of cards) {
    if (!customElements.get(type)) customElements.define(type, element);
    if (!window.customCards.some((card) => card.type === type)) {
      window.customCards.push({ type, name, description, documentationURL: 'https://github.com/lucasgiovanny/music-assistant-cards', preview: false });
    }
  }
  console.info(`%c MUSIC-ASSISTANT-CARDS %c ${VERSION} `, 'background:#26a69a;color:#000;font-weight:700', 'background:#1c1f24;color:#fff');
}
