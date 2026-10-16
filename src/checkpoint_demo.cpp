#include "mediview/graphics_algorithms.hpp"
#include <GLFW/glfw3.h>
#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <iostream>
using namespace mediview;

namespace {
    int W=1280, H=760;
    bool grid=true;
    bool polygonFill=true;
    bool concavePolygon=false;
    int lineExample=0; // All, positive slope, horizontal, vertical, negative slope.
    void color(float r, float g, float b) {
        glColor3f(r, g, b);
    }

    void point(double x, double y, float r, float g, float b, float size=3) {
        color(r, g, b);
        glPointSize(size);
        glBegin(GL_POINTS);
        glVertex2d(x, y);
        glEnd();
    }

    void line(const std::vector<Point2D>& p, float r, float g, float b, float width=1.5f) {
        color(r, g, b);
        glLineWidth(width);
        glBegin(GL_LINE_STRIP);
        for (auto v:p)glVertex2d(v.x, v.y);
        glEnd();
    }

    void pixels(const std::vector<Point2D>& samples, float r, float g, float b) {
        color(r, g, b);
        glPointSize(1.0f);
        glBegin(GL_POINTS);
        for (const auto& sample:samples) {
            // Align integer raster coordinates to pixel centres.
            glVertex2d(sample.x+0.5, sample.y+0.5);
        }
        glEnd();
    }

    void polygon(const Polygon& p, float r, float g, float b) {
        if (p.size()<2)return;
        color(r, g, b);
        glBegin(GL_LINE_LOOP);
        for (auto v:p)glVertex2d(v.x, v.y);
        glEnd();
    }

    void panel(double x, double y, double w, double h) {
        color(.10f, .13f, .19f);
        glBegin(GL_QUADS);
        glVertex2d(x, y);
        glVertex2d(x+w, y);
        glVertex2d(x+w, y+h);
        glVertex2d(x, y+h);
        glEnd();
    }

    void bitmap(float x,float y,const char* str,float scale=1.4f){
     static const unsigned char g[][7]={{14,17,17,31,17,17,17},{30,17,17,30,17,17,30},{14,17,16,16,16,17,14},{30,17,17,17,17,17,30},{31,16,16,30,16,16,31},{31,16,16,30,16,16,16},{14,17,16,23,17,17,15},{17,17,17,31,17,17,17},{14,4,4,4,4,4,14},{7,2,2,2,18,18,12},{17,18,20,24,20,18,17},{16,16,16,16,16,16,31},{17,27,21,21,17,17,17},{17,25,21,19,17,17,17},{14,17,17,17,17,17,14},{30,17,17,30,16,16,16},{14,17,17,17,21,18,13},{30,17,17,30,20,18,17},{15,16,16,14,1,1,30},{31,4,4,4,4,4,4},{17,17,17,17,17,17,14},{17,17,17,17,17,10,4},{17,17,17,21,21,21,10},{17,17,10,4,10,17,17},{17,17,10,4,4,4,4},{31,1,2,4,8,16,31},{14,17,19,21,25,17,14},{4,12,4,4,4,4,14},{14,17,1,2,4,8,31},{30,1,1,14,1,1,30},{2,6,10,18,31,2,2},{31,16,16,30,1,1,30},{14,16,16,30,17,17,14},{31,1,2,4,8,8,8},{14,17,17,14,17,17,14},{14,17,17,15,1,1,14}};
     const char* chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
     glBegin(GL_QUADS);
     for(;*str;++str){
        char c=*str;
        //check for spaces and null ptr
        if (c == ' ') {
            x += 6 * scale;
            continue;
        }
        if (c == ' ') {
            x += 6 * scale;
            continue;
        }
        if(c>='a'&&c<='z')c=char(c-32);
        const char*p=std::strchr(chars,c);
        if(p){int n=int(p-chars);
            for(int j=0;j<7;++j)for(int i=0;i<5;++i)if(g[n][j]&(1<<(4-i))){float xx=x+i*scale,yy=y+(6-j)*scale;glVertex2f(xx,yy);glVertex2f(xx+scale*.8f,yy);glVertex2f(xx+scale*.8f,yy+scale*.8f);glVertex2f(xx,yy+scale*.8f);}}x+=6*scale;}glEnd();
    }

    // Match each label and swatch to the colour used for its geometry.
    void legend(double x, double y, const char* label, float r, float g, float b) {
        color(r, g, b);
        glBegin(GL_QUADS);
        glVertex2d(x, y);
        glVertex2d(x+8, y);
        glVertex2d(x+8, y+8);
        glVertex2d(x, y+8);
        glEnd();
        bitmap(float(x+14), float(y), label, 1.0f);
    }

    void drawPanel(double x, double y, double w, double h, const char* title) {
        panel(x, y, w, h);
        color(.42f, .48f, .58f);
        glBegin(GL_LINE_LOOP);
        glVertex2d(x, y);
        glVertex2d(x+w, y);
        glVertex2d(x+w, y+h);
        glVertex2d(x, y+h);
        glEnd();
        color(.85f, .91f, 1.0f);
        bitmap(float(x+14), float(y+h-22), title, 1.4f);
    }

    void drawLinePanel(double x, double y, double w, double h) {
        drawPanel(x, y, w, h, "Lines");
        const char* examples[]={"L  All examples", "L  Positive slope", "L  Horizontal",
                                "L  Vertical", "L  Negative slope"};
        color(.7f, .78f, .88f);
        bitmap(float(x+14), float(y+h-38), examples[lineExample], 1.0f);
        // Each half uses identical local geometry for a fair visual comparison.
        const double half=w*.5;
        const double left=20, right=half-20;
        const double bottom=y+40, height=h-100;
        const Point2D starts[]={
            {left, bottom},
            {left, bottom+height*.40},
            {left, bottom+height*.58},
            {left, bottom+height}
        };
        const Point2D ends[]={
            {right, bottom+height*.25}, // Positive slope.
            {right, bottom+height*.40}, // Horizontal.
            {left, bottom+height*.80},  // Vertical.
            {right, bottom+height*.58}  // Negative slope.
        };
        for (int i=0; i<4; ++i) {
            if (lineExample!=0 && i!=lineExample-1) continue;
            pixels(ddaLine({x+starts[i].x, starts[i].y},
                           {x+ends[i].x, ends[i].y}), .2f, .85f, .67f);
            pixels(bresenhamLine(int(x+half+starts[i].x), int(starts[i].y),
                                 int(x+half+ends[i].x), int(ends[i].y)), .36f, .55f, 1);
        }
        legend(x+14, y+10, "DDA", .2f, .85f, .67f);
        legend(x+w*.55, y+10, "Bresenham", .36f, .55f, 1);
    }

    void drawPolygonPanel(double x, double y, double w, double h) {
        drawPanel(x, y, w, h, "Polygon");
        color(.7f, .78f, .88f);
        bitmap(float(x+w*.5), float(y+h-22),
               polygonFill ? "F  Fill on" : "F  Fill off", 1.0f);
        color(.85f, .91f, 1.0f);
        bitmap(float(x+w*.5), float(y+h-53),
               concavePolygon ? "P  Concave" : "P  Convex", 1.0f);
        const double half=w*.5;
        const double plotBottom=y+48, plotHeight=h-105;
        const Polygon convex={{12, 0}, {half*.75, plotHeight*.08},
                              {half-12, plotHeight*.78}, {half*.35, plotHeight},
                              {8, plotHeight*.65}};
        // The inward corner stays within the clip window so the clipped result
        // visibly retains its concavity and remains a single connected polygon.
        const Polygon concave={{half*.10, plotHeight*.10},
                               {half*.90, plotHeight*.10},
                               {half*.90, plotHeight*.90},
                               {half*.55, plotHeight*.50},
                               {half*.10, plotHeight*.90}};
        const Polygon& local=concavePolygon ? concave : convex;
        for (int view=0; view<2; ++view) {
            const double origin=x+view*half;
            Polygon original;
            for (const auto& vertex:local) {
                original.push_back({origin+vertex.x, plotBottom+vertex.y});
            }
            const Rect window{origin+half*.25, plotBottom+plotHeight*.20,
                              origin+half*.78, plotBottom+plotHeight*.72};
            const Polygon boundary={{window.left, window.bottom},
                                    {window.right, window.bottom},
                                    {window.right, window.top},
                                    {window.left, window.top}};
            if (view==0) {
                polygon(original, .95f, .55f, .24f);
                polygon(boundary, .3f, .65f, 1);
            } else {
                const auto clipped=clipPolygon(original, window);
                if (polygonFill) {
                    pixels(scanlineFillPoints(clipped), .12f, .42f, .32f);
                }
                // Keep the retained boundary visible over the clipping window.
                polygon(boundary, .3f, .65f, 1);
                polygon(clipped, .2f, .9f, .67f);
            }
            color(.7f, .78f, .88f);
            bitmap(float(origin+14), float(y+h-38),
                   view==0 ? "Before clipping" : "After clipping", 1.0f);
        }
        legend(x+14, y+23, "Original", .95f, .55f, .24f);
        legend(x+w*.5, y+23, "Clip window", .3f, .65f, 1);
        legend(x+14, y+10, "Clipped", .2f, .9f, .67f);
        legend(x+w*.5, y+10, "Scanline fill", .12f, .42f, .32f);
    }

    void drawCirclePanel(double x, double y, double w, double h) {
        drawPanel(x, y, w, h, "Circles and ellipses");
        const int cx=int(x+w*.32), cy=int(y+h*.53);
        const int radius=int(std::min(w, h)*.23);
        // Axes and diagonals divide the circle into its eight symmetric octants.
        const float guide=.38f;
        line({{double(cx-radius), double(cy)}, {double(cx+radius), double(cy)}}, guide, guide, guide, 1);
        line({{double(cx), double(cy-radius)}, {double(cx), double(cy+radius)}}, guide, guide, guide, 1);
        const double diagonal=radius*.70710678118;
        line({{cx-diagonal, cy-diagonal}, {cx+diagonal, cy+diagonal}}, guide, guide, guide, 1);
        line({{cx-diagonal, cy+diagonal}, {cx+diagonal, cy-diagonal}}, guide, guide, guide, 1);
        auto c=midpointCircle(cx, cy, radius);
        glPointSize(1.0f);
        glBegin(GL_POINTS);
        color(.25f, .75f, 1);
        for (auto p:c)glVertex2d(p.x, p.y);
        glEnd();
        point(cx, cy, 1, 1, 1, 5);
        color(.7f, .78f, .88f);
        bitmap(float(cx-radius), float(cy-radius-16), "8 octants", 1.0f);
        glPointSize(1.0f);
        const int ex=int(x+w*.72), ey=int(y+h*.53);
        const int rx=int(w*.16), ry=int(h*.26);
        // The ellipse reflects across these two axes into four quadrants.
        line({{double(ex-rx), double(ey)}, {double(ex+rx), double(ey)}}, guide, guide, guide, 1);
        line({{double(ex), double(ey-ry)}, {double(ex), double(ey+ry)}}, guide, guide, guide, 1);
        auto e=midpointEllipse(ex, ey, rx, ry);
        glBegin(GL_POINTS);
        color(1, .65f, .3f);
        for (auto p:e)glVertex2d(p.x, p.y);
        glEnd();
        point(ex, ey, 1, 1, 1, 5);
        glPointSize(1.0f);
        color(.7f, .78f, .88f);
        bitmap(float(ex+rx*.5), float(ey+7), "RX", 1.0f);
        bitmap(float(ex+7), float(ey+ry*.5), "RY", 1.0f);
        bitmap(float(ex-rx), float(ey-ry-16), "4 quadrants", 1.0f);
        legend(x+14, y+10, "Midpoint circle", .25f, .75f, 1);
        legend(x+w*.5, y+10, "Midpoint ellipse", 1, .65f, .3f);
    }

    void drawCurvePanel(double x, double y, double w, double h) {
        drawPanel(x, y, w, h, "Bezier and spline curves");
        Point2D a{x+15, y+35}, b{x+w*.3, y+h*.8}, c{x+w*.65, y+h*.2}, d{x+w-15, y+h*.7};
        const std::vector<Point2D> bezierControls={a, b, c, d};
        line(bezierControls, .3f, .48f, .43f, 1);
        line(bezierCurve(a, b, c, d, 80), .3f, .85f, .68f, 2);
        const char* bezierLabels[]={"B0", "B1", "B2", "B3"};
        for (int i=0; i<4; ++i) {
            const auto& control=bezierControls[i];
            point(control.x, control.y, .3f, .85f, .68f, 6);
            color(.3f, .85f, .68f);
            bitmap(float(control.x-5), float(control.y+10), bezierLabels[i], 1.0f);
        }
        std::vector<Point2D> cp={{x+20, y+h*.25}, {x+w*.3, y+h*.7}, {x+w*.58, y+h*.35}, {x+w-20, y+h*.65}};
        line(cp, .48f, .35f, .22f, 1);
        line(catmullRomSpline(cp, 25), .55f, .58f, 1, 2);
        const char* splineLabels[]={"S0", "S1", "S2", "S3"};
        for (std::size_t i=0; i<cp.size(); ++i) {
            point(cp[i].x, cp[i].y, 1, .7f, .3f, 6);
            color(1, .7f, .3f);
            bitmap(float(cp[i].x-5), float(cp[i].y-16), splineLabels[i], 1.0f);
        }
        legend(x+14, y+23, "Bezier B0 to B3", .3f, .85f, .68f);
        legend(x+w*.5, y+23, "Catmull Rom", .55f, .58f, 1);
        legend(x+14, y+10, "Spline controls S0 to S3", 1, .7f, .3f);
    }

    void drawAnatomy(double x, double y, double w, double h) {
        drawPanel(x, y, w, h, "Anatomy study");
        const double cx=x+w*.5;
        const double base=y+48, height=h-90;
        const double shoulder=base+height*.68, hip=base+height*.30;

        // A filled polygon provides a simplified torso behind the organs.
        const Polygon torso={{cx-w*.15, shoulder}, {cx+w*.15, shoulder},
                             {cx+w*.10, hip}, {cx-w*.10, hip}};
        pixels(scanlineFillPoints(torso), .14f, .22f, .30f);
        polygon(torso, .7f, .78f, .88f);
        pixels(midpointCircle(int(cx), int(base+height*.88), int(height*.10)),
               .7f, .78f, .88f);

        // Bresenham supplies the neck, spine, arms and legs.
        const auto bodyLine=[](Point2D start, Point2D end) {
            pixels(bresenhamLine(int(start.x), int(start.y), int(end.x), int(end.y)),
                   .7f, .78f, .88f);
        };
        bodyLine({cx, base+height*.78}, {cx, hip});
        for (int side:{-1, 1}) {
            bodyLine({cx+side*w*.15, shoulder}, {cx+side*w*.23, base+height*.38});
            bodyLine({cx+side*w*.23, base+height*.38}, {cx+side*w*.25, base+height*.24});
            bodyLine({cx+side*w*.07, hip}, {cx+side*w*.12, base});
            pixels(midpointEllipse(int(cx+side*w*.065), int(base+height*.56),
                                   int(w*.045), int(height*.095)), .35f, .75f, 1);
        }

        // Two cubic Bezier segments form one closed schematic heart.
        const double heartY=base+height*.43;
        const double heartWidth=w*.055, heartHeight=height*.10;
        const Point2D notch{cx, heartY+heartHeight*.25};
        const Point2D tip{cx, heartY-heartHeight};
        line(bezierCurve(notch, {cx-heartWidth*1.8, heartY+heartHeight*1.5},
                         {cx-heartWidth*1.8, heartY}, tip, 40), 1, .35f, .4f, 2);
        line(bezierCurve(tip, {cx+heartWidth*1.8, heartY},
                         {cx+heartWidth*1.8, heartY+heartHeight*1.5}, notch, 40),
             1, .35f, .4f, 2);

        legend(x+14, y+23, "Lines and circle", .7f, .78f, .88f);
        legend(x+w*.5, y+23, "Ellipse lungs", .35f, .75f, 1);
        legend(x+14, y+10, "Filled torso", .14f, .22f, .30f);
        legend(x+w*.5, y+10, "Bezier heart", 1, .35f, .4f);
    }

    void render() {
        glClearColor(.035f, .045f, .07f, 1);
        glClear(GL_COLOR_BUFFER_BIT);
      
        if (grid) {
            color(.08f, .10f, .14f);
            glBegin(GL_LINES);
            for (int x=0;x<W;x+=25) {
                glVertex2d(x, 0);
                glVertex2d(x, H);
            }
            for (int y=0;y<H;y+=25) {
                glVertex2d(0, y);
                glVertex2d(W, y);
            }
            glEnd();
        }
        panel(16, H-58, W-32, 42);
        color(.25f, .86f, .73f);
        bitmap(30, float(H-43), "MediView 3D - Checkpoint 1", 2.0f);
        double margin=18, gap=14, top=H-78, bottom=18, pw=(W-2*margin-2*gap)/3, ph=(top-bottom-2*gap)/2;
        drawLinePanel(margin, bottom+ph+gap, pw, ph);
        drawPolygonPanel(margin+pw+gap, bottom+ph+gap, pw, ph);
        drawCirclePanel(margin+2*(pw+gap), bottom+ph+gap, pw, ph);
        drawCurvePanel(margin, bottom, pw, ph);
        drawAnatomy(margin+pw+gap, bottom, pw, ph);
        drawPanel(margin+2*(pw+gap), bottom, pw, ph, "Overview");
    }

    void resize(GLFWwindow*, int w, int h) {
        W=std::max(1, w);
        H=std::max(1, h);
        glViewport(0, 0, W, H);

          glMatrixMode(GL_PROJECTION);
        glLoadIdentity();
        glOrtho(0, W, 0, H, -1, 1);
        glMatrixMode(GL_MODELVIEW);
        glLoadIdentity();
    }

    void key(GLFWwindow* w, int k, int, int action, int) {
        if (action==GLFW_PRESS) {
            if (k==GLFW_KEY_ESCAPE)glfwSetWindowShouldClose(w, GLFW_TRUE);
            if (k==GLFW_KEY_G)grid=!grid;
            if (k==GLFW_KEY_F)polygonFill=!polygonFill;
            if (k==GLFW_KEY_P)concavePolygon=!concavePolygon;
            if (k==GLFW_KEY_L)lineExample=(lineExample+1)%5;
        }
    }
}

int main() {
    if (!glfwInit()) {
        std::cerr<<"GLFW initialization failed.\n";
        return EXIT_FAILURE;
    }
    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 2);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 1);
    GLFWwindow* win=glfwCreateWindow(W, H, "MediView 3D | Checkpoint 1", nullptr, nullptr);
    if (!win) {
        std::cerr<<"Could not create OpenGL window.\n";
        glfwTerminate();
        return EXIT_FAILURE;
    }
    glfwMakeContextCurrent(win);
    glfwSwapInterval(1);
    glfwSetFramebufferSizeCallback(win, resize);
    glfwSetKeyCallback(win, key);
    while (!glfwWindowShouldClose(win)) {
        render();
        glfwSwapBuffers(win);
        glfwPollEvents();
    }
    glfwDestroyWindow(win);
    glfwTerminate();
    return EXIT_SUCCESS;
}
