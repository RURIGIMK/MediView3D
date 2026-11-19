# MediView 3D Browser Anatomy Studio

The browser viewer is in `web/`. It uses the prepared Artec scan, named
Z-Anatomy organ, muscle, and nerve assets, and an OBJ reference for bone
landmarks and generated vessel paths. The desktop C++ application remains
separate.

## Available structures and limits

- One joined scan-based skeleton mesh. Individual scan bones are not selectable.
- Eighteen named organ groups: heart, left/right lungs, liver, gallbladder,
  stomach, pancreas, spleen, left/right kidneys and adrenal glands, bladder,
  small and large intestines, trachea, bronchi, and esophagus.
- Twelve simplified, generated artery and vein groups. These are teaching
  paths, not a complete vascular segmentation.
- Twenty-eight selectable left/right muscle groups.
- Eleven nerve groups: brain, spinal cord, cranial nerves, paired brachial,
  lumbar, and sacral plexuses, and paired sciatic nerves.

The small-intestine source subset includes duodenum and jejunum, not ileum.
The nerve subset does not contain femoral nerves. There is no skin mesh or
separate superficial/deep muscle asset. These models are educational
adaptations, not clinical segmentations.

## Registration measurements

The browser skeleton is exported from `assets/skeleton/skeleton_prepared.ply`,
the already straightened scan with the display rod removed. Its measured bounds
are 0.3590 × 1.7130 × 0.2252 m.

The OBJ reference bones are registered to sampled scan vertices with one
similarity transform: uniform scale, rotation, and translation. A robust
median/MAD filter rejects inconsistent landmarks. The accepted fit is **19.6
mm RMS, 25.1 mm maximum**. The pelvis and both clavicles are outliers and are
excluded from those error values.

Organs are positioned and sized from the registered rib cage, sternum,
vertebral and pelvic landmarks, and scan depth measurements. Muscles and
nerves share a measured Z-Anatomy Y-up frame, aligned using its documented
1.78 m standing height, the scan's 1.713 m height, and the registered scan
orientation. This uses one uniform scale; no axis-specific scaling or arm
bending is applied.

The source forearm muscles reach about ±0.33 m while the scan arms stay within
about ±0.18 m. The arm silhouette mismatch remains and needs a matching source
asset. The lumbar plexus source groups also differ in vertical extent; the
viewer preserves their source geometry instead of mirroring them. These
limitations remain visible in the model and are not presented as corrected.

## Modes and controls

The view selector provides Complete, Muscular, Skeletal, Internal organs,
Nervous, Cardiovascular, Transparent muscle, and Deep anatomy modes. Skin is
marked unavailable because the project has no skin asset. Transparent muscle
uses alpha blending with depth writes disabled so internal structures remain
inspectable. The optional **Cutaway** control enables an anterior clipping
plane. Layer changes do not refit or move the camera. The camera fits the full
skeleton initially and on resize; **Reset view** restores that framing.

- Drag to orbit; right-drag or Shift + left-drag to pan; scroll to zoom.
- Use Full body, Front, Back, Left, Right, Top, and Bottom camera presets.
- Search or select a structure to view its details; click a visible mesh to
  select it.
- Toggle a layer, system, or individual structure; right-click a system chip
  to isolate that system.
- Adjust structure opacity or isolate a selected structure.
- **Measure** records a distance in centimetres. **Labels** toggles labels.
- **Guided tour** visits supplied structures. **Capture** saves a PNG.
- **Save view** and **Load view** store visibility and camera state locally.
- Keyboard shortcuts: `/` focuses search, `R` resets the camera, `1`–`4`
  select Front, Back, Left, and Right views, and `5` selects Full body.

Layer status reports loaded, visible, and failed structure counts. It also
shows the reference and Z-Anatomy registration errors. Lazy-loaded muscles and
nerves are counted only after their meshes have arrived.

## Run locally

From the repository root, serve the files with a static HTTP server:

```bash
python -m http.server 8000
```

Open `http://localhost:8000/web/`. The server must also expose the top-level
`assets/anatomy/` directory. `file://` URLs do not support the module and
asset requests used by the viewer. Three.js 0.160.0 and its Draco decoder are
vendored under `web/vendor/three/`; the viewer does not request them from a
CDN.

## Browser acceptance checks

With Python Playwright and its Chromium browser installed, capture the twelve
1920 × 1080 layer and close-up views, four responsive viewport checks, browser
console status, registration values, and centroid comparisons with:

```bash
python scripts/capture_web_acceptance.py
```

Images and JSON measurements are written to `docs/acceptance/`. The capture
waits for all 70 named structures and checks that each structure's world
centroid remains within 1 mm across views.

## Regenerate anatomy assets

The Z-Anatomy source FBXs listed in [`ATTRIBUTION.md`](ATTRIBUTION.md) are
ignored by Git and belong under `evidence/z-anatomy/`. With Blender installed,
run the exporters from the repository root:

```bash
blender --background --python scripts/export_z_anatomy_organs.py
blender --background --python scripts/export_z_anatomy_muscles.py
blender --background --python scripts/export_z_anatomy_nerves.py
```

The organ exporter caps each organ at 60,000 triangles. Muscle and nerve assets
are each capped at 400,000 triangles and use Draco compression. Preserve
Z-Anatomy CC BY-SA 4.0 attribution when redistributing these adaptations.

The prepared skeleton GLB is rebuilt from the cleaned PLY with:

```bash
python scripts/export_web_anatomy.py
```

This exporter leaves the PLY and supplied Blender evidence untouched.

## Deploy

The Render Blueprint and Vercel configuration publish the browser viewer and
copy all anatomy assets into the web output. Connect the desired Git branch;
pushes to that branch trigger a deployment. The C++ desktop application stays
a separate application target.
