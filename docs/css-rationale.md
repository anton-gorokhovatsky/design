# Пояснения к CSS

Развёрнутые пояснения перенесены из `styles.css`, чтобы не передавать их
посетителю с каждым обновлением стилей. Краткие пометки остаются рядом
с правилами; полные основания сохранены здесь. Текущие роли и принятые
состояния описаны в [системе интерфейса](design-system.md).

## Decorative noise: keep 10px clear of glyphs.

Decorative field noise must never attach itself to an interactive mark. The runtime clearance pass keeps these points at least 10px away from every rendered glyph across responsive scales.

## Motion: decisive entrance, quick exit, continuous travel.

Motion follows interface intent: decisive entrance, accelerated exit, continuous travel between two visible positions.

## Shared Akt typography and MATERIAL / 01.

Akt carries interface, content, and independently positioned canvas glyphs. One local glass material remains shared across every interface surface.

## Touch must not retain hover or combobox afterimages.

Touch already identifies the row spatially. Do not let iOS retain a pointer hover or the combobox's automatic active option as a false selected surface after the finger leaves the screen.

## Clipped rows signal continuation; forced colours stay native.

A clipped neighbouring row reveals that the list continues without adding a texture or another control. Forced colours keep the native affordance.

## Readout fragments stay subordinate to the selected node.

The selected node remains the anchor object. Its readout is assembled from small material fragments instead of becoming another dominant screen.

## Reels preserve their native ratio and complete source.

A reel is a source-faithful window with one stable silhouette. The video is captured in the receiver's native ratio, so the frame never stretches it or manufactures empty fields.

## 24px hit targets; scale the glyph, not its button.

Keep the visual scale of every map mark while giving its button a real 24px pointer target. Scaling belongs to the glyph, not the hit area.

## Geometric arrows; resume uses a document icon.

Directional affordances use one geometric construction. Decorative Unicode arrows are intentionally absent from links, cards and labels. The resume route uses a document metaphor rather than an abstract slash.

## One optical field, shared camera and semantic colour.

Observatory layer. The map behaves as one optical instrument: a camera moves the complete field, its planes answer the pointer at different amplitudes, and colour appears only when a semantic object becomes relevant.

## Depth belongs inside the fading scene.

Project depth inside the fading scene so opacity cannot flatten and then suddenly restore a perspective inherited from outside the scene.

## Unframed reels; metadata uses MATERIAL / 01.

Reels remain unframed content. Their title and timing live in a separate registered MATERIAL / 01 readout, like an observation instrument.

## One full reel narrative and two native-rate chapters.

Reel mosaic: one complete narrative stays dominant while two source-faithful chapters loop independently at their native playback rate.

## Keep the main reel when supplementary chapters cannot fit.

Keep the complete main reel when the surrounding consoles leave no room for its two supplementary chapters.

## Section changes tint the field, never the shared material.

Section changes move the map camera and tint only the field beneath the common material. The surfaces themselves keep the exact shared recipe.

## Place the running readout above its low anchor.

The running node lives low in the field, so its readout moves above it instead of covering the active object and erasing the state cue.

## 200% text reflows in one dimension, including 320px cards.

Text enlargement keeps every content family in a one-dimensional reflow. Container inputs preserve the normal composition without letting rem-based minima become wider than a 320px card at 200% reader text size.

## Orbital horizon and radar rings provide static depth cues.

Accessibility and orbital-observatory pass. The horizon gives the field a physical lower plane; the radar rings explain distance from the origin without adding another moving or interactive layer.

## Low focus reflects inside the curved horizon.

A low map focus lights the lower plane instead of letting one screen-space halo ignore the horizon. The plane clips this broad, faint reflection to its own curved edge.

## Quiet authorship; retain role labels on mobile.

First-visit authorship stays a quiet textual coordinate. Project cards expose the role already present in the source instead of hiding it on compact views.

## Centre the search row within its 48px controls.

Keep the search row on the material's true centerline. The 48px controls must not be offset by additional block padding or desktop optical nudges.

## Touch uses direct selection, without hover labels or reels.

Compact maps use direct selection and the inspector. Floating labels and hover reels cannot share a reliable collision-free touch surface.

## Keyboard focus without persistent pointer or touch afterimages.

Pointer and touch already identify the target spatially. Keep the focus affordance for keyboard navigation without leaving tap/click afterimages.

## Safari: panels.js replaces these portrait geometry fallbacks.

Mobile framing follows the real upper edge of the lower console (panels.js supplies exact values after Safari resolves its visible viewport). These values are stable first-paint fallbacks for a tall portrait phone.

## Compact screen readout; independent author signature.

The screen readout is one compact service instrument. The author signature remains an independent corner mark, preserving the original composition.

## Composition and chronology remain independent controls.

Map composition and chronology are independent controls. The five category cells stay in the mobile dock; chronology moves to the navigation utilities.

## Only selected filters own the signal rail.

Hover identifies a target but never impersonates its selected state. The signal symbol and rail belong only to an active filter, so a click remains legible even while the pointer stays over the same row.

## All visible: signal on aggregate only; categories stay pressed.

In the complete composition the aggregate owns the visible signal. The four category controls remain semantically pressed because they still describe visible content, but repeating the same blue rail five times adds no information. Partial compositions return the signal to each included category.

## Section variants change measure, not shared shell/type/spacing.

Section variants select a reading measure; shell, type and spacing are shared.

## Tight viewports preserve authorship while freeing map space.

Tight viewports keep the author's content while returning space to the map.

## Shared popup expansion preserves each anchor.

Every popup arrives with the same short, soft expansion. Individual transform properties preserve each window's existing anchor and responsive geometry.

## Hover previews expand inside their reserved bounds.

A placed hover preview expands inside its reserved bounds. Translating the whole group during entrance would cross a neighbouring console again.

## No parent opacity: a new backdrop root breaks child glass.

Opacity on a container would turn it into a backdrop root and leave its glass children unblurred for the duration of the entrance.

## Restored reading stays still; only its header enters.

Returning to a reading position keeps that content still; only its header reappears. A fresh section continues to use the full entrance.

## While reading: inert map, hidden competing labels.

The map is a non-interactive backdrop while reading a case. Its labels must not peek out from card corners or compete with the case's own text.

## Preferences suppress optical effects before the next frame.

Preferences suppress optical content effects even before the next scroll frame.

## Reading shell stays rounded and stationary during scroll.

A reading window keeps one rounded, stationary shell in every scroll state.

## CSS owns shell measure; JS measures the live header.

Shared section shell. CSS owns the measure; JS only measures the live header.

## Inset focus ring on inner scroll viewports.

The border of an inner scrolling viewport needs an inset ring to stay visible.

## Controls grow with text; fixed rows must not overlap.

Standalone controls may grow with text; fixed row heights must not overlap.

## Map index/authorship; material on disclosed mobile surfaces.

Index: navigation and authorship are typographic coordinates on the map. Only disclosed mobile surfaces use the shared MATERIAL / 01 contract.

## Accepted map-first layout, lighter framing.

Local variant 04: the same map-first journey, with lighter framing and readable relationships.

## Changing scope keeps touch targets stationary.

Switching map scope must not move a target while the visitor taps it.

## Shared card inset 12px; introductory field inset 20px.

Keep the shared mobile card at the same 12px inset in both map modes. The introductory map field retains its own 20px inset.

## iOS: composite each moving node with its filtered artwork.

Keep each moving node and its filtered artwork in one composited layer. iOS Safari can otherwise paint the artwork at a stale offset inside the clipped field.

## Guides behind solids; connections clipped by sphere depth.

Construction guides stay behind the solid nodes. Semantic connections are depth-clipped, so only their visible foreground can cross a sphere.

## Spatial camera owns placement; no extra legacy parallax.

The spatial camera owns placement; legacy pointer parallax must not add another offset after the caption-clearance calculation.

## The field, not the inner constellation, owns this gesture.

The field owns this gesture; the inner constellation must not capture it.

## Text navigation uses alignment/proximity, without a panel.

Text navigation uses alignment and proximity without a shared panel surface.

## Work index includes overview; one mobile work entry.

The work index includes the overview; mobile keeps one primary work link.

## MATERIAL / 01 CASCADE CONTRACT: registry owns fill, border, shadow and blur.

MATERIAL / 01 CASCADE CONTRACT The registry controls the rendered material. Component rules may define geometry and type, but cannot substitute a local fill, border, shadow, or blur for an active registered interface surface.

## Hierarchy: project system, named anchors, background field.

One hierarchy across the map: project system, named anchors, background field. The existing shared type and surface tokens remain the source of UI styling.

## Preserve coordinates; quiet idle light pools only.

Keep the coordinate field and its surface, quiet only the idle light pools. Selected-point feedback remains controlled by the original map styles.

## Weight comes from lit bodies; preserve orbit hit geometry.

The project system gains weight through its lit bodies, not a larger halo. Geometry, canvas bounds and satellite hit targets stay with the native map.

