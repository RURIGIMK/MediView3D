#include "mediview/graphics_algorithms.hpp"
#include <GLFW/glfw3.h>
#include <algorithm>
#include <cstdlib>
#include <iostream>
using namespace mediview;
namespace {
int W=1280,H=760; bool grid=true;
void color(float r,float g,float b){glColor3f(r,g,b);}
void point(double x,double y,float r,float g,float b,float size=3){color(r,g,b);glPointSize(size);glBegin(GL_POINTS);glVertex2d(x,y);glEnd();}
void line(const std::vector<Point2D>& p,float r,float g,float b,float width=1.5f){color(r,g,b);glLineWidth(width);glBegin(GL_LINE_STRIP);for(auto v:p)glVertex2d(v.x,v.y);glEnd();}
void polygon(const Polygon& p,float r,float g,float b){if(p.size()<2)return;color(r,g,b);glBegin(GL_LINE_LOOP);for(auto v:p)glVertex2d(v.x,v.y);glEnd();}
void panel(double x,double y,double w,double h){color(.10f,.13f,.19f);glBegin(GL_QUADS);glVertex2d(x,y);glVertex2d(x+w,y);glVertex2d(x+w,y+h);glVertex2d(x,y+h);glEnd();}
void drawPanel(double x,double y,double w,double h,const char* title){panel(x,y,w,h);color(.42f,.48f,.58f);glBegin(GL_LINE_LOOP);glVertex2d(x,y);glVertex2d(x+w,y);glVertex2d(x+w,y+h);glVertex2d(x,y+h);glEnd();(void)title;}
void drawLinePanel(double x,double y,double w,double h){drawPanel(x,y,w,h,"Lines");line(ddaLine({x+25,y+35},{x+w*.42,y+h-35}),.2f,.85f,.67f,2);line(bresenhamLine(int(x+w*.55),int(y+35),int(x+w-25),int(y+h-35)),.36f,.55f,1,2);}
void drawPolygonPanel(double x,double y,double w,double h){drawPanel(x,y,w,h,"Polygon");Polygon p={{x+20,y+30},{x+w*.75,y+45},{x+w*.9,y+h*.75},{x+w*.35,y+h*.9},{x+10,y+h*.65}};polygon(p,.95f,.55f,.24f);Rect r{x+w*.25,y+h*.25,x+w*.78,y+h*.72};color(.3f,.65f,1);glBegin(GL_LINE_LOOP);glVertex2d(r.left,r.bottom);glVertex2d(r.right,r.bottom);glVertex2d(r.right,r.top);glVertex2d(r.left,r.top);glEnd();polygon(clipPolygon(p,r),.2f,.9f,.67f);}
void drawCirclePanel(double x,double y,double w,double h){drawPanel(x,y,w,h,"Circle");auto c=midpointCircle(int(x+w*.32),int(y+h*.53),int(std::min(w,h)*.23));glBegin(GL_POINTS);color(.25f,.75f,1);for(auto p:c)glVertex2d(p.x,p.y);glEnd();auto e=midpointEllipse(int(x+w*.72),int(y+h*.53),int(w*.16),int(h*.26));glBegin(GL_POINTS);color(1,.65f,.3f);for(auto p:e)glVertex2d(p.x,p.y);glEnd();}
void drawCurvePanel(double x,double y,double w,double h){drawPanel(x,y,w,h,"Curves");Point2D a{x+15,y+35},b{x+w*.3,y+h*.8},c{x+w*.65,y+h*.2},d{x+w-15,y+h*.7};line(bezierCurve(a,b,c,d,80),.3f,.85f,.68f,2);std::vector<Point2D> cp={{x+20,y+h*.25},{x+w*.3,y+h*.7},{x+w*.58,y+h*.35},{x+w-20,y+h*.65}};line(catmullRomSpline(cp,25),.55f,.58f,1,2);for(auto p:cp)point(p.x,p.y,1,.7f,.3f,6);}
void drawAnatomy(double x,double y,double w,double h){drawPanel(x,y,w,h,"Anatomy study");double cx=x+w/2,cy=y+h*.52;auto head=midpointCircle(int(cx),int(cy+h*.28),int(h*.10));color(.7f,.78f,.88f);glBegin(GL_POINTS);for(auto p:head)glVertex2d(p.x,p.y);glEnd();line(bresenhamLine(int(cx),int(cy+h*.17),int(cx),int(cy-h*.22)),.7f,.78f,.88f,3);line(bresenhamLine(int(cx),int(cy+h*.08),int(cx-w*.2),int(cy-h*.02)),.7f,.78f,.88f,3);line(bresenhamLine(int(cx),int(cy+h*.08),int(cx+w*.2),int(cy-h*.02)),.7f,.78f,.88f,3);line(bresenhamLine(int(cx),int(cy-h*.22),int(cx-w*.12),int(y+20)),.7f,.78f,.88f,3);line(bresenhamLine(int(cx),int(cy-h*.22),int(cx+w*.12),int(y+20)),.7f,.78f,.88f,3);auto heart=bezierCurve({cx-18,cy-12},{cx-35,cy+15},{cx-5,cy+20},{cx,cy+2},30);line(heart,1,.35f,.4f,2);line(bezierCurve({cx,cy+2},{cx+25,cy+24},{cx+35,cy-5},{cx+4,cy-18},30),1,.35f,.4f,2);}
void render(){glClearColor(.035f,.045f,.07f,1);glClear(GL_COLOR_BUFFER_BIT);glMatrixMode(GL_PROJECTION);glLoadIdentity();glOrtho(0,W,0,H,-1,1);glMatrixMode(GL_MODELVIEW);glLoadIdentity();if(grid){color(.08f,.10f,.14f);glBegin(GL_LINES);for(int x=0;x<W;x+=25){glVertex2d(x,0);glVertex2d(x,H);}for(int y=0;y<H;y+=25){glVertex2d(0,y);glVertex2d(W,y);}glEnd();}
 panel(16,H-58,W-32,42);
 double margin=18,gap=14,top=H-78,bottom=18,pw=(W-2*margin-2*gap)/3,ph=(top-bottom-2*gap)/2;
 drawLinePanel(margin,bottom+ph+gap,pw,ph);drawPolygonPanel(margin+pw+gap,bottom+ph+gap,pw,ph);drawCirclePanel(margin+2*(pw+gap),bottom+ph+gap,pw,ph);drawCurvePanel(margin,bottom,pw,ph);drawAnatomy(margin+pw+gap,bottom,pw,ph);drawPanel(margin+2*(pw+gap),bottom,pw,ph,"Polygon Clipping / Filling"); }
void resize(GLFWwindow*,int w,int h){W=std::max(1,w);H=std::max(1,h);glViewport(0,0,W,H);}
void key(GLFWwindow* w,int k,int,int action,int){if(action==GLFW_PRESS){if(k==GLFW_KEY_ESCAPE)glfwSetWindowShouldClose(w,GLFW_TRUE);if(k==GLFW_KEY_G)grid=!grid;}}
}
int main(){if(!glfwInit()){std::cerr<<"GLFW initialization failed.\n";return EXIT_FAILURE;}glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR,2);glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR,1);GLFWwindow* win=glfwCreateWindow(W,H,"MediView 3D | Checkpoint 1",nullptr,nullptr);if(!win){std::cerr<<"Could not create OpenGL window.\n";glfwTerminate();return EXIT_FAILURE;}glfwMakeContextCurrent(win);glfwSwapInterval(1);glfwSetFramebufferSizeCallback(win,resize);glfwSetKeyCallback(win,key);while(!glfwWindowShouldClose(win)){render();glfwSwapBuffers(win);glfwPollEvents();}glfwDestroyWindow(win);glfwTerminate();return EXIT_SUCCESS;}