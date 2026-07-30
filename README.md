# Anton — practice map

Static personal portfolio for a digital product manager, web project lead, and
design engineer. The site is organized around a semantic four-direction map
instead of a conventional résumé timeline.

## Map model

- North: companies and institutions.
- East: projects and launches.
- South: personal interests.
- West: roles and ways of working.
- Nearby points share a semantic relationship; position is not a quantitative
  score or a distance from a supposedly objective centre.
- Point size communicates the personal weight of an experience.
- Shape distinguishes company, project, personal, and practice nodes.
- The Ilmix evidence readout is transcribed from the source
  [résumé](https://gorokhovatsky.notion.site/digital-web-digital-f68fc13247614ccb9738d9a85acf29b4?pvs=74):
  role/dates and the 2020 oncology.help audience and bounce-rate comparison.
  No lost product screenshots or unverified outcomes are reconstructed.
- Garage Museum is the map's largest node and a connected project graph: the
  Museum site, Narkomfin, Collection and Open Storage, archives, online courses,
  the inclusive museum app, the research webzine, the endowment, and support for
  cultural institutions.

An unframed point constellation is the visual origin of the coordinate system.
It samples ten emoji signatures
(`🍣 🥪 ☕ 📻 🏂 ⚽ 🌊 🖥️ 👋 🏃🏼‍♂️`), redraws them with small glyphs,
morphs from one silhouette to the next, and slowly rotates as one orbital
system. Running remains a clean `БЕГ` map node; its figurative image belongs to
the central constellation rather than to the label. The running light uses the
`--running-dusk` token sampled from SATISFY's Dusk Space-O™ Singlet.
`АГ / НАЧАЛО` remains a small coordinate label inside the field, not a separate
logo card. It is also the explicit start control for the optional observation
route.

## Interaction model

- The map is the full-screen default state; the portfolio does not continue as
  a conventional scrolling page.
- Node selection opens a compact readout assembled around the selected point as
  the composition's anchor object. Nine anchor points add the evidence fields
  `ЗАДАЧА / МОЯ РОЛЬ / РЕЗУЛЬТАТ`; numerical claims are included only where
  they are supported by the source résumé.
- `СЕАНС НАБЛЮДЕНИЯ` is an optional eight-stop, roughly sixty-second route
  through the same map and inspector. It never autostarts, never captures
  focus, and supports previous, pause/resume, next, arrow keys, and Escape.
- `ПОКАЗАТЬ ХРОНОЛОГИЮ` gives the radar rings a chronological meaning. Only
  nodes with supported dates enter the year orbits; undated principles remain
  visibly outside the chronology rather than receiving guessed dates.
- Map state is addressable: `?point=<id>`,
  `?filter=company,project`, `?view=time`, and
  `?route=observation&step=<n>` restore the corresponding context and work with
  browser Back/Forward.
- A compact `ВИД` selector can isolate one field or combine any subset of the
  four semantic fields without moving nodes. `ВСЁ` resets the custom view;
  `ХРОНОЛОГИЯ` switches the same filtered map to year orbits.
- The desktop `ЭКРАН` instrument contains the clock, theme, and two meaningful
  accessibility overrides: less motion and higher contrast. System preferences
  remain authoritative; manual choices persist locally.
- Yandex Metrica and Webvisor are delayed until an explicit opt-in. The choice
  is reversible from `ЭКРАН` or search, the search field is excluded from
  Webvisor key capture, and declining analytics does not alter the site.
  After consent, a small allowlist of goal events measures successful
  navigation — point opens, filters, chronology, the observation route,
  content panels, and contact actions. Search text, contact addresses, and
  free-form values are never sent as goal parameters.
- With JavaScript unavailable, a focused fallback still exposes selected work,
  the résumé, email, and Telegram instead of leaving a dead canvas.
- The query bar sits above the system rail and uses the functional prompt
  `Найти или открыть…` to search nodes or open content panels.
- Primary navigation is part of the map rather than a separate header: an
  indexed row of satellite points on desktop becomes a compact regular menu
  with one icon column, one label column, and equal hit areas on narrow
  screens.
- Hovering or focusing an eligible project node temporarily turns the central
  origin into a media receiver. Every reel is a muted seven-to-eight-second
  walkthrough of characteristic live states: full-page scrolls, meaningful
  inner routes, theme changes, or distinctive interface controls. Nodes without
  recorded media do not open an empty or decorative media receiver.
- A site reel is a window, not a crop: all 13 current sources are desktop
  websites, so each uses square pixels and is captured from a `1200×800`
  viewport into a `900×600` / `3:2` master and matching landscape receiver.
  The receiver uses the same `MATERIAL / 01`, while the native video fills its
  silhouette without stretching, artificial padding, or empty fields. Never
  use `cover`, reshape an existing recording, or merely rewrite a non-square
  SAR. A vertical receiver is reserved for a source proven mobile-native; it
  must never turn a desktop site into a portrait tablet. The reel has no title
  bar, footer, border, shadow, or decorative loading fallback. Each reel has a
  selected `900×600` poster from the same native capture, so its composition
  appears before video decoding. Rebuild the poster set with
  `node scripts/capture-reel-posters.mjs`. Reproduce a
  capture with `node scripts/capture-reels.cjs <project-id>` (Node.js,
  Playwright, Chrome, and FFmpeg are required) and run
  `node scripts/check-reels.mjs` after assembling or replacing reels. Set
  `PORTFOLIO_CAPTURE_BROWSER` when Chrome is outside its default macOS path.
- Touch devices keep the direct node-to-inspector interaction and do not render
  hover-only media.
- Long-form content remains inside the same coordinate system. Projects,
  approach, and contact appear as groups of soft, dismissible floating
  materials; they never replace the map with a full-height drawer.
- Contact is one compact material terminal rather than a separate empty
  screen: a live status, a greeting, one short invitation, and two parallel
  actions (`ЭЛ. ПОЧТА` and `TELEGRAM`). Destinations remain inside their
  links, so neither the email address nor the Telegram handle is exposed as
  display copy. Actions share a row on wide screens and reflow to one column
  at narrow widths or enlarged text.

## Instrument interface language

- Retrofuturism is used as interaction logic, not as visual pastiche: the map
  scans a field, controls change observation modes, and conventional lists
  remain available as a secondary route.
- Spatial depth comes from one observatory camera: the far grid and specks,
  relationship paths and nodes, and the near origin use restrained,
  coordinated parallax amplitudes. Opening a content section shifts that same
  camera rather than adding local perspective frames. Reduced motion freezes
  the travel without removing content or controls.
- Theme changes move the same camera across a restrained Earth terminator:
  horizon, atmosphere, and stellar density transition together. Reduced motion
  exposes the destination state immediately.
- The transparent blue favicon is an original ASCII spiral galaxy. Supporting
  browsers animate its particles through a canvas favicon; reduced-motion and
  non-scripted contexts keep the static SVG/PNG silhouette.
- The map is a data visualization before it is a cosmic image. A node is one
  experience, project, principle, or personal subject; field is experience
  type, nearby positions mean nearby ideas, size is personal weight, shape is
  type, and a line means a real relationship. Visual properties must never be
  added without a meaning.
- The idle map has no selected node. Semantic colour appears only in active
  states: bronze-neutral for institutions, signal blue for projects,
  dusk-lilac for personal nodes, and sage for principles. Colour reinforces
  the existing shape, size, label, and accessible name; it never carries the
  meaning alone.
- Observation settings (`ВИД`, `ЭКРАН`) stay at the edges of the field.
  Content navigation uses indexed points rather than button bars. These
  controls belong to one instrument-console family: the same material,
  typography, spacing rhythm, focus behavior, and motion are adapted into a
  upper-left observation module, upper-right status module, and lower-left
  navigation/search module. On desktop the three modules can be dragged by their free material
  and rearranged inside the viewport without changing the behavior of their
  controls. Consistency means predictable principles, not identical shapes.
  Crisp strokes remain reserved for active controls and focus.
- Self-hosted Golos Text carries every textual interface, content layer, and
  the central point constellation in weights 400/500/600/700.
  Arial/Helvetica remain system fallbacks only. The constellation positions
  each glyph independently on the canvas, so its geometry does not require a
  monospace font.
- A visual review includes an explicit optical-alignment pass at desktop,
  tablet, 390 px, and 320 px: shared text baselines, perceived icon centres,
  equal internal air, stable row rhythm, and aligned axes between neighbouring
  modules are checked in both themes. Mathematical centring alone is not a
  finished composition. Alignment fixes must preserve the shared compositing
  path rather than flattening surfaces into opaque white cards.
- `MATERIAL / 01` is the only interface-surface material. It translates the
  text-panel rule from [Natalie Liu's info page](https://www.natalieliu.com/info):
  a theme-aware 50% translucent fill, `blur(24px)`, no border, and no shadow.
  Every content panel, map readout, search result, and instrument console uses
  that exact recipe. Components own only geometry, spacing, and interaction
  state; they cannot introduce a stronger, tinted, edged, or shadowed material.
  Equality includes the field behind the surface and its stacking context:
  a local scrim, dimmed map, or persistent transform must not make one family
  look more opaque or prevent the shared backdrop blur from sampling the map.
  Every surface is registered in markup with `data-material-surface` and an
  explicit responsive mode. The release gate compares computed fill, blur,
  border, shadow, and material ancestry in every active state; a mismatch or
  nested glass surface fails the entire family.
  Subtle blush and lilac belong to the field behind `MATERIAL / 01`, so colour
  appears through translucency. Media and showreels are content shapes rather
  than interface surfaces and remain unframed.
- Typography follows Max Kohler's
  [continuous typography](https://www.maxkohler.com/posts/continuous-typography/)
  principle: type size, measure, spacing, and line-height are relationships to
  the available viewport and reader defaults, expressed with `clamp()`,
  viewport/rem inputs, container-relative units for card typography, and
  unitless leading. Breakpoints may regroup the composition, but must not
  introduce unrelated typographic scales or replace editorial typography:
  short Russian prepositions and conjunctions stay with the following word,
  while names, numbers, initials, and compound brands are joined only when
  they form an indivisible semantic unit. Actual line endings are checked in
  rendered control widths.
- Motion has three semantic curves: objects enter decisively with
  `--motion-enter`, leave with `--motion-exit`, and travel between two visible
  states with the symmetrical `--motion-shift`. Reduced-motion preferences
  collapse all travel while preserving the final state.

## Accessibility release gate

- Keep one interface rather than a separate accessible version. The map,
  content cards, inspector, search, and navigation must expose native roles,
  unique names, and a coherent accessibility tree.
- Complete the primary routes with keyboard only; preserve a visible focus
  indicator and return focus to the invoking control when an inspector or
  content group closes.
- No information may exist only on hover. Hover reels are atmospheric; click,
  focus, and touch still expose the same project identity and destination.
- Check light and dark contrast, 200% zoom, 320 CSS-pixel reflow, reduced
  motion, and the 390×844 touch layout before release.
- Decorative ASCII is hidden from assistive technology. The central canvas has
  a concise text alternative, and every interactive node has a specific
  accessible name.
- Museum Garage is the largest black node and is named directly. Its importance
  is communicated by scale and connections rather than a slogan.

## Audit workflow

The project keeps its static runtime and uses a small deterministic audit layer
instead of adding Storybook:

- `node scripts/audit-project.mjs` inventories map semantics, reel references,
  the complete material-surface registry, detached search compositing,
  material/type/motion contracts, accessibility hooks, metadata drift, and
  CSS-cleanup candidates.
- `node scripts/audit-project.mjs --json` returns the same report as structured
  JSON for comparison or external tooling.
- `node scripts/check-project.mjs` runs JavaScript syntax, project contracts,
  CSS-cascade and asset-graph checks, reel validation, browser visual
  contracts in Chromium and WebKit, and `git diff --check`.
- The WebKit gate also completes one assistive-technology route at `390×844`:
  it reads the live accessibility tree, enters through the visible skip link,
  moves between map points with arrows, opens and closes a point with
  `Enter`/`Escape`, verifies dialog focus trap/return, reduced motion, and
  reflow without horizontal overflow.
- `node scripts/check-performance-budget.mjs` keeps CSS, runtime, preloaded
  fonts, and their combined first-party source under explicit budgets and
  forbids eager video. Architecture/font changes need measured evidence beyond
  this guardrail; line count alone is not a reason to rewrite working layers.
- `pnpm install --frozen-lockfile && pnpm check` reproduces that full gate with
  the pinned Playwright version. `.github/workflows/quality.yml` runs the same
  command and retains browser frames as CI artifacts.
- `docs/ui-state-matrix.md` is the visual state catalog used for matched
  desktop, tablet, mobile, theme, zoom, contrast, and reduced-motion renders.

Static cleanup candidates are never deletion instructions. Confirm them with
computed styles, runtime state coverage, and matched before/after renders.

## Selected work

- [Olga Shirokostup](https://shirokostup.site/)
- [Tarski](https://tarski.ru/)
- [Herman & Co](https://barberherman.ru/)
- [Dusty Dumbbells Merch](https://merch.dustydumbbells.com/)
- [Dusty Dumbbells Camp](https://camp.dustydumbbells.com/)
- [11 111](https://11111.life/)
- [KS Fish](https://ks.fish/)
- [Doronin](https://doronin.store/)

The site uses static HTML, CSS, and JavaScript and publishes from the
repository's `gh-pages` branch.

`pnpm release -- --message "…" --file <path> …` is the single production
lane. Before validation it derives SHA-256 cache keys for the stylesheet and
all seven native modules, updates the managed import map, and automatically
adds that `index.html` change to the release scope. It then verifies the real
Git push credential path, runs the Chromium and WebKit contracts in parallel,
stages only the approved files, publishes the same commit to `main` and
`gh-pages`, and waits until the public domain serves the exact versioned URLs
and byte-identical runtime assets.

Golos Text font files are self-hosted under the SIL Open Font License 1.1; the
license is included at `assets/fonts/OFL-GolosText.txt`.
