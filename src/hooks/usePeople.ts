import { useCallback, useEffect, useMemo, useState } from "react";
import { FaceDb, type PersonRecord } from "../db/faceDb";
import type { Photo } from "./usePhotos";

export type PersonWithCover = PersonRecord & {
  photoIds: string[];
  coverThumbUri: string | null;
};

export function usePeople(photos: Photo[], refreshTrigger?: number) {
  const [persons, setPersons] = useState<PersonWithCover[]>([]);
  const [loading, setLoading] = useState(true);

  const photoMap = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  const load = useCallback(async () => {
    try {
      const rows = await FaceDb.getAllPersons();
      const result: PersonWithCover[] = [];

      for (const p of rows) {
        const faces = await FaceDb.getFacesByPerson(p.id);
        const photoIds = [...new Set(faces.map((f) => f.photo_id))].filter((id) =>
          photoMap.has(id),
        );
        if (photoIds.length === 0) continue;

        const coverFace = faces.find((f) => f.id === p.cover_face_id) ?? faces[0];

        result.push({
          ...p,
          photoIds,
          coverThumbUri: coverFace?.thumb_uri ?? null,
        });
      }

      setPersons(result);
    } catch {
      // DB not ready yet; will retry on next trigger
    } finally {
      setLoading(false);
    }
  }, [photoMap]);

  // Reload whenever photos change or an external trigger fires (e.g. after scan)
  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  const renamePerson = useCallback(async (id: string, name: string) => {
    await FaceDb.updatePersonName(id, name);
    setPersons((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }, []);

  return { persons, loading, reload: load, renamePerson };
}
