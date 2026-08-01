import { detectFaces, probeOnnxSupport } from "./FaceDetectionService";
import { getEmbedding } from "./FaceEmbeddingService";
import { clusterFaces } from "./FaceClusteringService";
import { FaceDb, type FaceRecord } from "../db/faceDb";
import type { Photo } from "../hooks/usePhotos";

export type ScanProgress = {
  processed: number;
  total: number;
  status: "idle" | "scanning" | "clustering" | "done" | "up_to_date" | "error";
  newFaces: number;
  errorMessage?: string;
};

// Process 3 photos at a time — balances throughput vs UI responsiveness
const BATCH = 3;
// Recluster every time we accumulate this many new faces
const RECLUSTER_EVERY = 15;

let running = false;
let abort = false;

/** Abort the in-progress scan, if any. */
export function abortScan(): void {
  abort = true;
}

export function isScanRunning(): boolean {
  return running;
}

/**
 * Run the full detect → embed → cluster pipeline on any unscanned photos.
 * Calls `onProgress` frequently so the UI can show live updates.
 */
export async function runFaceScan(
  photos: Photo[],
  onProgress: (p: ScanProgress) => void,
): Promise<void> {
  if (running) return;
  running = true;
  abort = false;

  try {
    // ── Find unscanned photos ─────────────────────────────────────────────────
    const scannedIds = await FaceDb.getScannedPhotoIds();
    const pending = photos.filter(
      (p) => p.mediaType === "photo" && !scannedIds.has(p.id),
    );

    if (pending.length === 0) {
      onProgress({ processed: 0, total: 0, status: "up_to_date", newFaces: 0 });
      return;
    }

    // Pre-flight the ONNX engine before scanning the gallery so a broken
    // engine surfaces as a friendly error instead of a crash or empty result.
    const engineError = await probeOnnxSupport();
    if (engineError) {
      onProgress({
        processed: 0,
        total: pending.length,
        status: "error",
        newFaces: 0,
        errorMessage: engineError,
      });
      return;
    }

    const total = pending.length;
    let processed = 0;
    let newFaces = 0;

    onProgress({ processed: 0, total, status: "scanning", newFaces: 0 });

    // ── Process in batches ────────────────────────────────────────────────────
    for (let i = 0; i < pending.length; i += BATCH) {
      if (abort) break;

      const batch = pending.slice(i, i + BATCH);

      await Promise.all(
        batch.map(async (photo) => {
          try {
            const faces = await detectFaces(photo.uri);

            if (faces.length === 0) {
              await FaceDb.setPhotoScanStatus(photo.id, "no_face");
              return;
            }

            for (let fi = 0; fi < faces.length; fi++) {
              const faceId = `${photo.id}_f${fi}`;
              const result = await getEmbedding(photo.uri, faces[fi], faceId);
              if (!result) continue;

              const record: FaceRecord = {
                id: faceId,
                photo_id: photo.id,
                embedding: result.embedding,
                bbox_x: faces[fi].bounds.x,
                bbox_y: faces[fi].bounds.y,
                bbox_w: faces[fi].bounds.width,
                bbox_h: faces[fi].bounds.height,
                person_id: null,
                thumb_uri: result.thumbUri,
              };
              await FaceDb.insertFace(record);
              newFaces++;
            }

            await FaceDb.setPhotoScanStatus(photo.id, "done");
          } catch {
            await FaceDb.setPhotoScanStatus(photo.id, "error").catch(() => {});
          }
        }),
      );

      processed += batch.length;
      onProgress({ processed, total, status: "scanning", newFaces });

      // Recluster every RECLUSTER_EVERY new faces so people appear while scanning continues
      if (newFaces > 0 && newFaces % RECLUSTER_EVERY === 0) {
        await runClustering();
      }

      // Yield to the UI thread between batches
      await new Promise<void>((r) => setTimeout(r, 30));
    }

    // ── Final cluster pass ────────────────────────────────────────────────────
    onProgress({ processed: total, total, status: "clustering", newFaces });
    await runClustering();

    onProgress({ processed: total, total, status: "done", newFaces });
  } catch {
    onProgress({
      processed: 0,
      total: 0,
      status: "error",
      newFaces: 0,
      errorMessage: "Face scanning failed. Please try again.",
    });
  } finally {
    running = false;
  }
}

/** Re-run DBSCAN over all stored embeddings and persist updated person records. */
export async function runClustering(): Promise<void> {
  const [allFaces, existingPersons] = await Promise.all([
    FaceDb.getAllFaces(),
    FaceDb.getAllPersons(),
  ]);

  if (allFaces.length === 0) return;

  const clusters = clusterFaces(allFaces, existingPersons);

  const assignments: { faceId: string; personId: string | null }[] = [];
  const persons = clusters.map((c) => {
    for (const fid of c.faceIds) assignments.push({ faceId: fid, personId: c.personId });

    const existing = existingPersons.find((p) => p.id === c.personId);
    return {
      id: c.personId,
      name: existing?.name ?? null,
      cover_face_id: c.coverFaceId,
      face_count: c.faceIds.length,
    };
  });

  await Promise.all([
    FaceDb.updateFacePersonIds(assignments),
    FaceDb.upsertPersons(persons),
  ]);
}
