import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import jpeg from "jpeg-js";
import type { DetectedFace } from "./FaceDetectionService";

// ── Fingerprint design ────────────────────────────────────────────────────────
// Instead of a neural embedding model (the ONNX runtime crashed on-device), we
// build a lightweight, crash-free "face fingerprint" purely in JS:
//
//   1. Appearance — the 160×160 face crop is downsampled to a 24×24 grayscale
//      grid (576 dims), photometrically normalised (mean/std) for lighting
//      invariance.
//   2. Edges — gradient magnitude of that grid (576 dims), which emphasises
//      facial structure over illumination.
//   3. Geometry — ML Kit landmark positions (eyes, nose, mouth) normalised to
//      the face frame plus a few distance ratios (16 dims).
//
// The concatenated vector is L2-normalised and clustered with cosine distance,
// exactly like a FaceNet embedding. It is deterministic, fast, and runs on the
// JS thread, so it can never hard-crash the app.

const THUMB_SIZE = 160;
const GRID = 24; // appearance grid cells per side
const GRID_DIMS = GRID * GRID;
const GEOM_DIMS = 16;

/** Fixed dimensionality of the fingerprint. Used to invalidate old scan data. */
export const FINGERPRINT_DIM = GRID_DIMS + GRID_DIMS + GEOM_DIMS;

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

/** Average RGBA pixels into a GRID×GRID grayscale image. */
function grayscaleGrid(
  rgba: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(GRID_DIMS);
  for (let gy = 0; gy < GRID; gy++) {
    const y0 = Math.floor((gy / GRID) * height);
    const y1 = Math.floor(((gy + 1) / GRID) * height);
    for (let gx = 0; gx < GRID; gx++) {
      const x0 = Math.floor((gx / GRID) * width);
      const x1 = Math.floor(((gx + 1) / GRID) * width);
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
          count++;
        }
      }
      out[gy * GRID + gx] = count > 0 ? sum / count : 0;
    }
  }
  return out;
}

/** Gradient magnitude of a GRID×GRID image via central differences. */
function gradientMagnitude(grid: Float32Array): Float32Array {
  const out = new Float32Array(GRID_DIMS);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const xm = grid[y * GRID + Math.max(0, x - 1)];
      const xp = grid[y * GRID + Math.min(GRID - 1, x + 1)];
      const ym = grid[Math.max(0, y - 1) * GRID + x];
      const yp = grid[Math.min(GRID - 1, y + 1) * GRID + x];
      const dx = xp - xm;
      const dy = yp - ym;
      out[y * GRID + x] = Math.sqrt(dx * dx + dy * dy);
    }
  }
  return out;
}

/** Zero-mean, unit-variance, clamped to ±3 to limit outlier blow-up. */
function zScore(v: Float32Array): Float32Array {
  let mean = 0;
  for (let i = 0; i < v.length; i++) mean += v[i];
  mean /= v.length;
  let varSum = 0;
  for (let i = 0; i < v.length; i++) {
    const d = v[i] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / v.length) || 1;
  for (let i = 0; i < v.length; i++) {
    let z = (v[i] - mean) / std;
    if (z > 3) z = 3;
    else if (z < -3) z = -3;
    v[i] = z;
  }
  return v;
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

// ── Landmark geometry ─────────────────────────────────────────────────────────

const GEOM_ORDER: ("leftEye" | "rightEye" | "noseBase" | "mouthLeft" | "mouthRight" | "mouthBottom")[] = [
  "leftEye",
  "rightEye",
  "noseBase",
  "mouthLeft",
  "mouthRight",
  "mouthBottom",
];

/**
 * Encode landmark positions relative to the face frame into a fixed-length
 * vector. Missing landmarks fall back to the frame centre so the dimensionality
 * never changes between faces.
 */
function buildGeometry(face: DetectedFace): Float32Array {
  const out = new Float32Array(GEOM_DIMS);
  const { x, y, width, height } = face.bounds;
  const cx = x + width / 2;
  const cy = y + height / 2;

  const norm = (p?: { x: number; y: number }): [number, number] =>
    p ? [(p.x - x) / width, (p.y - y) / height] : [0.5, 0.5];

  GEOM_ORDER.forEach((key, i) => {
    const [nx, ny] = norm(face.landmarks[key]);
    out[i * 2] = nx;
    out[i * 2 + 1] = ny;
  });

  const eyeL = norm(face.landmarks.leftEye);
  const eyeR = norm(face.landmarks.rightEye);
  const nose = norm(face.landmarks.noseBase);
  const mouthL = norm(face.landmarks.mouthLeft);
  const mouthR = norm(face.landmarks.mouthRight);

  const eyeMidX = (eyeL[0] + eyeR[0]) / 2;
  const eyeMidY = (eyeL[1] + eyeR[1]) / 2;
  const mouthMidX = (mouthL[0] + mouthR[0]) / 2;
  const mouthMidY = (mouthL[1] + mouthR[1]) / 2;

  // Derived ratios (dimensions: width for horizontal, height for vertical).
  out[12] = Math.hypot(eyeL[0] - eyeR[0], eyeL[1] - eyeR[1]); // eye separation / face width
  out[13] = Math.hypot(mouthL[0] - mouthR[0], mouthL[1] - mouthR[1]); // mouth width / face width
  out[14] = Math.hypot(eyeMidX - mouthMidX, eyeMidY - mouthMidY); // eye→mouth / face height
  out[15] = Math.hypot(nose[0] - mouthMidX, nose[1] - mouthMidY); // nose→mouth / face height

  return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

export type EmbeddingResult = {
  embedding: Float32Array;
  thumbUri: string;
} | null;

/**
 * Crop the detected face, save a thumbnail, and compute the face fingerprint.
 * Runs entirely on the JS thread — no native inference runtime is used.
 *
 * @param imageUri  Source photo URI (from expo-media-library).
 * @param face      Detected face (bounds + landmarks) in image pixels.
 * @param faceId    Unique ID for this face (used as thumbnail filename).
 */
export async function getEmbedding(
  imageUri: string,
  face: DetectedFace,
  faceId: string,
): Promise<EmbeddingResult> {
  try {
    const { x, y, width, height } = face.bounds;

    // 20 % padding around the face for a more stable fingerprint.
    const pad = Math.max(width, height) * 0.2;
    const originX = Math.max(0, x - pad);
    const originY = Math.max(0, y - pad);
    const cropW = width + pad * 2;
    const cropH = height + pad * 2;

    const manipResult = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        { crop: { originX, originY, width: cropW, height: cropH } },
        { resize: { width: THUMB_SIZE, height: THUMB_SIZE } },
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

    // ── Build fingerprint ─────────────────────────────────────────────────────
    const jpegBytes = base64ToBytes(base64);
    const decoded = jpeg.decode(jpegBytes, { useTArray: true });

    const gray = zScore(grayscaleGrid(decoded.data, decoded.width, decoded.height));
    const edges = zScore(gradientMagnitude(gray));
    const geometry = buildGeometry(face);

    const embedding = new Float32Array(FINGERPRINT_DIM);
    embedding.set(gray, 0);
    embedding.set(edges, GRID_DIMS);
    embedding.set(geometry, GRID_DIMS * 2);

    return { embedding: l2Normalize(embedding), thumbUri };
  } catch {
    return null;
  }
}
