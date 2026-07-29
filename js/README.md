# Runtime layers

The portfolio has no build step. Seven deferred classic scripts execute in the
order declared in `index.html` and share the browser's global lexical scope.
The split keeps source boundaries explicit without adding a framework,
bundler, or runtime dependency:

1. `preferences.js` — preferences, typography, theme, and clock.
2. `analytics.js` — explicit analytics consent and delayed counter loading.
3. `signal-field.js` — decorative canvas and depth grid.
4. `map-data.js` — deterministic portfolio data.
5. `map-engine.js` — map geometry, relations, filters, and observation route.
6. `panels.js` — movable consoles, content panels, search, and URL state.
7. `favicon.js` — dynamic favicon and visibility lifecycle.

Later layers may consume names declared by earlier layers. Moving a declaration
between files therefore requires running `node scripts/check-project.mjs` and
the real-browser UI contracts before release.
