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
    const actionCfg = this._config?.[actionKey];
    if (!actionCfg || actionCfg.action === 'none' || !this._hass) return;

    const action = actionCfg.action;
    const entity = actionCfg.entity ?? this._config.entity;
    const domain  = entity ? entity.split('.')[0] : null;

    if (action === 'toggle' && domain && entity) {
      this._hass.callService(domain, 'toggle', { entity_id: entity });
    } else if (action === 'more-info' && entity) {
      const ev = new Event('hass-more-info', { bubbles: true, composed: true });
      ev.detail = { entityId: entity };
      this.dispatchEvent(ev);
    } else if (action === 'call-service') {
      const [svcDomain, svcName] = (actionCfg.service ?? '').split('.');
      if (svcDomain && svcName) {
        this._hass.callService(svcDomain, svcName, actionCfg.service_data ?? {});
      }
    } else if (action === 'navigate' && actionCfg.navigation_path) {
      history.pushState(null, '', actionCfg.navigation_path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else if (action === 'url' && actionCfg.url_path) {
      window.open(actionCfg.url_path, actionCfg.url_target ?? '_blank');
    }
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
    const actionCfg = this._config?.[actionKey];
    if (!actionCfg || actionCfg.action === 'none' || !this._hass) return;

    const action  = actionCfg.action;
    const entity  = actionCfg.entity ?? this._config.entity;
    const domain  = entity ? entity.split('.')[0] : null;

    if (action === 'toggle' && domain && entity) {
      this._hass.callService(domain, 'toggle', { entity_id: entity });

    } else if (action === 'more-info' && entity) {
      const ev = new Event('hass-more-info', { bubbles: true, composed: true });
      ev.detail = { entityId: entity };
      this.dispatchEvent(ev);

    } else if (action === 'call-service') {
      const [svcDomain, svcName] = (actionCfg.service ?? '').split('.');
      if (svcDomain && svcName) {
        this._hass.callService(svcDomain, svcName, actionCfg.service_data ?? {});
      }

    } else if (action === 'navigate' && actionCfg.navigation_path) {
      history.pushState(null, '', actionCfg.navigation_path);
      window.dispatchEvent(new PopStateEvent('popstate'));

    } else if (action === 'url' && actionCfg.url_path) {
      window.open(actionCfg.url_path, actionCfg.url_target ?? '_blank');
    }
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

    for (const cfg of overlays) {
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

class ActiveDrawing extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._svg = null;
    this._loadToken = 0;
    this._retryTimer = null;
    this._loading = false;
    this._onWake = this._onWake.bind(this);
  }

  connectedCallback() {
    document.addEventListener('visibilitychange', this._onWake);
    window.addEventListener('online', this._onWake);
    window.addEventListener('pageshow', this._onWake);
    this._ensureSvg();
  }

  disconnectedCallback() {
    document.removeEventListener('visibilitychange', this._onWake);
    window.removeEventListener('online', this._onWake);
    window.removeEventListener('pageshow', this._onWake);
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
      const res = await fetch(url, {
        cache: attempt === 0 ? 'default' : 'no-cache',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (token !== this._loadToken) return; // superseded
      this._installSvg(text);
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
      `;
      root.appendChild(css);

      this.card = document.createElement('fp-card');
      this.content = document.createElement('div');
      this.content.style.padding = '0 4px 4px';
      this.content.style.position = 'relative';
      this.content.style.isolation = 'isolate';

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
window.customCards = window.customCards || [];
window.customCards.push({
    type: "floorplan-card",
    name: "Floorplan Card"
});
