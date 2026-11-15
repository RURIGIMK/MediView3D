# Anatomy asset attribution

## Z-Anatomy anatomy models

The browser organ asset `assets/anatomy/organs.glb` adapts models from the
[Z-Anatomy PC-Version FBX directory](https://github.com/LluisV/Z-Anatomy/tree/PC-Version/Resources/Models/FBX).
The upstream project distributes these models under
[Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).
The upstream PC-Version README identifies Lluís Vinent Juanico as the PC app
author, attributes its anatomy models to the Z-Anatomy project, and lists
Gauthier Kervyn among contributors.

The exporter uses these original filenames:

| Source filename | Local source path |
| --- | --- |
| `VisceralSystem100.fbx` | `evidence/z-anatomy/VisceralSystem100.fbx` |
| `CardioVascular41.fbx` | `evidence/z-anatomy/CardioVascular41.fbx` |
| `LymphoidOrgans100.fbx` | `evidence/z-anatomy/LymphoidOrgans100.fbx` |
| `MuscularSystem100.fbx` | `evidence/z-anatomy/MuscularSystem100.fbx` |
| `NervousSystem100.fbx` | `evidence/z-anatomy/NervousSystem100.fbx` |

These source files are intentionally ignored by Git. To reproduce the browser
assets, download the required files from the linked upstream directory and run
the corresponding exporters in `scripts/`.

Changes made for MediView3D: selected structures were grouped into separately
selectable organs, left/right muscle groups, and major nervous-system
structures; mirrored to match the viewer's patient-left/right convention;
centered or landmark-registered to the Artec scan; recolored with PBR
materials; decimated; and exported as Draco-compressed glTF. The
small-intestine group contains the available duodenum and jejunum meshes; no
ileum mesh is included in this source subset. The muscle export contains 28
named groups; the nerve export contains 11 named groups. Both layer assets are
capped at 400,000 triangles total. This attribution applies to the
Z-Anatomy-derived content in `organs.glb`, `muscles.glb`, and `nerves.glb`.
Redistributions of that adapted content must retain attribution and use
CC BY-SA 4.0 or a compatible license.

## Artec skeleton scan

The viewer continues to use the supplied scan-based skeleton asset. Its
original source and CC BY 3.0 attribution are recorded in
[`assets/skeleton/ATTRIBUTION.txt`](../assets/skeleton/ATTRIBUTION.txt); this
organ update does not modify that asset.
