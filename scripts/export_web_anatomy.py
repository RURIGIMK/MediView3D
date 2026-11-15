"""Export the supplied Blender scan as an optimized, meter-scale glTF binary.

Run from the repository root with:
  blender --background evidence/mediview_anatomy.blend --python scripts/export_web_anatomy.py
The source .blend is read only. The decimated mesh and material are created in
the in-memory scene and written to assets/anatomy/skeleton_scan.glb.
"""

import bpy
import os


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(ROOT, "assets", "anatomy", "skeleton_scan.glb")
SOURCE = bpy.context.scene.objects.get("Human skeleton")
if SOURCE is None or SOURCE.type != "MESH":
    raise RuntimeError("Expected a mesh object named 'Human skeleton' in the source scene")

os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)

# Duplicate first so the supplied Blender file is never modified on disk.
mesh_object = SOURCE.copy()
mesh_object.data = SOURCE.data.copy()
mesh_object.name = "Skeleton_Scan"
bpy.context.collection.objects.link(mesh_object)

# Source scan coordinates are millimetres, with Z up. Center the body and
# convert to metres; glTF export converts Blender's Z-up scene to glTF Y-up.
world_vertices = [SOURCE.matrix_world @ vertex.co for vertex in SOURCE.data.vertices]
bounds_min = [min(vertex[axis] for vertex in world_vertices) for axis in range(3)]
bounds_max = [max(vertex[axis] for vertex in world_vertices) for axis in range(3)]
center = [(bounds_min[axis] + bounds_max[axis]) * 0.5 for axis in range(3)]
mesh_object.location = tuple(-value * 0.001 for value in center)
mesh_object.scale = (0.001, 0.001, 0.001)
bpy.context.view_layer.objects.active = mesh_object
mesh_object.select_set(True)
SOURCE.select_set(False)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Keep a high-detail scan while reducing the source's 2.74M faces for browsers.
decimate = mesh_object.modifiers.new("Web mesh optimization", "DECIMATE")
decimate.ratio = min(1.0, 700000 / max(1, len(mesh_object.data.polygons)))
decimation_ratio = decimate.ratio
bpy.ops.object.modifier_apply(modifier=decimate.name)

material = bpy.data.materials.new("Scan Bone")
material.diffuse_color = (0.78, 0.82, 0.86, 1.0)
material.use_nodes = True
principled = material.node_tree.nodes.get("Principled BSDF")
if principled:
    principled.inputs["Base Color"].default_value = (0.78, 0.82, 0.86, 1.0)
    principled.inputs["Roughness"].default_value = 0.72
mesh_object.data.materials.clear()
mesh_object.data.materials.append(material)
mesh_object["anatomy_system"] = "Skeleton"
mesh_object["source"] = "Provided MediView3D Blender anatomy scene"
mesh_object["source_face_count"] = len(SOURCE.data.polygons)

# Export only the optimized scan object; organs use the authored GLB and the
# companion OBJ supplies landmark objects for browser-generated vessel paths.
bpy.ops.object.select_all(action="DESELECT")
mesh_object.select_set(True)
bpy.context.view_layer.objects.active = mesh_object
bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_texcoords=False,
    export_normals=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
)
print("Exported", OUTPUT, "faces=", len(mesh_object.data.polygons), "ratio=", decimation_ratio)
