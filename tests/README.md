# Running the Algorithm Checks

The algorithm checks build and run without OpenGL or GLFW. You need CMake 3.16 or later and a C++17 compiler.

From the repository root, configure and build the test target:

```bash
cmake -S . -B build -DMEDIVIEW_BUILD_OPENGL_DEMO=OFF
cmake --build build --config Release
```

Run the checks with CTest:

```bash
ctest --test-dir build -C Release --output-on-failure
```

Or run the test executable directly:

```bash
# Windows PowerShell
.\build\Release\mediview_algorithm_tests.exe

# Linux / macOS
./build/mediview_algorithm_tests
```

The checks cover line rasterization, polygon clipping and filling, circles, ellipses, Bézier curves, and Catmull–Rom splines. A successful run reports each named check as `[PASS]` and exits with code 0. A failure prints `[FAIL]` with the check's failure message and exits with code 1.
