import type { Photo } from "../hooks/usePhotos";

export type PhotoParams = {
  id: string;
  uri: string;
  width: number;
  height: number;
  creationTime: number;
  duration: number;
  mediaType: Photo["mediaType"];
  filename: string;
};

export function photoToParams(photo: Photo): PhotoParams {
  return {
    id: photo.id,
    uri: photo.uri,
    width: photo.width,
    height: photo.height,
    creationTime: photo.creationTime,
    duration: photo.duration,
    mediaType: photo.mediaType,
    filename: photo.filename,
  };
}

export function photoFromParams(params: Record<string, unknown>): PhotoParams | null {
  const { id, uri } = params;
  if (typeof id !== "string" || typeof uri !== "string") return null;
  const width = typeof params.width === "string" ? parseInt(params.width, 10) : NaN;
  const height = typeof params.height === "string" ? parseInt(params.height, 10) : NaN;
  const creationTime =
    typeof params.creationTime === "string" ? parseInt(params.creationTime, 10) : NaN;
  const duration =
    typeof params.duration === "string" ? parseInt(params.duration, 10) : NaN;
  const mediaType = params.mediaType as Photo["mediaType"];
  if (
    isNaN(width) ||
    isNaN(height) ||
    isNaN(creationTime) ||
    isNaN(duration) ||
    !["photo", "video", "audio", "unknown"].includes(mediaType)
  ) {
    return null;
  }
  return {
    id,
    uri,
    width,
    height,
    creationTime,
    duration,
    mediaType,
    filename: typeof params.filename === "string" ? params.filename : "",
  };
}
