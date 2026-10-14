#pragma once
#include <vector>

namespace mediview {
struct Point2D { double x{}; double y{}; };
struct Rect { double left{}; double bottom{}; double right{}; double top{}; };
using Polygon = std::vector<Point2D>;

std::vector<Point2D> ddaLine(Point2D start, Point2D end);
std::vector<Point2D> bresenhamLine(int x0, int y0, int x1, int y1);
Polygon clipPolygon(const Polygon& polygon, const Rect& clipRect);
std::vector<Point2D> scanlineFillPoints(const Polygon& polygon);
std::vector<Point2D> midpointCircle(int cx, int cy, int radius);
std::vector<Point2D> midpointEllipse(int cx, int cy, int rx, int ry);
std::vector<Point2D> bezierCurve(Point2D p0, Point2D p1, Point2D p2, Point2D p3, int segments = 80);
std::vector<Point2D> catmullRomSpline(const std::vector<Point2D>& controlPoints, int samplesPerSegment = 20);
}
