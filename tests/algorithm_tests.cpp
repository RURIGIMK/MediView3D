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

constexpr double kEpsilon = 1e-6;

bool near(double a, double b) { 
    return std::abs(a - b) <= kEpsilon * std::max({1.0, std::abs(a), std::abs(b)}); 
}

bool same(Point2D a, Point2D b) { 
    return near(a.x, b.x) && near(a.y, b.y); 
}

using PointSet = std::set<std::pair<int, int>>;

PointSet asSet(const std::vector<Point2D>& points) {
    PointSet result;
    for (const auto p : points) {
        result.emplace(static_cast<int>(std::lround(p.x)), static_cast<int>(std::lround(p.y)));
    }
    return result;
}

void require(bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}

// Custom assertion with detailed expected vs. actual reporting
template <typename T, typename U>
void requireEqual(const T& actual, const U& expected, const std::string& label) {
    if (actual != expected) {
        std::ostringstream ss;
        ss << label << " | Expected: " << expected << ", Got: " << actual;
        throw std::runtime_error(ss.str());
    }
}

// Lightweight Test Runner to isolate tests and track total pass/fail stats
class TestSuite {
public:
    void run(const std::string& name, const std::function<void()>& test) {
        try {
            test();
            std::cout << "[PASS] " << name << '\n';
            ++passed_;
        } catch (const std::exception& e) {
            std::cerr << "[FAIL] " << name << "\n  Reason: " << e.what() << '\n';
            ++failed_;
        }
    }

    int summary() const {
        std::cout << "\n========================================\n"
                  << "Test Results: " << passed_ << " passed, " << failed_ << " failed.\n"
                  << "========================================\n";
        return failed_ == 0 ? 0 : 1;
    }

private:
    int passed_ = 0;
    int failed_ = 0;
};

void verifyLine(const std::vector<Point2D>& line, Point2D first, Point2D last, std::size_t count, const std::string& label) {
    requireEqual(line.size(), count, label + " point count");
    require(same(line.front(), first), label + ": wrong first endpoint");
    require(same(line.back(), last), label + ": wrong last endpoint");
}

void verifyInside(const Polygon& polygon, const Rect& r) {
    for (const auto p : polygon) {
        require(p.x >= r.left - kEpsilon && p.x <= r.right + kEpsilon &&
                p.y >= r.bottom - kEpsilon && p.y <= r.top + kEpsilon,
                "clipping returned a point outside the window boundary");
    }
}

} // namespace

int main() {
    TestSuite suite;

    suite.run("DDA endpoints and zero-length line", [] {
        verifyLine(ddaLine({1, 2}, {5, 4}), {1, 2}, {5, 4}, 5, "DDA");
        verifyLine(ddaLine({2.4, -1.6}, {2.4, -1.6}), {2, -2}, {2, -2}, 1, "zero-length DDA");
    });

    suite.run("DDA horizontal, vertical, fractional, and reverse lines", [] {
        verifyLine(ddaLine({-2, 3}, {2, 3}), {-2, 3}, {2, 3}, 5, "horizontal DDA");
        verifyLine(ddaLine({4, -2}, {4, 2}), {4, -2}, {4, 2}, 5, "vertical DDA");
        verifyLine(ddaLine({2, 3}, {-2, 3}), {2, 3}, {-2, 3}, 5, "reverse horizontal DDA");
        
        const auto fractional = ddaLine({0.2, 0.2}, {2.2, 1.2});
        verifyLine(fractional, {0, 0}, {2, 1}, 3, "fractional DDA");
    });

    suite.run("Bresenham covers all eight octants", [] {
        const Point2D ends[] = {{4,2},{2,4},{-2,4},{-4,2},{-4,-2},{-2,-4},{2,-4},{4,-2}};
        for (const auto end : ends) {
            const auto line = bresenhamLine(0, 0, static_cast<int>(end.x), static_cast<int>(end.y));
            verifyLine(line, {0,0}, end, 5, "Bresenham octant");
            for (std::size_t i = 1; i < line.size(); ++i) {
                require(std::abs(line[i].x - line[i-1].x) <= 1 && std::abs(line[i].y - line[i-1].y) <= 1,
                        "Bresenham made a step larger than one pixel");
            }
        }
    });

    suite.run("Bresenham reverse direction and zero-length line", [] {
        const auto forward = bresenhamLine(-3, 1, 4, 5);
        const auto reverse = bresenhamLine(4, 5, -3, 1);
        verifyLine(reverse, {4,5}, {-3,1}, forward.size(), "reverse Bresenham");
        require(asSet(forward) == asSet(reverse), "reversing Bresenham changed its rasterized pixel set");
        verifyLine(bresenhamLine(7, -2, 7, -2), {7,-2}, {7,-2}, 1, "zero-length Bresenham");
    });

    suite.run("Polygon clipping for fully inside, outside, and fully enclosing polygons", [] {
        const Rect r{0, 0, 10, 10};
        const Polygon inside{{2,2},{8,2},{8,8},{2,8}};
        const auto kept = clipPolygon(inside, r);
        requireEqual(kept.size(), inside.size(), "inside polygon vertex count");
        verifyInside(kept, r);

        const auto rejected = clipPolygon({{-5,-5},{-1,-5},{-1,-1},{-5,-1}}, r);
        require(rejected.empty(), "outside polygon should be empty after clipping");

        const Polygon enclosing{{-5,-5},{15,-5},{15,15},{-5,15}};
        const auto clippedEnclosing = clipPolygon(enclosing, r);
        requireEqual(clippedEnclosing.size(), static_cast<std::size_t>(4), "enclosing polygon clipped vertex count");
        verifyInside(clippedEnclosing, r);
    });

    suite.run("Polygon clipping intersections match expected coordinates", [] {
        const auto result = clipPolygon({{-2,2},{2,2},{2,8},{-2,8}}, {0,0,4,6});
        const Point2D expected[] = {{0,2},{2,2},{2,6},{0,6}};
        requireEqual(result.size(), static_cast<std::size_t>(4), "clipping intersection vertex count");
        
        for (const auto want : expected) {
            require(std::any_of(result.begin(), result.end(), [&](Point2D got){ return same(got, want); }),
                    "expected clipping intersection/vertex is missing");
        }
        verifyInside(result, {0,0,4,6});
    });

    suite.run("Polygon clipping preserves vertices on window boundaries", [] {
        const Polygon onBoundary{{0,0},{5,0},{5,5},{0,5}};
        const auto result = clipPolygon(onBoundary, {0,0,5,5});
        requireEqual(result.size(), onBoundary.size(), "boundary-aligned polygon vertex count");
        verifyInside(result, {0,0,5,5});
    });

    suite.run("Scanline fill gives exact rectangle coverage", [] {
        const auto fill = asSet(scanlineFillPoints({{1,1},{4,1},{4,4},{1,4}}));
        PointSet expected;
        for (int y = 1; y < 4; ++y) {
            for (int x = 1; x <= 4; ++x) {
                expected.emplace(x, y);
            }
        }
        require(fill == expected, "rectangle scanline coverage differs from the half-open edge rule");
    });

    suite.run("Scanline fill handles concavity and shared vertices", [] {
        const auto concave = asSet(scanlineFillPoints({{0,0},{6,0},{6,6},{4,6},{4,2},{2,2},{2,6},{0,6}}));
        require(concave.count({1,4}) && concave.count({5,4}), "concave polygon arms were not filled");
        require(!concave.count({3,4}), "concave notch should remain empty");

        const auto triangle = asSet(scanlineFillPoints({{0,0},{4,4},{0,4}}));
        require(triangle.count({0,2}) && triangle.count({2,2}), "shared-vertex scan conversion lost interior points");
        require(!triangle.count({4,4}), "maximum-y vertex should be excluded by the half-open scanline rule");
    });

    suite.run("Midpoint circle symmetry, zero and negative radii", [] {
        const auto circle = midpointCircle(3, -2, 5);
        const auto pixels = asSet(circle);
        require(!pixels.empty(), "positive-radius circle is empty");
        
        for (const auto p : circle) {
            require(pixels.count({6 - static_cast<int>(p.x), -4 - static_cast<int>(p.y)}), "circle is missing central reflection");
            require(pixels.count({6 - static_cast<int>(p.x), static_cast<int>(p.y)}), "circle is missing horizontal symmetry");
            require(pixels.count({static_cast<int>(p.x), -4 - static_cast<int>(p.y)}), "circle is missing vertical symmetry");
        }
        
        require(asSet(midpointCircle(2, 3, 0)) == PointSet{{2,3}}, "zero-radius circle should contain only its centre");
        require(midpointCircle(0, 0, -1).empty(), "negative-radius circle should be empty");
    });

    suite.run("Midpoint ellipse symmetry and zero-axis cases", [] {
        const auto ellipse = midpointEllipse(2, -1, 6, 3);
        const auto pixels = asSet(ellipse);
        require(!pixels.empty(), "positive-axis ellipse is empty");
        
        for (const auto p : ellipse) {
            require(pixels.count({4 - static_cast<int>(p.x), static_cast<int>(p.y)}), "ellipse is missing horizontal symmetry");
            require(pixels.count({static_cast<int>(p.x), -2 - static_cast<int>(p.y)}), "ellipse is missing vertical symmetry");
        }
        
        require(asSet(midpointEllipse(1, 2, 0, 2)) == PointSet{{1,0},{1,1},{1,2},{1,3},{1,4}}, "zero x-radius should produce a vertical segment");
        require(asSet(midpointEllipse(1, 2, 2, 0)) == PointSet{{-1,2},{0,2},{1,2},{2,2},{3,2}}, "zero y-radius should produce a horizontal segment");
    });

    suite.run("Bezier endpoints and sampling behaviour", [] {
        const auto curve = bezierCurve({0,0},{1,3},{4,3},{5,0}, 4);
        requireEqual(curve.size(), static_cast<std::size_t>(5), "Bezier segment count + 1");
        require(same(curve.front(), {0,0}) && same(curve.back(), {5,0}), "Bezier endpoints do not match control endpoints");
        require(same(curve[2], {2.5,2.25}), "Bezier midpoint does not match cubic evaluation");
        
        requireEqual(bezierCurve({1,2},{1,2},{1,2},{1,2}, 0).size(), static_cast<std::size_t>(2), "non-positive sample count clamping");
    });

    suite.run("Catmull-Rom interpolation and small control-point sets", [] {
        const std::vector<Point2D> controls{{0,0},{2,2},{5,0}};
        const auto spline = catmullRomSpline(controls, 4);
        requireEqual(spline.size(), static_cast<std::size_t>(9), "spline segment boundary count");
        require(same(spline.front(), controls.front()) && same(spline.back(), controls.back()), "spline does not interpolate endpoints");
        require(same(spline[4], controls[1]), "spline does not interpolate middle control point");
        
        require(catmullRomSpline({}, 4).empty(), "empty spline input should produce no points");
        
        const auto onePoint = catmullRomSpline({{3,7}}, 4);
        require(onePoint.size() == 1 && same(onePoint.front(), {3,7}), "one-point spline should return control point");
        
        const auto twoPoint = catmullRomSpline({{0,0},{2,4}}, 2);
        require(twoPoint.size() == 3 && same(twoPoint.front(), {0,0}) && same(twoPoint.back(), {2,4}), "two-point spline endpoint interpolation failed");
    });

    return suite.summary();
}