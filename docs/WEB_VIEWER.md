# MediView 3D Browser Anatomy Studio

The browser viewer is in `web/`. It uses the supplied Blender scene for the
scan based skeleton and the accompanying named OBJ/MTL export for individual
organs and vessel paths. The desktop C++ application remains separate.

## Available structures

- Skeleton scan: one joined mesh from the supplied `.blend` file.
- Cardiovascular: heart, central aorta and vena cava, carotid paths, and named
  limb artery and vein paths.
- Respiratory: left and right lungs with lobes, trachea, and main/lobar bronchi.
- Digestive: liver, gallbladder, stomach, pancreas, esophagus, small intestine,
  and large intestine.
- Urinary: left and right kidneys, adrenal glands, and bladder.
- Lymphatic: spleen.
- Nervous: brain, spinal cord, cranial nerves, and left/right brachial, lumbar,
  sacral, and sciatic nerve groups.

Only systems represented in the supplied assets are listed. The joined scan
does not contain independently selectable bone objects. Small-intestine data
includes the duodenum and jejunum; the source set does not include an ileum
mesh. The muscle layer has 28 selectable left/right groups and loads on first
use. The 11-group nerve layer is off by default and loads when first enabled.
These models are educational adaptations, not clinical segmentations.

`assets/anatomy/muscles.glb` contains named neck, pectoral, deltoid, arm,
forearm, abdominal, back, gluteal, thigh, and calf groups. The layer is off by
default and includes an independent layer-opacity control; each group also
supports individual visibility, selection, details, and opacity.

Organs in `assets/anatomy/organs.glb` are adapted from Z-Anatomy CC BY-SA 4.0
meshes and exported as named Draco-compressed structures. Their left/right
convention is corrected for the viewer. Registration fits the named OBJ
reference bones to scan surface samples at the skull, clavicles, sternum,
pelvis, knees, and lower legs. Organ scale and placement are then measured from
the registered ribs, sternum, thoracic vertebrae, pelvis, and scan front/back
profiles; the organ layer no longer uses whole-body bounding-box registration.
The source reference retains negative Z for anterior and negative X for the
patient's left. Labels and metadata use the patient's perspective.

The initial camera fits the complete skeleton at a three-quarter angle, and
resizes refit that full-body framing. **Reset view** returns to the complete
skeleton. A PMREM RoomEnvironment and soft
key, fill, and rim lights shade the ivory bones. The scene uses a navy-indigo
gradient with no grid or fog. Organ labels appear only for a hovered or
selected structure, with leader lines. Vessel paths remain simplified and are
not a complete vascular segmentation; they are outside the organ asset export.

## Controls

- Drag with the left mouse button to orbit; right drag or Shift + left drag to
  pan; scroll to zoom.
- Use Full body, Front, Back, Left, Right, Top, and Bottom controls for standard
  views; `5` selects the full-body framing.
- Search or select an item in the structure browser, or click a mesh in the
  scene, to view its name, system, location, function, and description.
- Toggle system chips or the eye icon beside an individual structure. Right
  click a system chip to isolate that system.
- Use the opacity slider or **Isolate structure** in the information panel.
- **Measure** records the distance between two clicked points in centimetres.
- Major organs show a leader-line label on hover or selection. **Labels**
  toggles annotations.
  **Guided tour** visits
  supplied structures. **Capture** downloads a PNG screenshot.
- **Save view** stores camera and visibility settings in the current browser;
  **Load view** restores them on that device.
- Keyboard shortcuts: `/` focuses search, `R` resets the camera, `1`–`4`
  select Front, Back, Left, and Right views, and `5` selects Full body.

## Run locally

From the repository root, serve the project files with any static HTTP server.
For example:

```bash
python -m http.server 8000
```

Open `http://localhost:8000/web/`. The server must also serve the top-level
`assets/anatomy/` directory because the viewer fetches its models from
`/assets/anatomy/`. A direct `file://` URL will not work because browser module
and model requests require HTTP.

## Regenerate organ assets

The organ exporter requires these upstream files under `evidence/z-anatomy/`:

- `VisceralSystem100.fbx`
- `CardioVascular41.fbx`
- `LymphoidOrgans100.fbx`

Download them from the Z-Anatomy PC-Version FBX model directory linked in
[`ATTRIBUTION.md`](ATTRIBUTION.md). They are ignored by Git and are only needed
to regenerate the committed `assets/anatomy/organs.glb`. Run:

```bash
blender --background --python scripts/export_z_anatomy_organs.py
```

The exporter checks that every named source mesh exists and that each final
organ is at or below 60,000 triangles. The GLB is Draco-compressed. Its
Z-Anatomy-derived content is licensed CC BY-SA 4.0; see
[`ATTRIBUTION.md`](ATTRIBUTION.md).

## Regenerate muscle assets

The muscle exporter additionally requires `MuscularSystem100.fbx` from the
same upstream directory in `evidence/z-anatomy/`. It groups the major source
muscles into 28 selectable left/right structures and writes
`assets/anatomy/muscles.glb`:

```bash
blender --background --python scripts/export_z_anatomy_muscles.py
```

The exporter enforces a 400,000-triangle total budget and Draco-compresses the
GLB. The browser only requests this asset when the muscle layer is first shown.
The source FBX is ignored by Git; licensing and attribution are in
[`ATTRIBUTION.md`](ATTRIBUTION.md).

## Regenerate nerve assets

The nerve exporter requires `NervousSystem100.fbx` from the same upstream
directory in `evidence/z-anatomy/`. It groups the brain, spinal cord, cranial
nerves, and paired brachial, lumbar, sacral, and sciatic structures into
`assets/anatomy/nerves.glb`:

```bash
blender --background --python scripts/export_z_anatomy_nerves.py
```

The exporter enforces a 400,000-triangle total budget and Draco-compresses the
GLB. The browser only requests it when the nerve layer is first shown. The
brain is centered to the named skull landmark; the other structures retain
their shared landmark registration to the scan. The source FBX is ignored by
Git; licensing and attribution are in
[`ATTRIBUTION.md`](ATTRIBUTION.md).

## Deploy

The Render Blueprint and Vercel configuration copy the anatomy files into the
web publish directory during deployment, including the lazy-loaded
`muscles.glb` and `nerves.glb`.
Connect either service to the desired Git branch; pushes to that branch trigger
updates. The viewer loads Three.js,
the Draco decoder, and fonts from public CDNs, so browsers need network access
to those hosts.

To rebuild the compressed skeleton export after changing the Blender source,
run the export script with Blender in background mode:

```bash
blender --background evidence/mediview_anatomy.blend --python scripts/export_web_anatomy.py
```

The exporter does not modify or save over the source `.blend` file.
