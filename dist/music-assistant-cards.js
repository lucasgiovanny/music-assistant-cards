/* Music Assistant Cards
 * Lovelace cards drawn to sit beside the Daylight Calendar Card and the Shopping List
 * Card: a playlist cover grid, a now-playing panel, the play queue and mood buttons.
 * Licensed under MIT. See LICENSE.
 */

const VERSION = '0.2.0';
const LONG_PRESS_MS = 500;
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
    more_in_queue: '+{n} more in the queue'
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
    more_in_queue: '+{n} na fila'
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
    .map((item) => ({ name: item.name, uri: item.uri, image: item.image || null }));
  const extras = (Array.isArray(extra) ? extra : [])
    .filter((item) => item && item.uri)
    .map((item) => ({ name: item.name || item.uri, uri: item.uri, image: item.image || null }));
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

// Prefers the image mass_queue already encoded; a plain-HTTP URL would be blocked on an HTTPS page.
export function queueImage(item, secure) {
  const encoded = item?.local_image_encoded;
  if (encoded) return String(encoded).startsWith('data:') ? encoded : `data:image;base64,${encoded}`;
  const url = item?.media_image || '';
  if (!url || (secure && url.startsWith('http://'))) return null;
  return url;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const BASE_STYLES = `
  :host { display: block; }
  ha-card { background: none; box-shadow: none; border: none; padding: 0; color: var(--primary-text-color); }
  .tile { background: var(--mac-item-background, rgba(127, 127, 127, 0.16)); border-radius: 10px; }
  .warning { padding: 12px; color: var(--warning-color, #ffa600); font-size: 14px; }
  .muted { color: var(--secondary-text-color); }
  button { font: inherit; color: inherit; }
`;

function fireMoreInfo(node, entityId) {
  node.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
}

/* ---------------------------------------------------------------- */
/* Playlist grid                                                     */
/* ---------------------------------------------------------------- */

class MaPlaylistGrid extends ElementBase {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._library = null;
    this._error = false;
    this._menu = null;
    this._lastUri = null;
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass?.states || {}).find((id) => id.startsWith('media_player.')) || '';
    return { entity };
  }

  setConfig(config) {
    if (!config?.entity) throw new Error('entity is required');
    this._config = { shuffle: true, ...config };
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

  async _configEntryId() {
    if (this._config.config_entry_id) return this._config.config_entry_id;
    const entry = await this._hass.callWS({ type: 'config/entity_registry/get', entity_id: this._config.entity });
    return entry?.config_entry_id;
  }

  async _load() {
    try {
      const configEntryId = await this._configEntryId();
      const result = await this._hass.callWS({
        type: 'call_service',
        domain: 'music_assistant',
        service: 'get_library',
        service_data: { config_entry_id: configEntryId, media_type: 'playlist', limit: 500 },
        return_response: true
      });
      this._library = result?.response?.items || [];
      this._error = false;
    } catch (e) {
      this._error = true;
      setTimeout(() => this._load(), 30000);
    }
    this._render();
  }

  _play(uri, enqueue = 'replace') {
    const entityId = this._config.entity;
    this._hass.callService('music_assistant', 'play_media', { media_id: uri, media_type: 'playlist', enqueue }, { entity_id: entityId })
      .then(() => {
        if (enqueue === 'replace' && this._config.shuffle) {
          this._hass.callService('media_player', 'shuffle_set', { shuffle: true }, { entity_id: entityId });
        }
      });
    if (enqueue === 'replace') {
      this._lastUri = uri;
      try { localStorage.setItem(`ma-playlist-grid:${entityId}`, uri); } catch (e) { /* storage blocked */ }
      const moodEntity = this._config.mood_entity;
      if (moodEntity && this._config.mood_reset_option) {
        this._hass.callService('input_select', 'select_option', { option: this._config.mood_reset_option }, { entity_id: moodEntity });
      }
    }
    this._updateActive();
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
    const items = this._library ? selectPlaylists(this._library, this._config) : [];
    let body;
    if (this._error) body = `<div class="warning">${escapeHtml(t(lang, 'unavailable'))}</div>`;
    else if (!this._library) body = `<div class="muted pad">${escapeHtml(t(lang, 'loading'))}</div>`;
    else if (!items.length) body = `<div class="muted pad">${escapeHtml(t(lang, 'no_playlists'))}</div>`;
    else {
      body = `<div class="grid">${items.map((item) => `
        <div class="cover" data-uri="${escapeHtml(item.uri)}" title="${escapeHtml(item.name)}">
          <div class="art tile">${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy">` : '<ha-icon icon="mdi:playlist-music"></ha-icon>'}</div>
          <div class="label">${escapeHtml(item.name)}</div>
        </div>`).join('')}</div>`;
    }
    const title = this._config.title ?? t(lang, 'playlists');
    this.shadowRoot.innerHTML = `
      <style>${BASE_STYLES}
        .header { font-size: 16px; font-weight: 500; padding: 4px 2px 12px; }
        .pad { padding: 12px 4px; font-size: 14px; }
        .grid { display: grid; gap: 14px; grid-template-columns: ${columns ? `repeat(${columns}, minmax(0, 1fr))` : 'repeat(auto-fill, minmax(130px, 1fr))'}; }
        .cover { cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
        .art { position: relative; aspect-ratio: 1; overflow: hidden; display: flex; align-items: center; justify-content: center; --mdc-icon-size: 40px; color: var(--secondary-text-color); outline: 2px solid transparent; outline-offset: 2px; transition: outline-color 0.2s, transform 0.1s; }
        .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .cover:active .art { transform: scale(0.98); }
        .cover.active .art { outline-color: var(--mac-accent); }
        .cover.active .label { color: var(--mac-accent); }
        .label { margin-top: 8px; font-size: 13px; font-weight: 500; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .overlay { position: fixed; inset: 0; z-index: 9; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .menu { width: 100%; max-width: 320px; background: var(--card-background-color, #1c1f24); border-radius: 14px; padding: 8px; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
        .menu h3 { margin: 8px 12px 6px; font-size: 15px; font-weight: 500; }
        .menu button { border: none; background: none; text-align: left; padding: 12px; border-radius: 8px; cursor: pointer; font-size: 14px; }
        .menu button:hover { background: rgba(127,127,127,0.16); }
        .menu .cancel { color: var(--secondary-text-color); }
      </style>
      <ha-card style="--mac-accent: ${escapeHtml(accent)}">
        ${title ? `<div class="header">${escapeHtml(title)}</div>` : ''}
        ${body}
        ${this._menu ? `
          <div class="overlay"><div class="menu" role="menu">
            <h3>${escapeHtml(this._menu.name)}</h3>
            <button data-enqueue="replace">${escapeHtml(t(lang, 'play_now'))}</button>
            <button data-enqueue="next">${escapeHtml(t(lang, 'play_next'))}</button>
            <button data-enqueue="add">${escapeHtml(t(lang, 'add_queue'))}</button>
            <button class="cancel" data-close>${escapeHtml(t(lang, 'cancel'))}</button>
          </div></div>` : ''}
      </ha-card>`;
    this._bind(items);
    this._updateActive();
  }

  _bind(items) {
    const root = this.shadowRoot;
    root.querySelectorAll('.art img').forEach((img) => img.addEventListener('error', () => {
      img.replaceWith(Object.assign(document.createElement('ha-icon'), { icon: 'mdi:playlist-music' }));
    }, { once: true }));
    root.querySelectorAll('.cover').forEach((el) => {
      const uri = el.dataset.uri;
      let timer = null;
      let longPressed = false;
      const cancel = () => clearTimeout(timer);
      el.addEventListener('pointerdown', () => {
        longPressed = false;
        timer = setTimeout(() => {
          longPressed = true;
          this._menu = items.find((item) => item.uri === uri);
          this._render();
        }, LONG_PRESS_MS);
      });
      el.addEventListener('pointerup', cancel);
      el.addEventListener('pointerleave', cancel);
      el.addEventListener('pointercancel', cancel);
      el.addEventListener('contextmenu', (event) => event.preventDefault());
      el.addEventListener('click', () => {
        if (!longPressed) this._play(uri);
      });
    });
    const overlay = root.querySelector('.overlay');
    if (!overlay) return;
    const close = () => {
      this._menu = null;
      this._render();
    };
    overlay.addEventListener('click', (event) => event.target === overlay && close());
    overlay.querySelector('[data-close]').addEventListener('click', close);
    overlay.querySelectorAll('[data-enqueue]').forEach((button) => button.addEventListener('click', () => {
      const uri = this._menu.uri;
      this._menu = null;
      this._play(uri, button.dataset.enqueue);
      this._render();
    }));
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
/* Queue                                                             */
/* ---------------------------------------------------------------- */

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
  }

  static getStubConfig(hass) {
    return MaPlaylistGrid.getStubConfig(hass);
  }

  setConfig(config) {
    if (!config?.entity) throw new Error('entity is required');
    this._config = { limit: 25, ...config };
    this._trackSignature = null;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
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
      this._render();
      return;
    }
    this._loading = true;
    try {
      const queue = (await this._service('music_assistant', 'get_queue', {}, true, { entity_id: entity }).catch(() => null))?.response?.[entity];
      const current = queue?.current_item?.queue_item_id || null;
      const limit = Number(this._config.limit) || 25;
      const result = await this._service('mass_queue', 'get_queue_items', { entity, offset: Math.max(0, Number(queue?.current_index) || 0), limit: limit + 1 }, true);
      const items = result?.response?.[entity] || [];
      this._items = upcomingItems(items, current, limit + 1);
      this._total = Math.max(0, (Number(queue?.items) || 0) - (Number(queue?.current_index) || 0));
      this._error = null;
    } catch (e) {
      this._error = 'unavailable';
    }
    this._loading = false;
    this._render();
  }

  async _act(service, item) {
    await this._service('mass_queue', service, { entity: this._config.entity, queue_item_id: item.queue_item_id }).catch(() => null);
    this._load();
  }

  _render() {
    if (!this._config) return;
    const lang = resolveLanguage(this._hass);
    const accent = this._config.color || 'var(--primary-color)';
    const secure = typeof location !== 'undefined' && location.protocol === 'https:';
    const items = this._items || [];
    let body;
    if (this._error) body = `<div class="warning">${escapeHtml(t(lang, this._error))}</div>`;
    else if (!this._items) body = `<div class="muted pad">${escapeHtml(t(lang, 'loading'))}</div>`;
    else if (!items.length) body = `<div class="muted pad">${escapeHtml(t(lang, 'queue_empty'))}</div>`;
    else {
      const rest = this._total - items.length;
      body = `<div class="list tile">${items.map((item, index) => {
        const image = queueImage(item, secure);
        return `
          <div class="row ${item.current ? 'current' : ''}" data-index="${index}">
            <div class="thumb">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : '<ha-icon icon="mdi:music-note"></ha-icon>'}</div>
            <div class="text">
              <div class="name">${escapeHtml(item.media_title)}</div>
              <div class="artist muted">${escapeHtml(item.media_artist)}</div>
            </div>
            ${item.current ? `<span class="badge">${escapeHtml(t(lang, 'now'))}</span>` : ''}
          </div>`;
      }).join('')}
      ${rest > 0 ? `<div class="more muted">${escapeHtml(t(lang, 'more_in_queue').replace('{n}', rest))}</div>` : ''}
      </div>`;
    }
    const title = this._config.title ?? t(lang, 'queue');
    const maxHeight = this._config.max_height;
    this.shadowRoot.innerHTML = `
      <style>${BASE_STYLES}
        .header { font-size: 16px; font-weight: 500; padding: 4px 2px 12px; }
        .pad { padding: 12px 4px; font-size: 14px; }
        .list { padding: 6px; ${maxHeight ? `max-height: ${escapeHtml(maxHeight)}; overflow-y: auto;` : ''} }
        .row { display: flex; align-items: center; gap: 12px; padding: 6px; border-radius: 8px; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
        .row:hover { background: rgba(127,127,127,0.12); }
        .row.current .name { color: var(--mac-accent); }
        .thumb { flex: 0 0 auto; width: 44px; height: 44px; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: rgba(127,127,127,0.18); color: var(--secondary-text-color); --mdc-icon-size: 22px; }
        .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .text { flex: 1; min-width: 0; }
        .name { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .artist { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; background: var(--mac-accent); color: var(--text-primary-color, #fff); }
        .more { font-size: 12px; text-align: center; padding: 8px 0 4px; }
        .overlay { position: fixed; inset: 0; z-index: 9; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .menu { width: 100%; max-width: 320px; background: var(--card-background-color, #1c1f24); border-radius: 14px; padding: 8px; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
        .menu h3 { margin: 8px 12px 6px; font-size: 15px; font-weight: 500; }
        .menu button { border: none; background: none; text-align: left; padding: 12px; border-radius: 8px; cursor: pointer; font-size: 14px; }
        .menu button:hover { background: rgba(127,127,127,0.16); }
        .menu .cancel { color: var(--secondary-text-color); }
      </style>
      <ha-card style="--mac-accent: ${escapeHtml(accent)}">
        ${title ? `<div class="header">${escapeHtml(title)}</div>` : ''}
        ${body}
        ${this._menu ? `
          <div class="overlay"><div class="menu" role="menu">
            <h3>${escapeHtml(this._menu.media_title)}</h3>
            <button data-service="play_queue_item">${escapeHtml(t(lang, 'play_now'))}</button>
            <button data-service="move_queue_item_next">${escapeHtml(t(lang, 'play_next'))}</button>
            <button data-service="remove_queue_item">${escapeHtml(t(lang, 'remove'))}</button>
            <button class="cancel" data-close>${escapeHtml(t(lang, 'cancel'))}</button>
          </div></div>` : ''}
      </ha-card>`;
    this._bind(items);
  }

  _bind(items) {
    const root = this.shadowRoot;
    root.querySelectorAll('.thumb img').forEach((img) => img.addEventListener('error', () => {
      img.replaceWith(Object.assign(document.createElement('ha-icon'), { icon: 'mdi:music-note' }));
    }, { once: true }));
    root.querySelectorAll('.row').forEach((el) => {
      const item = items[Number(el.dataset.index)];
      let timer = null;
      let longPressed = false;
      const cancel = () => clearTimeout(timer);
      el.addEventListener('pointerdown', () => {
        longPressed = false;
        timer = setTimeout(() => {
          longPressed = true;
          this._menu = item;
          this._render();
        }, LONG_PRESS_MS);
      });
      el.addEventListener('pointerup', cancel);
      el.addEventListener('pointerleave', cancel);
      el.addEventListener('pointercancel', cancel);
      el.addEventListener('contextmenu', (event) => event.preventDefault());
      el.addEventListener('click', () => {
        if (!longPressed && !item.current) this._act('play_queue_item', item);
      });
    });
    const overlay = root.querySelector('.overlay');
    if (!overlay) return;
    const close = () => {
      this._menu = null;
      this._render();
    };
    overlay.addEventListener('click', (event) => event.target === overlay && close());
    overlay.querySelector('[data-close]').addEventListener('click', close);
    overlay.querySelectorAll('[data-service]').forEach((button) => button.addEventListener('click', () => {
      const item = this._menu;
      this._menu = null;
      this._render();
      this._act(button.dataset.service, item);
    }));
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
        .header { font-size: 16px; font-weight: 500; padding: 4px 2px 12px; }
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
    ['ma-playlist-grid', MaPlaylistGrid, 'MA Playlist Grid', 'Music Assistant playlists as a grid of covers; tap to play.'],
    ['ma-now-playing', MaNowPlaying, 'MA Now Playing', 'What is playing, with controls and volume.'],
    ['ma-queue', MaQueue, 'MA Queue', 'The play queue from the current track on; tap to jump, hold for more.'],
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
