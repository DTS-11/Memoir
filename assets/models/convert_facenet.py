"""
Convert facenet-pytorch pretrained weights to ONNX.

Quick setup (works on Python 3.14):
    pip install torch --index-url https://download.pytorch.org/whl/cpu
    pip install --no-deps facenet-pytorch
    pip install requests numpy onnx onnxscript
    python convert_facenet.py

Output: facenet.onnx  (~90 MB, 512-dim embeddings)
"""

import sys
print(f"Python {sys.version}")

import torch

try:
    from facenet_pytorch import InceptionResnetV1
except ImportError:
    print(
        "\n[ERROR] facenet_pytorch not found.\n"
        "Run:  pip install --no-deps facenet-pytorch requests numpy\n"
    )
    sys.exit(1)


def export(classify: bool, out_path: str, dim_label: str) -> None:
    print(f"\nLoading VGGFace2 weights ({dim_label})...")
    # classify=False  → 512-dim embedding head
    # classify=True   → 8631-class logits, then strip last layer for 512-dim
    model = InceptionResnetV1(pretrained="vggface2", classify=classify).eval()

    dummy = torch.zeros(1, 3, 160, 160)

    print(f"Exporting to {out_path} ...")
    torch.onnx.export(
        model,
        dummy,
        out_path,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
        opset_version=12,
        do_constant_folding=True,
    )
    print(f"  Saved {out_path}")


# 512-dim (default) ─ higher accuracy, larger file
export(classify=False, out_path="facenet.onnx", dim_label="512-dim")

print("\nDone!  Copy facenet.onnx into assets/models/ and rebuild the app.")
print("If you want the lighter 128-dim model, see the README for ArcFace.")
