"""Export the cleaned, straightened prepared PLY as an uncompressed GLB.

Run from the repository root with:
  python scripts/export_web_anatomy.py

The prepared scan is already de-leaned and has the display stand removed.
This exporter centres its measured bounds, converts metres from Z-up to glTF's
Y-up coordinates, calculates vertex normals, and writes a self-contained GLB.
"""

import argparse
import json
import struct
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "assets" / "skeleton" / "skeleton_prepared.ply"
DEFAULT_OUTPUT = ROOT / "assets" / "anatomy" / "skeleton_scan.glb"


def read_prepared_ply(path):
    with path.open("rb") as source:
        header = bytearray()
        while not header.endswith(b"end_header\n"):
            line = source.readline()
            if not line:
                raise ValueError("The prepared PLY has no complete header.")
            header.extend(line)
        text = header.decode("ascii")
        if "format binary_little_endian 1.0" not in text:
            raise ValueError("The prepared skeleton must be a binary little-endian PLY.")
        vertex_count = int(next(line.split()[2] for line in text.splitlines() if line.startswith("element vertex ")))
        face_count = int(next(line.split()[2] for line in text.splitlines() if line.startswith("element face ")))
        if "property float x\nproperty float y\nproperty float z" not in text:
            raise ValueError("The prepared PLY must store x, y, z float vertices.")
        vertices = np.frombuffer(source.read(vertex_count * 12), dtype="<f4").reshape(vertex_count, 3).copy()
        face_data = source.read(face_count * 13)
    faces_record = np.frombuffer(face_data, dtype=np.dtype([("count", "u1"), ("indices", "<i4", (3,))]))
    if len(faces_record) != face_count or np.any(faces_record["count"] != 3):
        raise ValueError("The prepared skeleton must contain triangle faces only.")
    return vertices, faces_record["indices"].copy()


def gltf_binary(vertices, faces):
    bounds_min = vertices.min(axis=0)
    bounds_max = vertices.max(axis=0)
    center = (bounds_min + bounds_max) * 0.5
    positions = vertices - center
    positions = positions[:, (0, 2, 1)]
    positions[:, 2] *= -1

    triangles = positions[faces]
    face_normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    normals = np.zeros_like(positions)
    np.add.at(normals, faces[:, 0], face_normals)
    np.add.at(normals, faces[:, 1], face_normals)
    np.add.at(normals, faces[:, 2], face_normals)
    lengths = np.linalg.norm(normals, axis=1)
    normals[lengths > 1e-12] /= lengths[lengths > 1e-12, None]
    normals[lengths <= 1e-12] = (0, 1, 0)

    position_bytes = np.asarray(positions, dtype="<f4").tobytes()
    normal_bytes = np.asarray(normals, dtype="<f4").tobytes()
    index_bytes = np.asarray(faces.reshape(-1), dtype="<u4").tobytes()
    position_offset = 0
    normal_offset = len(position_bytes)
    index_offset = normal_offset + len(normal_bytes)
    binary = position_bytes + normal_bytes + index_bytes
    gltf = {
        "asset": {"version": "2.0", "generator": "MediView3D prepared skeleton exporter"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "Skeleton_Scan", "mesh": 0}],
        "meshes": [{"name": "Skeleton_Scan", "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0, "mode": 4}]}],
        "materials": [{"name": "Scan Bone", "pbrMetallicRoughness": {"baseColorFactor": [0.78, 0.82, 0.86, 1], "metallicFactor": 0, "roughnessFactor": 0.72}}],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": position_offset, "byteLength": len(position_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": normal_offset, "byteLength": len(normal_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": index_offset, "byteLength": len(index_bytes), "target": 34963},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(positions), "type": "VEC3", "min": positions.min(axis=0).tolist(), "max": positions.max(axis=0).tolist()},
            {"bufferView": 1, "componentType": 5126, "count": len(normals), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5125, "count": int(faces.size), "type": "SCALAR", "min": [0], "max": [int(faces.max())]},
        ],
    }
    json_chunk = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * ((-len(json_chunk)) % 4)
    binary += b"\0" * ((-len(binary)) % 4)
    total_length = 12 + 8 + len(json_chunk) + 8 + len(binary)
    return struct.pack("<4sII", b"glTF", 2, total_length) + struct.pack("<I4s", len(json_chunk), b"JSON") + json_chunk + struct.pack("<I4s", len(binary), b"BIN\0") + binary, positions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    vertices, faces = read_prepared_ply(args.source)
    glb, positions = gltf_binary(vertices, faces)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(glb)
    size = positions.max(axis=0) - positions.min(axis=0)
    print(f"Exported {args.output}: {len(vertices):,} vertices, {len(faces):,} triangles")
    print("Centred glTF bounds (m):", ", ".join(f"{value:.4f}" for value in size))
    print(f"GLB size: {len(glb) / 1_000_000:.2f} MB")


if __name__ == "__main__":
    main()
