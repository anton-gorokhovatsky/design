# Runtime modules

The portfolio has no build step, framework, or production dependency. Seven
native ES modules use explicit `import`/`export` edges and keep their top-level
names out of the browser global scope:

1. `preferences.js` — preferences, typography, theme, and clock; no imports.
2. `analytics.js` — consent and delayed analytics; imports preferences.
3. `signal-field.js` — decorative canvas and depth grid; imports preferences.
4. `map-data.js` — deterministic portfolio data; no imports.
5. `map-engine.js` — geometry, relations, filters, and observation; imports
   analytics, map data, preferences, and the signal-field primitives it owns.
6. `panels.js` — consoles, content, search, and URL state; imports the public
   APIs of analytics, map data, map engine, preferences, and signal field.
7. `favicon.js` — variant 01 and visibility lifecycle; imports lifecycle APIs
   from map engine, preferences, and signal field.

`scripts/runtime-files.mjs` is the authoritative runtime manifest. `index.html`
loads the same seven module URLs and contains a generated import map so every
direct and transitive request uses its own `?v=<content-hash>`. The release
command updates that managed block before validation and commit.
