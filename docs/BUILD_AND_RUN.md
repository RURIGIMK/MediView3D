# Build and run MediView 3D

## Requirements
- C++17 compiler
- CMake 3.16 or later
- For the windowed demo: OpenGL development libraries and GLFW 3

## Windows (Visual Studio 2022 + vcpkg)
Install Visual Studio 2022 Community with the **Desktop development with C++** workload, CMake, and Git. Install GLFW through vcpkg:
```powershell
git clone https://github.com/microsoft/vcpkg.git C:\dev\vcpkg
cd C:\dev\vcpkg
.\bootstrap-vcpkg.bat
.\vcpkg.exe install glfw3:x64-windows
``
From the repository root:
```powershell
cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE=C:/dev/vcpkg/scripts/buildsystems/vcpkg.cmake -DMEDIVIEW_BUILD_OPENGL_DEMO=ON
cmake --build build --config Release
ctest --test-dir build -C Release --output-on-failure
.\build\Release\mediview_demo.exe
``

## Ubuntu / WSL
```bash
sudo apt update
sudo apt install -y build-essential cmake git libgl1-mesa-dev libglfw3-dev
git clone https://github.com/RURIGIMK/MediView3D.git
cd MediView3D
cmake -S . -B build -DMEDIVIEW_BUILD_OPENGL_DEMO=ON
cmake --build build -j
ctest --test-dir build --output-on-failure
./build/mediview_demo
``
A visible OpenGL window requires a working desktop display. Under WSL, use WSLg or a configured X server.

## Pure C++ tests only
This does not require GLFW or OpenGL:
```bash
cmake -S . -B build -DMEDIVIEW_BUILD_OPENGL_DEMO=OFF
cmake --build build
ctest --test-dir build --output-on-failure
``

## Troubleshooting
If the demo target is missing, check whether CMake found OpenGL and GLFW. The pure C++ algorithm target can still build independently. Remove the build directory and configure again after installing dependencies.
