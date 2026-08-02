import { NativeModules, Platform } from "react-native";
import FaceDetection, {
  type Face,
  type FaceDetectionOptions,
  type LandmarkType,
  type Point,
} from "@react-native-ml-kit/face-detection";

// Detection runs entirely on-device via Google ML Kit (bundled with the app).
// No ONNX models, no downloads, no native runtime to crash on — the library is
// autolinked and its native module is only touched when a scan actually runs.

export type FaceLandmarkPoint = { x: number; y: number };

export type DetectedFace = {
  /** Bounding box in the original image's pixel coordinates. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Key facial landmarks (eyes, nose, mouth) in image pixel coordinates. */
  landmarks: Partial<Record<LandmarkType, FaceLandmarkPoint>>;
};

const DETECTION_OPTIONS: FaceDetectionOptions = {
  // 'fast' keeps scans snappy on low-end devices; accuracy is still good.
  performanceMode: "fast",
  landmarkMode: "all",
  classificationMode: "none",
  minFaceSize: 0.08,
};

const LANDMARK_KEYS: LandmarkType[] = [
  "leftEar",
  "rightEar",
  "leftEye",
  "rightEye",
  "noseBase",
  "leftCheek",
  "rightCheek",
  "mouthLeft",
  "mouthRight",
  "mouthBottom",
];

function toDetectedFace(f: Face): DetectedFace {
  const landmarks: DetectedFace["landmarks"] = {};
  if (f.landmarks) {
    for (const key of LANDMARK_KEYS) {
      const lm = f.landmarks[key] as { position: Point } | undefined;
      if (lm?.position) {
        landmarks[key] = { x: lm.position.x, y: lm.position.y };
      }
    }
  }
  return {
    bounds: {
      x: f.frame.left,
      y: f.frame.top,
      width: f.frame.width,
      height: f.frame.height,
    },
    landmarks,
  };
}

/** Detect faces in a photo. Returns [] when nothing is found or on error. */
export async function detectFaces(imageUri: string): Promise<DetectedFace[]> {
  try {
    const faces = await FaceDetection.detect(imageUri, DETECTION_OPTIONS);
    return faces.map(toDetectedFace);
  } catch {
    return [];
  }
}

/**
 * Pre-flight check that the native ML Kit module is linked. Call before a full
 * scan so a missing engine surfaces as a friendly error instead of a silent
 * scan that finds nothing.
 */
export async function probeFaceDetectionSupport(): Promise<string | null> {
  if (Platform.OS === "web") {
    return "Face scanning isn't available on this platform.";
  }
  if (!NativeModules?.FaceDetection) {
    return "Face scanning isn't available on this device (the detection engine failed to load).";
  }
  return null;
}
