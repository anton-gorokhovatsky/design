# Anton — practice map

Static personal site with a portfolio: work, principles, interests, and favourite
things are parts of the same authorial map. Finding work is a possible use, not
the site's defining purpose. The concise case route still surfaces task,
contribution, and outcome without turning the whole map into a résumé timeline.

## Map model

- North: companies and institutions.
- East: projects and launches.
- South: personal interests.
- West: roles and ways of working.
- Nearby points share a semantic relationship; position is not a quantitative
  score or a distance from a supposedly objective centre.
- Point size communicates the personal weight of an experience.
- Shape distinguishes company, project, personal, and practice nodes.
- One quiet `2010—2016` anchor summarizes the early progression from content
  and e-commerce through corporate web products to founding and operating
  Freya Project; the chronology begins in 2010 rather than the education year.
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
`--running-dusk` token sampled from SATISFY's Dusk Space-O™ Singlet. YouTube uses
the same sphere geometry at about half the visible area, with its own red accent
(`--youtube-red`); its approved position is `72 / 82`.
`МАРШРУТ / 60 СЕК` remains a small coordinate label inside the field, not a separate
logo card. It is also the explicit start control for the optional observation
route.

## Interaction model

- The map is the full-screen default state; the portfolio does not continue as
  a conventional scrolling page.
- Node selection opens a compact readout assembled around the selected point as
  the composition's anchor object. Twelve anchor points add the evidence fields
  `ЗАДАЧА / МОЯ РОЛЬ / РЕЗУЛЬТАТ`; numerical claims are included only where
  they are supported by the source résumé.
- A card's primary external link sits inside its heading fragment, below the
  metadata and before the story. It shares the existing text-link style, with no
  nested material. Labels name the destination; related map points remain last.
- `РАБОТЫ / 60 СЕК` is an optional eight-stop, roughly sixty-second route
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
  four semantic fields without moving nodes. `ВСЁ` is the aggregate state: it
  is visibly and semantically active when all four fields are shown, switches
  off for a custom subset, and restores the full view when pressed. In the
  complete composition it owns the only visible signal rail; the four included
  category buttons remain semantically pressed but visually quiet. In a custom
  subset, visible emphasis returns to the included categories.
  `ХРОНОЛОГИЯ` switches the same filtered map to year orbits.
- The desktop `ЭКРАН` instrument contains the clock, theme, and two meaningful
  accessibility overrides: less motion and higher contrast. System preferences
  remain authoritative; manual choices persist locally. Its marks use distinct
  silhouettes for live time, theme, motion, contrast, and analytics instead of
  presenting unrelated states as a column of radio buttons.
- Yandex Metrica and Webvisor are delayed until an explicit opt-in. The choice
  is reversible from the focused `АНАЛИТИКА И ПРИВАТНОСТЬ` place opened from
  `ЭКРАН` or search; the general `НАСТРОЙКИ САЙТА` place remains available on
  mobile. The search field is excluded from Webvisor key capture, and declining
  analytics does not alter the site.
  That focused place leads with the current state and its consequence:
  signal-blue belongs only to a loaded counter, while unset and denied states
  stay neutral and use different marker shapes. Once a choice exists, the
  panel shows only the available reverse action rather than a disabled copy of
  the current decision.
  After consent, a small allowlist of goal events measures successful
  navigation — point opens, filters, chronology, the observation route,
  content panels, and contact actions. Search text, contact addresses, and
  free-form values are never sent as goal parameters. The four signals used
  for product decisions and the deliberately conservative reading gate are
  documented in [`docs/analytics-decision-signals.md`](docs/analytics-decision-signals.md).
- With JavaScript unavailable, a focused fallback still exposes employer-facing
  cases, both résumé routes, email, and Telegram instead of leaving a dead canvas.
- The query bar sits above the system rail and uses the functional prompt
  `Найти или открыть…` to search nodes or open content panels. It also indexes
  the evidence fields `ЗАДАЧА / МОЯ РОЛЬ / РЕЗУЛЬТАТ`, so a process, outcome,
  or metric can find a case without its project name.
- Primary navigation is part of the map rather than a separate header: an
  indexed row of satellite points on desktop becomes a compact regular menu
  with one icon column, one label column, and equal hit areas on narrow
  screens.
- Hovering or focusing an eligible project node temporarily turns the central
  origin into a media receiver. Most reels are muted seven-to-eight-second
  walkthroughs of characteristic live states: full-page scrolls, meaningful
  inner routes, theme changes, or distinctive interface controls. A longer
  editorial pass is allowed when a real interaction needs legible dwell time;
  the current `11 111` reel uses 11.8 seconds for its bicycle-challenge hero,
  preparation diary, archive, a real diary-entry switch and the site's dark-theme
  control. Its secondary loops separate the light hero-to-diary route from the
  selected diary entry in dark mode. Tarski
  uses 12.4 seconds for its light editorial route, a real theme
  switch, the dark artist network, and an artist dossier; its secondary loops
  keep one light editorial chapter and one dark network/dossier chapter.
  Narkomfin uses 13.2 seconds to make the live 3D building legible across its
  initial, roof, cafe, and bookshop cameras before a real night-theme switch;
  its secondary loops separate the day camera route from the night roof view.
  Garage Webzine uses 12.4 seconds for its light cover and contents, a real
  article route, and the same article in the site's dark theme. Shirokostup
  uses 12.8 seconds for a calm light hero, the complete Index, its real dark
  appearance state, and one measured move into Selected work. Their chapter
  pairs keep those light and dark editorial states independently readable.
  The Russian Art Archive uses 11.8 seconds for its catalogue identity, a real
  search for «Мамышев-Монро», and the resulting archival cards. Radiance uses
  11.6 seconds for current events, its programme, and visiting information.
  Garage Endowment uses 10.8 seconds for the fund's mission and target
  capitals, followed by a real move into the donation controls. Each of these
  routes also has two chapters separating the source's identity from its
  working interface.
  Nodes without recorded media do not open an empty or decorative
  media receiver.
- A site reel is a window, not a crop: all 17 current sources are desktop
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
- Desktop hover and keyboard-focus previews keep the complete master dominant
  and add exactly two independently looping chapters selected for that
  project's own editorial rhythm. Chapters never change `playbackRate`:
  perceived tempo comes from their source-faithful ranges and different loop
  lengths. They are reproducible 450×300 H.264 derivatives of the 3:2 masters,
  not replacement reels. Use `?reel=mosaic&preview=<project-id>` to hold a
  chosen preview open for review, or `?reel=single` to inspect the master-only
  fallback. Regenerate every chapter with
  `node scripts/capture-reel-chapters.mjs`, or one pair with
  `node scripts/capture-reel-chapters.mjs <project-id>`; the command also
  refreshes all 34 content hashes in the managed `map-data.js` manifest.
- Touch devices keep the direct node-to-inspector interaction and do not render
  hover-only media.
- Long-form content remains inside the same coordinate system. Key cases,
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

## Recruiter and share routes

- The primary public résumé route points to hh.ru from navigation, contact, and
  no-script fallback. The long-form Notion chronology remains a secondary,
  evidence-rich route in contact and no-script contexts.
- `assets/anton-gorokhovatsky-resume.pdf` remains an unlinked draft for a
  separate editorial pass. Rebuild it with `python3 scripts/build-resume-pdf.py`
  in an environment with ReportLab; do not expose it in the interface until it
  is accepted explicitly.
- `/work/garage/`, `/work/narkomfin/`, `/work/tarski/`, `/work/doronin/`,
  `/work/eleven/`, and `/work/shirokostup/` expose stable, project-specific
  metadata and redirect visitors into the corresponding map state. Their
  `1200×630` previews are reproduced with
  `node scripts/capture-share-images.mjs`; pass route IDs to refresh only
  selected images.
- The main `1200×630` browser share image is reproduced from the current
  `?og=1` site state with `node scripts/capture-share-images.mjs site`; its
  metadata URL uses the first 12 characters of the JPEG SHA-256 as a cache key.
- `node scripts/check-publication-assets.mjs` keeps the main share image, the
  six canonical/OG routes, their image geometry, the sitemap, and the draft PDF
  integrity in one reproducible contract.
- Arial/Helvetica remain system fallbacks only. The constellation positions
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
  CSS-cascade, asset-graph and publication checks, reel validation, browser
  visual contracts in Chromium and WebKit, and `git diff --check`.
- `scripts/browser-contracts.cjs` owns shared scenarios, mobile expressions,
  validators, MIME types, and the local static server. Chromium, WebKit, share
  capture, and focused reel checks keep only their browser-specific drivers.
- `node scripts/check-reel-preview.mjs <id>` is the focused receiver check for
  the supported reel ids: it hovers the mapped project, verifies the current
  900×600 video/poster, two 450×300 chapters and readout, and writes a full
  frame plus a 1:1 receiver crop.
- The WebKit gate also completes one assistive-technology route at `390×844`:
  it reads the live accessibility tree, enters through the visible skip link,
  moves between map points with arrows, opens and closes a point with
  `Enter`/`Escape`, verifies dialog focus trap/return, reduced motion, and
  reflow without horizontal overflow.
- `node scripts/check-performance-budget.mjs` keeps CSS, runtime, preloaded
  fonts, and their combined first-party source under explicit budgets and
  forbids eager video. Architecture/font changes need measured evidence beyond
  this guardrail; line count alone is not a reason to rewrite working layers.
- `node scripts/check-css-cascade.mjs --report-overridden` inventories earlier
  declarations that the same selector/media unconditionally replaces later.
  A bounded `--fix-overridden-range=<first>:<last>` is allowed only as one
  historical-layer cleanup followed by matched renders and the full gate.
- `pnpm install --frozen-lockfile && pnpm check` reproduces that full gate with
  the pinned Playwright version. `.github/workflows/quality.yml` runs the same
  command and retains browser frames as CI artifacts.
- `docs/ui-state-matrix.md` is the visual state catalog used for matched
  desktop, tablet, mobile, theme, zoom, contrast, and reduced-motion renders.
  Dated runs and revoked acceptances live separately in
  `docs/acceptance-history.md`.
- `docs/agent-evals.md` keeps natural intent-level tasks for recurring agent
  work. Mechanical code/accessibility checks and human review of real renders
  stay separate; documentation and tokens are grounding, not proof.

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
- [Доронин в деле](https://doronin.store/)

The site uses static HTML, CSS, and JavaScript and publishes from the
repository's `gh-pages` branch.

`pnpm release -- --message "…" --file <path> …` is the single production
lane. Before validation it derives SHA-256 cache keys for the stylesheet and
all native modules, updates the managed import map, and automatically
adds that `index.html` change to the release scope. It then verifies the real
Git push credential path, runs the local Chromium and WebKit contracts,
stages only the approved files, and pushes a candidate to `main`. Production
stays unchanged until the exact commit's GitHub Quality push run succeeds.
Only then does the script advance `gh-pages` and verify the public HTML and
byte-identical runtime assets. Failed, cancelled, skipped or timed-out runs
cannot publish. If interrupted after commit, `node scripts/release.mjs --resume <full-SHA>`
resumes this barrier from a clean checkout without a second commit
or a blind rerun of Quality.

Golos Text font files are self-hosted under the SIL Open Font License 1.1; the
license is included at `assets/fonts/OFL-GolosText.txt`.
