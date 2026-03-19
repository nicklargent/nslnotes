import { convertFileSrc } from "@tauri-apps/api/core";
import { runtime } from "../lib/runtime";
import { IMAGE_MIME_TYPES, MIME_TO_EXT } from "../types/images";
import type { ImageMimeType } from "../types/images";

/**
 * Derive the root path from an entity path.
 * Entity paths are always {rootPath}/{type}/{file}.md where type is notes/tasks/docs.
 */
export function rootPathFromEntity(entityPath: string): string {
  // e.g. "/home/user/notes-root/notes/2026-03-18.md" → "/home/user/notes-root"
  const parts = entityPath.split("/");
  // Find the segment that is "notes", "tasks", or "docs"
  for (let i = parts.length - 2; i >= 0; i--) {
    if (parts[i] === "notes" || parts[i] === "tasks" || parts[i] === "docs") {
      return parts.slice(0, i).join("/");
    }
  }
  // Fallback: go up two levels from file
  return parts.slice(0, -2).join("/");
}

/**
 * Service for image storage, ingestion, and URL resolution.
 */
export const ImageService = {
  /**
   * Get the .assets/ directory path for a given entity file path.
   * e.g. "/root/notes/2026-03-18.md" → "/root/notes/2026-03-18.assets"
   */
  getAssetsDir(entityPath: string): string {
    const withoutExt = entityPath.replace(/\.md$/, "");
    return `${withoutExt}.assets`;
  },

  /**
   * Generate a unique filename for a stored image.
   * @param source - "clipboard" or original filename (for drag-drop)
   * @param mimeType - image MIME type
   */
  generateImageFilename(source: string, mimeType: ImageMimeType): string {
    const ext = MIME_TO_EXT[mimeType];
    const timestamp = Math.floor(Date.now() / 1000);
    const prefix =
      source === "clipboard" ? "clipboard" : slugify(stripExtension(source));
    return `${prefix}-${timestamp}.${ext}`;
  },

  /**
   * Resolve a relative image path to a renderable URL.
   * In Tauri mode, uses convertFileSrc for asset:// protocol.
   * In web mode, uses /api/assets endpoint.
   */
  resolveImageUrl(
    relativePath: string,
    entityPath: string,
    _rootPath: string
  ): string {
    // relativePath is like "./2026-03-18.assets/img.png"
    // entityPath is like "/root/notes/2026-03-18.md"
    // We need the absolute path to the image file
    const entityDir = entityPath.substring(0, entityPath.lastIndexOf("/"));
    const absolutePath = relativePath.startsWith("./")
      ? `${entityDir}/${relativePath.slice(2)}`
      : `${entityDir}/${relativePath}`;

    if (runtime.isNative()) {
      return convertFileSrc(absolutePath);
    }

    // Web mode: pass absolute path (Vite plugin resolves all paths absolutely)
    return `/api/assets?path=${encodeURIComponent(absolutePath)}`;
  },

  /**
   * Convert a resolved URL back to a relative markdown path.
   * Inverse of resolveImageUrl for saving.
   */
  unresolveImageSrc(
    src: string,
    entityPath: string,
    _rootPath: string
  ): string {
    let absolutePath: string | null = null;

    if (src.startsWith("/api/assets?path=")) {
      // Web mode URL — contains absolute path
      absolutePath = decodeURIComponent(src.slice("/api/assets?path=".length));
    } else if (
      src.includes("://localhost") ||
      src.startsWith("asset://") ||
      src.startsWith("https://asset.localhost")
    ) {
      // Tauri asset URL — extract the file path
      // convertFileSrc creates URLs like https://asset.localhost/{path}
      try {
        const url = new URL(src);
        absolutePath = decodeURIComponent(url.pathname);
      } catch {
        return src;
      }
    } else if (src.startsWith("./") || !src.includes("://")) {
      // Already a relative path
      return src;
    }

    if (!absolutePath) return src;

    // Convert absolute path to relative path from entity's directory
    const entityDir = entityPath.substring(0, entityPath.lastIndexOf("/"));
    if (absolutePath.startsWith(entityDir + "/")) {
      return "./" + absolutePath.slice(entityDir.length + 1);
    }
    return src;
  },

  /**
   * Ingest an image from clipboard paste.
   * Writes the image to the entity's .assets/ directory.
   * Returns the markdown string to insert.
   */
  async ingestFromClipboard(
    entityPath: string,
    base64: string,
    mimeType: string
  ): Promise<string | null> {
    if (!IMAGE_MIME_TYPES.has(mimeType)) return null;

    const assetsDir = ImageService.getAssetsDir(entityPath);
    await runtime.ensureDirectory(assetsDir);

    const filename = ImageService.generateImageFilename(
      "clipboard",
      mimeType as ImageMimeType
    );
    const imagePath = `${assetsDir}/${filename}`;
    await runtime.writeBinary(imagePath, base64);

    // Return relative markdown path
    const entitySlug = entityPath
      .substring(entityPath.lastIndexOf("/") + 1)
      .replace(/\.md$/, "");
    return `![image](./${entitySlug}.assets/${filename})`;
  },

  /**
   * Ingest an image from drag-drop.
   * Writes the image to the entity's .assets/ directory.
   * Returns the markdown string to insert.
   */
  async ingestFromDrop(
    entityPath: string,
    filename: string,
    base64: string,
    mimeType: string
  ): Promise<string | null> {
    if (!IMAGE_MIME_TYPES.has(mimeType)) return null;

    const assetsDir = ImageService.getAssetsDir(entityPath);
    await runtime.ensureDirectory(assetsDir);

    const storedFilename = ImageService.generateImageFilename(
      filename,
      mimeType as ImageMimeType
    );
    const imagePath = `${assetsDir}/${storedFilename}`;
    await runtime.writeBinary(imagePath, base64);

    const entitySlug = entityPath
      .substring(entityPath.lastIndexOf("/") + 1)
      .replace(/\.md$/, "");
    const alt = stripExtension(filename);
    return `![${alt}](./${entitySlug}.assets/${storedFilename})`;
  },
};

/** Slugify a string for use as filename prefix. */
function slugify(str: string): string {
  return (
    str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "image"
  );
}

/** Strip file extension from a filename. */
function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}
