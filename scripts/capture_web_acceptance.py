"""Capture the browser viewer acceptance set with local files and Playwright.

Run from the repository root with Python Playwright and Chromium installed:
  python scripts/capture_web_acceptance.py
"""

import json
import mimetypes
import pathlib
import argparse
import urllib.parse

from playwright.sync_api import sync_playwright


ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "acceptance"
VIEWER_URL = "http://viewer.local/web/index.html?qa=1"


def capture():
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true")
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    console_errors = []
    failed_requests = []
    snapshots = []
    screenshots = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--use-gl=swiftshader", "--use-angle=swiftshader"])
        page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)

        def serve_local_files(route):
            request_url = urllib.parse.urlparse(route.request.url)
            if request_url.hostname != "viewer.local":
                route.abort()
                return
            relative_path = urllib.parse.unquote(request_url.path).lstrip("/")
            target = (ROOT / relative_path).resolve()
            if ROOT not in target.parents and target != ROOT:
                route.abort()
                return
            if not target.is_file():
                failed_requests.append({"url": route.request.url, "error": "file not found"})
                route.fulfill(status=404, body="Not found")
                return
            route.fulfill(
                status=200,
                body=target.read_bytes(),
                content_type=mimetypes.guess_type(target.name)[0] or "application/octet-stream",
                headers={"Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin"},
            )

        page.route("**/*", serve_local_files)
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: console_errors.append(str(error)))
        page.on("requestfailed", lambda request: failed_requests.append({"url": request.url, "error": request.failure}))
        page.goto(VIEWER_URL, wait_until="domcontentloaded")
        page.wait_for_function(
            "window.__mediviewQA && window.__mediviewQA.snapshot().layers.every(layer => !layer.loading) && window.__mediviewQA.snapshot().structures.length === 70",
            timeout=120000,
        )

        if args.smoke:
            value = page.evaluate("window.__mediviewQA.snapshot()")
            print(json.dumps({
                "status": value["status"],
                "atlas_frame": value["atlasFrame"],
                "registration": value["registration"],
                "structures": {item["name"]: {"centroid": item["centroid"], "min": item["min"], "max": item["max"], "visible": item["visible"], "material": item["material"]} for item in value["structures"] if item["name"] in {"Human skeleton", "Heart", "Lung_L", "Liver", "Kidney_L", "Bladder", "Brain", "Spinal_Cord", "Neck_L", "Pectorals_L", "Quadriceps_L", "Calves_L"}},
            }, indent=2))
            page.screenshot(path=str(ROOT / "evidence" / "viewer-smoke.png"))
            browser.close()
            return

        def snapshot():
            value = page.evaluate("window.__mediviewQA.snapshot()")
            snapshots.append(value)
            return value

        def mode(value):
            page.evaluate("(value) => window.__mediviewQA.setMode(value)", value)
            page.wait_for_timeout(150)

        def layer(identifier, visible):
            page.evaluate("([id, visible]) => window.__mediviewQA.setLayer(id, visible)", [identifier, visible])

        def save(name):
            snapshot()
            path = OUTPUT / f"{name}.png"
            page.screenshot(path=str(path))
            screenshots.append(str(path.relative_to(ROOT)).replace("\\", "/"))

        mode("skeletal")
        save("01-skeleton-only")
        mode("muscular")
        save("02-muscles-only")
        layer("skeleton", True)
        save("03-skeleton-and-muscles")
        mode("nervous")
        save("04-nervous-only")
        mode("organs")
        save("05-internal-organs-only")
        mode("complete")
        layer("nerves", False)
        layer("vessels", False)
        save("06-skeleton-muscles-organs")
        mode("complete")
        save("07-all-systems")
        mode("transparent-muscle")
        save("08-transparent-muscle-with-organs")

        mode("complete")
        layer("organs", False)
        layer("vessels", False)
        layer("muscles", False)
        layer("skeleton", True)
        layer("nerves", True)
        page.evaluate("window.__mediviewQA.select('Brain', false)")
        page.evaluate("window.__mediviewQA.setStructureOpacity('Human skeleton', 0.4)")
        page.evaluate("window.__mediviewQA.clearHighlight()")
        page.evaluate("window.__mediviewQA.frameStructure('Brain', 1.8)")
        save("09-head-and-brain-closeup")
        mode("complete")
        layer("muscles", False)
        layer("nerves", False)
        layer("vessels", False)
        page.evaluate("window.__mediviewQA.select('Heart', false)")
        page.evaluate("window.__mediviewQA.clearHighlight()")
        page.evaluate("window.__mediviewQA.frameStructure('Heart', 1.8)")
        save("10-heart-and-lungs-closeup")
        page.evaluate("window.__mediviewQA.select('Bladder', false)")
        page.evaluate("window.__mediviewQA.clearHighlight()")
        page.evaluate("window.__mediviewQA.frameStructure('Bladder', 1.8)")
        save("11-pelvis-closeup")
        mode("complete")
        layer("organs", False)
        layer("vessels", False)
        page.evaluate("window.__mediviewQA.select('Brachial_Plexus_L', false)")
        page.evaluate("window.__mediviewQA.clearHighlight()")
        page.evaluate("window.__mediviewQA.frameStructure('Brachial_Plexus_L', 1.8)")
        save("12-arm-nerves-and-muscles-closeup")

        baseline = snapshots[0]["structures"]
        baseline_centroids = {item["name"]: item["centroid"] for item in baseline}
        centroid_drift = {}
        for index, value in enumerate(snapshots[1:], start=2):
            current = {item["name"]: item["centroid"] for item in value["structures"]}
            missing = set(baseline_centroids) - set(current)
            if missing:
                centroid_drift[str(index)] = {"missing": sorted(missing)}
                continue
            drift = max(
                sum((current[name][axis] - point[axis]) ** 2 for axis in range(3)) ** 0.5
                for name, point in baseline_centroids.items()
            )
            centroid_drift[str(index)] = {"max_m": drift, "pass": drift <= 0.001}

        responsive = []
        for width, height in [(1920, 1080), (1366, 768), (1024, 768), (390, 844)]:
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_timeout(150)
            responsive.append(
                page.evaluate(
                    """() => ({
                      viewport: [innerWidth, innerHeight],
                      pageOverflow: document.documentElement.scrollWidth > innerWidth,
                      panelsOverlap: (() => { const a=document.querySelector('.anatomy-panel').getBoundingClientRect(), b=document.querySelector('.info-panel').getBoundingClientRect(); return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; })(),
                      leftPanel: (() => { const r=document.querySelector('.anatomy-panel').getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom]; })(),
                      rightPanel: (() => { const r=document.querySelector('.info-panel').getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom]; })(),
                      status: document.querySelector('#load-state').innerText,
                      mode: document.querySelector('#anatomy-mode').value
                    })"""
                )
            )

        final = snapshots[-1]
        report = {
            "status": final["status"],
            "registration": final["registration"],
            "atlas_frame": final["atlasFrame"],
            "structure_count": len(final["structures"]),
            "layer_states": final["layers"],
            "centroid_consistency": centroid_drift,
            "screenshots": screenshots,
            "responsive": responsive,
            "console_errors": console_errors,
            "failed_requests": failed_requests,
        }
        (OUTPUT / "browser-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        (OUTPUT / "centroids-by-view.json").write_text(
            json.dumps({"screenshots": screenshots, "snapshots": snapshots}, indent=2), encoding="utf-8"
        )
        browser.close()
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    capture()
