import { Asset } from "expo-asset";
import * as ImageManipulator from "expo-image-manipulator";
import type { InferenceSession, Tensor } from "onnxruntime-react-native";
import { Image } from "react-native";
import jpeg from "jpeg-js";

// UltraFace RFB-320
// Input : float32 NCHW [1, 3, 240, 320], normalised (pixel − 127) / 128
// Output[scores]: [1, 4420, 2]  — [bg_prob, face_prob]
// Output[boxes] : [1, 4420, 4]  — [x1, y1, x2, y2] normalised 0–1
const DETECTOR_W = 320;
const DETECTOR_H = 240;
const SCORE_THRESH = 0.7;
const IOU_THRESH = 0.3;

export type DetectedFace = {
  bounds: { x: number; y: number; width: number; height: number };
};

// ── Singleton session ─────────────────────────────────────────────────────────
let _session: InferenceSession | null = null;
let _sessionPromise: Promise<InferenceSession> | null = null;

// onnxruntime-react-native runs a synchronous JSI install() at import time and
// loads large models when InferenceSession.create() is called. Importing it at
// module load would do this native work during app startup (before React
// mounts), which can hard-crash on-device. Load it lazily, only when a face
// scan actually runs.
let _ort: typeof import("onnxruntime-react-native") | null = null;
function getOrt(): typeof import("onnxruntime-react-native") {
  if (_ort) return _ort;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _ort = require("onnxruntime-react-native") as typeof import("onnxruntime-react-native");
  return _ort;
}

async function loadSession(): Promise<InferenceSession> {
  if (_session) return _session;
  if (_sessionPromise) return _sessionPromise;
  _sessionPromise = (async () => {
    const [asset] = await Asset.loadAsync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../../assets/models/ultraface.onnx"),
    );
    if (!asset.localUri) throw new Error("ultraface.onnx has no localUri");
    const { InferenceSession } = getOrt();
    _session = await InferenceSession.create(asset.localUri);
    return _session;
  })();
  return _sessionPromise;
}

export function preloadDetector(): Promise<void> {
  return loadSession()
    .then(() => {})
    .catch(() => {});
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getOriginalSize(uri: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) =>
    Image.getSize(uri, (w, h) => resolve({ w, h }), reject),
  );
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function rgbaToNchw(rgba: Uint8Array, w: number, h: number): Float32Array {
  const n = w * h;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    out[i] = (rgba[i * 4] - 127) / 128; // R
    out[n + i] = (rgba[i * 4 + 1] - 127) / 128; // G
    out[2 * n + i] = (rgba[i * 4 + 2] - 127) / 128; // B
  }
  return out;
}

function iou(a: number[], b: number[]): number {
  const x1 = Math.max(a[0], b[0]),
    y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]),
    y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter === 0) return 0;
  return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter);
}

function nms(boxes: number[][], scores: number[]): number[] {
  const order = scores
    .map((s, i) => [s, i] as [number, number])
    .sort((a, b) => b[0] - a[0])
    .map(([, i]) => i);
  const kept: number[] = [];
  const dropped = new Set<number>();
  for (const i of order) {
    if (dropped.has(i)) continue;
    kept.push(i);
    for (const j of order) {
      if (j !== i && !dropped.has(j) && iou(boxes[i], boxes[j]) > IOU_THRESH)
        dropped.add(j);
    }
  }
  return kept;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function detectFaces(imageUri: string): Promise<DetectedFace[]> {
  try {
    const { Tensor } = getOrt();
    const [origSize, resized] = await Promise.all([
      getOriginalSize(imageUri),
      ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: DETECTOR_W, height: DETECTOR_H } }],
        { format: ImageManipulator.SaveFormat.JPEG, base64: true, compress: 0.9 },
      ),
    ]);

    if (!resized.base64) return [];

    const decoded = jpeg.decode(base64ToBytes(resized.base64), { useTArray: true });
    const tensor = new Tensor(
      "float32",
      rgbaToNchw(decoded.data, decoded.width, decoded.height),
      [1, 3, DETECTOR_H, DETECTOR_W],
    );

    const sess = await loadSession();
    const out = await sess.run({ [sess.inputNames[0]]: tensor });

    // Identify outputs by last dimension: 2 = scores, 4 = boxes
    const out0 = out[sess.outputNames[0]];
    const out1 = out[sess.outputNames[1]];
    const [scoresOut, boxesOut] = out0.dims[2] === 2 ? [out0, out1] : [out1, out0];

    const scores = scoresOut.data as Float32Array;
    const boxes = boxesOut.data as Float32Array;
    const n = scores.length / 2;

    const candBoxes: number[][] = [];
    const candScores: number[] = [];
    for (let i = 0; i < n; i++) {
      const faceProb = scores[i * 2 + 1];
      if (faceProb < SCORE_THRESH) continue;
      candBoxes.push([
        boxes[i * 4],
        boxes[i * 4 + 1],
        boxes[i * 4 + 2],
        boxes[i * 4 + 3],
      ]);
      candScores.push(faceProb);
    }

    if (candBoxes.length === 0) return [];

    return nms(candBoxes, candScores).map((idx) => {
      const [x1, y1, x2, y2] = candBoxes[idx];
      return {
        bounds: {
          x: x1 * origSize.w,
          y: y1 * origSize.h,
          width: (x2 - x1) * origSize.w,
          height: (y2 - y1) * origSize.h,
        },
      };
    });
  } catch {
    return [];
  }
}
