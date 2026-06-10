"""
Convert facenet-pytorch pretrained weights to a single-file ONNX.

Quick setup (works on Python 3.14):
    pip install torch --index-url https://download.pytorch.org/whl/cpu
    pip install --no-deps facenet-pytorch
    pip install requests numpy onnx onnxscript
    python convert_facenet.py

Output: facenet.onnx  (~90 MB inline, 512-dim embeddings)

IMPORTANT: The output must be a single self-contained .onnx file.
Newer versions of PyTorch / ONNX may split large models into a
.onnx header + .onnx.data weights file. This script explicitly
merges them back into one file so Metro can bundle it correctly.
"""

import os
import sys
print(f"Python {sys.version}")

import torch
import onnx
from onnx.external_data_helper import load_external_data_for_model

try:
    from facenet_pytorch import InceptionResnetV1
except ImportError:
    print(
        "\n[ERROR] facenet_pytorch not found.\n"
        "Run:  pip install --no-deps facenet-pytorch requests numpy\n"
    )
    sys.exit(1)


TEMP_PATH = "facenet_tmp.onnx"
OUT_PATH  = "facenet.onnx"


def export() -> None:
    print("\nLoading VGGFace2 weights (512-dim)...")
    model = InceptionResnetV1(pretrained="vggface2", classify=False).eval()
    dummy = torch.zeros(1, 3, 160, 160)

    print(f"Exporting to {TEMP_PATH} ...")
    torch.onnx.export(
        model,
        dummy,
        TEMP_PATH,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
        opset_version=12,
        do_constant_folding=True,
    )
    print(f"  Exported.")

    # PyTorch may have written TEMP_PATH as a split model (header + .onnx.data).
    # Load and re-save with all tensors inlined so Metro gets one complete file.
    print("Inlining external data (if any) ...")
    proto = onnx.load(TEMP_PATH, load_external_data=False)
    load_external_data_for_model(proto, os.path.dirname(os.path.abspath(TEMP_PATH)))
    onnx.save(proto, OUT_PATH)
    print(f"  Saved {OUT_PATH}  ({os.path.getsize(OUT_PATH) / 1e6:.1f} MB)")

    # Clean up temp files
    for leftover in [TEMP_PATH, TEMP_PATH + ".data"]:
        if os.path.exists(leftover):
            os.remove(leftover)


export()

print("\nDone!  facenet.onnx is ready — rebuild the app.")
print("If you want the lighter 128-dim model, see the README for ArcFace.")
