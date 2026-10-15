#include "mediview/graphics_algorithms.hpp"

#include <algorithm>
#include <cmath>
#include <functional>
#include <iostream>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

using namespace mediview;

namespace {
constexpr double epsilon = 1e-6;
bool near(double a, double b) { return std::abs(a - b) <= epsilon; }
bool same(Point2D a, Point2D b) { return near(a.x, b.x) && near(a.y, b.y); }
using PointSet = std::set<std::pair<int, int>>;

PointSet asSet(const std::vector<Point2D>& points) {
    PointSet result;
    for (const auto p : points) result.emplace(static_cast<int>(std::lround(p.x)), static_cast<int>(std::lround(p.y)));
    return result;
}
void require(bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}
void check(const std::string& name, const std::function<void()>& test) {
    test();
    std::cout << "[PASS] " << name << '\n';
}
void verifyLine(const std::vector<Point2D>& line, Point2D first, Point2D last, std::size_t count, const std::string& label) {
    require(line.size() == count, label + ": unexpected point count");
    require(same(line.front(), first), label + ": wrong first endpoint");
    require(same(line.back(), last), label + ": wrong last endpoint");
}
void verifyInside(const Polygon& polygon, const Rect& r) {
    for (const auto p : polygon)
        require(p.x >= r.left-epsilon && p.x <= r.right+epsilon && p.y >= r.bottom-epsilon && p.y <= r.top+epsilon,
                "clipping returned a point outside the window");
}
}

int main() {
    try {
        check("DDA endpoints and zero-length line", [] {
            verifyLine(ddaLine({1, 2}, {5, 4}), {1, 2}, {5, 4}, 5, "DDA");
            verifyLine(ddaLine({2.4, -1.6}, {2.4, -1.6}), {2, -2}, {2, -2}, 1, "zero-length DDA");
        });
        check("DDA horizontal, vertical and fractional lines", [] {
            verifyLine(ddaLine({-2, 3}, {2, 3}), {-2, 3}, {2, 3}, 5, "horizontal DDA");
            verifyLine(ddaLine({4, -2}, {4, 2}), {4, -2}, {4, 2}, 5, "vertical DDA");
            const auto fractional = ddaLine({0.2, 0.2}, {2.2, 1.2});
            verifyLine(fractional, {0, 0}, {2, 1}, 3, "fractional DDA");
        });
        check("Bresenham covers all eight octants", [] {
            const Point2D ends[] = {{4,2},{2,4},{-2,4},{-4,2},{-4,-2},{-2,-4},{2,-4},{4,-2}};
            for (const auto end : ends) {
                const auto line = bresenhamLine(0, 0, static_cast<int>(end.x), static_cast<int>(end.y));
                verifyLine(line, {0,0}, end, 5, "Bresenham octant");
                for (std::size_t i=1; i<line.size(); ++i)
                    require(std::abs(line[i].x-line[i-1].x)<=1 && std::abs(line[i].y-line[i-1].y)<=1,
                            "Bresenham made a step larger than one pixel");
            }
        });
        check("Bresenham reverse direction and zero-length line", [] {
            const auto forward = bresenhamLine(-3, 1, 4, 5);
            const auto reverse = bresenhamLine(4, 5, -3, 1);
            verifyLine(reverse, {4,5}, {-3,1}, forward.size(), "reverse Bresenham");
            require(asSet(forward) == asSet(reverse), "reversing Bresenham changed its rasterized pixel set");
            verifyLine(bresenhamLine(7, -2, 7, -2), {7,-2}, {7,-2}, 1, "zero-length Bresenham");
        });
        check("Polygon clipping for fully inside and outside polygons", [] {
            const Rect r{0, 0, 10, 10};
            const Polygon inside{{2,2},{8,2},{8,8},{2,8}};
            const auto kept = clipPolygon(inside, r);
            require(kept.size() == inside.size(), "inside polygon changed vertex count");
            verifyInside(kept, r);
            const auto rejected = clipPolygon({{-5,-5},{-1,-5},{-1,-1},{-5,-1}}, r);
            require(rejected.empty(), "outside polygon should be empty after clipping");
        });
        check("Polygon clipping intersections match expected coordinates", [] {
            const auto result = clipPolygon({{-2,2},{2,2},{2,8},{-2,8}}, {0,0,4,6});
            const Point2D expected[] = {{0,2},{2,2},{2,6},{0,6}};
            require(result.size() == 4, "clipping intersection case should have four vertices");
            for (const auto want : expected)
                require(std::any_of(result.begin(), result.end(), [&](Point2D got){ return same(got,want); }),
                        "expected clipping intersection/vertex is missing");
            verifyInside(result, {0,0,4,6});
        });
        check("Polygon clipping preserves vertices on window boundaries", [] {
            const Polygon onBoundary{{0,0},{5,0},{5,5},{0,5}};
            const auto result = clipPolygon(onBoundary, {0,0,5,5});
            require(result.size() == onBoundary.size(), "boundary-aligned polygon gained or lost vertices");
            verifyInside(result, {0,0,5,5});
        });
        check("Scanline fill gives exact rectangle coverage", [] {
            const auto fill = asSet(scanlineFillPoints({{1,1},{4,1},{4,4},{1,4}}));
            PointSet expected;
            for (int y=1; y<4; ++y) for (int x=1; x<=4; ++x) expected.emplace(x,y);
            require(fill == expected, "rectangle scanline coverage differs from the documented half-open edge rule");
        });
        check("Scanline fill handles concavity and shared vertices", [] {
            const auto concave = asSet(scanlineFillPoints({{0,0},{6,0},{6,6},{4,6},{4,2},{2,2},{2,6},{0,6}}));
            require(concave.count({1,4}) && concave.count({5,4}), "concave polygon arms were not filled");
            require(!concave.count({3,4}), "concave notch should remain empty");
            const auto triangle = asSet(scanlineFillPoints({{0,0},{4,4},{0,4}}));
            require(triangle.count({0,2}) && triangle.count({2,2}), "shared-vertex scan conversion lost expected interior points");
            require(!triangle.count({4,4}), "maximum-y vertex should be excluded by the half-open scanline rule");
        });
        check("Midpoint circle symmetry, zero and negative radii", [] {
            const auto circle = midpointCircle(3, -2, 5);
            const auto pixels = asSet(circle);
            require(!pixels.empty(), "positive-radius circle is empty");
            for (const auto p : circle) {
                require(pixels.count({6-static_cast<int>(p.x), -4-static_cast<int>(p.y)}), "circle is missing its central reflection");
                require(pixels.count({6-static_cast<int>(p.x), static_cast<int>(p.y)}), "circle is missing horizontal symmetry");
                require(pixels.count({static_cast<int>(p.x), -4-static_cast<int>(p.y)}), "circle is missing vertical symmetry");
            }
            require(asSet(midpointCircle(2, 3, 0)) == PointSet{{2,3}}, "zero-radius circle should contain only its centre");
            require(midpointCircle(0, 0, -1).empty(), "negative-radius circle should be empty");
        });
        check("Midpoint ellipse symmetry and zero-axis cases", [] {
            const auto ellipse = midpointEllipse(2, -1, 6, 3);
            const auto pixels = asSet(ellipse);
            require(!pixels.empty(), "positive-axis ellipse is empty");
            for (const auto p : ellipse) {
                require(pixels.count({4-static_cast<int>(p.x), static_cast<int>(p.y)}), "ellipse is missing horizontal symmetry");
                require(pixels.count({static_cast<int>(p.x), -2-static_cast<int>(p.y)}), "ellipse is missing vertical symmetry");
            }
            require(asSet(midpointEllipse(1, 2, 0, 2)) == PointSet{{1,0},{1,1},{1,2},{1,3},{1,4}}, "zero x-radius should produce a vertical segment");
            require(asSet(midpointEllipse(1, 2, 2, 0)) == PointSet{{-1,2},{0,2},{1,2},{2,2},{3,2}}, "zero y-radius should produce a horizontal segment");
        });
        check("Bezier endpoints and sampling behaviour", [] {
            const auto curve = bezierCurve({0,0},{1,3},{4,3},{5,0},4);
            require(curve.size() == 5, "Bezier should return segments + 1 samples");
            require(same(curve.front(), {0,0}) && same(curve.back(), {5,0}), "Bezier endpoints do not match control endpoints");
            require(same(curve[2], {2.5,2.25}), "Bezier midpoint does not match cubic evaluation");
            require(bezierCurve({1,2},{1,2},{1,2},{1,2},0).size() == 2, "non-positive sample count should clamp to one segment");
        });
        check("Catmull-Rom interpolation and small control-point sets", [] {
            const std::vector<Point2D> controls{{0,0},{2,2},{5,0}};
            const auto spline = catmullRomSpline(controls, 4);
            require(spline.size() == 9, "spline should share segment boundaries without duplicating them");
            require(same(spline.front(), controls.front()) && same(spline.back(), controls.back()), "spline does not interpolate its endpoints");
            require(same(spline[4], controls[1]), "spline does not interpolate its middle control point");
            require(catmullRomSpline({}, 4).empty(), "empty spline input should produce no points");
            const auto onePoint = catmullRomSpline({{3,7}}, 4);
            require(onePoint.size() == 1 && same(onePoint.front(), {3,7}), "one-point spline should return that control point");
            const auto twoPoint = catmullRomSpline({{0,0},{2,4}}, 2);
            require(twoPoint.size() == 3 && same(twoPoint.front(), {0,0}) && same(twoPoint.back(), {2,4}), "two-point spline failed to interpolate endpoints");
        });
        std::cout << "All MediView 3D graphics algorithm checks passed.\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "[FAIL] " << error.what() << '\n';
        return 1;
    }
}
