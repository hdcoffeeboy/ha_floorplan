// ─────────────────────────────────────────────────────────────────────────────
// Overlay position helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveTransform(anchor, scale) {
  const map = {
    'center':       'translate(-50%, -50%)',
    'top-left':     'translate(0, 0)',
    'top-right':    'translate(-100%, 0)',
    'bottom-left':  'translate(0, -100%)',
    'bottom-right': 'translate(-100%, -100%)',
  };
  const translate = map[anchor] ?? 'translate(-50%, -50%)';
  return scale && scale !== 1 ? `${translate} scale(${scale})` : translate;
}

// Run an overlay action through Home Assistant's own action handler (the
// `hass-action` event handled at the app root), so every standard action
// works: toggle, more-info, perform-action/call-service, navigate, url,
// assist, with confirmation. `entity` may sit on the action (legacy
// floorplan style) or on the overlay.
function fireOverlayAction(node, overlayConfig, actionKey) {
  const actionCfg = overlayConfig?.[actionKey];
  if (!actionCfg || actionCfg.action === 'none') return;
  const ev = new Event('hass-action', { bubbles: true, composed: true });
  ev.detail = {
    config: { entity: actionCfg.entity ?? overlayConfig.entity, [actionKey]: actionCfg },
    action: actionKey.replace(/_action$/, ''),
  };
  node.dispatchEvent(ev);
}

// ─────────────────────────────────────────────────────────────────────────────
// State icon overlay
// Renders HA's native <state-badge> (the same element Picture Elements'
// state-icon uses), so icon colours, light tint/dimming, climate hvac_action
// colours and theme variables all come from Home Assistant.
//
// Config example:
//   type: state_icon
//   entity: light.living_room
//   x: 42%
//   y: 35%
//   anchor: center        # center | top-left | top-right | bottom-left | bottom-right
//   scale: 1              # optional size multiplier
//   icon_map:             # optional per-state icon
//     "on":  mdi:lightbulb
//     "off": mdi:lightbulb-off
//   color_map:            # optional per-state colour; overrides HA's colour
//     "on":  "#f5c518"
//     "off": "var(--secondary-text-color)"
//   visible_states: [on]  # optional; hide icon in other states
//   entity_picture: false # optional; never show media player artwork
// ─────────────────────────────────────────────────────────────────────────────

// <state-badge> is registered lazily by the HA frontend. Loading the card
// helpers imports the Picture Elements elements, which define it.
const stateBadgeReady = customElements.get('state-badge')
  ? Promise.resolve()
  : Promise.resolve(window.loadCardHelpers?.())
      .catch(() => {})
      .then(() => customElements.whenDefined('state-badge'));

// Strip entity pictures so <state-badge> shows the icon instead.
function withoutPicture(stateObj) {
  if (!stateObj?.attributes?.entity_picture && !stateObj?.attributes?.entity_picture_local) {
    return stateObj;
  }
  return {
    ...stateObj,
    attributes: { ...stateObj.attributes, entity_picture: undefined, entity_picture_local: undefined },
  };
}

class FloorplanStateIcon extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        state-badge { display: flex; width: 24px; height: 24px; }
        state-badge.picture { width: 40px; height: 40px; }
        :host([actionable]) state-badge { cursor: pointer; }
      </style>
      <state-badge></state-badge>
    `;
    this._badge = this.shadowRoot.querySelector('state-badge');
    this._dirty = true;

    this._tapCount  = 0;
    this._tapTimer  = null;
    this._holdTimer = null;

    this._badge.addEventListener('pointerdown',   this._onPointerDown.bind(this));
    this._badge.addEventListener('pointerup',     this._onPointerUp.bind(this));
    this._badge.addEventListener('pointercancel', this._onPointerCancel.bind(this));

    stateBadgeReady.then(() => { this._dirty = true; this._update(); });
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  set config(config) {
    this._config = config;
    this._dirty = true;
    if (config.tap_action || config.hold_action || config.double_tap_action) {
      this.setAttribute('actionable', '');
    }
    this._update();
  }

  _update() {
    if (!this._config || !this._hass || !customElements.get('state-badge')) return;
    const entityId = this._config.entity;
    const stateObj = this._hass.states[entityId];
    // hass updates fire for every entity change; skip if ours hasn't changed
    if (!this._dirty && stateObj === this._lastStateObj) return;
    this._dirty = false;
    this._lastStateObj = stateObj;

    const state = stateObj ? stateObj.state : 'unknown';
    const domain = entityId ? entityId.split('.')[0] : null;

    const visibleStates = this._config.visible_states;
    if (visibleStates && !visibleStates.includes(state)) {
      this.style.display = 'none';
      return;
    }
    this.style.display = '';

    // Artwork only for media players that are playing/paused (existing behaviour)
    const showPicture = domain === 'media_player'
      && ['playing', 'paused'].includes(state)
      && this._config.entity_picture !== false;

    const iconMap = this._config.icon_map ?? {};
    const colorOverride = (this._config.color_map ?? {})[state];

    const badge = this._badge;
    badge.classList.toggle('picture', showPicture && !!stateObj?.attributes?.entity_picture);
    badge.stateObj = showPicture ? stateObj : withoutPicture(stateObj);
    badge.overrideIcon = iconMap[state] ?? this._config.icon ?? undefined;
    badge.stateColor = !colorOverride;
    badge.style.color = colorOverride ?? '';
  }

  _onPointerDown() {
    this._holdTimer = setTimeout(() => {
      this._holdTimer = null;
      this._fireAction('hold_action');
    }, HOLD_MS);
  }

  _onPointerUp() {
    if (!this._holdTimer) return;
    clearTimeout(this._holdTimer);
    this._holdTimer = null;
    this._tapCount++;
    if (this._tapCount === 1) {
      this._tapTimer = setTimeout(() => {
        this._tapCount = 0;
        this._fireAction('tap_action');
      }, DBTAP_MS);
    } else {
      clearTimeout(this._tapTimer);
      this._tapCount = 0;
      this._fireAction('double_tap_action');
    }
  }

  _onPointerCancel() {
    clearTimeout(this._holdTimer);
    this._holdTimer = null;
  }

  _fireAction(actionKey) {
    fireOverlayAction(this, this._config, actionKey);
  }
}
customElements.define('floorplan-state-icon', FloorplanStateIcon);



// ─────────────────────────────────────────────────────────────────────────────
// State label overlay
// Renders a text label, optionally using a template string.
//
// Supported template patterns:
//   {{ states('sensor.my_sensor') }}
//   {{ state_attr('climate.living', 'current_temperature') }}
//
// Config example:
//   type: state_label
//   entity: sensor.living_room_temp
//   x: 55%
//   y: 30%
//   anchor: center
//   template: "{{ states('sensor.living_room_temp') }}°"
//   style:
//     font-size: 12px
//     color: white
//     font-weight: 600
// ─────────────────────────────────────────────────────────────────────────────

class FloorplanStateLabel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>:host { display: block; white-space: nowrap; }</style>
      <span></span>
    `;
    this._span = this.shadowRoot.querySelector('span');
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  set config(config) {
    this._config = config;
    this._update();
  }

  _resolveTemplate(tmpl) {
    if (!this._hass) return '';
    return tmpl
      .replace(
        /\{\{\s*states\(['"]([^'"]+)['"]\)\s*\}\}/g,
        (_, eid) => this._hass.states[eid]?.state ?? ''
      )
      .replace(
        /\{\{\s*state_attr\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)\s*\}\}/g,
        (_, eid, attr) => this._hass.states[eid]?.attributes?.[attr] ?? ''
      );
  }

  _update() {
    if (!this._config || !this._hass) return;

    const entityId = this._config.entity;
    const stateObj = this._hass.states[entityId];
    let text;

    if (this._config.template) {
      // Explicit template takes priority
      text = this._resolveTemplate(this._config.template);
    } else if (this._config.attribute) {
      // Read a specific attribute, optionally with a suffix
      const val = stateObj?.attributes?.[this._config.attribute] ?? '';
      text = val + (this._config.suffix ?? '');
    } else {
      // Default: entity state, optionally with a suffix
      const val = stateObj ? stateObj.state : 'unknown';
      text = val + (this._config.suffix ?? '');
    }

    this._span.textContent = text;

    const style = Object.entries(this._config.style ?? {})
      .map(([k, v]) => `${k}:${v}`)
      .join(';');
    this._span.style.cssText = style;
  }
}
customElements.define('floorplan-state-label', FloorplanStateLabel);


// ─────────────────────────────────────────────────────────────────────────────
// Action button overlay
// A tappable button supporting tap / hold / double-tap actions.
//
// Supported action types (matching HA Lovelace conventions):
//   toggle, more-info, call-service, navigate, url, none
//
// Config example:
//   type: action_button
//   x: 60%
//   y: 60%
//   anchor: center
//   label: "Fan"
//   icon: mdi:fan
//   tap_action:
//     action: toggle
//     entity: fan.bedroom
//   hold_action:
//     action: more-info
//     entity: fan.bedroom
//   double_tap_action:
//     action: call-service
//     service: fan.set_percentage
//     service_data:
//       entity_id: fan.bedroom
//       percentage: 100
//   style:
//     background: "rgba(0,0,0,0.5)"
//     border-radius: 8px
//     color: white
// ─────────────────────────────────────────────────────────────────────────────

const HOLD_MS   = 500;
const DBTAP_MS  = 250;

class FloorplanActionButton extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: inline-block; cursor: pointer; user-select: none; }
        .btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 6px;
          /* Match Picture Elements' action button (plain ha-button) */
          background: none;
          color: var(--primary-color);
          font-weight: var(--ha-font-weight-medium, 500);
          font-size: 12px;
          transition: background-color 0.15s;
        }
        @media (hover: hover) {
          .btn:hover { background-color: var(--ha-color-fill-primary-quiet-hover); }
        }
        .btn:active { background-color: var(--ha-color-fill-primary-quiet-active); }
        ha-icon { width: 18px; height: 18px; }
      </style>
      <div class="btn">
        <ha-icon style="display:none"></ha-icon>
        <span></span>
      </div>
    `;
    this._btn   = this.shadowRoot.querySelector('.btn');
    this._haIcon = this.shadowRoot.querySelector('ha-icon');
    this._label  = this.shadowRoot.querySelector('span');

    this._tapCount  = 0;
    this._tapTimer  = null;
    this._holdTimer = null;

    this._btn.addEventListener('pointerdown',   this._onPointerDown.bind(this));
    this._btn.addEventListener('pointerup',     this._onPointerUp.bind(this));
    this._btn.addEventListener('pointercancel', this._onPointerCancel.bind(this));
  }

  set hass(hass) {
    this._hass = hass;
  }

  set config(config) {
    this._config = config;
    this._render();
  }

  _render() {
    if (!this._config) return;

    if (this._config.icon) {
      this._haIcon.setAttribute('icon', this._config.icon);
      this._haIcon.style.display = '';
    } else {
      this._haIcon.style.display = 'none';
    }

    this._label.textContent = this._config.label ?? '';

    const extra = Object.entries(this._config.style ?? {})
      .map(([k, v]) => `${k}:${v}`)
      .join(';');
    if (extra) this._btn.style.cssText = extra;
  }

  _onPointerDown() {
    this._holdTimer = setTimeout(() => {
      this._holdTimer = null;
      this._fireAction('hold_action');
    }, HOLD_MS);
  }

  _onPointerUp() {
    if (!this._holdTimer) return; // hold already fired
    clearTimeout(this._holdTimer);
    this._holdTimer = null;
    this._tapCount++;
    if (this._tapCount === 1) {
      this._tapTimer = setTimeout(() => {
        this._tapCount = 0;
        this._fireAction('tap_action');
      }, DBTAP_MS);
    } else {
      clearTimeout(this._tapTimer);
      this._tapCount = 0;
      this._fireAction('double_tap_action');
    }
  }

  _onPointerCancel() {
    clearTimeout(this._holdTimer);
    this._holdTimer = null;
  }

  _fireAction(actionKey) {
    fireOverlayAction(this, this._config, actionKey);
  }
}
customElements.define('floorplan-action-button', FloorplanActionButton);


// ─────────────────────────────────────────────────────────────────────────────
// Overlay manager
// Owns all overlay elements, positions them over this.content, and keeps
// them in sync when hass updates.
// ─────────────────────────────────────────────────────────────────────────────

class OverlayManager {
  constructor(container, hass) {
    this._container = container;
    this._hass = hass;
    this._elements = [];
  }

  setHass(hass) {
    this._hass = hass;
    this._elements.forEach(el => { el.hass = hass; });
  }

  render(overlays) {
    // Remove previous overlays
    this._elements.forEach(el => el.remove());
    this._elements = [];

    for (const [index, cfg] of overlays.entries()) {
      let el;
      if      (cfg.type === 'state_icon')    el = document.createElement('floorplan-state-icon');
      else if (cfg.type === 'state_label')   el = document.createElement('floorplan-state-label');
      else if (cfg.type === 'action_button') el = document.createElement('floorplan-action-button');
      else {
        console.warn('floorplan-card: unknown overlay type', cfg.type);
        continue;
      }

      el.style.cssText = [
        'position: absolute',
        `left: ${cfg.x ?? '0'}`,
        `top: ${cfg.y ?? '0'}`,
        `transform: ${resolveTransform(cfg.anchor ?? 'center', cfg.scale)}`,
        'pointer-events: auto',
      ].join(';');

      el._fpIndex = index; // position in config.overlays, for the editor
      el.config = cfg;
      el.hass   = this._hass;

      this._container.appendChild(el);
      this._elements.push(el);
    }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Main card element
//
// The SVG is fetched and inlined into the shadow DOM (rather than loaded via
// an <object> element). <object> creates a nested browsing context that
// WebKit frequently fails to (re)load when the iOS companion app resumes,
// leaving the card collapsed with overlays bunched at the top.
//
// Optional config:
//   aspect_ratio: 1.6   # width / height; reserves space before the SVG loads.
//                       # If omitted, the ratio from the last successful load
//                       # (cached in localStorage) is used.
// ─────────────────────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];
const RATIO_CACHE_PREFIX = 'floorplan-card:ratio:';

// SVG text by URL. The editor preview rebuilds the card on every config
// change; this avoids refetching (and flickering) each time.
const svgTextCache = new Map();

// ── Visual editor shared helpers ────────────────────────────────────────────
// The editor hands a live bridge object to the preview card under this
// symbol: object spreads keep it, saving to YAML drops it.
const FP_EDITOR_BRIDGE = Symbol.for('floorplan-card-editor-bridge');
const EDITOR_DRAG_THRESHOLD_PX = 4;
const PERCENT_RE = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)%\s*$/;

// Only overlays placed in percent (or not at all) can be dragged; px or
// calc() positions are left alone rather than converted.
function isMovableOverlay(cfg) {
  return [cfg.x, cfg.y].every(v =>
    v == null || v === '' || v === 0 || v === '0' || PERCENT_RE.test(String(v)));
}

const clampPct = v => Math.min(100, Math.max(0, v));
const roundPct = v => Math.round(v * 10) / 10;

class ActiveDrawing extends HTMLElement {

  static getConfigElement() {
    return document.createElement('floorplan-card-editor');
  }

  static getStubConfig() {
    return {
      image: '/local/floorplan/floorplan.svg',
      stylesheet: '/local/floorplan/floorplan.css',
      overlays: [],
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._svg = null;
    this._loadToken = 0;
    this._retryTimer = null;
    this._loading = false;
    this._onWake = this._onWake.bind(this);
    this._preview = false;
    this._press = undefined;
    this._onBridgeChanged = () => this._updateEditing();
    this._onPressDown   = this._onPressDown.bind(this);
    this._onPressMove   = this._onPressMove.bind(this);
    this._onPressUp     = this._onPressUp.bind(this);
    this._onPressCancel = this._onPressCancel.bind(this);
    this._blockAction   = this._blockAction.bind(this);
  }

  connectedCallback() {
    document.addEventListener('visibilitychange', this._onWake);
    window.addEventListener('online', this._onWake);
    window.addEventListener('pageshow', this._onWake);
    this._bridge?.addEventListener('changed', this._onBridgeChanged);
    this._ensureSvg();
    this._updateEditing();
  }

  disconnectedCallback() {
    document.removeEventListener('visibilitychange', this._onWake);
    window.removeEventListener('online', this._onWake);
    window.removeEventListener('pageshow', this._onWake);
    this._bridge?.removeEventListener('changed', this._onBridgeChanged);
  }

  // ── Editor preview ────────────────────────────────────────────────────────
  // HA sets `preview` on the card shown in the card editor. When the
  // floorplan editor is open (bridge active), clicks and drags on the
  // preview select and position overlays instead of running their actions.
  // Mirrors Picture Elements' editor-preview-controller.

  set preview(value) {
    this._preview = !!value;
    this._updateEditing();
  }

  get preview() {
    return this._preview;
  }

  get _editor() {
    return this._preview && this._bridge?.active ? this._bridge : undefined;
  }

  _setBridge(bridge) {
    if (bridge === this._bridge) return;
    if (this.isConnected) {
      this._bridge?.removeEventListener('changed', this._onBridgeChanged);
      bridge?.addEventListener('changed', this._onBridgeChanged);
    }
    this._bridge = bridge;
    this._updateEditing();
  }

  _overlayEls() {
    return this._overlayManager?._elements ?? [];
  }

  _updateEditing() {
    if (!this.content) return;
    const editor = this._editor;
    this.content.classList.toggle('fp-editing', !!editor);
    const overlays = this.config?.overlays ?? [];
    for (const el of this._overlayEls()) {
      el.toggleAttribute('fp-selected', !!editor && el._fpIndex === editor.selectedIndex);
      el.toggleAttribute('fp-movable', !!editor && isMovableOverlay(overlays[el._fpIndex] ?? {}));
    }
  }

  _bindEditorEvents() {
    const c = this.content;
    const capture = { capture: true };
    c.addEventListener('pointerdown', this._onPressDown, capture);
    c.addEventListener('pointermove', this._onPressMove);
    c.addEventListener('pointerup', this._onPressUp);
    c.addEventListener('pointercancel', this._onPressCancel);
    c.addEventListener('lostpointercapture', this._onPressCancel);
    for (const type of ['click', 'dblclick', 'contextmenu', 'dragstart']) {
      c.addEventListener(type, this._blockAction, capture);
    }
  }

  _overlayIndex(ev) {
    for (const node of ev.composedPath()) {
      if (node === this.content) break;
      if (node._fpIndex !== undefined) return node._fpIndex;
    }
    return undefined;
  }

  // Overlay's left/top in percent of the container, as laid out.
  _overlayPosition(index) {
    const el = this._overlayEls().find(e => e._fpIndex === index);
    const c = this.content;
    if (!el || !c.clientWidth || !c.clientHeight) return undefined;
    const style = getComputedStyle(el);
    return {
      left: (parseFloat(style.left) / c.clientWidth) * 100,
      top:  (parseFloat(style.top)  / c.clientHeight) * 100,
    };
  }

  // Capture phase, so overlays and SVG groups don't see the press.
  _onPressDown(ev) {
    const editor = this._editor;
    if (!editor) return;
    ev.stopPropagation();
    if (!ev.isPrimary || ev.button !== 0 || ev.ctrlKey) return;
    ev.preventDefault();
    const index = this._overlayIndex(ev);
    const cfg = index !== undefined ? this.config.overlays?.[index] : undefined;
    this.content.setPointerCapture(ev.pointerId);
    this._press = {
      pointerId: ev.pointerId,
      clientX: ev.clientX,
      clientY: ev.clientY,
      index,
      start: cfg && isMovableOverlay(cfg) ? this._overlayPosition(index) : undefined,
    };
  }

  _onPressMove(ev) {
    const press = this._press;
    if (!press || ev.pointerId !== press.pointerId) return;
    if (!ev.buttons || !this._editor) { this._onPressCancel(ev); return; }
    const dx = ev.clientX - press.clientX;
    const dy = ev.clientY - press.clientY;
    if (!press.dragged && Math.hypot(dx, dy) < EDITOR_DRAG_THRESHOLD_PX) return;
    press.dragged = true;
    if (!press.start) return;
    const c = this.content;
    press.moved = {
      left: clampPct(press.start.left + (dx / c.clientWidth) * 100),
      top:  clampPct(press.start.top  + (dy / c.clientHeight) * 100),
    };
    const el = this._overlayEls().find(e => e._fpIndex === press.index);
    el?.style.setProperty('left', `${press.moved.left}%`);
    el?.style.setProperty('top', `${press.moved.top}%`);
    c.classList.add('fp-dragging');
  }

  _onPressUp(ev) {
    const press = this._press;
    if (!press || ev.pointerId !== press.pointerId) return;
    const editor = this._editor;
    if (!editor) { this._onPressCancel(ev); return; }
    this._endPress();
    if (press.moved) {
      editor.handlers.moveOverlay(press.index, press.moved.left, press.moved.top);
    } else if (press.dragged) {
      // A drag that moved nothing is not a click.
    } else if (press.index !== undefined) {
      editor.handlers.selectOverlay(press.index);
    } else {
      const rect = this.content.getBoundingClientRect();
      editor.handlers.clickImage(
        clampPct(((ev.clientX - rect.left) / this.content.clientWidth) * 100),
        clampPct(((ev.clientY - rect.top) / this.content.clientHeight) * 100),
      );
    }
  }

  // Also bound to lostpointercapture.
  _onPressCancel(ev) {
    const press = this._press;
    if (!press || ev.pointerId !== press.pointerId) return;
    this._endPress();
    if (!press.moved) return;
    // Put the overlay back where its config places it.
    const el = this._overlayEls().find(e => e._fpIndex === press.index);
    const cfg = this.config.overlays?.[press.index] ?? {};
    el?.style.setProperty('left', String(cfg.x ?? '0'));
    el?.style.setProperty('top', String(cfg.y ?? '0'));
  }

  _endPress() {
    this._press = undefined;
    this.content.classList.remove('fp-dragging');
  }

  // Capture phase: stop clicks, menus and native drags while editing.
  _blockAction(ev) {
    if (!this._editor) return;
    ev.stopPropagation();
    ev.preventDefault();
  }

  // App resumed / network back: if the SVG is missing, retry immediately
  // instead of waiting for the next backoff step.
  _onWake() {
    if (document.visibilityState !== 'visible') return;
    if (this._svg) return;
    clearTimeout(this._retryTimer);
    this._retryTimer = null;
    this._loading = false;
    this._ensureSvg();
  }

  _ensureSvg() {
    if (this._svg || this._loading || !this.config || !this.isConnected) return;
    this._loadSvg(0);
  }

  async _loadSvg(attempt) {
    this._loading = true;
    const token = ++this._loadToken;
    const url = this.config.image;
    try {
      let text = attempt === 0 ? svgTextCache.get(url) : undefined;
      if (text === undefined) {
        const res = await fetch(url, {
          cache: attempt === 0 ? 'default' : 'no-cache',
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text = await res.text();
      }
      if (token !== this._loadToken) return; // superseded
      this._installSvg(text);
      svgTextCache.set(url, text);
      this._loading = false;
    } catch (e) {
      if (token !== this._loadToken) return;
      if (attempt < SVG_RETRY_DELAYS_MS.length) {
        console.warn(`floorplan-card: SVG load failed (attempt ${attempt + 1}), retrying`, e);
        this._retryTimer = setTimeout(() => {
          this._retryTimer = null;
          this._loadSvg(attempt + 1);
        }, SVG_RETRY_DELAYS_MS[attempt]);
      } else {
        this._loading = false;
        console.error('floorplan-card: SVG failed to load', e);
        this._showError();
      }
    }
  }

  _showError() {
    const msg = document.createElement('div');
    msg.className = 'fp-error';
    msg.textContent = 'Floorplan failed to load. Tap to retry.';
    msg.addEventListener('click', () => {
      this._holder.replaceChildren();
      this._ensureSvg();
    });
    this._holder.replaceChildren(msg);
  }

  _installSvg(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const src = doc.documentElement;
    if (!src || src.localName !== 'svg' || doc.querySelector('parsererror')) {
      throw new Error('Response is not a valid SVG');
    }
    const svg = document.importNode(src, true);

    // Make the SVG scale to the card width. Ensure a viewBox exists, then
    // drop fixed width/height so CSS controls sizing.
    if (!svg.getAttribute('viewBox')) {
      const w = parseFloat(svg.getAttribute('width'));
      const h = parseFloat(svg.getAttribute('height'));
      if (w > 0 && h > 0) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }
    svg.removeAttribute('width');
    svg.removeAttribute('height');

    // Reserve and remember the aspect ratio so future loads don't collapse
    const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      const ratio = vb[2] / vb[3];
      this._holder.style.aspectRatio = String(ratio);
      try { localStorage.setItem(RATIO_CACHE_PREFIX + this.config.image, String(ratio)); } catch (_) {}
    }

    // Inject the user stylesheet into the SVG (as before)
    const style = document.createElementNS(SVG_NS, 'style');
    style.textContent = `@import url("${this.config.stylesheet}");`;
    svg.insertBefore(style, svg.firstChild);

    this._holder.replaceChildren(svg);
    this._svg = svg;

    this._bindSvgActions();
    this.updateStates();
  }

  // Element lookup inside the inlined SVG (ids may contain dots, so use
  // getElementById rather than querySelector).
  _getSvgEl(id) {
    return this._svg ? this.shadowRoot.getElementById(id) : null;
  }

  _bindSvgActions() {
    (this.config.groups ?? []).forEach(group => {
      (group.entities ?? []).forEach(entity_id => {
        const el = this._getSvgEl(entity_id);
        if (!el) {
          console.warn('floorplan-card: element with id missing in svg for configured entity ' + entity_id);
          return;
        }
        const domain = entity_id.split('.')[0];
        const isToggle = group.action?.service === 'toggle';
        el.style.cursor = 'pointer';
        // 'click' fires for both mouse and touch; listening to touchend as
        // well caused toggles to fire twice on touch devices.
        el.addEventListener('click', () => {
          if (isToggle) {
            this.myHass?.callService(domain, 'toggle', { entity_id });
          } else {
            const ev = new Event('hass-more-info', { bubbles: true, composed: true });
            ev.detail = { entityId: entity_id };
            this.dispatchEvent(ev);
          }
        });
      });
    });
  }

  updateStates() {
    if (!this._svg || !this.myHass || !this.config) return;
    const states = this.myHass.states;

    (this.config.groups ?? []).forEach(group => {
      if ('states' in group) {
        const style_map = new Map();
        group.states.forEach(s => style_map.set(s.state, s.class));

        group.entities.forEach(entity_id => {
          const state_str = states[entity_id]?.state ?? 'unavailable';
          const style_class = style_map.get(state_str) || 'default';
          const el = this._getSvgEl(entity_id);
          if (el) {
            el.setAttribute('class', style_class);
          } else {
            console.warn('floorplan-card: cannot apply style class because svg is missing element with id ' + entity_id);
          }
        });
      }

      if (group.on_update === 'set_text') {
        group.entities.forEach(entity_id => {
          const entity = states[entity_id];
          if (!entity) return;
          let state_str = entity.state;
          const unit = entity.attributes?.unit_of_measurement;
          if (unit) state_str += unit;

          let el = this._getSvgEl(entity_id);
          if (el) {
            const tspans = el.getElementsByTagName('tspan');
            if (tspans.length === 1) el = tspans[0];
            el.textContent = state_str;
          } else {
            console.warn('floorplan-card: cannot set text because svg is missing element with id ' + entity_id);
          }
        });
      }
    });

    // ── style_rules ──────────────────────────────────────────────────────────
    // Evaluates JS expressions against entity state and applies the result
    // as inline style on arbitrary SVG elements.
    //
    //   style_rules:
    //     - entity: binary_sensor.bathroom_door_opening
    //       elements:
    //         - id: doorBathroomOpen
    //           style: "display: ${ entity.state === 'on' ? 'inline' : 'none' };"
    // ─────────────────────────────────────────────────────────────────────────
    (this.config.style_rules ?? []).forEach(rule => {
      const entity = states[rule.entity];
      if (!entity) return;
      (rule.elements ?? []).forEach(elCfg => {
        const svgEl = this._getSvgEl(elCfg.id);
        if (!svgEl) {
          console.warn('floorplan-card: style_rules could not find SVG element', elCfg.id);
          return;
        }
        try {
          const styleStr = elCfg.style.replace(/\$\{([^}]+)\}/g,
            (_, expr) => Function('entity', `return (${expr})`)(entity));
          svgEl.setAttribute('style', styleStr);
        } catch (e) {
          console.warn('floorplan-card: style_rules expression error for', elCfg.id, e);
        }
      });
    });
  }

  _tryInitOverlays() {
    if (!this.config || !this.myHass || !this.content) return;
    if (!this._overlayManager) {
      this._overlayManager = new OverlayManager(this.content, this.myHass);
    }
    this._overlayManager.render(this.config.overlays ?? []);
    this._overlaysRendered = true;
    this._updateEditing();
  }

  setConfig(config) {
    if (!config.image) {
      throw new Error('You need to define an svg image');
    }
    if (!config.stylesheet) {
      throw new Error('You need to define a stylesheet');
    }
    if (!config.entity && !config.overlays) {
      throw new Error('You need to define an entity or at least one overlay');
    }
    const prev = this.config;
    this.config = config;

    if (!this.content) {
      const root = this.shadowRoot;
      const css = document.createElement('style');
      css.textContent = `
        .fp-svg-holder { width: 100%; }
        .fp-svg-holder > svg { display: block; width: 100%; height: auto; }
        .fp-error {
          padding: 16px; text-align: center; cursor: pointer;
          color: var(--error-color, #db4437);
        }
        /* Editor preview */
        .fp-editing > * { cursor: pointer; }
        .fp-editing > [fp-movable] {
          cursor: grab; touch-action: none;
          outline: 1px dashed var(--primary-color); outline-offset: 2px;
        }
        .fp-editing > [fp-selected] {
          outline: 2px solid var(--primary-color); outline-offset: 2px;
        }
        .fp-editing.fp-dragging, .fp-editing.fp-dragging > * { cursor: grabbing; }
      `;
      root.appendChild(css);

      this.card = document.createElement('fp-card');
      this.content = document.createElement('div');
      this.content.style.padding = '0 4px 4px';
      this.content.style.position = 'relative';
      this.content.style.isolation = 'isolate';
      this._bindEditorEvents();

      this._holder = document.createElement('div');
      this._holder.className = 'fp-svg-holder';
      this.content.appendChild(this._holder);
      this.card.appendChild(this.content);

      if (config.title) {
        const title = document.createElement('h1');
        title.innerHTML = config.title;
        root.appendChild(title);
      }
      root.appendChild(this.card);
    }

    // Reserve space before the SVG arrives so overlays are positioned correctly
    let ratio = Number(config.aspect_ratio);
    if (!(ratio > 0)) {
      try { ratio = Number(localStorage.getItem(RATIO_CACHE_PREFIX + config.image)); } catch (_) {}
    }
    if (ratio > 0 && !this._svg) this._holder.style.aspectRatio = String(ratio);

    // Reload SVG if a new image/stylesheet/groups was configured (e.g. editor)
    if (prev && (prev.image !== config.image || prev.stylesheet !== config.stylesheet
                 || prev.groups !== config.groups)) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
      this._loading = false;
      this._loadToken++;
      this._svg = null;
      this._holder.replaceChildren();
    }
    this._ensureSvg();

    if (prev && prev.overlays !== config.overlays) this._overlaysRendered = false;
    if (!this._overlaysRendered) this._tryInitOverlays();
    this._setBridge(config[FP_EDITOR_BRIDGE]);
  }

  set hass(hass) {
    this.myHass = hass;
    if (!this._overlaysRendered) this._tryInitOverlays();
    this._overlayManager?.setHass(hass);
    this.updateStates();
  }

  getCardSize() {
    return 8;
  }
}
customElements.define('floorplan-card', ActiveDrawing);


// ─────────────────────────────────────────────────────────────────────────────
// Visual editor
// Card options and an overlay list (add, reorder, delete). Selecting an
// overlay (in the list or the preview) opens its form; in the preview, drag
// it to move it or click the floorplan to place it. Built on HA's ha-form.
// ─────────────────────────────────────────────────────────────────────────────

// Hand-overs in a row that may go without the bridge coming back (e.g. a
// parent editor that drops symbols).
const MAX_BRIDGE_HAND_OVERS = 10;

class FloorplanEditorBridge extends EventTarget {
  constructor(handlers) {
    super();
    this.handlers = handlers;
    this.active = false;
    this.selectedIndex = undefined;
    this._handOvers = 0;
  }

  setState(active, selectedIndex) {
    if (active === this.active && selectedIndex === this.selectedIndex) return;
    this.active = active;
    this.selectedIndex = selectedIndex;
    this.dispatchEvent(new Event('changed'));
  }

  // Configs from outside the editor (the first one, YAML edits) arrive
  // without the bridge, so the editor must pass them on with it attached.
  needsHandOver(config) {
    if (config[FP_EDITOR_BRIDGE] === this) {
      this._handOvers = 0;
      return false;
    }
    if (this._handOvers >= MAX_BRIDGE_HAND_OVERS) return false;
    this._handOvers++;
    return true;
  }
}

// ── Editor form schemas (HA ha-form / selectors) ────────────────────────────

const OVERLAY_TYPES = {
  state_icon:    'State icon',
  state_label:   'State label',
  action_button: 'Action button',
};

const ANCHOR_OPTIONS = ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right']
  .map(value => ({ value, label: value }));

const CARD_SCHEMA = [
  { name: 'image', required: true, selector: { text: {} } },
  { name: 'stylesheet', required: true, selector: { text: {} } },
  { name: 'title', selector: { text: {} } },
  { name: 'aspect_ratio', selector: { number: { min: 0.1, max: 10, step: 0.01, mode: 'box' } } },
  {
    name: '', type: 'expandable', title: 'SVG groups and style rules (YAML)',
    schema: [
      { name: 'groups', selector: { object: {} } },
      { name: 'style_rules', selector: { object: {} } },
    ],
  },
];

const POSITION_SCHEMA = {
  name: '', type: 'grid',
  schema: [
    { name: 'x', selector: { text: {} } },
    { name: 'y', selector: { text: {} } },
    { name: 'anchor', selector: { select: { mode: 'dropdown', options: ANCHOR_OPTIONS } } },
    { name: 'scale', selector: { number: { min: 0.1, max: 10, step: 0.1, mode: 'box' } } },
  ],
};

const ACTIONS_SCHEMA = {
  name: '', type: 'expandable', title: 'Interactions',
  schema: ['tap_action', 'hold_action', 'double_tap_action'].map(name => ({
    name, selector: { ui_action: { default_action: 'none' } },
  })),
};

const OVERLAY_SCHEMAS = {
  state_icon: [
    { name: 'entity', required: true, selector: { entity: {} } },
    { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
    POSITION_SCHEMA,
    { name: 'visible_states', selector: { select: { multiple: true, custom_value: true, options: [] } } },
    { name: 'entity_picture', default: true, selector: { boolean: {} } },
    {
      name: '', type: 'expandable', title: 'Per-state icons and colours (YAML)',
      schema: [
        { name: 'icon_map', selector: { object: {} } },
        { name: 'color_map', selector: { object: {} } },
      ],
    },
    ACTIONS_SCHEMA,
  ],
  state_label: [
    { name: 'entity', selector: { entity: {} } },
    { name: 'attribute', selector: { attribute: {} }, context: { filter_entity: 'entity' } },
    { name: 'suffix', selector: { text: {} } },
    { name: 'template', selector: { text: { multiline: true } } },
    POSITION_SCHEMA,
    { name: 'style', selector: { object: {} } },
  ],
  action_button: [
    { name: 'label', selector: { text: {} } },
    { name: 'icon', selector: { icon: {} } },
    { name: 'entity', selector: { entity: {} } },
    POSITION_SCHEMA,
    { name: 'style', selector: { object: {} } },
    ACTIONS_SCHEMA,
  ],
};

const FIELD_LABELS = {
  image: 'SVG image URL',
  stylesheet: 'Stylesheet URL',
  title: 'Title',
  aspect_ratio: 'Aspect ratio (width ÷ height)',
  groups: 'Groups',
  style_rules: 'Style rules',
  entity: 'Entity',
  icon: 'Icon',
  label: 'Label',
  x: 'X (% from left)',
  y: 'Y (% from top)',
  anchor: 'Anchor',
  scale: 'Scale',
  visible_states: 'Only show in states',
  entity_picture: 'Show media artwork',
  icon_map: 'Icon per state',
  color_map: 'Colour per state',
  attribute: 'Attribute',
  suffix: 'Suffix',
  template: 'Template',
  style: 'Style (CSS)',
  tap_action: 'Tap action',
  hold_action: 'Hold action',
  double_tap_action: 'Double tap action',
};

const FIELD_HELPERS = {
  image: 'e.g. /local/floorplan/home.svg',
  stylesheet: 'e.g. /local/floorplan/home.css',
  aspect_ratio: 'Reserves space before the SVG loads. Optional.',
  entity: 'For button actions: the entity used by Toggle and More info.',
  template: "Supports {{ states('entity') }} and {{ state_attr('entity', 'attr') }}. Overrides attribute.",
};

// Drop empty values so the saved YAML stays clean.
function cleanConfig(config) {
  const out = {};
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined || value === '' ||
        (Array.isArray(value) && !value.length)) continue;
    out[key] = value;
  }
  return out;
}

// ha-form and its selectors are loaded lazily by HA. Opening a built-in
// card's editor loads them.
let editorDepsReady;
function loadEditorDeps() {
  editorDepsReady ??= (async () => {
    if (customElements.get('ha-form')) return;
    const helpers = await window.loadCardHelpers?.();
    const card = await helpers?.createCardElement({ type: 'entities', entities: [] });
    await card?.constructor?.getConfigElement?.();
    await customElements.whenDefined('ha-form');
  })().catch(e => console.warn('floorplan-card: editor components failed to load', e));
  return editorDepsReady;
}

class FloorplanCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._selected = undefined;
    this._view = undefined;
    this._bridge = new FloorplanEditorBridge({
      selectOverlay: index => this._select(index),
      moveOverlay: (index, x, y) => this._setPosition(index, x, y),
      clickImage: (x, y) => {
        if (this._selected !== undefined) this._setPosition(this._selected, x, y);
      },
    });
    loadEditorDeps().then(() => { this._view = undefined; this._render(); });
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll('ha-form').forEach(f => { f.hass = hass; });
  }

  setConfig(config) {
    this._config = config;
    if (this._selected !== undefined && !config.overlays?.[this._selected]) {
      this._selected = undefined;
      this._updateBridge();
    }
    this._render();
    this._handOver();
  }

  connectedCallback() {
    this._updateBridge();
    this._handOver();
  }

  disconnectedCallback() {
    // YAML mode or dialog closed: the preview behaves like a normal card.
    this._bridge.setState(false);
  }

  _updateBridge() {
    this._bridge.setState(this.isConnected, this._selected);
  }

  _handOver() {
    if (this.isConnected && this._config && this._bridge.needsHandOver(this._config)) {
      this._fireConfigChanged(this._config);
    }
  }

  _fireConfigChanged(config) {
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: { ...config, [FP_EDITOR_BRIDGE]: this._bridge } },
      bubbles: true,
      composed: true,
    }));
  }

  _select(index) {
    this._selected = index;
    this._updateBridge();
    this._render();
  }

  _setOverlays(overlays) {
    this._fireConfigChanged({ ...this._config, overlays });
    this._render();
  }

  _setPosition(index, x, y) {
    const overlays = [...(this._config?.overlays ?? [])];
    if (!overlays[index]) return;
    overlays[index] = { ...overlays[index], x: `${roundPct(x)}%`, y: `${roundPct(y)}%` };
    this._selected = index;
    this._updateBridge();
    this._setOverlays(overlays);
  }

  _addOverlay(type) {
    const overlays = [...(this._config.overlays ?? []), { type, x: '50%', y: '50%' }];
    this._selected = overlays.length - 1;
    this._updateBridge();
    this._setOverlays(overlays);
  }

  _moveOverlay(index, delta) {
    const overlays = [...(this._config.overlays ?? [])];
    const target = index + delta;
    if (target < 0 || target >= overlays.length) return;
    [overlays[index], overlays[target]] = [overlays[target], overlays[index]];
    this._setOverlays(overlays);
  }

  _deleteOverlay(index) {
    const overlays = [...(this._config.overlays ?? [])];
    overlays.splice(index, 1);
    this._setOverlays(overlays);
  }

  _overlayName(cfg) {
    const type = OVERLAY_TYPES[cfg.type] ?? cfg.type ?? 'Overlay';
    const entity = cfg.entity ?? cfg.tap_action?.entity;
    const name = entity ? this._hass?.states[entity]?.attributes?.friendly_name ?? entity : cfg.label;
    return name ? `${type}: ${name}` : type;
  }

  _makeForm(schema, onChange) {
    const form = document.createElement('ha-form');
    form.hass = this._hass;
    form.schema = schema;
    form.computeLabel = s => FIELD_LABELS[s.name] ?? s.name;
    form.computeHelper = s => FIELD_HELPERS[s.name];
    form.addEventListener('value-changed', ev => {
      ev.stopPropagation();
      onChange(ev.detail.value);
    });
    return form;
  }

  _render() {
    if (!this._config) return;
    if (!customElements.get('ha-form')) return; // re-rendered once loaded
    const overlay = this._selected !== undefined ? this._config.overlays?.[this._selected] : undefined;
    const view = overlay ? `overlay:${this._selected}:${overlay.type}` : 'main';
    if (view !== this._view) {
      this._view = view;
      overlay ? this._buildOverlayView(overlay) : this._buildMainView();
    }
    if (overlay) {
      this._overlayForm.data = overlay;
      this._overlayTitle.textContent = this._overlayName(overlay);
      this._movableHint.hidden = !isMovableOverlay(overlay);
    } else {
      this._cardForm.data = this._config;
      this._renderList();
    }
  }

  _styles() {
    return `
      <style>
        :host { display: block; }
        .hint {
          margin: 12px 0; padding: 8px 12px; border-radius: 8px;
          background: var(--secondary-background-color);
          color: var(--secondary-text-color); font-size: 14px;
        }
        h3 { margin: 16px 0 8px; font-size: 16px; font-weight: 500; }
        .row {
          display: flex; align-items: center; gap: 4px;
          padding: 4px 4px 4px 12px; margin: 0 0 4px;
          border: 1px solid var(--divider-color); border-radius: 8px;
        }
        .name {
          flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          cursor: pointer; padding: 6px 0;
        }
        .pos { color: var(--secondary-text-color); font-size: 12px; font-variant-numeric: tabular-nums; }
        .add { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
        button {
          padding: 6px 10px; border-radius: 6px; border: none; background: none;
          color: var(--primary-color); font: inherit; cursor: pointer;
        }
        button:hover { background: var(--ha-color-fill-primary-quiet-hover, var(--secondary-background-color)); }
        button:disabled { color: var(--disabled-text-color); cursor: default; background: none; }
        .icon-btn { padding: 6px; color: var(--secondary-text-color); }
        .icon-btn ha-icon { --mdc-icon-size: 20px; display: block; }
        .header { display: flex; align-items: center; gap: 4px; margin-bottom: 8px; }
        .header .title { font-size: 16px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .empty { color: var(--secondary-text-color); }
      </style>`;
  }

  _buildMainView() {
    const root = this.shadowRoot;
    root.innerHTML = `${this._styles()}
      <div class="card-form"></div>
      <h3>Overlays</h3>
      <p class="hint">Click an overlay here or in the preview to edit it. In the preview, drag an overlay to move it.</p>
      <div class="list"></div>
      <div class="add"></div>`;
    this._overlayForm = undefined;
    this._cardForm = this._makeForm(CARD_SCHEMA, value => {
      this._fireConfigChanged(cleanConfig({ ...value, overlays: this._config.overlays }));
    });
    root.querySelector('.card-form').append(this._cardForm);
    const add = root.querySelector('.add');
    for (const [type, label] of Object.entries(OVERLAY_TYPES)) {
      const btn = document.createElement('button');
      btn.textContent = `+ ${label}`;
      btn.addEventListener('click', () => this._addOverlay(type));
      add.append(btn);
    }
  }

  _iconButton(icon, title, onClick, disabled) {
    const btn = document.createElement('button');
    btn.className = 'icon-btn';
    btn.title = title;
    btn.disabled = !!disabled;
    const ic = document.createElement('ha-icon');
    ic.icon = icon;
    btn.append(ic);
    btn.addEventListener('click', ev => { ev.stopPropagation(); onClick(); });
    return btn;
  }

  _renderList() {
    const list = this.shadowRoot.querySelector('.list');
    const overlays = this._config.overlays ?? [];
    list.replaceChildren();
    if (!overlays.length) {
      list.innerHTML = '<p class="empty">No overlays yet.</p>';
      return;
    }
    overlays.forEach((cfg, index) => {
      const row = document.createElement('div');
      row.className = 'row';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = this._overlayName(cfg);
      name.addEventListener('click', () => this._select(index));
      const pos = document.createElement('span');
      pos.className = 'pos';
      pos.textContent = `${cfg.x ?? '0'}, ${cfg.y ?? '0'}`;
      row.append(
        name, pos,
        this._iconButton('mdi:arrow-up', 'Move up', () => this._moveOverlay(index, -1), index === 0),
        this._iconButton('mdi:arrow-down', 'Move down', () => this._moveOverlay(index, 1), index === overlays.length - 1),
        this._iconButton('mdi:pencil', 'Edit', () => this._select(index)),
        this._iconButton('mdi:delete', 'Delete', () => this._deleteOverlay(index)),
      );
      list.append(row);
    });
  }

  _buildOverlayView(overlay) {
    const root = this.shadowRoot;
    root.innerHTML = `${this._styles()}
      <div class="header"><span class="title"></span></div>
      <p class="hint movable">Drag this overlay in the preview, or click the floorplan to place it.</p>
      <div class="overlay-form"></div>`;
    this._cardForm = undefined;
    const header = root.querySelector('.header');
    header.prepend(this._iconButton('mdi:arrow-left', 'Back', () => this._select(undefined)));
    this._overlayTitle = root.querySelector('.title');
    this._movableHint = root.querySelector('.movable');
    const index = this._selected;
    const schema = OVERLAY_SCHEMAS[overlay.type] ?? [POSITION_SCHEMA];
    this._overlayForm = this._makeForm(schema, value => {
      const overlays = [...(this._config.overlays ?? [])];
      overlays[index] = cleanConfig({ ...value, type: overlay.type });
      this._fireConfigChanged({ ...this._config, overlays });
    });
    root.querySelector('.overlay-form').append(this._overlayForm);
  }
}
customElements.define('floorplan-card-editor', FloorplanCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
    type: "floorplan-card",
    name: "Floorplan Card"
});
