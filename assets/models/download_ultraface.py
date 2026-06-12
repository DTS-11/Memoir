"""
Download the UltraFace RFB-320 ONNX model from the ONNX Model Zoo.

    python assets/models/download_ultraface.py

Output: assets/models/ultraface.onnx  (~1.3 MB)

Unlike facenet.onnx, this file is small enough to commit to git directly.
"""

import os
import sys
import urllib.request

URL = (
    "https://github.com/onnx/models/raw/main/"
    "validated/vision/body_analysis/ultraface/models/version-RFB-320.onnx"
)
OUT = os.path.join(os.path.dirname(__file__), "ultraface.onnx")


def download() -> None:
    print(f"Downloading UltraFace RFB-320 → {OUT}")
    urllib.request.urlretrieve(URL, OUT)
    size = os.path.getsize(OUT)
    if size < 500_000:
        os.remove(OUT)
        print(f"[ERROR] Downloaded file is too small ({size} bytes). Check the URL.")
        sys.exit(1)
    print(f"Done. {size / 1e6:.2f} MB — commit this file to git.")


download()
