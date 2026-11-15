"""Export the major Z-Anatomy nervous structures as a registered GLB.

Run from the repository root with:
  blender --background --python scripts/export_z_anatomy_nerves.py

The source FBX is kept outside the repository in evidence/z-anatomy/.
"""

import os

import bmesh
import bpy
from mathutils import Matrix, Vector


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "evidence", "z-anatomy", "NervousSystem100.fbx")
OUTPUT = os.path.join(ROOT, "assets", "anatomy", "nerves.glb")
REFERENCE_OBJ = os.path.join(ROOT, "assets", "anatomy", "mediview_anatomy.obj")
MAX_TOTAL_TRIANGLES = 400_000
TARGET_TOTAL_TRIANGLES = 390_000


def triangle_count(obj):
    return sum(len(poly.vertices) - 2 for poly in obj.data.polygons)


def in_source_group(obj, group_name):
    current = obj
    while current:
        if current.name.lower() == group_name.lower():
            return True
        current = current.parent
    return False


def exportable_mesh(obj):
    return (
        obj.type == "MESH"
        and not obj.name.lower().endswith(".j")
        and triangle_count(obj) > 24
    )


def group_selector(group_name):
    return lambda obj: exportable_mesh(obj) and in_source_group(obj, group_name)


def brain_selector(obj):
    # This source mesh extends far below the cranial cavity and displaces the brain group.
    return (
        exportable_mesh(obj)
        and in_source_group(obj, "Brain.g")
        and obj.name.lower() != "hypothalamus"
    )


def sided_group_selector(group_name, side, excluded_group=None):
    def matches(obj):
        if not exportable_mesh(obj) or not in_source_group(obj, group_name):
            return False
        if not obj.name.lower().endswith(f".{side}"):
            return False
        return not excluded_group or not in_source_group(obj, excluded_group)

    return matches


NERVE_GROUPS = {
    "Brain": brain_selector,
    "Spinal_Cord": group_selector("Spinal cord.g"),
    "Cranial_Nerves": group_selector("Cranial nerves.g"),
    "Brachial_Plexus_L": sided_group_selector("Brachial plexus.g", "l"),
    "Brachial_Plexus_R": sided_group_selector("Brachial plexus.g", "r"),
    "Lumbar_Plexus_L": sided_group_selector("Lumbar plexus.g", "l"),
    "Lumbar_Plexus_R": sided_group_selector("Lumbar plexus.g", "r"),
    "Sacral_Plexus_L": sided_group_selector("Sacral plexus.g", "l", "Sciatic nerve.l"),
    "Sacral_Plexus_R": sided_group_selector("Sacral plexus.g", "r", "Sciatic nerve.r"),
    "Sciatic_Nerve_L": sided_group_selector("Sciatic nerve.l", "l"),
    "Sciatic_Nerve_R": sided_group_selector("Sciatic nerve.r", "r"),
}


def nerve_material(name):
    material = bpy.data.materials.new(f"{name}_Nerve")
    material.diffuse_color = (0.82, 0.72, 0.39, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = material.diffuse_color
    shader.inputs["Roughness"].default_value = 0.48
    for socket_name, value in (("Coat Weight", 0.14), ("Coat Roughness", 0.4)):
        socket = shader.inputs.get(socket_name)
        if socket:
            socket.default_value = value
    return material


def import_nerve_source():
    if not os.path.isfile(SOURCE):
        raise FileNotFoundError(
            f"Missing {SOURCE}. Download NervousSystem100.fbx from "
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
    group.data.materials.append(nerve_material(name))
    group["source"] = "Z-Anatomy, CC BY-SA 4.0"
    group["source_meshes"] = ", ".join(source_names)
    return group


def object_bounds(obj):
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return minimum, maximum


def register_brain_to_skull(brain, skull):
    brain_minimum, brain_maximum = object_bounds(brain)
    skull_minimum, skull_maximum = object_bounds(skull)
    offset = (skull_minimum.z + skull_maximum.z - brain_minimum.z - brain_maximum.z) / 2
    brain.location.z += offset
    bpy.context.view_layer.update()
    return offset


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
        raise RuntimeError(f"Nerve GLB exceeds its {MAX_TOTAL_TRIANGLES}-triangle budget: {total}.")
    return total


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    source_meshes = import_nerve_source()
    if not os.path.isfile(REFERENCE_OBJ):
        raise FileNotFoundError(f"Missing skeleton landmark reference: {REFERENCE_OBJ}.")
    bpy.ops.wm.obj_import(filepath=REFERENCE_OBJ)
    skull = bpy.data.objects.get("Skull_Cranium")
    if not skull:
        raise RuntimeError(f"The skeleton landmark reference does not contain Skull_Cranium: {REFERENCE_OBJ}.")
    frame_conversion = Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))
    groups = []
    assigned = set()
    group_sources = {
        name: [obj for obj in source_meshes if selector(obj)]
        for name, selector in NERVE_GROUPS.items()
    }

    for name, objects in group_sources.items():
        if not objects:
            raise RuntimeError(f"No source meshes matched the required nerve group {name}.")
        duplicates = assigned.intersection(obj.name for obj in objects)
        if duplicates:
            raise RuntimeError(f"Source meshes were assigned more than once: {', '.join(sorted(duplicates))}.")
        assigned.update(obj.name for obj in objects)
        groups.append(make_group(name, objects, frame_conversion))

    brain_offset = register_brain_to_skull(next(group for group in groups if group.name == "Brain"), skull)
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
    print(f"Nerve structures: {len(groups)}")
    print(f"Total triangles: {total_triangles:,} / {MAX_TOTAL_TRIANGLES:,}")
    print(f"Brain adjusted {brain_offset * 1000:.1f} mm to the skull landmark center.")
    for group in groups:
        print(f"{group.name}: {triangle_count(group):,} triangles")


if __name__ == "__main__":
    main()
