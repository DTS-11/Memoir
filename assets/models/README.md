# ONNX Models

Two models are required. Run the scripts below once, then build.

## ultraface.onnx — face detection (~1.3 MB, commit to git)

```bash
python assets/models/download_ultraface.py
```

| Property    | Value                              |
|-------------|------------------------------------|
| Input       | `[1, 3, 240, 320]` NCHW float32   |
| Normalise   | `(pixel − 127) / 128`             |
| Output[0]   | `scores` `[1, 4420, 2]`           |
| Output[1]   | `boxes`  `[1, 4420, 4]` — x1 y1 x2 y2 normalised 0–1 |
| Source      | ONNX Model Zoo — version-RFB-320  |

---

## facenet.onnx — face embeddings (~90 MB, do NOT commit)

Place your `facenet.onnx` file in this directory before building.

## Expected model spec

| Property      | Value                                |
|---------------|--------------------------------------|
| Input name    | first input (auto-detected at runtime)|
| Input shape   | `[1, 3, 160, 160]` — NCHW float32    |
| Pixel range   | `(pixel − 127.5) / 128.0`            |
| Output        | `[1, 128]` or `[1, 512]` float32     |
| L2-normalized | Yes                                  |

## Recommended sources

### Option A — timesler/facenet-pytorch (PyTorch → ONNX)
```bash
pip install facenet-pytorch torch onnx
python -c "
import torch
from facenet_pytorch import InceptionResnetV1
model = InceptionResnetV1(pretrained='vggface2').eval()
dummy = torch.randn(1, 3, 160, 160)
torch.onnx.export(model, dummy, 'facenet.onnx',
  input_names=['input'], output_names=['output'],
  opset_version=11)
"
```

### Option B — Pre-converted model
Search GitHub for `facenet.onnx` releases, e.g.:
  https://github.com/elliottzheng/face-alignment/releases

### Option C — ArcFace (higher accuracy, different input size)
If you switch to ArcFace (112×112 input), update `MODEL_INPUT_SIZE = 112`
in `src/services/FaceEmbeddingService.ts` and use normalization `pixel/127.5 - 1`.

Download: https://github.com/onnx/models/tree/main/validated/vision/body_analysis/arcface
