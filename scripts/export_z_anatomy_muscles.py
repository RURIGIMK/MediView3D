"""Export the major Z-Anatomy muscle groups as a landmark-registered GLB.

Run from the repository root with:
  blender --background --python scripts/export_z_anatomy_muscles.py

The source FBX is kept outside the repository in evidence/z-anatomy/.
"""

import os

import bmesh
import bpy
from mathutils import Matrix


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "evidence", "z-anatomy", "MuscularSystem100.fbx")
OUTPUT = os.path.join(ROOT, "assets", "anatomy", "muscles.glb")
MAX_TOTAL_TRIANGLES = 400_000
TARGET_TOTAL_TRIANGLES = 390_000


def has_side(obj, side):
    return obj.name.lower().endswith(f".{side.lower()}")


def parent_side(parent_name, side):
    return lambda obj: obj.parent and obj.parent.name == parent_name and has_side(obj, side)


def name_side(tokens, side):
    return lambda obj: has_side(obj, side) and any(token in obj.name.lower() for token in tokens)


MUSCLE_GROUPS = {
    "Neck_L": parent_side("Muscles of neck.g", "l"),
    "Neck_R": parent_side("Muscles of neck.g", "r"),
    "Pectorals_L": parent_side("Pectoralis major muscle.g", "l"),
    "Pectorals_R": parent_side("Pectoralis major muscle.g", "r"),
    "Deltoids_L": parent_side("Deltoid muscle.g", "l"),
    "Deltoids_R": parent_side("Deltoid muscle.g", "r"),
    "Biceps_L": parent_side("Biceps brachii muscle.g", "l"),
    "Biceps_R": parent_side("Biceps brachii muscle.g", "r"),
    "Triceps_L": parent_side("Triceps brachii muscle.g", "l"),
    "Triceps_R": parent_side("Triceps brachii muscle.g", "r"),
    "Forearm_L": lambda obj: obj.parent and "forearm" in obj.parent.name.lower() and has_side(obj, "l"),
    "Forearm_R": lambda obj: obj.parent and "forearm" in obj.parent.name.lower() and has_side(obj, "r"),
    "Abdominals_L": name_side(("rectus abdominis",), "l"),
    "Abdominals_R": name_side(("rectus abdominis",), "r"),
    "Obliques_L": name_side(("abdominal oblique", "transversus abdominis"), "l"),
    "Obliques_R": name_side(("abdominal oblique", "transversus abdominis"), "r"),
    "Trapezius_L": name_side(("part of trapezius muscle",), "l"),
    "Trapezius_R": name_side(("part of trapezius muscle",), "r"),
    "Latissimus_L": name_side(("latissimus dorsi muscle",), "l"),
    "Latissimus_R": name_side(("latissimus dorsi muscle",), "r"),
    "Glutes_L": lambda obj: obj.parent and "gluteal muscles" in obj.parent.name.lower() and has_side(obj, "l"),
    "Glutes_R": lambda obj: obj.parent and "gluteal muscles" in obj.parent.name.lower() and has_side(obj, "r"),
    "Quadriceps_L": name_side(("rectus femoris", "vastus "), "l"),
    "Quadriceps_R": name_side(("rectus femoris", "vastus "), "r"),
    "Hamstrings_L": name_side(("biceps femoris", "semimembranosus muscle", "semitendinosus muscle"), "l"),
    "Hamstrings_R": name_side(("biceps femoris", "semimembranosus muscle", "semitendinosus muscle"), "r"),
    "Calves_L": name_side(("gastrocnemius", "soleus muscle", "plantaris muscle"), "l"),
    "Calves_R": name_side(("gastrocnemius", "soleus muscle", "plantaris muscle"), "r"),
}


def triangle_count(obj):
    return sum(len(poly.vertices) - 2 for poly in obj.data.polygons)


def tissue_material(name):
    material = bpy.data.materials.new(f"{name}_Muscle")
    material.diffuse_color = (0.32, 0.105, 0.09, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = material.diffuse_color
    shader.inputs["Roughness"].default_value = 0.54
    for socket_name, value in (("Metallic", 0.0), ("Coat Weight", 0.12), ("Coat Roughness", 0.42)):
        socket = shader.inputs.get(socket_name)
        if socket:
            socket.default_value = value
    return material


def import_muscle_source():
    if not os.path.isfile(SOURCE):
        raise FileNotFoundError(
            f"Missing {SOURCE}. Download MuscularSystem100.fbx from "
            "https://github.com/LluisV/Z-Anatomy/tree/PC-Version/Resources/Models/FBX "
            "and keep it in evidence/z-anatomy/."
        )
    bpy.ops.import_scene.fbx(filepath=SOURCE)
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh data was imported from {SOURCE}.")
    return meshes


def bake_source_frame(obj, frame_conversion):
    obj.data = obj.data.copy()
    obj.data.transform(frame_conversion @ obj.matrix_world.copy())
    obj.parent = None
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_world = Matrix.Identity(4)


def make_group(name, source_objects, frame_conversion):
    source_names = [obj.name for obj in source_objects]
    for obj in source_objects:
        bake_source_frame(obj, frame_conversion)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in source_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = source_objects[0]
    if len(source_objects) > 1:
        bpy.ops.object.join()
    group = bpy.context.view_layer.objects.active
    group.name = name
    group.data.name = f"{name}_Mesh"
    group.parent = None
    group.matrix_parent_inverse = Matrix.Identity(4)
    group.matrix_world = Matrix.Identity(4)

    mesh = bmesh.new()
    mesh.from_mesh(group.data)
    bmesh.ops.recalc_face_normals(mesh, faces=mesh.faces)
    mesh.to_mesh(group.data)
    mesh.free()
    group.data.update()
    for polygon in group.data.polygons:
        polygon.use_smooth = True
    group.data.materials.clear()
    group.data.materials.append(tissue_material(name))
    group["source"] = "Z-Anatomy, CC BY-SA 4.0"
    group["source_meshes"] = ", ".join(source_names)
    return group


def decimate_to_budget(groups):
    raw_total = sum(triangle_count(group) for group in groups)
    ratio = min(1.0, TARGET_TOTAL_TRIANGLES / raw_total)
    if ratio < 1.0:
        for group in groups:
            modifier = group.modifiers.new("Mobile triangle budget", "DECIMATE")
            modifier.ratio = ratio
            bpy.context.view_layer.objects.active = group
            bpy.ops.object.modifier_apply(modifier=modifier.name)

    total = sum(triangle_count(group) for group in groups)
    while total > MAX_TOTAL_TRIANGLES:
        ratio = (MAX_TOTAL_TRIANGLES - 5_000) / total
        for group in groups:
            modifier = group.modifiers.new("Mobile triangle budget", "DECIMATE")
            modifier.ratio = ratio
            bpy.context.view_layer.objects.active = group
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        total = sum(triangle_count(group) for group in groups)

    if total > MAX_TOTAL_TRIANGLES:
        raise RuntimeError(f"Muscle GLB exceeds its {MAX_TOTAL_TRIANGLES}-triangle budget: {total}.")
    return total


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    source_meshes = import_muscle_source()
    frame_conversion = Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))
    groups = []
    assigned = set()
    group_sources = {
        name: [obj for obj in source_meshes if selector(obj)]
        for name, selector in MUSCLE_GROUPS.items()
    }

    for name, objects in group_sources.items():
        if not objects:
            raise RuntimeError(f"No source meshes matched the required muscle group {name}.")
        duplicates = assigned.intersection(obj.name for obj in objects)
        if duplicates:
            raise RuntimeError(f"Source meshes were assigned more than once: {', '.join(sorted(duplicates))}.")
        assigned.update(obj.name for obj in objects)
        groups.append(make_group(name, objects, frame_conversion))

    total_triangles = decimate_to_budget(groups)
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for group in groups:
        group.select_set(True)
    bpy.context.view_layer.objects.active = groups[0]
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
    print(f"Muscle groups: {len(groups)}")
    print(f"Total triangles: {total_triangles:,} / {MAX_TOTAL_TRIANGLES:,}")
    for group in groups:
        print(f"{group.name}: {triangle_count(group):,} triangles")


if __name__ == "__main__":
    main()
