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
     const char* chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";glBegin(GL_QUADS);for(;*str;++str){char c=*str;if(c>='a'&&c<='z')c=char(c-32);const char*p=std::strchr(chars,c);if(p){int n=int(p-chars);for(int j=0;j<7;++j)for(int i=0;i<5;++i)if(g[n][j]&(1<<(4-i))){float xx=x+i*scale,yy=y+(6-j)*scale;glVertex2f(xx,yy);glVertex2f(xx+scale*.8f,yy);glVertex2f(xx+scale*.8f,yy+scale*.8f);glVertex2f(xx,yy+scale*.8f);}}x+=6*scale;}glEnd();
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
        pixels(ddaLine({x+25, y+35}, {x+w*.42, y+h-35}), .2f, .85f, .67f);
        pixels(bresenhamLine(int(x+w*.55), int(y+35), int(x+w-25), int(y+h-35)), .36f, .55f, 1);
        legend(x+14, y+10, "DDA", .2f, .85f, .67f);
        legend(x+w*.55, y+10, "Bresenham", .36f, .55f, 1);
    }

    void drawPolygonPanel(double x, double y, double w, double h) {
        drawPanel(x, y, w, h, "Polygon");
        Polygon p={{x+20, y+30}, {x+w*.75, y+45}, {x+w*.9, y+h*.75}, {x+w*.35, y+h*.9}, {x+10, y+h*.65}};
        Rect r{x+w*.25, y+h*.25, x+w*.78, y+h*.72};
        const auto clipped=clipPolygon(p, r);
        // Plot the pixels computed by our C++ scanline algorithm.
        // Draw the outlines afterwards so the fill cannot obscure them.
        const auto fill=scanlineFillPoints(clipped);
        color(.12f, .42f, .32f);
        glPointSize(1.0f);
        glBegin(GL_POINTS);
        for (const auto& pixel:fill) glVertex2d(pixel.x, pixel.y);
        glEnd();
        polygon(p, .95f, .55f, .24f);
        color(.3f, .65f, 1);
        glBegin(GL_LINE_LOOP);
        glVertex2d(r.left, r.bottom);
        glVertex2d(r.right, r.bottom);
        glVertex2d(r.right, r.top);
        glVertex2d(r.left, r.top);
        glEnd();
        polygon(clipped, .2f, .9f, .67f);
        legend(x+14, y+23, "Original", .95f, .55f, .24f);
        legend(x+w*.5, y+23, "Clip window", .3f, .65f, 1);
        legend(x+14, y+10, "Clipped", .2f, .9f, .67f);
        legend(x+w*.5, y+10, "Scanline fill", .12f, .42f, .32f);
    }

    void drawCirclePanel(double x, double y, double w, double h) {
        drawPanel(x, y, w, h, "Circles and ellipses");
        auto c=midpointCircle(int(x+w*.32), int(y+h*.53), int(std::min(w, h)*.23));
        glBegin(GL_POINTS);
        color(.25f, .75f, 1);
        for (auto p:c)glVertex2d(p.x, p.y);
        glEnd();
        auto e=midpointEllipse(int(x+w*.72), int(y+h*.53), int(w*.16), int(h*.26));
        glBegin(GL_POINTS);
        color(1, .65f, .3f);
        for (auto p:e)glVertex2d(p.x, p.y);
        glEnd();
        legend(x+14, y+10, "Midpoint circle", .25f, .75f, 1);
        legend(x+w*.5, y+10, "Midpoint ellipse", 1, .65f, .3f);
    }

    void drawCurvePanel(double x, double y, double w, double h) {
        drawPanel(x, y, w, h, "Bezier and spline curves");
        Point2D a{x+15, y+35}, b{x+w*.3, y+h*.8}, c{x+w*.65, y+h*.2}, d{x+w-15, y+h*.7};
        line(bezierCurve(a, b, c, d, 80), .3f, .85f, .68f, 2);
        std::vector<Point2D> cp={{x+20, y+h*.25}, {x+w*.3, y+h*.7}, {x+w*.58, y+h*.35}, {x+w-20, y+h*.65}};
        line(catmullRomSpline(cp, 25), .55f, .58f, 1, 2);
        for (auto p:cp)point(p.x, p.y, 1, .7f, .3f, 6);
        legend(x+14, y+23, "Bezier", .3f, .85f, .68f);
        legend(x+w*.5, y+23, "Catmull Rom", .55f, .58f, 1);
        legend(x+14, y+10, "Spline control points", 1, .7f, .3f);
    }

    void drawAnatomy(double x, double y, double w, double h) {
        drawPanel(x, y, w, h, "Anatomy study");
        double cx=x+w/2, cy=y+h*.52;
        auto head=midpointCircle(int(cx), int(cy+h*.28), int(h*.10));
        color(.7f, .78f, .88f);
        glBegin(GL_POINTS);
        for (auto p:head)glVertex2d(p.x, p.y);
        glEnd();
        line(bresenhamLine(int(cx), int(cy+h*.17), int(cx), int(cy-h*.22)), .7f, .78f, .88f, 3);
        line(bresenhamLine(int(cx), int(cy+h*.08), int(cx-w*.2), int(cy-h*.02)), .7f, .78f, .88f, 3);
        line(bresenhamLine(int(cx), int(cy+h*.08), int(cx+w*.2), int(cy-h*.02)), .7f, .78f, .88f, 3);
        line(bresenhamLine(int(cx), int(cy-h*.22), int(cx-w*.12), int(y+20)), .7f, .78f, .88f, 3);
        line(bresenhamLine(int(cx), int(cy-h*.22), int(cx+w*.12), int(y+20)), .7f, .78f, .88f, 3);
        auto heart=bezierCurve({cx-18, cy-12}, {cx-35, cy+15}, {cx-5, cy+20}, {cx, cy+2}, 30);
        line(heart, 1, .35f, .4f, 2);
        line(bezierCurve({cx, cy+2}, {cx+25, cy+24}, {cx+35, cy-5}, {cx+4, cy-18}, 30), 1, .35f, .4f, 2);
        legend(x+14, y+10, "Body", .7f, .78f, .88f);
        legend(x+w*.5, y+10, "Heart curves", 1, .35f, .4f);
    }

    void render() {
        glClearColor(.035f, .045f, .07f, 1);
        glClear(GL_COLOR_BUFFER_BIT);
        glMatrixMode(GL_PROJECTION);
        glLoadIdentity();
        glOrtho(0, W, 0, H, -1, 1);
        glMatrixMode(GL_MODELVIEW);
        glLoadIdentity();
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
    }

    void key(GLFWwindow* w, int k, int, int action, int) {
        if (action==GLFW_PRESS) {
            if (k==GLFW_KEY_ESCAPE)glfwSetWindowShouldClose(w, GLFW_TRUE);
            if (k==GLFW_KEY_G)grid=!grid;
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
