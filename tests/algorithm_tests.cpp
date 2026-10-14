#include "mediview/graphics_algorithms.hpp"
#include <cmath>
#include <iostream>
#include <stdexcept>
using namespace mediview;
void require(bool ok,const char* msg){if(!ok)throw std::runtime_error(msg);}
bool near(double a,double b){return std::abs(a-b)<1e-6;}
int main(){
 try {
  auto dda=ddaLine({0,0},{5,3}); require(dda.size()==6,"DDA sample count");
  auto line=bresenhamLine(5,3,0,0); require(line.size()==6,"Bresenham reverse line count");
  require(near(line.front().x,5)&&near(line.back().x,0),"Bresenham endpoints");
  Polygon p={{-2,2},{5,2},{5,8},{-2,8}};
  auto clipped=clipPolygon(p,{0,0,4,6}); require(clipped.size()>=4,"polygon clipping output");
  for(auto v:clipped) require(v.x>=-1e-6&&v.x<=4.000001&&v.y>=-1e-6&&v.y<=6.000001,"clipped vertex outside rectangle");
  auto fill=scanlineFillPoints({{1,1},{4,1},{4,4},{1,4}}); require(!fill.empty(),"scanline fill");
  require(midpointCircle(0,0,10).size()>=8,"circle symmetry samples");
  require(midpointEllipse(0,0,8,4).size()>=8,"ellipse samples");
  auto bez=bezierCurve({0,0},{1,2},{3,2},{4,0},20); require(bez.size()==21,"Bezier samples"); require(near(bez.front().x,0)&&near(bez.back().x,4),"Bezier endpoints");
  auto spline=catmullRomSpline({{0,0},{1,2},{3,2},{4,0}},10); require(spline.size()==31,"spline sample count"); require(near(spline.front().x,0)&&near(spline.back().x,4),"spline endpoints");
  std::cout<<"All MediView 3D graphics algorithm tests passed.\n"; return 0;
 } catch(const std::exception& e){std::cerr<<"TEST FAILED: "<<e.what()<<'\n';return 1;}
}
