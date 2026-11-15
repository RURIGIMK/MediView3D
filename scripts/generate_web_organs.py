"""Compatibility entry point for the licensed Z-Anatomy organ exporter."""

import os
import runpy


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
runpy.run_path(os.path.join(ROOT, "scripts", "export_z_anatomy_organs.py"), run_name="__main__")
