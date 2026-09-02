# Runtime modules

The portfolio has no build step, framework, or production dependency. Ten
native ES modules use explicit `import`/`export` edges and keep their top-level
names out of the browser global scope:

1. `preferences.js` — preferences, typography, theme, and clock; no imports.
2. `analytics.js` — consent and delayed analytics; imports preferences.
3. `signal-field.js` — decorative canvas and depth grid; imports preferences.
4. `map-data.js` — deterministic portfolio data; no imports.
5. `observation-route.js` — route steps, timing, controls, and keyboard flow;
   imports analytics, map data, preferences, and signal field.
6. `personal-media.js` — user-started YouTube iframe, desktop persistence,
   inline mobile layout, and complete close/teardown; no imports.
7. `map-engine.js` — map geometry, relations, filters, and media previews;
   imports the observation/personal-media controllers and shared map primitives.
8. `viewport-ui.js` — detached command geometry and draggable desktop
   consoles; no imports.
9. `panels.js` — content panels, search, navigation, and URL state; imports the
   public APIs of analytics, map data, map engine, preferences, signal field,
   and viewport UI.
10. `favicon.js` — variant 01 and visibility lifecycle; imports lifecycle APIs
   from map engine, preferences, and signal field.

`scripts/runtime-files.mjs` is the authoritative runtime manifest. `index.html`
loads the same ten module URLs and contains a generated import map so every
direct and transitive request uses its own `?v=<content-hash>`. The release
command updates that managed block before validation and commit.
