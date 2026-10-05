# Runtime modules

The portfolio has no build step, framework, or production dependency. Eighteen
native ES modules keep top-level names out of the browser global scope.
`scripts/runtime-files.mjs` is the authoritative manifest, in this order:

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
9. `map-data.js` — authored portfolio data and generated media metadata;
   no imports.
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

`index.html` loads the same eighteen module URLs and contains a generated import
map so every direct and transitive request uses its own `?v=<content-hash>`.
`pnpm cache` and the release command update the managed block. The structural
checks enforce parity between this manifest and the loaded modules.

Media source settings live in `scripts/reel-specs.json`; `pnpm media:prepare`
regenerates posters, chapters, measured durations and content hashes together.
See the root README for capture and release commands.
