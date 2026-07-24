# Anton — practice map

Static personal portfolio for a digital product manager, web project lead, and
design engineer. The site is organized around a semantic four-direction map
instead of a conventional résumé timeline.

## Map model

- North: companies and institutions.
- East: projects and launches.
- South: personal interests.
- West: roles and ways of working.
- Position communicates semantic proximity, not a quantitative score.
- Point size communicates the personal weight of an experience.
- Shape distinguishes company, project, personal, and practice nodes.
- Garage Museum is the map's largest node and a connected project graph: the
  Museum site, Narkomfin, Collection and Open Storage, archives, online courses,
  the inclusive museum app, the research webzine, the endowment, and support for
  cultural institutions.

An unframed point constellation is the visual origin of the coordinate system.
It samples the nine emoji signatures from the earlier portfolio
(`🍣 🥪 ☕ 📻 🏂 ⚽ 🌊 🖥️ 👋`), redraws them with small mono glyphs, morphs from
one silhouette to the next, and slowly rotates as one orbital system.
`AG / ORIGIN` remains a small coordinate label inside the field, not a separate
logo card.

## Interaction model

- The map is the full-screen default state; the portfolio does not continue as
  a conventional scrolling page.
- Node selection opens a compact readout assembled around the selected point as
  the composition's anchor object.
- A compact `VIEW` selector in the system rail isolates the four
  semantic fields without moving nodes.
- The query bar sits above the system rail and uses the functional prompt
  `НАЙТИ ИЛИ ОТКРЫТЬ…` to search nodes or open content panels.
- Primary navigation is part of the map rather than a separate header: an
  indexed row of satellite points on desktop becomes a small expandable orbit
  on narrow screens.
- Hovering or focusing an eligible project node temporarily turns the central
  origin into a media receiver. Every reel is a muted seven-to-ten-second
  walkthrough of characteristic live states: full-page scrolls, meaningful
  inner routes, theme changes, or distinctive interface controls. Nodes without
  recorded media do not open an empty or decorative media receiver.
- A site reel is a window, not a crop: the captured site occupies 100% of the
  reel width, the video uses square pixels and a 4:5 display aspect ratio, and
  the receiver uses `object-fit: contain` with top alignment. Never use
  `cover` to fill the receiver by cutting off the website. The reel is presented
  as one uninterrupted media shape without a frame, title bar, footer, or
  decorative loading fallback. Run
  `node scripts/check-reels.mjs` after assembling or replacing reels.
- Touch devices keep the direct node-to-inspector interaction and do not render
  hover-only media.
- Long-form content remains inside the same coordinate system. Projects,
  approach, and contact appear as groups of soft, dismissible floating
  materials; they never replace the map with a full-height drawer.

## Instrument interface language

- Retrofuturism is used as interaction logic, not as visual pastiche: the map
  scans a field, controls change observation modes, and conventional lists
  remain available as a secondary route.
- The map is a data visualization before it is a cosmic image. A node is one
  experience, project, principle, or personal subject; position is semantic
  proximity inside the four fields, size is personal weight, shape is type,
  and a line means a real relationship. Visual properties must never be added
  without a meaning.
- Observation settings (`VIEW`, `DISPLAY`) stay at the edges of the field.
  Content navigation uses indexed points rather than button bars. These
  controls belong to one instrument-console family: the same material,
  typography, spacing rhythm, focus behavior, and motion are adapted into a
  left observation module, right status module, and bottom navigation/search
  module. On desktop the three modules can be dragged by their free material
  and rearranged inside the viewport without changing the behavior of their
  controls. Consistency means predictable principles, not identical shapes.
  Crisp strokes remain reserved for active controls and focus.
- Arial/Helvetica carries every textual interface and content layer. IBM Plex
  Mono remains only inside ASCII fields whose geometry depends on a fixed-width
  grid.
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
  Subtle blush and lilac belong to the field behind `MATERIAL / 01`, so colour
  appears through translucency. Media and showreels are content shapes rather
  than interface surfaces and remain unframed.
- Typography follows Max Kohler's
  [continuous typography](https://www.maxkohler.com/posts/continuous-typography/)
  principle: type size, measure, spacing, and line-height are relationships to
  the available viewport and reader defaults, expressed with `clamp()`,
  viewport/rem inputs, container-relative units for card typography, and
  unitless leading. Breakpoints may regroup the composition, but must not
  introduce unrelated typographic scales.
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

IBM Plex font files are self-hosted under the SIL Open Font License 1.1; the
license is included at `assets/fonts/LICENSE.txt`.
