import { DBSCAN } from "density-clustering";
import type { FaceRecord, PersonRecord } from "../db/faceDb";

// Cosine distance between two L2-normalized vectors.
// Range [0, 2]; ≈0 means same person, ≈1.5+ means different person.
function cosineDist(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  // Both vectors are already L2-normalized, so ||a||=||b||=1 → dist = 1 − dot
  return 1 - dot;
}

export type ClusterGroup = {
  personId: string;
  faceIds: string[];
  coverFaceId: string;
};

/**
 * Cluster face embeddings with DBSCAN, then try to preserve existing person
 * IDs so user-given names survive re-clustering.
 *
 * epsilon: cosine distance threshold — tune 0.4 (strict) → 0.6 (lenient).
 * minPts : minimum faces per cluster before it is counted as a person.
 */
export function clusterFaces(
  faces: FaceRecord[],
  existingPersons: PersonRecord[],
  epsilon = 0.5,
  minPts = 2,
): ClusterGroup[] {
  if (faces.length === 0) return [];

  const dataset = faces.map((f) => Array.from(f.embedding));
  const dbscan = new DBSCAN();
  const clusters = dbscan.run(dataset, epsilon, minPts, cosineDist);

  // Build a reverse map from faceId → existing personId
  const existingAssignment = new Map<string, string>(
    faces.filter((f) => f.person_id != null).map((f) => [f.id, f.person_id!]),
  );

  return clusters.map((indices, i) => {
    const faceIds = indices.map((idx) => faces[idx].id);

    // Vote on which existing person ID should be kept for this cluster
    const votes = new Map<string, number>();
    for (const fid of faceIds) {
      const pid = existingAssignment.get(fid);
      if (pid) votes.set(pid, (votes.get(pid) ?? 0) + 1);
    }

    let bestId: string | null = null;
    let bestVotes = 0;
    for (const [pid, count] of votes) {
      if (count > bestVotes) {
        bestVotes = count;
        bestId = pid;
      }
    }

    // Keep existing ID when ≥ 1/3 of cluster faces agree on it
    const personId =
      bestId != null && bestVotes >= Math.max(1, faceIds.length / 3)
        ? bestId
        : `person_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;

    return { personId, faceIds, coverFaceId: faceIds[0] };
  });
}
