import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  runFaceScan,
  runClustering,
  abortScan,
  isScanRunning,
  type ScanProgress,
} from "../services/FaceProcessingQueue";
import { FaceDb } from "../db/faceDb";
import type { Photo } from "./usePhotos";

type FaceProcessingCtx = {
  progress: ScanProgress;
  startScan: (photos: Photo[]) => void;
  stopScan: () => void;
  recluster: () => Promise<void>;
  resetAndRescan: (photos: Photo[]) => Promise<void>;
};

const Ctx = createContext<FaceProcessingCtx | null>(null);

export function FaceProcessingProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<ScanProgress>({
    processed: 0,
    total: 0,
    status: "idle",
    newFaces: 0,
  });
  const photosRef = useRef<Photo[]>([]);

  useEffect(() => {
    FaceDb.init().catch(() => {});
  }, []);

  const startScan = useCallback((photos: Photo[]) => {
    if (isScanRunning()) return;
    photosRef.current = photos;
    runFaceScan(photos, (p) => setProgress(p));
  }, []);

  const stopScan = useCallback(() => {
    abortScan();
    setProgress((p) => ({ ...p, status: "idle" }));
  }, []);

  const recluster = useCallback(async () => {
    await runClustering();
  }, []);

  const resetAndRescan = useCallback(
    async (photos: Photo[]) => {
      abortScan();
      await FaceDb.clearAll();
      setProgress({ processed: 0, total: photos.length, status: "idle", newFaces: 0 });
      // Small delay to let the abort settle
      setTimeout(() => startScan(photos), 200);
    },
    [startScan],
  );

  const value = useMemo(
    () => ({ progress, startScan, stopScan, recluster, resetAndRescan }),
    [progress, startScan, stopScan, recluster, resetAndRescan],
  );

  return createElement(Ctx.Provider, { value }, children);
}

export function useFaceProcessing(): FaceProcessingCtx {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useFaceProcessing must be used inside FaceProcessingProvider");
  return ctx;
}
