import FaceDetection from "@react-native-ml-kit/face-detection";

export type DetectedFace = {
  bounds: { x: number; y: number; width: number; height: number };
  rotationY?: number;
};

/**
 * Detect faces in a photo using ML Kit. Returns bounding boxes in the
 * coordinate space of the original image (pixels).
 */
export async function detectFaces(imageUri: string): Promise<DetectedFace[]> {
  try {
    const faces = await FaceDetection.detect(imageUri, {
      performanceMode: "fast",
      landmarkMode: "none",
      classificationMode: "none",
      minFaceSize: 0.08,
    });
    // ML Kit returns frame.{left, top, width, height}; normalise to bounds.{x, y, width, height}
    return faces.map((f) => ({
      bounds: {
        x: f.frame.left,
        y: f.frame.top,
        width: f.frame.width,
        height: f.frame.height,
      },
      rotationY: f.rotationY,
    }));
  } catch {
    return [];
  }
}
