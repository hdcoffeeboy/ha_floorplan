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
2. DONE: step 2 built, verified and merged.
3. DONE: step 1 (full editor forms) committed; initial tests pass, long test cycle under way. Then step 3.

## 2026-11-21 — Action button theming (merged to main)
- Native state icon colours tested on device: working.
- Action button defaults now match Picture Elements (plain `ha-button`): `--primary-color` text, medium weight, no background. Previously `--state-icon-color` on translucent grey, illegible in dark mode. Per-button `style:` still overrides.
- Text colour verified in light and dark mode. (A grey/white background seen in testing came from a `background` in the button's own YAML `style:`, not the card.)
- Added hover/press tint using HA's `--ha-color-fill-primary-quiet-hover` / `-active` (same tokens as `ha-button`). Hover only on devices with a pointer. An inline `style: background` overrides it.
- Hover and press tint verified in light and dark mode.

## 2026-11-21 — Visual editor step 2 (merged to main)
- `floorplan-card-editor` (via `getConfigElement`): hint, overlay list with x/y, selected overlay gets editable x/y fields + Done. Other settings: code editor.
- Bridge (`FloorplanEditorBridge`) attached to config under `Symbol.for('floorplan-card-editor-bridge')`; hand-over limited to 10 like Picture Elements.
- Preview (`ActiveDrawing`, only when HA sets `preview` and editor is open): click overlay = select, drag (>4px) = move, click floorplan = place selected. Writes `x`/`y` as % to 0.1. Overlay and SVG group actions blocked while editing. Movable overlays dashed outline, selected solid.
- Only % (or unset) positions are draggable; others marked "not %".
- HA rebuilds the preview card on every config change: SVG text now cached in memory per URL to avoid refetch/flicker.
- Verified 2026-11-21: bridge reaches preview; select/drag/place work; save/discard correct; dashboard card unaffected; saved YAML clean.

## 2026-11-21 — Visual editor step 1: full forms (committed; long test cycle under way)
- Editor built on HA `ha-form` (loaded via card helpers if not yet defined).
- Main view: card options (image, stylesheet, title, aspect_ratio; groups/style_rules as YAML fields), overlay list (edit, move up/down, delete), add State icon / State label / Action button (new overlays at 50%, 50%).
- Overlay view (from list or preview click): back button, drag hint, per-type form: entity, icon, label, attribute, suffix, template, x/y/anchor/scale, visible_states, entity_picture, icon_map/color_map/style (YAML), tap/hold/double-tap via HA action picker.
- Overlay actions now run through HA's `hass-action` event (same handler as built-in cards): adds perform-action, assist, confirmations; removes duplicate action code. `entity` may be on the action (legacy) or on the overlay. `url_target` no longer honoured (HA opens URLs in a new tab).
- Empty fields removed from saved YAML.
- `getStubConfig` added so the card can be added from the card picker.
- To verify: forms load; edits update preview; add/reorder/delete; actions picker values work on dashboard (toggle, more-info, perform-action, navigate); existing YAML actions (incl. call-service, tap_action.entity) still work; saved YAML clean.

## 2026-11-21 — Marketplace (HACS) release prep (committed on branch `hacs-release`; based on `editor-forms`; neither merged to main)
- Card type renamed `custom:floorplan-card` → `custom:svg-floorplan-card` (clashed with ExperienceLovelace ha-floorplan); internal elements prefixed `svg-floorplan-`. No alias. Own dashboards need `type:` updated.
- Licence: Apache 2.0 (required by upstream: floorplan-card by chr1st1ank, fork of ExperienceLovelace ha-floorplan, both Apache 2.0, no upstream NOTICE files). Added LICENSE, NOTICE, header in floorplan-card.js marking modifications.
- Added `hacs.json` (filename `floorplan-card.js`, min HA 2026.11.0), `.github/workflows/validate.yml` (hacs/action, category plugin), full README, `CARD_VERSION = '1.0.0'` console banner, card picker description.
- User to do: add `images/screenshot.png` (HACS image check); confirm min HA version; GitHub repo description, topics, issues enabled; merge; push; run validation; publish release v1.0.0; then submit PR to hacs/default (plugin list) if wanted.
- Decide whether STATUS.md stays in the public repo.
- README has no upgrade section (card was private; no public history).
- PAUSED: user living with `hacs-release` build for an extended test cycle before release. Resume with the "User to do" list above, then merge `hacs-release` into main.
