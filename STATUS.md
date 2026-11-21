# Status

## 2026-11-07 — SVG load reliability
- Replaced `<object>` SVG loading with fetch + inline into shadow DOM (fixes collapsed card on iOS app resume).
- Retry with backoff (0.5s → 15s); immediate retry on `visibilitychange`/`online`/`pageshow`; "tap to retry" message after final failure.
- Space reserved before load via `aspect_ratio` config or ratio cached in localStorage from last successful load.
- Overlays render without waiting for the SVG.
- SVG group clicks: `click` only (removed duplicate `touchend` that double-fired toggles); `hass-more-info` dispatched from the card.
- Config changes (image/stylesheet/groups/overlays) now reload in the editor.
- `set_text` no longer throws on missing entities.

## Notes
- Stylesheet selectors using `:root` or relying on a separate SVG document no longer match (SVG is now inline in the card's shadow root).

## 2026-11-07 — Deployed
- Pushed, deployed, HA restarted. No persistent collapse so far; brief collapse on page load (Picture Elements does the same).

## 2026-11-21 — SVG load reliability: RESOLVED
- Several weeks of testing (incl. iOS app resume): loading is fully reliable.

## Next
- If the brief collapse matters: set `aspect_ratio` explicitly in config.
- Consider deduplicating action handling in `FloorplanStateIcon` / `FloorplanActionButton`.

## To Do
- Adjust state label colour to support light/dark mode better. Use Picture Elements as a model
- Create an editor UI for the card, similar to Picture Elements, so that state icons etc can be selected and positioned from the UI, rather than just from YAML.
- Add support for camera notifications so that a camera icon can display a pop-up with the video stream (might exist in HA at a deeper level).
- Add UI to configure overlays, visible states and color maps.
- Thermostat and Electric Blanket Helper "Heat" class elements appear in black, not the default deep orange of the Picture Elements card. I suspect that the card is not passing through HA's standard icon colours, but applying its own. I recall we had some troulbe replicating the appearance of dimmed and tinted lamps, also.
- WashData icon colours are not reflected in the card. Work out how to support these natively, rather than reinvent or replicate the colours manually.
## 2026-11-21 — Investigation: native state icon colours
- Picture Elements `state-icon` = `hui-state-icon-element` → renders HA's `<state-badge>` with `stateColor: true` (frontend `src/components/entity/state-badge.ts`).
- `state-badge` colour logic: `stateColorCss()` CSS-var cascade (`--state-<domain>-<device_class>-<state>-color` → `--state-<domain>-<state>-color` → `--state-<domain>-active|inactive-color` → `--state-active|inactive-color`), then `rgb_color`, then `filter: brightness((b+245)/5 %)`, then climate `hvac_action` → mode colour.
- Thermostat black bug: our `themeColorForState` looks up `hvac_action` (`heating`) in a map keyed by mode (`heat`), falls through to `--primary-text-color`.
- Plan: replace `ha-state-icon`/`ha-icon` + manual colours in `FloorplanStateIcon` with `<state-badge>`; delete colour helpers (lines ~17–233); keep `color_map` as inline host colour override with `stateColor=false`.
- WashData: unverified. `state-badge` colours `sensor` entities only via `rgb_color` attribute or battery rules. Check the entity's attributes in Developer Tools.

## 2026-11-21 — Native state icon colours (merged to main)
- `FloorplanStateIcon` now renders HA's `<state-badge>` with `stateColor: true`; removed ~220 lines of custom colour logic.
- `state-badge` is defined via `window.loadCardHelpers()`; icon re-renders once it is ready.
- Badge sized 24×24 (40×40 for media artwork), so existing layouts are unchanged. Media artwork no longer double-scaled.
- `color_map` still overrides (disables state colour, sets inline colour). `icon_map`, `visible_states` (now applied for all icon types), `entity_picture: false` kept.
- Entity pictures still only shown for playing/paused media players.
- Skips re-render when the entity's state object hasn't changed.
- WashData support deferred.

## To verify on device
- Dimmed/coloured lights, thermostat heating (deep orange), valves, locks, unavailable entities.
- Custom icon sets (`phu:` etc.) via `icon_map`/`icon`.
- Media player artwork shape: HA uses rounded square (8%), previously circle.
- Light and dark themes.

## 2026-11-21 — Scope: visual editor (no changes made)
Picture Elements (frontend commit 711ff63, 2026-10-28) editor:
- `hui-picture-elements-card-editor.ts`: `ha-form` for card options + element list + per-element sub-editor (`ha-form` schema per element type).
- `cards/picture-elements/editor-bridge.ts`: live object attached to the config under a Symbol; survives spreads into the preview card, dropped from saved YAML.
- `cards/picture-elements/editor-preview-controller.ts`: in the preview, captures pointer events; click selects, drag moves (4px threshold), click on empty image places selected element. Writes `left`/`top` % rounded to 0.1. Blocks element actions while editing.
- `movable-element.ts`: only % positions are draggable.
Plan for floorplan-card (vanilla JS, no Lit/build):
1. Editor element + `getConfigElement`/`getStubConfig`: card options form, overlay list (add/delete/reorder), per-type overlay forms. ~350 lines.
2. Bridge + preview drag/select/place in `ActiveDrawing`, writing overlay `x`/`y` %. ~200 lines.
3. `groups`, `style_rules`, `icon_map`, `color_map`, `visible_states` via object (YAML) fields at first.

## Next steps (agreed 2026-11-21)
1. DONE: native state icon colours and action button theming tested and merged.
2. Then start visual editor with step 2 (preview click/drag positioning + minimal editor: overlay list and positions). Test early that the config Symbol bridge reaches a custom card's preview.
3. Then step 1 (full editor forms), then step 3.

## 2026-11-21 — Action button theming (merged to main)
- Native state icon colours tested on device: working.
- Action button defaults now match Picture Elements (plain `ha-button`): `--primary-color` text, medium weight, no background. Previously `--state-icon-color` on translucent grey, illegible in dark mode. Per-button `style:` still overrides.
- Text colour verified in light and dark mode. (A grey/white background seen in testing came from a `background` in the button's own YAML `style:`, not the card.)
- Added hover/press tint using HA's `--ha-color-fill-primary-quiet-hover` / `-active` (same tokens as `ha-button`). Hover only on devices with a pointer. An inline `style: background` overrides it.
- Hover and press tint verified in light and dark mode.
