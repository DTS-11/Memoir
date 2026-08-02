import * as SQLite from "expo-sqlite";

export type FaceRecord = {
  id: string;
  photo_id: string;
  embedding: Float32Array;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  person_id: string | null;
  thumb_uri: string | null;
};

export type PersonRecord = {
  id: string;
  name: string | null;
  cover_face_id: string | null;
  face_count: number;
};

type FaceRow = Omit<FaceRecord, "embedding"> & { embedding: Uint8Array };

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync("memoir_faces.db");
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS faces (
      id          TEXT PRIMARY KEY NOT NULL,
      photo_id    TEXT NOT NULL,
      embedding   BLOB NOT NULL,
      bbox_x      REAL NOT NULL,
      bbox_y      REAL NOT NULL,
      bbox_w      REAL NOT NULL,
      bbox_h      REAL NOT NULL,
      person_id   TEXT,
      thumb_uri   TEXT,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS persons (
      id             TEXT PRIMARY KEY NOT NULL,
      name           TEXT,
      cover_face_id  TEXT,
      face_count     INTEGER NOT NULL DEFAULT 0,
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS photo_scan (
      photo_id      TEXT PRIMARY KEY NOT NULL,
      status        TEXT NOT NULL,
      processed_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_faces_photo   ON faces(photo_id);
    CREATE INDEX IF NOT EXISTS idx_faces_person  ON faces(person_id);
  `);
  return _db;
}

function toBlob(f: Float32Array): Uint8Array {
  return new Uint8Array(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength));
}

function fromBlob(b: Uint8Array): Float32Array {
  return new Float32Array(new Uint8Array(b).buffer);
}

export const FaceDb = {
  async init(): Promise<void> {
    await getDb();
  },

  async insertFace(face: FaceRecord): Promise<void> {
    const d = await getDb();
    await d.runAsync(
      `INSERT OR REPLACE INTO faces
         (id, photo_id, embedding, bbox_x, bbox_y, bbox_w, bbox_h, person_id, thumb_uri, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        face.id,
        face.photo_id,
        toBlob(face.embedding),
        face.bbox_x,
        face.bbox_y,
        face.bbox_w,
        face.bbox_h,
        face.person_id,
        face.thumb_uri,
        Date.now(),
      ],
    );
  },

  async setPhotoScanStatus(
    photoId: string,
    status: "done" | "no_face" | "error",
  ): Promise<void> {
    const d = await getDb();
    await d.runAsync(
      `INSERT OR REPLACE INTO photo_scan (photo_id, status, processed_at) VALUES (?,?,?)`,
      [photoId, status, Date.now()],
    );
  },

  async getScannedPhotoIds(): Promise<Set<string>> {
    const d = await getDb();
    const rows = await d.getAllAsync<{ photo_id: string }>(
      `SELECT photo_id FROM photo_scan`,
    );
    return new Set(rows.map((r) => r.photo_id));
  },

  async getAnyEmbeddingDim(): Promise<number | null> {
    const d = await getDb();
    const row = await d.getFirstAsync<{ embedding: Uint8Array }>(
      `SELECT embedding FROM faces LIMIT 1`,
    );
    if (!row) return null;
    return new Float32Array(new Uint8Array(row.embedding).buffer).length;
  },

  async getAllFaces(): Promise<FaceRecord[]> {
    const d = await getDb();
    const rows = await d.getAllAsync<FaceRow>(
      `SELECT id, photo_id, embedding, bbox_x, bbox_y, bbox_w, bbox_h, person_id, thumb_uri FROM faces`,
    );
    return rows.map((r) => ({ ...r, embedding: fromBlob(r.embedding) }));
  },

  async getFacesByPerson(personId: string): Promise<FaceRecord[]> {
    const d = await getDb();
    const rows = await d.getAllAsync<FaceRow>(
      `SELECT id, photo_id, embedding, bbox_x, bbox_y, bbox_w, bbox_h, person_id, thumb_uri
       FROM faces WHERE person_id = ?`,
      [personId],
    );
    return rows.map((r) => ({ ...r, embedding: fromBlob(r.embedding) }));
  },

  async updateFacePersonIds(
    assignments: { faceId: string; personId: string | null }[],
  ): Promise<void> {
    if (!assignments.length) return;
    const d = await getDb();
    await d.withTransactionAsync(async () => {
      for (const { faceId, personId } of assignments) {
        await d.runAsync(`UPDATE faces SET person_id = ? WHERE id = ?`, [
          personId,
          faceId,
        ]);
      }
    });
  },

  async upsertPersons(persons: PersonRecord[]): Promise<void> {
    if (!persons.length) return;
    const d = await getDb();
    const now = Date.now();
    await d.withTransactionAsync(async () => {
      for (const p of persons) {
        const existing = await d.getFirstAsync<{ name: string | null }>(
          `SELECT name FROM persons WHERE id = ?`,
          [p.id],
        );
        if (existing) {
          await d.runAsync(
            `UPDATE persons SET cover_face_id=?, face_count=?, updated_at=? WHERE id=?`,
            [p.cover_face_id, p.face_count, now, p.id],
          );
        } else {
          await d.runAsync(
            `INSERT INTO persons (id, name, cover_face_id, face_count, created_at, updated_at)
             VALUES (?,?,?,?,?,?)`,
            [p.id, p.name, p.cover_face_id, p.face_count, now, now],
          );
        }
      }
    });
  },

  async getAllPersons(): Promise<PersonRecord[]> {
    const d = await getDb();
    return d.getAllAsync<PersonRecord>(
      `SELECT id, name, cover_face_id, face_count
       FROM persons WHERE face_count > 0 ORDER BY face_count DESC`,
    );
  },

  async getPersonById(id: string): Promise<PersonRecord | null> {
    const d = await getDb();
    const r = await d.getFirstAsync<PersonRecord>(
      `SELECT id, name, cover_face_id, face_count FROM persons WHERE id = ?`,
      [id],
    );
    return r ?? null;
  },

  async updatePersonName(id: string, name: string): Promise<void> {
    const d = await getDb();
    await d.runAsync(`UPDATE persons SET name = ?, updated_at = ? WHERE id = ?`, [
      name,
      Date.now(),
      id,
    ]);
  },

  async clearAll(): Promise<void> {
    const d = await getDb();
    await d.execAsync(`DELETE FROM faces; DELETE FROM persons; DELETE FROM photo_scan;`);
  },

  async getScanStats(): Promise<{
    done: number;
    noFace: number;
    error: number;
    total: number;
  }> {
    const d = await getDb();
    const rows = await d.getAllAsync<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count FROM photo_scan GROUP BY status`,
    );
    const stats = { done: 0, noFace: 0, error: 0, total: 0 };
    for (const r of rows) {
      if (r.status === "done") stats.done = r.count;
      else if (r.status === "no_face") stats.noFace = r.count;
      else if (r.status === "error") stats.error = r.count;
      stats.total += r.count;
    }
    return stats;
  },
};
