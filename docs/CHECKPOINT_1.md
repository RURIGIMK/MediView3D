# Checkpoint 1 — Technical Foundation and Visual Prototype

## Scope

The checkpoint demonstrates standard C++ graphics algorithms for line drawing, polygon clipping and filling, circles and ellipses, and Bézier/spline curves. The current desktop prototype also introduces a schematic 3D anatomy scene rendered with OpenGL. The algorithms calculate their results independently of OpenGL; OpenGL displays the prototype.

## Acceptance checklist

- [ ] Configure and build the C++ targets with CMake.
- [ ] Run CTest and capture the actual passing output.
- [ ] Confirm DDA and Bresenham line implementations are present in source.
- [ ] Confirm Sutherland–Hodgman polygon clipping and scanline filling are present in source.
- [ ] Confirm midpoint circle and ellipse implementations are present in source.
- [ ] Confirm cubic Bézier and Catmull–Rom spline implementations are present in source.
- [ ] Build and run the updated OpenGL anatomy prototype.
- [ ] Demonstrate mouse rotation, zoom, and layer toggles.
- [ ] Capture genuine screenshots of the running prototype and test output.
- [ ] Verify README, source files, commit history and issues are accessible to the lecturer.
- [ ] Submit one Google Form for the group.

## Suggested evidence

1. The full application window with the 3D anatomy prototype and interface visible.
2. A view with the organ or vessel layer toggled off.
3. A rotated or zoomed anatomy view.
4. Terminal output from the successful CMake build.
5. Terminal output from CTest.
6. Source-code views showing the graphics algorithms, if the checkpoint requires implementation evidence beyond test output.

Capture screenshots from the real running program and terminal. Do not use mock-ups as implementation evidence. Save the genuine screenshots in `evidence/` if required by the submission instructions.

## Current boundary

The anatomy is a procedural schematic, not a medically accurate model. Anatomical structures are not individually selectable and have no linked educational descriptions yet. Imported medical meshes, ray-cast selection, animation/effects and true 3D cross-section clipping remain future work. The current anatomy UI prioritises the 3D product direction; the algorithm implementations remain in the source and test targets, but the current main window no longer displays the original multi-panel 2D algorithm gallery.
