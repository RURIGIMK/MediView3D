#include "mediview/graphics_algorithms.hpp"
#include <algorithm>
#include <cmath>

namespace mediview {
namespace {
enum class Edge { Left, Right, Bottom, Top };
bool inside(Point2D p, const Rect& r, Edge e) {
    switch (e) {
        case Edge::Left: return p.x >= r.left;
        case Edge::Right: return p.x <= r.right;
        case Edge::Bottom: return p.y >= r.bottom;
        case Edge::Top: return p.y <= r.top;
    }
    return false;
}
Point2D intersection(Point2D a, Point2D b, const Rect& r, Edge e) {
    if (e == Edge::Left || e == Edge::Right) {
        const double x = e == Edge::Left ? r.left : r.right;
        const double dx = b.x - a.x;
        if (std::abs(dx) < 1e-12) return {x, a.y};
        return {x, a.y + (x-a.x) * (b.y-a.y)/dx};
    }
    const double y = e == Edge::Bottom ? r.bottom : r.top;
    const double dy = b.y - a.y;
    if (std::abs(dy) < 1e-12) return {a.x, y};
    return {a.x + (y-a.y) * (b.x-a.x)/dy, y};
}
void addCircleOctants(std::vector<Point2D>& out, int cx, int cy, int x, int y) {
    const Point2D p[] = {{double(cx+x),double(cy+y)},{double(cx-x),double(cy+y)},
      {double(cx+x),double(cy-y)},{double(cx-x),double(cy-y)},
      {double(cx+y),double(cy+x)},{double(cx-y),double(cy+x)},
      {double(cx+y),double(cy-x)},{double(cx-y),double(cy-x)}};
    out.insert(out.end(), std::begin(p), std::end(p));
}
}
std::vector<Point2D> ddaLine(Point2D a, Point2D b) {
    const double dx=b.x-a.x, dy=b.y-a.y;
    const int steps=static_cast<int>(std::ceil(std::max(std::abs(dx),std::abs(dy))));
    if (!steps) return {{std::round(a.x),std::round(a.y)}};
    std::vector<Point2D> out; out.reserve(steps+1);
    for(int i=0;i<=steps;++i) { const double t=double(i)/steps; out.push_back({std::round(a.x+t*dx),std::round(a.y+t*dy)}); }
    return out;
}
std::vector<Point2D> bresenhamLine(int x0,int y0,int x1,int y1) {
    std::vector<Point2D> out;
    int dx=std::abs(x1-x0), sx=x0<x1?1:-1, dy=-std::abs(y1-y0), sy=y0<y1?1:-1, err=dx+dy;
    for(;;) { out.push_back({double(x0),double(y0)}); if(x0==x1&&y0==y1) break;
        int e2=2*err; if(e2>=dy){err+=dy;x0+=sx;} if(e2<=dx){err+=dx;y0+=sy;} }
    return out;
}
Polygon clipPolygon(const Polygon& polygon,const Rect& r) {
    Polygon out=polygon;
    const Edge edges[]={Edge::Left,Edge::Right,Edge::Bottom,Edge::Top};
    for(Edge e:edges) {
        if(out.empty()) break;
        Polygon in=out; out.clear(); Point2D prev=in.back(); bool prevIn=inside(prev,r,e);
        for(Point2D cur:in) { bool curIn=inside(cur,r,e);
            if(curIn) { if(!prevIn) out.push_back(intersection(prev,cur,r,e)); out.push_back(cur); }
            else if(prevIn) out.push_back(intersection(prev,cur,r,e));
            prev=cur; prevIn=curIn;
        }
    }
    return out;
}
std::vector<Point2D> scanlineFillPoints(const Polygon& poly) {
    std::vector<Point2D> out; if(poly.size()<3) return out;
    double minY=poly[0].y,maxY=poly[0].y;
    for(auto p:poly){minY=std::min(minY,p.y);maxY=std::max(maxY,p.y);}
    for(int y=int(std::ceil(minY));y<=int(std::floor(maxY));++y) {
        std::vector<double> xs;
        for(std::size_t i=0;i<poly.size();++i) { auto a=poly[i],b=poly[(i+1)%poly.size()];
            if((a.y<=y&&b.y>y)||(b.y<=y&&a.y>y)) xs.push_back(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y)); }
        std::sort(xs.begin(),xs.end());
        for(std::size_t i=0;i+1<xs.size();i+=2) for(int x=int(std::ceil(xs[i]));x<=int(std::floor(xs[i+1]));++x) out.push_back({double(x),double(y)});
    }
    return out;
}
std::vector<Point2D> midpointCircle(int cx,int cy,int r) {
    std::vector<Point2D> out; if(r<0)return out; int x=0,y=r,d=1-r;
    while(x<=y){addCircleOctants(out,cx,cy,x,y);++x;if(d<0)d+=2*x+1;else{--y;d+=2*(x-y)+1;}}
    return out;
}
std::vector<Point2D> midpointEllipse(int cx,int cy,int rx,int ry) {
    std::vector<Point2D> out; if(rx<0||ry<0)return out;
    if(rx==0){for(int y=-ry;y<=ry;++y)out.push_back({double(cx),double(cy+y)});return out;}
    if(ry==0){for(int x=-rx;x<=rx;++x)out.push_back({double(cx+x),double(cy)});return out;}
    double x=0,y=ry,rx2=double(rx)*rx,ry2=double(ry)*ry,dx=0,dy=2*rx2*y;
    double p1=ry2-rx2*ry+0.25*rx2;
    while(dx<dy){out.push_back({cx+x,cy+y});out.push_back({cx-x,cy+y});out.push_back({cx+x,cy-y});out.push_back({cx-x,cy-y});++x;dx+=2*ry2;if(p1<0)p1+=ry2+dx;else{--y;dy-=2*rx2;p1+=ry2+dx-dy;}}
    double p2=ry2*(x+0.5)*(x+0.5)+rx2*(y-1)*(y-1)-rx2*ry2;
    while(y>=0){out.push_back({cx+x,cy+y});out.push_back({cx-x,cy+y});out.push_back({cx+x,cy-y});out.push_back({cx-x,cy-y});--y;dy-=2*rx2;if(p2>0)p2+=rx2-dy;else{++x;dx+=2*ry2;p2+=rx2-dy+dx;}}
    return out;
}
std::vector<Point2D> bezierCurve(Point2D p0,Point2D p1,Point2D p2,Point2D p3,int n) {
    n=std::max(1,n); std::vector<Point2D> out; out.reserve(n+1);
    for(int i=0;i<=n;++i){double t=double(i)/n,u=1-t;out.push_back({u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y});}
    return out;
}
std::vector<Point2D> catmullRomSpline(const std::vector<Point2D>& p,int n) {
    std::vector<Point2D> out; if(p.size()<2)return p; n=std::max(1,n);
    for(std::size_t i=0;i+1<p.size();++i){auto p0=p[i==0?i:i-1],p1=p[i],p2=p[i+1],p3=p[std::min(i+2,p.size()-1)];
      for(int j=(i==0?0:1);j<=n;++j){double t=double(j)/n,t2=t*t,t3=t2*t;
        auto f=[&](double a,double b,double c,double d){return 0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);};
        out.push_back({f(p0.x,p1.x,p2.x,p3.x),f(p0.y,p1.y,p2.y,p3.y)});}}
    return out;
}
}
