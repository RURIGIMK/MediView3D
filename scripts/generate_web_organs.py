"""Generate the named, low-poly organ models used by the web viewer.

Run from the repository root with:
  blender --background --python scripts/generate_web_organs.py

The meshes use the same metre-scale, Y-up coordinates as
assets/anatomy/mediview_anatomy.obj. No source .blend file is required.
"""

import math
import os

import bpy
from mathutils import Vector


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(ROOT, "assets", "anatomy", "organs.glb")
TAU = math.tau
HEART_CENTER = (-0.03, 1.20, -0.078)
HEART_RADII = (0.064, 0.083, 0.064)


def target_to_blender(point):
    x, y, z = point
    return (x, -z, y)


def surface_color(base, point, amplitude=0.015):
    x, y, z = point
    grain = (
        math.sin(x * 43.0 + z * 31.0)
        * math.sin(y * 39.0 - z * 27.0)
        + 0.45 * math.sin((x + y + z) * 61.0)
    )
    factor = 1.0 + amplitude * grain
    return tuple(max(0.0, min(1.0, component * factor)) for component in base) + (1.0,)


def organ_material(name, base, roughness):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*base, 1.0)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    shader = nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    for socket_name, value in (("Metallic", 0.0), ("Specular IOR Level", 0.32),
                               ("Coat Weight", 0.12), ("Coat Roughness", 0.34)):
        socket = shader.inputs.get(socket_name)
        if socket:
            socket.default_value = value
    vertex_color = nodes.new("ShaderNodeVertexColor")
    vertex_color.layer_name = "TissueTint"
    material.node_tree.links.new(vertex_color.outputs["Color"], shader.inputs["Base Color"])
    return material


def create_mesh(name, vertices, faces, base_color, roughness=0.4, parent=None):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata([target_to_blender(vertex) for vertex in vertices], [], faces)
    mesh.update()
    color_layer = mesh.color_attributes.new(name="TissueTint", type="FLOAT_COLOR", domain="POINT")
    color_layer.data.foreach_set(
        "color",
        [
            component
            for vertex in vertices
            for component in surface_color(base_color, vertex)
        ],
    )
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    obj.data.materials.append(organ_material(f"{name}_Tissue", base_color, roughness))
    obj["anatomy_system"] = "Organs"
    obj["structure_key"] = name
    return obj


def uv_surface(center, radii, segments, stacks, deform):
    vertices = []
    faces = []
    for row in range(stacks + 1):
        latitude = math.pi * row / stacks
        vertical = math.cos(latitude)
        ring = math.sin(latitude)
        for column in range(segments):
            angle = TAU * column / segments
            nx, nz = math.cos(angle), math.sin(angle)
            point = deform(center, radii, nx, vertical, nz, ring)
            vertices.append(point)
    for row in range(stacks):
        for column in range(segments):
            current = row * segments + column
            next_column = row * segments + (column + 1) % segments
            faces.append((current, next_column, next_column + segments, current + segments))
    return vertices, faces


def lung_mesh(side):
    center_x = 0.115 if side == "R" else -0.115
    center = (center_x, 1.22, -0.05)
    radii = (0.074, 0.15, 0.073)

    def deform(origin, extent, nx, ny, nz, ring):
        x0, y0, z0 = origin
        rx, ry, rz = extent
        x = x0 + rx * ring * nx * (1.0 - 0.14 * ny)
        y = y0 + ry * ny
        z = z0 + rz * ring * nz * (1.0 - 0.08 * ny)
        front = max(0.0, -nz)
        fissures = []
        if side == "R":
            fissures = (ny - (0.04 + 0.18 * nx), ny - (-0.31 + 0.5 * abs(nx)))
        else:
            fissures = (ny - (-0.08 + 0.4 * abs(nx)),)
        groove = sum(math.exp(-((distance / 0.045) ** 2)) for distance in fissures)
        radial = 1.0 - 0.11 * groove * (0.3 + 0.7 * front)
        if side == "L":
            notch = math.exp(
                -(((nx - 0.72) / 0.24) ** 2)
                -(((ny - 0.02) / 0.32) ** 2)
                -(((nz + 0.65) / 0.42) ** 2)
            )
            radial *= 1.0 - 0.34 * notch
        micro = 0.0007 * math.sin(19.0 * nx + 7.0 * ny) * math.sin(11.0 * nz - 4.0 * ny)
        radial += micro * ring
        return (x0 + (x - x0) * radial, y, z0 + (z - z0) * radial)

    return uv_surface(center, radii, 112, 72, deform)


def heart_mesh():
    center = HEART_CENTER
    radius_x, radius_y, radius_z = HEART_RADII
    outline = heart_outline()

    vertices = []
    faces = []
    depth_steps = 48
    for depth_index in range(depth_steps + 1):
        depth = -1.0 + 2.0 * depth_index / depth_steps
        profile = max(0.0001, 1.0 - depth * depth) ** 0.36
        for nx, ny in outline:
            apex_shift = -0.008 * max(0.0, -ny) ** 1.4
            micro = 0.0002 * math.sin(nx * 31.0 + ny * 27.0) * profile
            vertices.append((
                center[0] + radius_x * nx * profile + apex_shift * profile,
                center[1] + radius_y * ny * profile,
                center[2] + radius_z * depth + micro,
            ))
    for layer in range(depth_steps):
        for column in range(len(outline)):
            a = layer * len(outline) + column
            b = layer * len(outline) + (column + 1) % len(outline)
            faces.append((a, b, b + len(outline), a + len(outline)))
    return vertices, faces, outline


def heart_outline(samples=192):
    outline = []
    for index in range(samples):
        angle = TAU * index / samples
        x = 16.0 * math.sin(angle) ** 3 / 16.0
        y = (
            13.0 * math.cos(angle)
            - 5.0 * math.cos(2.0 * angle)
            - 2.0 * math.cos(3.0 * angle)
            - math.cos(4.0 * angle)
        ) / 17.0
        outline.append((x, y))
    return outline


def point_inside_outline(x, y, outline):
    inside = False
    previous_x, previous_y = outline[-1]
    for current_x, current_y in outline:
        if (current_y > y) != (previous_y > y):
            crossing_x = (previous_x - current_x) * (y - current_y) / (previous_y - current_y) + current_x
            if x < crossing_x:
                inside = not inside
        previous_x, previous_y = current_x, current_y
    return inside


def heart_front_surface_z(x, y, outline):
    nx = (x - HEART_CENTER[0]) / HEART_RADII[0]
    ny = (y - HEART_CENTER[1]) / HEART_RADII[1]
    if not point_inside_outline(nx, ny, outline):
        return HEART_CENTER[2]
    low, high = 0.0001, 1.0
    for _ in range(24):
        scale = (low + high) * 0.5
        if point_inside_outline(nx / scale, ny / scale, outline):
            high = scale
        else:
            low = scale
    depth = math.sqrt(max(0.0, 1.0 - high ** (1.0 / 0.36)))
    return HEART_CENTER[2] - HEART_RADII[2] * depth - 0.0005


def heart_chamber_grooves(outline):
    paths = (
        ((-0.045, 1.232), (-0.025, 1.238), (-0.002, 1.231), (0.02, 1.225)),
        ((-0.012, 1.225), (-0.018, 1.201), (-0.03, 1.174), (-0.044, 1.145)),
        ((-0.012, 1.225), (0.003, 1.203), (0.014, 1.18), (0.025, 1.151)),
    )
    parts = []
    for path in paths:
        points = [(x, y, heart_front_surface_z(x, y, outline)) for x, y in path]
        parts.append(swept_tube(points, [0.0014, 0.0017, 0.0015, 0.0008], radial_segments=8, steps_per_segment=8))
    return merge_mesh_data(*parts)


def liver_mesh():
    center = (0.07, 1.02, -0.073)

    def deform(origin, extent, nx, ny, nz, ring):
        x0, y0, z0 = origin
        rx, ry, rz = extent
        lobe = 1.0 + 0.21 * nx
        x = x0 + rx * ring * nx * lobe
        y = y0 + ry * ny * (0.88 if ny < 0.0 else 1.0)
        z = z0 + rz * ring * nz * (1.0 - 0.1 * nx)
        cleft = math.exp(-(((x + 0.012) / 0.014) ** 2) -(((ny - 0.8) / 0.22) ** 2))
        indent = 1.0 - 0.15 * cleft
        return (x0 + (x - x0) * indent, y, z0 + (z - z0) * indent)

    return uv_surface(center, (0.112, 0.073, 0.085), 128, 64, deform)


def catmull_rom(points, steps_per_segment):
    sampled = []
    for segment in range(len(points) - 1):
        p0 = points[max(0, segment - 1)]
        p1 = points[segment]
        p2 = points[segment + 1]
        p3 = points[min(len(points) - 1, segment + 2)]
        for step in range(steps_per_segment):
            t = step / steps_per_segment
            t2, t3 = t * t, t * t * t
            sampled.append(tuple(
                0.5 * (
                    2.0 * p1[axis]
                    + (-p0[axis] + p2[axis]) * t
                    + (2.0 * p0[axis] - 5.0 * p1[axis] + 4.0 * p2[axis] - p3[axis]) * t2
                    + (-p0[axis] + 3.0 * p1[axis] - 3.0 * p2[axis] + p3[axis]) * t3
                )
                for axis in range(len(p1))
            ))
    sampled.append(points[-1])
    return sampled


def swept_tube(points, radii, radial_segments=16, steps_per_segment=10):
    control = [(*point, radius) for point, radius in zip(points, radii)]
    samples = catmull_rom(control, steps_per_segment)
    vertices, faces = [], []
    for index, sample in enumerate(samples):
        position = Vector(sample[:3])
        tangent = Vector(samples[min(index + 1, len(samples) - 1)][:3]) - Vector(
            samples[max(0, index - 1)][:3]
        )
        tangent.normalize()
        reference = Vector((0.0, 0.0, 1.0))
        if abs(tangent.dot(reference)) > 0.92:
            reference = Vector((0.0, 1.0, 0.0))
        normal = tangent.cross(reference).normalized()
        binormal = tangent.cross(normal).normalized()
        for ring_index in range(radial_segments):
            angle = TAU * ring_index / radial_segments
            offset = (
                normal * math.cos(angle) + binormal * math.sin(angle)
            ) * sample[3]
            vertices.append(tuple(position + offset))
    for row in range(len(samples) - 1):
        for column in range(radial_segments):
            a = row * radial_segments + column
            b = row * radial_segments + (column + 1) % radial_segments
            faces.append((a, b, b + radial_segments, a + radial_segments))
    return vertices, faces


def merge_mesh_data(*parts):
    vertices, faces = [], []
    for part_vertices, part_faces in parts:
        offset = len(vertices)
        vertices.extend(part_vertices)
        faces.extend(tuple(index + offset for index in face) for face in part_faces)
    return vertices, faces


def stomach_mesh():
    path = [
        ((-0.045, 1.078, -0.073), 0.007, 0.009),
        ((-0.070, 1.055, -0.073), 0.019, 0.020),
        ((-0.105, 1.037, -0.073), 0.040, 0.043),
        ((-0.137, 1.010, -0.073), 0.050, 0.052),
        ((-0.128, 0.971, -0.073), 0.042, 0.046),
        ((-0.091, 0.952, -0.073), 0.032, 0.036),
        ((-0.050, 0.963, -0.073), 0.021, 0.026),
        ((-0.023, 0.988, -0.073), 0.010, 0.013),
    ]
    samples = catmull_rom(
        [(*center, rx, rz) for center, rx, rz in path],
        steps_per_segment=10,
    )
    vertices, faces = [], []
    radial_segments = 64
    for index, sample in enumerate(samples):
        center = Vector(sample[:3])
        tangent = Vector(samples[min(index + 1, len(samples) - 1)][:3]) - Vector(
            samples[max(0, index - 1)][:3]
        )
        tangent.normalize()
        normal = Vector((-tangent.y, tangent.x, 0.0)).normalized()
        rx, rz = sample[3], sample[4]
        for column in range(radial_segments):
            angle = TAU * column / radial_segments
            point = center + normal * (rx * math.cos(angle)) + Vector((0, 0, rz * math.sin(angle)))
            vertices.append(tuple(point))
    for row in range(len(samples) - 1):
        for column in range(radial_segments):
            a = row * radial_segments + column
            b = row * radial_segments + (column + 1) % radial_segments
            faces.append((a, b, b + radial_segments, a + radial_segments))
    return vertices, faces


def kidney_mesh(side):
    center = (-0.08, 0.92, 0.022) if side == "L" else (0.08, 0.92, 0.022)
    medial_sign = 1.0 if side == "L" else -1.0

    def deform(origin, extent, nx, ny, nz, ring):
        x0, y0, z0 = origin
        rx, ry, rz = extent
        medial = medial_sign * nx
        hilum = math.exp(-(((medial - 0.73) / 0.2) ** 2) -((ny / 0.28) ** 2))
        hilum *= max(0.0, -nz) ** 1.5
        radial = ring * (1.0 - 0.4 * hilum)
        x = x0 + rx * radial * nx * (1.0 + 0.12 * ny)
        y = y0 + ry * ny
        z = z0 + rz * radial * nz
        return (x, y, z)

    return uv_surface(center, (0.047, 0.068, 0.034), 96, 64, deform)


def bladder_mesh():
    center = (0.0, 0.68, -0.075)

    def deform(origin, extent, nx, ny, nz, ring):
        x0, y0, z0 = origin
        rx, ry, rz = extent
        taper = 0.72 + 0.28 * max(0.0, ny + 0.2)
        x = x0 + rx * ring * nx * taper
        y = y0 + ry * ny
        z = z0 + rz * ring * nz * taper
        return (x, y, z)

    return uv_surface(center, (0.056, 0.055, 0.049), 96, 64, deform)


def gallbladder_mesh():
    center = (0.145, 0.963, -0.144)

    def deform(origin, extent, nx, ny, nz, ring):
        x0, y0, z0 = origin
        rx, ry, rz = extent
        taper = 0.66 + 0.34 * max(0.0, -ny + 0.12)
        return (x0 + rx * ring * nx * taper, y0 + ry * ny, z0 + rz * ring * nz * taper)

    return uv_surface(center, (0.014, 0.03, 0.014), 48, 36, deform)


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)

    colors = {
        "Lung_L": (0.58, 0.29, 0.34),
        "Lung_R": (0.58, 0.29, 0.34),
        "Heart": (0.43, 0.055, 0.09),
        "Liver": (0.35, 0.105, 0.065),
        "Stomach": (0.59, 0.27, 0.23),
        "Kidney_L": (0.39, 0.105, 0.12),
        "Kidney_R": (0.39, 0.105, 0.12),
        "Bladder": (0.57, 0.25, 0.22),
    }

    for name in ("Lung_L", "Lung_R"):
        vertices, faces = lung_mesh(name[-1])
        create_mesh(name, vertices, faces, colors[name], roughness=0.43)

    heart, heart_faces, outline = heart_mesh()
    aorta, aorta_faces = swept_tube(
        [(-0.02, 1.265, -0.075), (-0.018, 1.30, -0.075), (-0.005, 1.33, -0.075),
         (0.012, 1.345, -0.075), (0.025, 1.33, -0.075)],
        [0.018, 0.016, 0.015, 0.014, 0.012],
        radial_segments=20,
    )
    pulmonary, pulmonary_faces = swept_tube(
        [(-0.045, 1.255, -0.105), (-0.035, 1.29, -0.11), (-0.015, 1.315, -0.11),
         (0.015, 1.325, -0.105)],
        [0.014, 0.012, 0.011, 0.009],
        radial_segments=16,
    )
    heart_vertices, heart_faces = merge_mesh_data(
        (heart, heart_faces),
        (aorta, aorta_faces),
        (pulmonary, pulmonary_faces),
    )
    heart_obj = create_mesh("Heart", heart_vertices, heart_faces, colors["Heart"], roughness=0.31)
    groove_vertices, groove_faces = heart_chamber_grooves(outline)
    create_mesh(
        "Heart_ChamberGrooves", groove_vertices, groove_faces, (0.24, 0.025, 0.045),
        roughness=0.38, parent=heart_obj,
    )
    heart_obj["anatomy_detail"] = "Heart form with chamber grooves, ascending aortic and pulmonary trunks"

    vertices, faces = liver_mesh()
    liver_obj = create_mesh("Liver", vertices, faces, colors["Liver"], roughness=0.39)
    vertices, faces = gallbladder_mesh()
    create_mesh("Gallbladder", vertices, faces, (0.24, 0.31, 0.11), roughness=0.46, parent=liver_obj)
    duct_vertices, duct_faces = swept_tube(
        [(0.145, 0.988, -0.144), (0.13, 1.001, -0.14), (0.11, 1.012, -0.135)],
        [0.0024, 0.0018, 0.0008],
        radial_segments=8,
    )
    create_mesh("Gallbladder_Duct", duct_vertices, duct_faces, (0.28, 0.34, 0.14), roughness=0.46, parent=liver_obj)
    vertices, faces = stomach_mesh()
    create_mesh("Stomach", vertices, faces, colors["Stomach"], roughness=0.38)
    for name in ("Kidney_L", "Kidney_R"):
        vertices, faces = kidney_mesh(name[-1])
        create_mesh(name, vertices, faces, colors[name], roughness=0.37)
    vertices, faces = bladder_mesh()
    create_mesh("Bladder", vertices, faces, colors["Bladder"], roughness=0.38)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects["Heart"]
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    print("Exported", OUTPUT)
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            print(obj.name, "triangles=", len(obj.data.polygons))


if __name__ == "__main__":
    main()
