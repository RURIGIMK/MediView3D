# MediView 3D Browser Anatomy Studio

The browser viewer is in `web/`. It uses the supplied Blender scene for the
scan based skeleton and the accompanying named OBJ/MTL export for individual
organs and vessel paths. The desktop C++ application remains separate.

## Available structures

- Skeleton scan: one joined mesh from the supplied `.blend` file.
- Cardiovascular: heart, central aorta and vena cava, carotid paths, and named
  limb artery and vein paths.
- Respiratory: left and right lungs.
- Digestive: liver and stomach.
- Urinary: left and right kidneys and bladder.

Only systems represented in the supplied assets are listed. The joined scan
does not contain independently selectable bone objects. The viewer does not
invent missing muscles, nerves, reproductive organs, or other structures.
Descriptions are concise educational summaries and the supplied anatomy meshes
are schematic, not clinical segmentations.

The companion OBJ export placed its `L` objects on negative X, opposite the
project's patient-left convention. The browser reflects these named anatomy
meshes so left and right labels match the patient, while leaving the scan
skeleton unchanged. It also uses narrower, smooth tube paths for the supplied
artery and vein routes so they read as connected branches alongside the bones.
The included vessel data remains simplified and is not a complete vascular
segmentation.

## Controls

- Drag with the left mouse button to orbit; right drag or Shift + left drag to
  pan; scroll to zoom.
- Use the Front, Back, Left, Right, Top, and Bottom controls for standard views.
- Search or select an item in the structure browser, or click a mesh in the
  scene, to view its name, system, location, function, and description.
- Toggle system chips or the eye icon beside an individual structure. Right
  click a system chip to isolate that system.
- Use the opacity slider or **Isolate structure** in the information panel.
- **Measure** records the distance between two clicked points in centimetres.
- Major organs have front-view labels; selecting one replaces its label with a
  selected-structure callout. **Labels** toggles these annotations.
  **Guided tour** visits
  supplied structures. **Capture** downloads a PNG screenshot.
- **Save view** stores camera and visibility settings in the current browser;
  **Load view** restores them on that device.
- Keyboard shortcuts: `/` focuses search, `R` resets the camera, and `1`–`4`
  select Front, Back, Left, and Right views.

## Run locally

From the repository root, serve the project files with any static HTTP server.
For example, with Python installed:

```bash
python -m http.server 8000
```

Open `http://localhost:8000/web/`. The static server must serve the top-level
`assets/anatomy/` directory because the web viewer fetches its models from
`/assets/anatomy/`. A direct `file://` URL will not work because browser module
and model requests require HTTP.

## Deploy

The Render Blueprint and Vercel configuration copy the anatomy files into the
web publish directory during deployment. Connect either service to the desired
Git branch; pushes to that branch trigger updates. The viewer loads Three.js,
the Draco decoder, and fonts from public CDNs, so browsers need network access
to those hosts.

To rebuild the compressed skeleton export after changing the Blender source,
run the export script with Blender in background mode:

```bash
blender --background evidence/mediview_anatomy.blend --python scripts/export_web_anatomy.py
```

The exporter does not modify or save over the source `.blend` file.
