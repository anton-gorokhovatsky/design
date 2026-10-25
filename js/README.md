# Runtime modules

The portfolio has no build step, framework, or production dependency. Twenty-eight
native ES modules keep top-level names out of the browser global scope.
`scripts/runtime-files.mjs` is the complete, authoritative manifest. Core responsibilities:

1. `preferences.js` — preferences, typography, theme, clock and the shared
   visible-tab-stop query; no imports.
2. `whoop-day.js` — allowlisted public daily snapshot, recovery palette,
   freshness and colour preference; no OAuth credentials or runtime dependencies.
3. `whoop-aura.js` — native Canvas aura beneath the author card, driven by the
   daily palette and motion preferences; no imports.
4. `presence.js` — anonymous visible-tab presence and visitor count; no imports.
5. `atlas-motion.js` — lazy native Atlas frames with static SVG fallback;
   no imports.
6. `analytics.js` — consent and delayed analytics; imports preferences.
7. `cipher-field.js` — deterministic point-to-cipher composition; no imports.
8. `signal-field.js` — decorative Canvas and depth grid; imports preferences
   and cipher field.
9. `map-data.js` — initial map metadata, exact short descriptions and generated
   media metadata; no imports. `case-content.js` hydrates full descriptions and
   figure metadata only when details or search are requested.
10. `observation-route.js` — route steps, timing, controls and keyboard flow;
    imports analytics, map data, preferences and signal field.
11. `personal-media.js` — user-started YouTube iframe, desktop persistence,
    inline mobile layout and close/teardown; no imports.
12. `sphere-surfaces.js` — seeded sphere textures and a shared Canvas loop
    capped at 24 fps; imports preferences. Offscreen, filtered, hidden-tab,
    reduced-motion and forced-colour states pause rendering.
13. `map-media.js` — hover/focus video receiver, two-chapter mosaic, observation
    showcase, playback and media placement. Imports only map data and preferences.
    Callers use its lifecycle functions and `isMapPreviewActive()`; they do not
    reach into its active item or video DOM.
14. `map-engine.js` — map geometry, relations, filters and inspector; connects
    observation, personal media, sphere surfaces and the map-media controller.
15. `viewport-ui.js` — detached command geometry, draggable desktop consoles,
    scroll lenses and scroll edges; imports preferences.
16. `panels.js` — content panels, search, navigation and URL state; uses public
    APIs from analytics, map data, map engine, map media, preferences, signal
    field and viewport UI.
17. `case-view.js` — expanded professional case, single scroll viewport,
    pinned media receiver, focus and background isolation. Reuses the preview
    video instead of creating another decoder; coordinates map media, map engine,
    panels, map data, preferences and viewport UI.
18. `favicon.js` — variant 01 and visibility lifecycle; imports lifecycle APIs
    from map media, preferences and signal field.
    Reuses its 48 PNG frames; pauses while the document is hidden or on pagehide,
    then resumes the same phase on visibility/pageshow without changing its cadence.

The Aura field reuses its phase-independent spatial warp and pixel buffer until
geometry or noise changes. Coordinates retain Float64 precision; phase and palette
still apply on each frame.

The remaining modules own celestial volumes, map controls, contribution tags,
mobile composition, focused/spatial layouts, orbital physics and the project
picker. Their ordering and complete paths live only in the manifest.

The readable source of `spatial-home.js` is `rendering/js/spatial-home.js`;
the runtime copy is compressed with Terser (`--module --compress passes=3 --mangle`).
Its caption clearance includes the complete private-practice orbit envelope,
while connection-line occlusion still follows the solid core.

`index.html` loads all twenty-eight module URLs and contains a generated import
map so every direct and transitive request uses its own `?v=<content-hash>`.
`pnpm cache` and the release command update the managed block. The structural
checks enforce parity between this manifest and the loaded modules.

Media source settings live in `scripts/reel-specs.json`; `pnpm media:prepare`
regenerates posters, chapters, measured durations and content hashes together.
See the root README for capture and release commands.

Detailed case copy and figure metadata live in `case-content.json`. The small
`case-content.js` controller requests this versioned payload when works, a full
point card or search is opened. The initial map retains the exact existing short
descriptions; loading hydrates the full descriptions and figures on the same
items. Search waits for the complete index before accepting an early Enter.
Failed requests can be retried. A shared request has a 10-second deadline, including
its response body; aborting releases it for a fresh attempt. Responses cannot
reopen dismissed cards. Reselecting a point whose reading window is already open
keeps the current detail request: cached data still hydrates the visible text,
evidence and editorial links after a reload.

`runtimeDataFiles` keeps the payload in the cache/import-map manifest and public
asset verification. Static content checks read it, and the performance gate
bounds it separately while preserving every existing JavaScript/CSS limit.

## Scroll lens invariants

Detailed rendering rationale for `viewport-ui.js` is kept here rather than
in the initial download. The adjacent source comments identify each invariant.

- Refraction enlarges foreground content as it enters the matte edge. Keep baselines intact: vertical displacement clips glyphs in browser SVG pipelines.
- The story opts into `fullWidth`: its text can expand across the reading gutters up to the fixed pane outline. The displacement map uses pane coordinates and extended filter bounds. Other readers and media keep their existing profile; the glass shell and its rounded corners never deform.

- Decode each edge texture once. Replacing a PNG data URL on every scroll frame made WebKit alternate between the previous and newly decoded map.

- WebKit can discard the whole filter when a merged feImage lies entirely outside its bounds. Keep unused textures in bounds and merge transparency.

- Keep the raster attached to its picture so native/inertial scrolling moves both together. A viewport-sized copy repositioned from scroll events lags behind Safari's compositor and leaves torn bands at the frame boundary.

- Copy the undistorted centre in one operation. Only the two narrow edge bands need row sampling, even when a tall reel scrolls past the window.

- Project the live iframe: cross-origin pixels cannot be sampled, and WebKit loses accelerated video under SVG URL filters (222757).

- Text refraction filters the native scrollport inside a stationary transparent clipping frame. Native Safari can omit an ancestor SVG filter across the accelerated scrolling boundary; apply the URL through `--scroll-ink-filter` on the scrollport itself. The low-specificity CSS rule preserves the existing focus-plane filter. Apply menu/settings blur to the outer frame: replacing the scrollport SVG filter with CSS blur can leave native Safari stuck on its blurred raster after return. Keep the outer frame clipped, the edge maps fixed to the viewport, and the native scroll, reading position, focus and outer glass shell intact.
- A sticky close target has a neutral rectangle in the upper map. Visible controls suppress the intersecting edge; transparent text links keep refraction until focused. Selection and visible keyboard focus suspend the text filter. Visible images, videos and iframes suspend the parent text filter; their existing attached media/player projection remains responsible for the edge. Hidden previews do not suspend text. Never reparent a live iframe, and preserve video playback when moving its scrollport.

## Focused index

On compact map panes, the existing search form and results enter the nonmodal top layer without reparenting or replacing the input. They share the visual viewport's coordinates, including its keyboard offset; the map column still bounds their width in a wide paired layout. Closing search removes the top layer immediately and preserves the query.

Mouse movement highlights a whole result row even in a narrow viewport. Arrow navigation establishes keyboard modality before moving the visible selection; a parked pointer does not create a second highlight. Enter opens that selection. Coarse touch retains its existing protection against sticky hover. The background map keeps its normal visual depth; only the result surface uses MATERIAL / 01.
