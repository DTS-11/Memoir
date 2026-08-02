import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import jpeg from "jpeg-js";
import type { DetectedFace } from "./FaceDetectionService";

// ── Fingerprint design ────────────────────────────────────────────────────────
// Instead of a neural embedding model (the ONNX runtime crashed on-device), we
// build a lightweight, crash-free "face fingerprint" purely in JS:
//
//   1. Appearance — the face crop is eye-aligned (rotated so the eye line is
//      level and scaled so the inter-pupil distance is constant), then sampled
//      into a 32×32 grayscale grid (1024 dims), photometrically normalised
//      (mean/std) for lighting invariance.
//   2. Edges — gradient magnitude of that grid (1024 dims), which emphasises
//      facial structure over illumination.
//   3. Geometry — ML Kit landmark positions (eyes, nose, mouth) normalised to
//      the face frame plus a few distance ratios (16 dims), down-weighted so
//      noisy landmarks can't dominate the similarity score.
//
// The concatenated vector is L2-normalised and clustered with cosine distance,
// exactly like a FaceNet embedding. It is deterministic, fast, and runs on the
// JS thread, so it can never hard-crash the app.

const WORK_SIZE = 192;
const GRID = 32; // appearance grid cells per side
const GRID_DIMS = GRID * GRID;
const GEOM_DIMS = 16;
// Geometry dims are noisier than the pixel dims; scale them down so they stay
// informative without dominating the cosine distance.
const GEOM_WEIGHT = 0.5;
// Where the eyes should sit in the aligned grid (x-centre, y in grid cells).
const EYE_Y_CELLS = 0.42 * GRID;
// Inter-pupil distance mapped to this many grid cells (sets face scale).
const IPD_CELLS = 0.4 * GRID;

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

function grayAt(
  rgba: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const cx = x < 0 ? 0 : x > width - 1 ? width - 1 : x;
  const cy = y < 0 ? 0 : y > height - 1 ? height - 1 : y;
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  const lum = (i: number) => 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  const top = lum(i00) + (lum(i10) - lum(i00)) * fx;
  const bot = lum(i01) + (lum(i11) - lum(i01)) * fx;
  return top + (bot - top) * fy;
}

/**
 * Sample a GRID×GRID grayscale grid from an affine-aligned window of the image.
 * The window is centred on the eye midpoint, rotated so the eye line is level,
 * and scaled so the inter-pupil distance fills a fixed fraction of the grid.
 * This normalises away head roll and face scale differences — the two biggest
 * causes of same-person faces landing far apart in embedding space.
 */
function alignedGrid(
  rgba: Uint8Array,
  width: number,
  height: number,
  params: {
    eyeMidX: number;
    eyeMidY: number;
    cos: number;
    sin: number;
    pxPerCell: number;
    eyeY: number;
  },
): Float32Array {
  const { eyeMidX, eyeMidY, cos, sin, pxPerCell, eyeY } = params;
  const out = new Float32Array(GRID_DIMS);
  const gridCentre = GRID / 2;
  for (let gy = 0; gy < GRID; gy++) {
    const dy = (gy - eyeY) * pxPerCell;
    for (let gx = 0; gx < GRID; gx++) {
      const dx = (gx - gridCentre) * pxPerCell;
      // Inverse of the alignment: rotate + translate into image coordinates.
      const sx = eyeMidX + dx * cos - dy * sin;
      const sy = eyeMidY + dx * sin + dy * cos;
      out[gy * GRID + gx] = grayAt(rgba, width, height, sx, sy);
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

const GEOM_ORDER: (
  | "leftEye"
  | "rightEye"
  | "noseBase"
  | "mouthLeft"
  | "mouthRight"
  | "mouthBottom"
)[] = ["leftEye", "rightEye", "noseBase", "mouthLeft", "mouthRight", "mouthBottom"];

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

    // Generous square crop (1.8× the face) centred on the face so there is room
    // to rotate during alignment without clipping the face.
    const side = Math.max(width, height) * 1.8;
    const originX = Math.max(0, x + width / 2 - side / 2);
    const originY = Math.max(0, y + height / 2 - side / 2);

    const manipResult = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        { crop: { originX, originY, width: side, height: side } },
        { resize: { width: WORK_SIZE, height: WORK_SIZE } },
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
    const w = decoded.width;
    const h = decoded.height;
    const s = w / side; // original px → working px

    const eyeL = face.landmarks.leftEye;
    const eyeR = face.landmarks.rightEye;
    const eyeLX = (eyeL ? eyeL.x : x + width / 2) - originX;
    const eyeLY = (eyeL ? eyeL.y : y + height / 2) - originY;
    const eyeRX = (eyeR ? eyeR.x : x + width / 2) - originX;
    const eyeRY = (eyeR ? eyeR.y : y + height / 2) - originY;

    const exL = eyeLX * s;
    const eyL = eyeLY * s;
    const exR = eyeRX * s;
    const eyR = eyeRY * s;
    const ipd = Math.hypot(exR - exL, eyR - eyL);

    // Align using the eyes when both are present; otherwise fall back to the
    // face frame (no rotation, face box scaled to fill the grid).
    const aligned = alignedGrid(decoded.data, w, h, {
      eyeMidX: (exL + exR) / 2,
      eyeMidY: (eyL + eyR) / 2,
      cos: Math.cos(Math.atan2(eyR - eyL, exR - exL)),
      sin: Math.sin(Math.atan2(eyR - eyL, exR - exL)),
      pxPerCell: ipd > 0 ? ipd / IPD_CELLS : (width * s) / (0.75 * GRID),
      eyeY: ipd > 0 ? EYE_Y_CELLS : GRID / 2,
    });

    const gray = zScore(aligned);
    const edges = zScore(gradientMagnitude(aligned));
    const geometry = buildGeometry(face);

    const embedding = new Float32Array(FINGERPRINT_DIM);
    embedding.set(gray, 0);
    embedding.set(edges, GRID_DIMS);
    for (let i = 0; i < GEOM_DIMS; i++) {
      embedding[GRID_DIMS * 2 + i] = geometry[i] * GEOM_WEIGHT;
    }

    return { embedding: l2Normalize(embedding), thumbUri };
  } catch {
    return null;
  }
}
