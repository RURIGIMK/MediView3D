"""Export the licensed Z-Anatomy organ subset as named, centered GLB meshes.

Run from the repository root with:
  blender --background --python scripts/export_z_anatomy_organs.py

The source FBXs are kept outside the repository in evidence/z-anatomy/.
"""

import math
import os

import bpy
import bmesh
from mathutils import Matrix, Vector


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = os.path.join(ROOT, "evidence", "z-anatomy")
OUTPUT = os.path.join(ROOT, "assets", "anatomy", "organs.glb")
MAX_TRIANGLES_PER_ORGAN = 60000

SOURCE_FILES = {
    "visceral": "VisceralSystem100.fbx",
    "cardiovascular": "CardioVascular41.fbx",
    "lymphoid": "LymphoidOrgans100.fbx",
}

ORGAN_GROUPS = {
    "Heart": ("cardiovascular", (
        "Right atrium", "Right ventricle", "Left atrium", "Left ventricle",
        "Inferior papillary muscle of right ventricle",
        "Anterior papillary muscle of right ventricle",
        "Septal papillary muscle of right ventricle",
        "Inferior papillary muscle of left ventricle",
    )),
    "Lung_L": ("visceral", ("Superior lobe of left lung", "Inferior lobe of left lung")),
    "Lung_R": ("visceral", (
        "Superior lobe of right lung", "Middle lobe of right lung", "Inferior lobe of right lung",
    )),
    "Liver": ("visceral", ("Liver",)),
    "Gallbladder": ("visceral", ("Gallbladder",)),
    "Stomach": ("visceral", ("Stomach",)),
    "Pancreas": ("visceral", ("Pancreas",)),
    "Spleen": ("lymphoid", ("Spleen",)),
    "Kidney_L": ("visceral", ("Kidney.l",)),
    "Kidney_R": ("visceral", ("Kidney.r",)),
    "Adrenal_L": ("visceral", ("Suprarenal gland.l",)),
    "Adrenal_R": ("visceral", ("Suprarenal gland.r",)),
    "Bladder": ("visceral", ("Urinary bladder",)),
    "Small_Intestine": ("visceral", ("Duodenum", "Jejunum")),
    "Large_Intestine": ("visceral", (
        "Ascending colon", "Transverse colon", "Descending colon", "Sigmoid colon",
    )),
    "Trachea": ("visceral", ("Trachea",)),
    "Bronchi": ("visceral", (
        "Left main bronchus", "Left superior lobar bronchus", "Left inferior lobar bronchus",
        "Right main bronchus", "Right superior lobar bronchus",
        "Right inferior lobar bronchus", "Intermediate bronchus.r", "Middle lobar bronchus.r",
    )),
    "Esophagus": ("visceral", ("Oesophagus",)),
}

MATERIALS = {
    "Heart": ((0.48, 0.075, 0.105, 1.0), 0.29, "cardiovascular"),
    "Lung_L": ((0.78, 0.34, 0.40, 1.0), 0.40, "respiratory"),
    "Lung_R": ((0.78, 0.34, 0.40, 1.0), 0.40, "respiratory"),
    "Liver": ((0.43, 0.15, 0.095, 1.0), 0.42, "digestive"),
    "Gallbladder": ((0.45, 0.46, 0.18, 1.0), 0.43, "digestive"),
    "Stomach": ((0.74, 0.36, 0.31, 1.0), 0.38, "digestive"),
    "Pancreas": ((0.75, 0.49, 0.31, 1.0), 0.43, "digestive"),
    "Spleen": ((0.48, 0.20, 0.25, 1.0), 0.42, "lymphatic"),
    "Kidney_L": ((0.52, 0.19, 0.19, 1.0), 0.37, "urinary"),
    "Kidney_R": ((0.52, 0.19, 0.19, 1.0), 0.37, "urinary"),
    "Adrenal_L": ((0.64, 0.30, 0.19, 1.0), 0.44, "endocrine"),
    "Adrenal_R": ((0.64, 0.30, 0.19, 1.0), 0.44, "endocrine"),
    "Bladder": ((0.68, 0.34, 0.30, 1.0), 0.39, "urinary"),
    "Small_Intestine": ((0.80, 0.47, 0.39, 1.0), 0.40, "digestive"),
    "Large_Intestine": ((0.67, 0.33, 0.29, 1.0), 0.42, "digestive"),
    "Trachea": ((0.76, 0.49, 0.43, 1.0), 0.40, "respiratory"),
    "Bronchi": ((0.78, 0.42, 0.39, 1.0), 0.40, "respiratory"),
    "Esophagus": ((0.77, 0.39, 0.34, 1.0), 0.42, "digestive"),
}


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.collections):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def import_source(source_name, filename):
    path = os.path.join(SOURCE_DIR, filename)
    if not os.path.isfile(path):
        raise FileNotFoundError(
            f"Missing {path}. Download {filename} from "
            "https://github.com/LluisV/Z-Anatomy/tree/PC-Version/Resources/Models/FBX "
            "and keep it in evidence/z-anatomy/."
        )
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    imported = [obj for obj in bpy.data.objects if obj not in before and obj.type == "MESH"]
    if not imported:
        raise RuntimeError(f"No meshes were imported from {path}.")
    return {obj.name: obj for obj in imported}


def tissue_material(name, color, roughness):
    material = bpy.data.materials.new(f"{name}_Tissue")
    material.diffuse_color = color
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    for socket_name, value in (("Metallic", 0.0), ("Coat Weight", 0.18), ("Coat Roughness", 0.3)):
        socket = shader.inputs.get(socket_name)
        if socket:
            socket.default_value = value
    return material


def centered_organ_mesh(name, source_objects, color, roughness, system):
    if not source_objects:
        raise RuntimeError(f"No source meshes were selected for {name}.")

    source_names = [obj.name for obj in source_objects]
    frame_conversion = Matrix.Rotation(math.pi, 4, "Z")
    for obj in source_objects:
        obj.matrix_world = frame_conversion @ obj.matrix_world

    bpy.ops.object.select_all(action="DESELECT")
    for obj in source_objects:
        obj.select_set(True)
    active = source_objects[0]
    bpy.context.view_layer.objects.active = active
    if len(source_objects) > 1:
        bpy.ops.object.join()
    organ = bpy.context.view_layer.objects.active
    organ.name = name
    organ.data.name = f"{name}_Mesh"

    organ.data.transform(organ.matrix_world.copy())
    organ.parent = None
    organ.matrix_parent_inverse = Matrix.Identity(4)
    organ.matrix_world = Matrix.Identity(4)
    bounds = [Vector((math.inf, math.inf, math.inf)), Vector((-math.inf, -math.inf, -math.inf))]
    for vertex in organ.data.vertices:
        for axis in range(3):
            bounds[0][axis] = min(bounds[0][axis], vertex.co[axis])
            bounds[1][axis] = max(bounds[1][axis], vertex.co[axis])
    center = (bounds[0] + bounds[1]) * 0.5
    for vertex in organ.data.vertices:
        vertex.co -= center

    bmesh_data = bmesh.new()
    bmesh_data.from_mesh(organ.data)
    bmesh.ops.recalc_face_normals(bmesh_data, faces=bmesh_data.faces)
    bmesh_data.to_mesh(organ.data)
    bmesh_data.free()
    organ.data.update()
    for polygon in organ.data.polygons:
        polygon.use_smooth = True
        polygon.material_index = 0
    organ.data.materials.clear()
    organ.data.materials.append(tissue_material(name, color, roughness))
    organ.location = (0.0, 0.0, 0.0)
    organ.rotation_euler = (0.0, 0.0, 0.0)
    organ.scale = (1.0, 1.0, 1.0)
    if organ.parent or any(abs(value) > 1e-6 for value in organ.location) or any(abs(value - 1.0) > 1e-6 for value in organ.scale):
        raise RuntimeError(f"{name} could not be centered at the origin with an identity transform.")
    organ["anatomy_system"] = system
    organ["source"] = "Z-Anatomy, CC BY-SA 4.0"
    organ["source_meshes"] = ", ".join(source_names)

    triangle_count = sum(len(polygon.vertices) - 2 for polygon in organ.data.polygons)
    if triangle_count > MAX_TRIANGLES_PER_ORGAN:
        modifier = organ.modifiers.new("Mobile triangle budget", "DECIMATE")
        modifier.ratio = (MAX_TRIANGLES_PER_ORGAN - 100) / triangle_count
        bpy.context.view_layer.objects.active = organ
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        triangle_count = sum(len(polygon.vertices) - 2 for polygon in organ.data.polygons)
    if triangle_count > MAX_TRIANGLES_PER_ORGAN:
        raise RuntimeError(f"{name} exceeds the {MAX_TRIANGLES_PER_ORGAN}-triangle budget: {triangle_count}.")
    return organ, triangle_count


def main():
    clear_scene()
    source_meshes = {
        name: import_source(name, filename)
        for name, filename in SOURCE_FILES.items()
    }

    exported = []
    triangle_counts = {}
    for organ_name, (source_name, mesh_names) in ORGAN_GROUPS.items():
        missing = [mesh_name for mesh_name in mesh_names if mesh_name not in source_meshes[source_name]]
        if missing:
            raise RuntimeError(f"{organ_name} is missing licensed source meshes: {', '.join(missing)}")
        source_objects = [source_meshes[source_name][mesh_name] for mesh_name in mesh_names]
        color, roughness, system = MATERIALS[organ_name]
        organ, triangles = centered_organ_mesh(
            organ_name, source_objects, color, roughness, system,
        )
        exported.append(organ)
        triangle_counts[organ_name] = triangles

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in exported:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = exported[0]
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )
    print(f"Exported {OUTPUT}")
    print("Z-Anatomy source models adapted and registered to scan landmarks at runtime.")
    for name, triangles in triangle_counts.items():
        print(f"{name}: {triangles:,} triangles")


if __name__ == "__main__":
    main()
