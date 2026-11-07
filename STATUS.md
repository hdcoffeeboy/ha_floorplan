# Status

## 2026-11-07 — SVG load reliability
- Replaced `<object>` SVG loading with fetch + inline into shadow DOM (fixes collapsed card on iOS app resume).
- Retry with backoff (0.5s → 15s); immediate retry on `visibilitychange`/`online`/`pageshow`; "tap to retry" message after final failure.
- Space reserved before load via `aspect_ratio` config or ratio cached in localStorage from last successful load.
- Overlays render without waiting for the SVG.
- SVG group clicks: `click` only (removed duplicate `touchend` that double-fired toggles); `hass-more-info` dispatched from the card.
- Config changes (image/stylesheet/groups/overlays) now reload in the editor.
- `set_text` no longer throws on missing entities.

## Untested / to verify on device
- Stylesheet selectors using `:root` or relying on a separate SVG document no longer match (SVG is now inline in the card's shadow root).
- Verify on iOS companion app resume.

## 2026-11-07 — Deployed
- Pushed, deployed, HA restarted. No persistent collapse so far; brief collapse on page load (Picture Elements does the same).
- Holding further refinements until stability confirmed.

## Next
- If the brief collapse matters: set `aspect_ratio` explicitly in config.
- Consider deduplicating action handling in `FloorplanStateIcon` / `FloorplanActionButton`.

## To Do
- Adjust state label colour to support light/dark mode better. Use Picture Elements as a model
- Create an editor UI for the card, similar to Picture Elements, so that state icons etc can be selected and positioned from the UI, rather than just from YAML.
- Add support for camera notifications so that a camera icon can display a pop-up with the video stream (might exist in HA at a deeper level).
- Add UI to configure overlays, visible states and color maps.