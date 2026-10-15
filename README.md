# MediView3D: Interactive Anatomy Visualisation

## Project title

**MediView3D: An Interactive 3D Human Anatomy Visualisation System**

## Project description

We are developing MediView3D as a Computer Graphics project to explore how graphics algorithms can be used to represent and interact with simplified human anatomy. The project combines a C++ graphics-algorithm foundation with an OpenGL desktop prototype. The current prototype renders a schematic 3D skeleton, simplified organ shapes and branching vessels, with controls for rotating the scene, zooming and toggling visual layers.

This is an educational graphics prototype, not a clinically accurate anatomical model or a medical diagnostic tool.

## Group members and responsibilities

The responsibilities below reflect the current project plan and should be confirmed by our group before final submission.

| Group member | Planned responsibility |
|---|---|
| Wambaire Ian Nganga | Team coordination, core graphics, rendering and lighting |
| Denzel Sam Omondi | 3D model processing and optimisation |
| Kamau Edwin Kamau | Interaction, raycasting and clipping |
| Kanyi Sharon Wambui | UI/UX and interface controls |
| Kariuki Rurigi Maina | Animation and effects, including easing, transitions and visual highlighting |
| Anne Warigi | Educational data integration and documentation |

## Technologies and tools

- **C++17** for graphics algorithms and scene geometry.
- **OpenGL 2.1 compatibility profile** for rendering the desktop prototype.
- **GLFW** for the application window and keyboard, mouse and scroll input.
- **CMake** for configuring and building the project.
- **CTest** for running the automated graphics-algorithm tests.
- **Git and GitHub** for version control, collaboration, issues and project documentation.
- **Ubuntu/WSL** as the current development environment.

The graphics algorithms are implemented in C++ independently of OpenGL. OpenGL is used to display the results and the anatomy prototype.

## Graphics techniques and algorithms implemented so far

### Algorithm foundation

- Digital Differential Analyzer (DDA) line drawing.
- Bresenham line drawing, including reverse-direction lines.
- Sutherland–Hodgman polygon clipping against a rectangular clipping window.
- Scanline polygon filling.
- Midpoint circle drawing.
- Midpoint ellipse drawing.
- Cubic Bézier curve sampling.
- Catmull–Rom spline sampling.

### Current 3D visualisation prototype

- Procedurally constructed, simplified skeletal geometry using spheres and connected segments.
- Stylised organ shapes and branching vessel geometry.
- Perspective projection and depth testing.
- Basic OpenGL lighting and colour-based visual layers.
- Mouse-drag rotation and scroll-wheel zoom.
- Keyboard controls to show or hide the skeleton, organs, vessels and reference grid.
- On-screen title, legend, control hints and an educational-use disclaimer.

The anatomy shapes are illustrative approximations. They are not sourced from a medical scan and should not be interpreted as anatomically accurate models.

## How to compile and run

### 1. Install the required tools on Ubuntu or WSL

Run:

```bash
sudo apt update
sudo apt install -y build-essential cmake git libglfw3-dev libgl1-mesa-dev xorg-dev
```

A graphical desktop or WSLg session is required to open the OpenGL window.

### 2. Get the latest project files

If the repository is already on your computer, open a terminal in the repository and run:

```bash
git pull origin main
```

If you have not cloned it yet:

```bash
git clone https://github.com/RURIGIMK/MediView3D.git
cd MediView3D
```

### 3. Build the application

From the repository root, run:

```bash
cmake -S . -B build-gl -DMEDIVIEW_BUILD_OPENGL_DEMO=ON
cmake --build build-gl --config Release
```

If CMake reports that OpenGL or GLFW cannot be found, check the packages in step 1 and read `docs/BUILD_AND_RUN.md`.

### 4. Launch the visualisation

```bash
./build-gl/mediview_demo
```

### 5. Run the automated algorithm tests

In another terminal, from the repository root:

```bash
ctest --test-dir build-gl -C Release --output-on-failure
```

The test suite can also be built without the graphical demo:

```bash
cmake -S . -B build -DMEDIVIEW_BUILD_OPENGL_DEMO=OFF
cmake --build build --config Release
ctest --test-dir build -C Release --output-on-failure
```

## Prototype controls

| Input | Action |
|---|---|
| Hold left mouse button and drag | Rotate the 3D view |
| Mouse wheel | Zoom in or out |
| `+` or `=` | Zoom in |
| `-` | Zoom out |
| `1` | Toggle the skeleton layer |
| `2` | Toggle the organ layer |
| `3` | Toggle the vessel layer |
| `G` | Toggle the reference grid |
| `R` | Reset the view |
| `Esc` | Close the application |

## Current progress

We have implemented the required core graphics algorithms in C++ and added automated tests for the algorithm foundation. We have also developed an initial interactive OpenGL anatomy prototype to move the project beyond a collection of separate 2D algorithm panels. The prototype presents a schematic 3D body structure with independently toggleable visual layers, perspective, lighting, rotation and zoom.

The current work is a prototype rather than a complete anatomy platform. We still need to build and run the updated version locally, verify the controls and rendering on the target computer, run the test suite again, and capture genuine screenshots for the checkpoint submission.

## Known limitations and issues

- The skeleton, organs and vessels are procedurally drawn approximations, not a detailed or medically validated 3D anatomical model.
- Anatomical structures are not yet selectable and do not have individual educational descriptions.
- The prototype does not yet include imported anatomical meshes, animation sequences, ray-cast selection, or a true 3D cross-section/clipping workflow.
- The current renderer uses the OpenGL compatibility profile and immediate-mode drawing; a modern shader-based rendering pipeline remains future work.
- The scanline fill algorithm is intended for simple polygons and does not handle holes or self-intersecting polygons.
- GUI support and OpenGL drivers vary by operating system. The desktop window requires a working graphical display.
- Build success and test results should be verified on the machine used for the submission; performance has not been benchmarked.
- The group membership and responsibility table must be confirmed by the team before submission.

## Checkpoint evidence

We will capture screenshots directly from the running program and terminal rather than use mock-ups as evidence.

1. The application open with the full anatomy prototype and visible interface.
2. The anatomy with one or more layers toggled off, demonstrating interaction.
3. A rotated or zoomed view demonstrating camera controls.
4. The terminal showing a successful build.
5. The terminal showing CTest passing.
6. The original algorithm demonstrations, where required by the checkpoint rubric.

See [Checkpoint 1](docs/CHECKPOINT_1.md) and [Build and Run](docs/BUILD_AND_RUN.md) for the current checklist and setup guidance.

## Repository

Source code, tests, documentation and project history: [RURIGIMK/MediView3D](https://github.com/RURIGIMK/MediView3D)
