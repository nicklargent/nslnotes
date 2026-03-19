/** Supported image MIME types */
export type ImageMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp";

export const IMAGE_MIME_TYPES: ReadonlySet<string> = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export const MIME_TO_EXT: Record<ImageMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** Reference to an image within a markdown entity */
export interface ImageRef {
  alt: string;
  relativePath: string;
  width?: number;
}

/** Tracked image file on disk */
export interface ImageFile {
  path: string;
  filename: string;
  entityPath: string;
  size: number;
  isOrphan: boolean;
}
