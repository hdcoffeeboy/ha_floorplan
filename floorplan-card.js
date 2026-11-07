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

// Default state colours per domain, mirroring HA frontend theme conventions
const DOMAIN_STATE_COLORS = {
  light:          { on: 'var(--state-light-active-color, #fdd835)',
                    off: 'var(--state-light-inactive-color, #7b7b7b)' },
  switch:         { on: 'var(--state-switch-active-color, #43a047)',
                    off: 'var(--state-switch-inactive-color, #7b7b7b)' },
  binary_sensor:  { on: 'var(--state-binary_sensor-active-color, #43a047)',
                    off: 'var(--state-binary_sensor-inactive-color, #7b7b7b)' },
  climate:        { heat: 'var(--state-climate-heat-color, #ff8100)',
                    cool: 'var(--state-climate-cool-color, #2196f3)',
                    heat_cool: 'var(--state-climate-heat_cool-color, #fb8c00)',
                    auto: 'var(--state-climate-auto-color, #00acc1)',
                    dry:  'var(--state-climate-dry-color, #efb400)',
                    fan_only: 'var(--state-climate-fan_only-color, #43a047)',
                    idle: 'var(--state-climate-idle-color, #7b7b7b)',
                    off:  'var(--state-climate-off-color, #7b7b7b)' },
  fan:            { on: 'var(--state-fan-active-color, #43a047)',
                    off: 'var(--state-fan-inactive-color, #7b7b7b)' },
  cover:          { open: 'var(--state-cover-active-color, #43a047)',
                    closed: 'var(--state-cover-inactive-color, #7b7b7b)' },
  lock:           { unlocked: 'var(--state-lock-active-color, #ff8100)',
                    locked: 'var(--state-lock-inactive-color, #43a047)' },
  alarm_control_panel: { disarmed: 'var(--state-alarm_control_panel-inactive-color, #43a047)',
                         armed_away: 'var(--state-alarm_control_panel-active-color, #ff8100)',
                         armed_home: 'var(--state-alarm_control_panel-active-color, #ff8100)',
                         triggered: 'var(--state-alarm_control_panel-triggered-color, #f44336)' },
  person:         { home: 'var(--state-person-home-color, #43a047)',
                    not_home: 'var(--state-person-not_home-color, #7b7b7b)' },
  device_tracker: { home: 'var(--state-device_tracker-home-color, #43a047)',
                    not_home: 'var(--state-device_tracker-not_home-color, #7b7b7b)' },
  input_boolean:  { on: 'var(--state-input_boolean-active-color, #43a047)',
                    off: 'var(--state-input_boolean-inactive-color, #7b7b7b)' },
  valve:          { open: 'var(--state-valve-active-color, #43a047)',
                    closed: 'var(--state-valve-inactive-color, #7b7b7b)' },
  media_player:   { playing: 'var(--state-media_player-active-color, #43a047)',
                    paused:  'var(--state-media_player-active-color, #43a047)',
                    idle:    'var(--state-media_player-inactive-color, #7b7b7b)',
                    off:     'var(--state-media_player-inactive-color, #7b7b7b)' },
};

// Battery colour is derived from level attribute rather than state string.
// Mirrors HA frontend: red < 20%, amber < 50%, green >= 50%.
// Also handles charging (amber) and discharging states.
function batteryColor(stateObj) {
  const state = stateObj?.state ?? 'unknown';
  const attrs = stateObj?.attributes ?? {};

  // sensor.*_battery or device_class: battery
  const level = parseFloat(attrs.battery_level ?? state);
  const isCharging = attrs.battery_charging === true
    || (typeof attrs.charger_type === 'string' && attrs.charger_type !== 'none')
    || state === 'charging';

  if (isCharging) return 'var(--state-sensor-battery-charging-color, #fb8c00)';
  if (isNaN(level)) return 'var(--primary-text-color)';
  if (level < 20)   return 'var(--state-sensor-battery-low-color, #f44336)';
  if (level < 50)   return 'var(--state-sensor-battery-medium-color, #fb8c00)';
  return 'var(--state-sensor-battery-high-color, #43a047)';
}

// Read a CSS variable from the HA document root (outside shadow DOM)
// so theme variables are honoured correctly.
function getThemeVar(varName, fallback) {
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return val || fallback;
}

// Map entity state to the appropriate HA theme CSS variable, then resolve it.
function themeColorForState(entityId, state, stateObj) {
  const domain = entityId ? entityId.split('.')[0] : null;
  const deviceClass = stateObj?.attributes?.device_class;

  // Unavailable / unknown — always grey regardless of domain
  if (state === 'unavailable' || state === 'unknown') {
    return getThemeVar('--state-unavailable-color', '#bdbdbd');
  }

  // Battery sensors — level-based colour
  if (deviceClass === 'battery' || entityId?.toLowerCase().includes('battery')) {
    return batteryColor(stateObj);
  }

  // Domain + state -> CSS variable name, mirroring HA frontend conventions
  const varMap = {
    light:         { on: '--state-light-active-color' },
    switch:        { on: '--state-switch-active-color' },
    binary_sensor: { on: '--state-binary_sensor-active-color' },
    climate: {
      heat:      '--state-climate-heat-color',
      cool:      '--state-climate-cool-color',
      heat_cool: '--state-climate-heat_cool-color',
      auto:      '--state-climate-auto-color',
      dry:       '--state-climate-dry-color',
      fan_only:  '--state-climate-fan_only-color',
    },
    fan:           { on: '--state-fan-active-color' },
    cover:         { open: '--state-cover-active-color' },
    lock:          { unlocked: '--state-lock-active-color' },
    valve:         { open: '--state-valve-active-color' },
    media_player:  { playing: '--state-media_player-active-color',
                     paused:  '--state-media_player-active-color' },
    alarm_control_panel: {
      armed_away:  '--state-alarm_control_panel-active-color',
      armed_home:  '--state-alarm_control_panel-active-color',
      triggered:   '--state-alarm_control_panel-triggered-color',
    },
    person:        { home: '--state-person-home-color' },
    device_tracker:{ home: '--state-device_tracker-home-color' },
    input_boolean: { on: '--state-input_boolean-active-color' },
  };

  // For climate entities, use hvac_action if available — it reflects what
  // the unit is actually doing (idle/heating/cooling) rather than the mode
  const effectiveState = (domain === 'climate' && stateObj?.attributes?.hvac_action)
    ? stateObj.attributes.hvac_action
    : state;

  // Only use domain-specific variable if it resolves to a real value
  const domainVars = varMap[domain];
  if (domainVars?.[effectiveState]) {
    const resolved = getThemeVar(domainVars[effectiveState], '');
    if (resolved) return resolved;
  }

  // Also check inactiveStates using effectiveState
  const inactiveStates = ['off', 'closed', 'locked', 'not_home', 'idle'];
  if (inactiveStates.includes(effectiveState)) {
    return getThemeVar('--state-icon-color',
             getThemeVar('--state-inactive-color', '#7b7b7b'));
  }



  return getThemeVar('--primary-text-color', '#ffffff');
}

function defaultColorForState(entityId, state, stateObj) {
  const domain = entityId ? entityId.split('.')[0] : null;

  // Battery sensors — colour by level regardless of domain
  const deviceClass = stateObj?.attributes?.device_class;
  if (deviceClass === 'battery' || (domain === 'sensor' && entityId?.toLowerCase().includes('battery'))) {
    return batteryColor(stateObj);
  }

  return DOMAIN_STATE_COLORS[domain]?.[state] ?? 'var(--primary-text-color)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Light colour helpers
// Mirrors HA frontend logic for deriving icon colour from light attributes.
// ─────────────────────────────────────────────────────────────────────────────

// Convert colour temperature in Kelvin to an approximate RGB value.
// Uses a simplified Tanner Helland algorithm.
function kelvinToRgb(kelvin) {
  const t = Math.min(Math.max(kelvin, 1000), 40000) / 100;
  let r, g, b;

  // Red
  if (t <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    r = Math.min(Math.max(r, 0), 255);
  }

  // Green
  if (t <= 66) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }
  g = Math.min(Math.max(g, 0), 255);

  // Blue
  if (t >= 66) {
    b = 255;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    b = Math.min(Math.max(b, 0), 255);
  }

  return [Math.round(r), Math.round(g), Math.round(b)];
}

// Derive the best colour for a light entity icon.
// Priority: rgb_color > color_temp_kelvin > warm white fallback > off grey
function lightIconColor(stateObj) {
  if (!stateObj || stateObj.state === 'off') {
    return DOMAIN_STATE_COLORS.light.off;
  }

  const attr = stateObj.attributes;

  // Derive base RGB colour
  let r, g, b;
  if (attr.rgb_color) {
    [r, g, b] = attr.rgb_color;
  } else if (attr.color_temp_kelvin) {
    [r, g, b] = kelvinToRgb(attr.color_temp_kelvin);
  } else if (attr.color_temp) {
    [r, g, b] = kelvinToRgb(Math.round(1000000 / attr.color_temp));
  } else {
    [r, g, b] = kelvinToRgb(2700);
  }

  // Apply brightness as a CSS filter, exactly as picture-elements does:
  // color = raw rgb_color, filter = brightness(x%) where x is derived from
  // the brightness attribute. HA uses roughly: pct = brightness/255 * 100
  // but with a minimum so icons don't go black.
  const bri = attr.brightness != null ? attr.brightness / 255 : 1.0;
  const filterPct = Math.round(Math.max(20, Math.pow(bri, 0.35) * 100));

  return { color: `rgb(${r},${g},${b})`, filter: `brightness(${filterPct}%)` };
}


// ─────────────────────────────────────────────────────────────────────────────
// State icon overlay
// Renders an MDI icon whose appearance is driven by entity state.
//
// Config example:
//   type: state_icon
//   entity: light.living_room
//   x: 42%
//   y: 35%
//   anchor: center        # center | top-left | top-right | bottom-left | bottom-right
//   size: 24              # icon size in px, default 24
//   icon_map:
//     "on":  mdi:lightbulb
//     "off": mdi:lightbulb-off
//   color_map:
//     "on":  "#f5c518"
//     "off": "var(--secondary-text-color)"
// ─────────────────────────────────────────────────────────────────────────────

class FloorplanStateIcon extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-state-icon { display: block; }
        ha-icon { display: block; }
        :host([actionable]) ha-state-icon { cursor: pointer; }
        :host([actionable]) ha-icon { cursor: pointer; }
        :host([actionable]) img.entity-picture { cursor: pointer; }
        img.entity-picture {
          display: block;
          border-radius: 50%;
          object-fit: cover;
          width: 40px;
          height: 40px;
        }
      </style>
      <ha-state-icon></ha-state-icon>
      <ha-icon style="display:none"></ha-icon>
      <img class="entity-picture" style="display:none" alt="">
    `;
    this._icon    = this.shadowRoot.querySelector('ha-state-icon');
    this._haIcon  = this.shadowRoot.querySelector('ha-icon');
    this._img     = this.shadowRoot.querySelector('img.entity-picture');

    this._tapCount  = 0;
    this._tapTimer  = null;
    this._holdTimer = null;

    // Attach pointer events to all elements
    for (const el of [this._icon, this._haIcon, this._img]) {
      el.addEventListener('pointerdown',   this._onPointerDown.bind(this));
      el.addEventListener('pointerup',     this._onPointerUp.bind(this));
      el.addEventListener('pointercancel', this._onPointerCancel.bind(this));
    }
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  set config(config) {
    this._config = config;
    if (config.tap_action || config.hold_action || config.double_tap_action) {
      this.setAttribute('actionable', '');
    }
    this._update();
  }

  _update() {
    if (!this._config || !this._hass) return;
    const entityId = this._config.entity;
    const stateObj = this._hass.states[entityId];
    const state = stateObj ? stateObj.state : 'unknown';
    const domain = entityId ? entityId.split('.')[0] : null;

    // For media players with album art, show thumbnail instead of icon
    const entityPicture = stateObj?.attributes?.entity_picture;
    const showPicture = domain === 'media_player'
      && entityPicture
      && ['playing', 'paused'].includes(state)
      && this._config.entity_picture !== false;

    if (showPicture) {
      // Determine size from scale — approximate icon footprint
      const scale = this._config.scale ?? 1;
      const size = Math.round(40 * scale);
      this._img.style.cssText = `display:block;width:${size}px;height:${size}px;`;
      this._img.src = entityPicture;
      this._icon.style.display = 'none';
    } else {
      this._img.style.display = 'none';

      // Resolve which icon to show — icon_map > config icon > entity default
      const iconMap = this._config.icon_map ?? {};
      const resolvedIcon = iconMap[state] ?? this._config.icon ?? null;

      // Use ha-icon for custom icon sets (non-mdi prefix), ha-state-icon otherwise
      const isCustomIcon = resolvedIcon && !resolvedIcon.startsWith('mdi:');

      if (isCustomIcon) {
        // ha-icon handles custom brand icon sets (phu:, hue:, etc.)
        this._icon.style.display = 'none';
        this._haIcon.style.display = '';
        this._haIcon.setAttribute('icon', resolvedIcon);

        const colorMap = this._config.color_map ?? {};
        if (colorMap[state]) {
          this._haIcon.style.color = colorMap[state];
          this._haIcon.style.filter = '';
        } else if (domain === 'light') {
          const lc = lightIconColor(stateObj);
          this._haIcon.style.color = lc.color;
          this._haIcon.style.filter = lc.filter;
        } else {
          this._haIcon.style.color = defaultColorForState(entityId, state, stateObj);
          this._haIcon.style.filter = '';
        }
      } else {
        // ha-state-icon for mdi: and default entity icons
        this._haIcon.style.display = 'none';
        this._icon.style.display = '';
        this._icon.hass = this._hass;
        this._icon.stateObj = stateObj;

        if (resolvedIcon) {
          this._icon.setAttribute('icon', resolvedIcon);
        } else {
          this._icon.removeAttribute('icon');
        }

        // Hide overlay if state is not in visible_states list
    const visibleStates = this._config.visible_states;
    if (visibleStates && !visibleStates.includes(state)) {
      this.style.display = 'none';
      return;
    } else {
      this.style.display = '';
    }

    const colorMap = this._config.color_map ?? {};
        this._icon.style.filter = '';
        if (colorMap[state]) {
          this._icon.style.color = colorMap[state];
        } else if (domain === 'light' && state === 'on') {
          const lc2 = lightIconColor(stateObj);
          this._icon.style.color = lc2.color;
          this._icon.style.filter = lc2.filter;
        } else {
          this._icon.style.color = themeColorForState(entityId, state, stateObj);
        }
      }
    }

    // Scale via transform on the host element is handled by OverlayManager
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
          background: rgba(0,0,0,0.45);
          color: var(--state-icon-color, #44739e);
          font-size: 12px;
        }
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
// ─────────────────────────────────────────────────────────────────────────────

class ActiveDrawing extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  updateStates() {
    const svg_doc = this.image.getSVGDocument();
    if(svg_doc && this.myHass)
    {
        var states = this.myHass.states;

        // For each group of the card's config
        (this.config.groups ?? []).forEach(function(group)
        {
          // If the group has a "states" item
          if("states" in group)
          {
              // Create a dictionary of state-dependent styles
              var style_map = new Map();
              group.states.forEach(function(state_obj)
              {
                style_map.set(state_obj.state, state_obj.class);
              });

              // For each entity set the style according to the state
              group.entities.forEach(function(entity_id)
              {
                const state = states[entity_id];
                const state_str = state ? state.state : 'unavailable';
                var style_class = style_map.get(state_str);
                style_class = style_class ? style_class : 'default';
                var entity = svg_doc.getElementById(entity_id);
                if(entity){
                    entity.setAttribute("class", style_class);
                }else{
                    console.warn("Cannot apply style class because svg is missing element with id " + entity_id);
                }
              });
          }
          // If the group has on_update: 'set_text'
          if("on_update" in group && group.on_update == "set_text")
          {
              // For each entity write the current status into the svg element
              group.entities.forEach(function(entity_id)
              {
                // Get entity and state
                const entity = states[entity_id];
                var state_str = entity.state;
                // If there is a unit of measurement, append it
                var unit = entity["attributes"]["unit_of_measurement"];
                if(unit){
                    state_str = state_str + unit;
                }
                // Get svg element and write text
                var element = svg_doc.getElementById(entity_id);
                if(element){
                    // Is the actual text wrapped into a nested tspan?
                    const tspans = element.getElementsByTagName("tspan");
                    if(tspans.length == 1){
                      element = tspans[0];
                    }
                    element.textContent = state_str;
                }else{
                    console.warn("Cannot set text because svg is missing element with id " + entity_id);
                }
              });
          }
        });

        // ── style_rules ──────────────────────────────────────────────────────
        // Evaluates JS expressions against entity state and applies the result
        // as inline style on arbitrary SVG elements.
        //
        // Config example:
        //   style_rules:
        //     - entity: binary_sensor.bathroom_door_opening
        //       elements:
        //         - id: doorBathroomOpen
        //           style: "display: ${ entity.state === 'on' ? 'inline' : 'none' };"
        //         - id: doorBathroomClosed
        //           style: "display: ${ entity.state === 'on' ? 'none' : 'inline' };"
        // ─────────────────────────────────────────────────────────────────────
        (this.config.style_rules ?? []).forEach(rule => {
          const stateObj = states[rule.entity];
          if (!stateObj) return;
          const entity = stateObj; // expose as 'entity' in expressions

          (rule.elements ?? []).forEach(elCfg => {
            const svgEl = svg_doc.getElementById(elCfg.id);
            if (!svgEl) {
              console.warn('chr-floorplan-card: style_rules could not find SVG element', elCfg.id);
              return;
            }
            try {
              // Replace ${ ... } expressions, then evaluate the full style string
              const styleStr = elCfg.style.replace(/\$\{([^}]+)\}/g, (_, expr) => {
                return Function('entity', `return (${expr})`)(entity);
              });
              svgEl.setAttribute('style', styleStr);
            } catch(e) {
              console.warn('chr-floorplan-card: style_rules expression error for', elCfg.id, e);
            }
          });
        });
    }
  }

  prepareSVGOnceLoaded() {
    // Guard against race condition where onload fires before SVG DOM is ready.
    // This is common on mobile. Retry up to 20 times with 100ms intervals.
    const svg_doc = this.image.contentDocument;
    if (!svg_doc || !svg_doc.querySelector('svg')) {
      if ((this._svgRetryCount ?? 0) < 20) {
        this._svgRetryCount = (this._svgRetryCount ?? 0) + 1;
        setTimeout(() => this.prepareSVGOnceLoaded(), 100);
      } else {
        console.warn('floorplan-card: SVG failed to load after retries');
      }
      return;
    }
    this._svgRetryCount = 0;

    // Add the stylesheet to the svg file
    var style = svg_doc.createElementNS("http://www.w3.org/2000/svg", "style");
    // Make the browser load our css
    style.textContent = '@import url("' + this.config.stylesheet + '");';
    var svgElem = svg_doc.querySelector('svg');
    svgElem.insertBefore(style, svgElem.firstChild);

    // Set onClick handlers for each entity in a group for actions and more-info dialogue
    (this.config.groups ?? []).forEach(group => { // For each group of the card's config
      // If the group has an "entities" item
      if("entities" in group)
      {
          // For each of the entities
          group.entities.forEach(entity_id => {
            var domain = entity_id.split('.')[0];
            var svg_element = svg_doc.getElementById(entity_id);

            if(svg_element){ // Check if the entity is in the svg graph
                // Action: Toggle on click/touch
                if("action" in group && group.action.service == "toggle"){
                    // Bind parameters to hass service action function
                    const toggle_func = this.myHass.callService.bind(
                          this.myHass, domain, 'toggle', { 'entity_id': entity_id }
                    );
                    // Click event for mouse
                    svg_element.addEventListener('click', function(event){ toggle_func(); } );
                    // Touch event for touchscreens
                    svg_element.addEventListener('touchend', function(event){ toggle_func(); } );
                // Default: Open more-info box on click/touch
                }else{
                    // Click event for mouse
                    svg_element.addEventListener('click', e => {
                            var new_event = new Event('hass-more-info');
                            new_event.detail = {'entityId': entity_id};
                            document.querySelector('home-assistant').dispatchEvent(new_event);
                        }
                    );
                    // Touch event for touchscreens
                    svg_element.addEventListener('touchend', e => {
                            var new_event = new Event("hass-more-info");
                            new_event.detail = {entityId: entity_id};
                            document.querySelector('home-assistant').dispatchEvent(new_event);
                            e.preventDefault();
                        }
                    );
                }
            }else{
                console.warn("Element with id missing in svg for configured entity " + entity_id)
            }
          });
      }
    });

    // Update states and initialise overlays once SVG is ready
    this.updateStates();
    this._tryInitOverlays();
  }

  _tryInitOverlays() {
    if (!this.config || !this.myHass || !this.content) return;
    if (!this._overlayManager) {
      this.content.style.position = 'relative';
      this.content.style.isolation = 'isolate';
      this._overlayManager = new OverlayManager(this.content, this.myHass);
    }
    this._overlayManager.render(this.config.overlays ?? []);
  }

  setConfig(config) {
    if (!config.image) {
      throw new Error('You need to define an svg image');
    }
    if (!config.stylesheet) {
      throw new Error('You need to define a stylesheet');
    }
    // entity and groups are only required when not using overlays-only config
    if (!config.entity && !config.overlays) {
      throw new Error('You need to define an entity or at least one overlay');
    }
    this.config = config;

    if(!this.content)
    {
      // Create basic structure of the card
      const root = this.shadowRoot;
      this.card = document.createElement('fp-card');
      this.card.header = 'floorplan-card';
      this.content = document.createElement('div');
      this.content.style.padding = '0 4px 4px';

      // Add svg file to card and insert css style once loaded
      this.image = document.createElement('object');
      this.image.type = 'image/svg+xml';
      this.image.data = this.config.image;
      this.image.style = 'width: 100%';
      this.image.id = "fp-image";
      this.image.async = false;
      this.image.onload = this.prepareSVGOnceLoaded.bind(this);

      // Put all the HTML elements together and also add the title if available
      this.content.appendChild(this.image);
      this.card.appendChild(this.content);
      if(this.config.title){
        const title = document.createElement('h1');
        title.innerHTML = this.config.title;
        root.appendChild(title);
      }
      root.appendChild(this.card);
    }
  }

  set hass(hass) {
    // Store the hass object for use in other functions
    this.myHass = hass;

    // Keep overlays in sync with state updates
    this._overlayManager?.setHass(hass);

    // Update states on the svg picture
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
