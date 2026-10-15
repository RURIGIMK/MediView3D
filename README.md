# MediView 3D — Computer Graphics Foundation (C++ / OpenGL)

MediView 3D is an educational human-anatomy visualization project. This checkpoint builds a **standard C++ graphics-algorithm foundation** and an optional OpenGL visualizer that relates the algorithms to simplified anatomical shapes. The current anatomy drawing is schematic and is not a clinical or anatomically accurate model.

## Group members and initial responsibilities

| Member | Responsibility |
|---|---|
| Wambaire Ian Nganga | Team lead, core graphics, rendering and lighting |
| Denzel Sam Omondi | 3D model processing and optimization |
| Kamau Edwin Kamau | Interaction, raycasting and clipping |
| Kanyi Sharon Wambui | UI/UX and interface controls |
| Kariuki Rurigi Maina | Animation and effects: explode view, easing, fades and highlights |
| Anne Warigi | Educational data integration and documentation |

Confirm the names and responsibilities with the group before final submission.

## Technologies

- C++17 for the algorithms and data structures
- CMake for cross-platform build configuration
- OpenGL (compatibility profile) for displaying the algorithm outputs
- GLFW for creating the interactive desktop window
- CTest for running algorithm checks

The algorithms themselves are implemented in C++ and do not call OpenGL to calculate their results. OpenGL is a display layer only.

## Techniques implemented in this foundation

- Digital Differential Analyzer (DDA) line drawing
- Bresenham line drawing, including reverse-direction lines
- Polygon clipping against a rectangular window using Sutherland–Hodgman
- Polygon scanline filling
- Midpoint circle algorithm
- Midpoint ellipse algorithm
- Cubic Bézier curve sampling
- Catmull–Rom spline sampling
- Simplified anatomy study composed from algorithm-generated geometry

## Repository layout

```text
MediView3D/
├── CMakeLists.txt
├── README.md
├── include/mediview/graphics_algorithms.hpp
├── src/graphics_algorithms.cpp
├── src/main.cpp
├── tests/algorithm_tests.cpp
├── docs/CHECKPOINT_1.md
├── docs/BUILD_AND_RUN.md
└── evidence/README.md
```

## Build and run

See [`docs/BUILD_AND_RUN.md`](docs/BUILD_AND_RUN.md) for detailed Windows, Ubuntu/WSL, and macOS instructions.

Quick build of the pure C++ algorithm tests:

```bash
cmake -S . -B build -DMEDIVIEW_BUILD_OPENGL_DEMO=OFF
cmake --build build
ctest --test-dir build --output-on-failure
```

Build the OpenGL demo by installing OpenGL development files and GLFW, then configuring with `-DMEDIVIEW_BUILD_OPENGL_DEMO=ON`. If GLFW/OpenGL are not found, CMake still builds the pure C++ algorithms and tests.



## Known limitations

- The anatomy is a 2D schematic built from simple geometric primitives, not a full 3D anatomical model.
- The polygon scanline fill is intended for simple polygons and does not handle holes or self-intersecting polygons.
- The OpenGL visualizer uses the legacy compatibility profile to keep setup lightweight for this checkpoint.
- GUI and driver availability differ by operating system; use the build guide if the OpenGL window does not launch.
- Performance has not been benchmarked and no 60 FPS claim is made.
