# Map layout implementation notes

Rationale for the existing clearance and authored layout in `js/map-engine.js`.
Kept outside the startup bundle so the hover rendering fix fits the unchanged
performance limits. This move changes no layout logic.

- Keep map points clear of controls.
- Use three quarters of the available outer field, with a bounded stretch. The existing clearance pass then fits this target around actual controls.
- Shared origin and angular anchors scale with the usable mobile map field. The radii reserve room for each system's sphere, orbit and attached label.
- Labels stay inside the available field, including the permitted tilt.
- Borrow the spare lower field for the upper group, gradually reducing the shift toward the personal nodes so the whole composition still fits.
- Mobile titles reserve space alongside the consoles. First place the author's named landmarks, then fit other nodes around them.
- Orbit projects are positioned by their own layer. Reserving their old map positions leaves phantom obstacles and exhausts the compact field.
- Reserve the whole pointer target, including on compact maps.
- Mobile captions approach the painted glyph while clearing its 24px pointer core; the orbital system uses its projected vertical extent. Reserve the final caption bounds for subsequent points and labels, without retaining an empty obstacle at its former position.
- On the narrowest map, the Narkomfin caption wraps like the principles caption so its name remains beside its point.
- Find the nearest free ring when the edges are occupied.
- Keep the institutional anchor; open the lower sectors toward the dock.
- The center, personal sector and principles retain their authored anchors.
- Authored emphasis, independent of case order and node size. Herman is considered last, after the main labels have claimed their space.

## Rendering and interaction constraints

These existing implementation notes are preserved here alongside the layout
rationale; moving comments does not change the startup code.

- Keep SVG paths alive to avoid empty WebKit frames.
- Publish the cached backdrop and spotlight as one canvas frame.
- The first gradient is the moving spotlight, painted below from the same token.
- The plane belongs to the map sector, even when controls displace its target.
- A mobile preview or parent panel may already have restored its own focus.
- Rotate sphere surfaces, keeping glyph geometry and lighting fixed.
- Cross-subject relationships supplement the professional parent without changing the point's chronology or layout rules.
- Hidden points cannot bend the few relationships shown on the introductory map.
- Open the circular order at its largest empty sector, never through a fan.
- Clear other nodes first; spacing chooses between equally clear arcs.
- One quadratic arc, expressed as a cubic for the existing in-place morph.
