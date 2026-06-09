# FaceNet ONNX Model

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
