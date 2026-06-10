import { Asset } from "expo-asset";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { InferenceSession, Tensor } from "onnxruntime-react-native";
import jpeg from "jpeg-js";
import type { DetectedFace } from "./FaceDetectionService";

// ── Model config ─────────────────────────────────────────────────────────────
// Expected model: FaceNet ONNX (128-dim or 512-dim)
// Input : float32 NCHW [1, 3, 160, 160]
// Pixel normalization: (pixel − 127.5) / 128.0
// Output: float32 [1, N] L2-normalized embedding
// See assets/models/README.md for download instructions.
const MODEL_INPUT_SIZE = 160;

// ── Singleton session ─────────────────────────────────────────────────────────
let session: InferenceSession | null = null;
let sessionPromise: Promise<InferenceSession> | null = null;

async function loadSession(): Promise<InferenceSession> {
  if (session) return session;
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const [asset] = await Asset.loadAsync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../../assets/models/facenet.onnx"),
    );
    if (!asset.localUri) throw new Error("Model asset has no local URI");

    // The model is a split ONNX (header + external .onnx.data). If only the
    // header was bundled (< 5 MB) ONNX Runtime will crash natively trying to
    // read the missing weight file — catch it here before we ever call create().
    const info = await FileSystem.getInfoAsync(asset.localUri);
    const fileSize = (info as { size?: number }).size ?? 0;
    if (!info.exists || fileSize < 5_000_000) {
      throw new Error(
        "facenet.onnx is header-only (external data not bundled). " +
          "Re-run convert_facenet.py with the inline flag to produce a single-file model.",
      );
    }

    const s = await InferenceSession.create(asset.localUri);
    session = s;
    return s;
  })();

  return sessionPromise;
}

/** Kick off model loading without blocking the caller. Returns a promise that resolves once the model is ready. */
export function preloadModel(): Promise<void> {
  return loadSession()
    .then(() => {})
    .catch(() => {});
}

// ── Thumb directory ───────────────────────────────────────────────────────────
const THUMBS_DIR = `${FileSystem.documentDirectory}memoir_face_thumbs/`;
let thumbsDirReady = false;

async function ensureThumbsDir(): Promise<void> {
  if (thumbsDirReady) return;
  await FileSystem.makeDirectoryAsync(THUMBS_DIR, { intermediates: true }).catch(
    () => {},
  );
  thumbsDirReady = true;
}

// ── Image preprocessing ───────────────────────────────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Convert raw RGBA pixel data (jpeg-js output) to a NCHW Float32Array with
 * FaceNet normalization: (pixel − 127.5) / 128.
 */
function rgbaToNchwFloat32(
  rgba: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const pixels = width * height;
  const out = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    const src = i * 4;
    out[i] = (rgba[src] - 127.5) / 128.0; // R
    out[pixels + i] = (rgba[src + 1] - 127.5) / 128.0; // G
    out[2 * pixels + i] = (rgba[src + 2] - 127.5) / 128.0; // B
  }
  return out;
}

function l2Normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

export type EmbeddingResult = {
  embedding: Float32Array;
  thumbUri: string;
} | null;

/**
 * Crop the detected face from the source image, resize to 160×160, generate
 * a FaceNet embedding, and save a thumbnail for display.
 *
 * @param imageUri  Source photo URI (from expo-media-library).
 * @param face      Bounding box in original image pixel coordinates.
 * @param faceId    Unique ID for this face (used as thumbnail filename).
 */
export async function getEmbedding(
  imageUri: string,
  face: DetectedFace,
  faceId: string,
): Promise<EmbeddingResult> {
  try {
    const { x, y, width, height } = face.bounds;

    // 20 % padding around the face for better embedding quality
    const pad = Math.max(width, height) * 0.2;
    const originX = Math.max(0, x - pad);
    const originY = Math.max(0, y - pad);
    const cropW = width + pad * 2;
    const cropH = height + pad * 2;

    const manipResult = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        { crop: { originX, originY, width: cropW, height: cropH } },
        { resize: { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE } },
      ],
      {
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
        compress: 0.85,
      },
    );

    const base64 = manipResult.base64;
    if (!base64) return null;

    // ── Save thumbnail ────────────────────────────────────────────────────────
    await ensureThumbsDir();
    const thumbUri = `${THUMBS_DIR}${faceId}.jpg`;
    await FileSystem.writeAsStringAsync(thumbUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // ── Decode JPEG → RGBA pixels ─────────────────────────────────────────────
    const jpegBytes = base64ToBytes(base64);
    const decoded = jpeg.decode(jpegBytes, { useTArray: true });

    // ── Build tensor ──────────────────────────────────────────────────────────
    const float32 = rgbaToNchwFloat32(decoded.data, decoded.width, decoded.height);
    const inputTensor = new Tensor("float32", float32, [
      1,
      3,
      MODEL_INPUT_SIZE,
      MODEL_INPUT_SIZE,
    ]);

    // ── Run inference ─────────────────────────────────────────────────────────
    const sess = await loadSession();
    const inputName = sess.inputNames[0];
    const outputs = await sess.run({ [inputName]: inputTensor });
    const outputName = sess.outputNames[0];
    const raw = outputs[outputName].data as Float32Array;

    return { embedding: l2Normalize(new Float32Array(raw)), thumbUri };
  } catch {
    return null;
  }
}
