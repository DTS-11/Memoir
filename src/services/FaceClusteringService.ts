import type { FaceRecord, PersonRecord } from "../db/faceDb";

// Cosine distance between two L2-normalized vectors.
// Range [0, 2]; ≈0 means same person, ≈1.5+ means different person.
function cosineDist(a: Float32Array, b: Float32Array): number {
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

class UnionFind {
  private parent: Int32Array;
  private rank: Int32Array;

  constructor(n: number) {
    this.parent = new Int32Array(n);
    this.rank = new Int32Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[x] !== x) {
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb;
    } else if (this.rank[ra] > this.rank[rb]) {
      this.parent[rb] = ra;
    } else {
      this.parent[rb] = ra;
      this.rank[ra]++;
    }
  }
}

/**
 * Cluster face embeddings and try to preserve existing person IDs so user-given
 * names survive re-clustering.
 *
 * Uses single-linkage connected components (union-find) instead of DBSCAN: it
 * merges faces through gradual appearance drift (lighting, expression, ageing),
 * which is exactly the chain that used to split one person into many small
 * DBSCAN clusters.
 *
 * epsilon: cosine distance threshold — tune 0.4 (strict) → 0.7 (lenient).
 * minPts : minimum faces per cluster before it is counted as a person.
 */
export function clusterFaces(
  faces: FaceRecord[],
  existingPersons: PersonRecord[],
  epsilon = 0.6,
  minPts = 2,
): ClusterGroup[] {
  if (faces.length === 0) return [];

  const n = faces.length;
  const uf = new UnionFind(n);

  for (let i = 0; i < n; i++) {
    const a = faces[i].embedding;
    for (let j = i + 1; j < n; j++) {
      if (cosineDist(a, faces[j].embedding) <= epsilon) uf.union(i, j);
    }
  }

  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    const arr = byRoot.get(r);
    if (arr) arr.push(i);
    else byRoot.set(r, [i]);
  }

  const clusters = Array.from(byRoot.values())
    .filter((indices) => indices.length >= minPts)
    .sort((a, b) => b.length - a.length);

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
