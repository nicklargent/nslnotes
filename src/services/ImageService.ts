import { convertFileSrc } from "@tauri-apps/api/core";
import { runtime } from "../lib/runtime";
import { IMAGE_MIME_TYPES, MIME_TO_EXT, EXT_TO_MIME } from "../types/images";
import type { ImageMimeType } from "../types/images";
import { indexStore, setIndexStore } from "../stores/indexStore";

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
    // Already a resolved URL — return as-is to prevent double-resolution
    if (
      relativePath.includes("://") ||
      relativePath.startsWith("https://asset.localhost")
    ) {
      return relativePath;
    }

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

    // absolutePath didn't match entityDir — still convert to a relative path
    // rather than leaking a protocol URL (cross-entity paste, stale references).
    const filename = absolutePath.substring(absolutePath.lastIndexOf("/") + 1);
    if (absolutePath.includes(".assets/")) {
      return `./${entitySlug(entityPath)}.assets/${filename}`;
    }
    return `./${filename}`;
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
    addImageToIndex(imagePath, filename, entityPath);

    // Return relative markdown path
    const slug = entitySlug(entityPath);
    return `![image](./${slug}.assets/${filename})`;
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
    addImageToIndex(imagePath, storedFilename, entityPath);

    const slug = entitySlug(entityPath);
    const alt = stripExtension(filename);
    return `![${alt}](./${slug}.assets/${storedFilename})`;
  },
  /**
   * Ingest an image by copying from a filesystem path (for Tauri native drag-drop).
   * Returns the markdown string to insert, or null if the file is not a supported image.
   */
  async ingestFromFilePath(
    entityPath: string,
    sourcePath: string
  ): Promise<string | null> {
    const ext = sourcePath
      .substring(sourcePath.lastIndexOf(".") + 1)
      .toLowerCase();
    const mimeType = EXT_TO_MIME[ext];
    if (!mimeType) return null;

    const assetsDir = ImageService.getAssetsDir(entityPath);
    await runtime.ensureDirectory(assetsDir);

    const originalFilename = sourcePath.substring(
      sourcePath.lastIndexOf("/") + 1
    );
    const storedFilename = ImageService.generateImageFilename(
      originalFilename,
      mimeType
    );
    const imagePath = `${assetsDir}/${storedFilename}`;
    await runtime.copyFile(sourcePath, imagePath);
    addImageToIndex(imagePath, storedFilename, entityPath);

    const slug = entitySlug(entityPath);
    const alt = stripExtension(originalFilename);
    return `![${alt}](./${slug}.assets/${storedFilename})`;
  },

  /**
   * Copy images referenced in markdown from source entity's .assets/ to target entity's .assets/.
   * Rewrites relative paths in the markdown to point to the new location.
   * Source images are left in place.
   */
  async copyImagesForPromotion(
    sourceEntityPath: string,
    targetEntityPath: string,
    markdown: string
  ): Promise<string> {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/g;
    let match: RegExpExecArray | null;
    const replacements: { original: string; replacement: string }[] = [];

    const sourceDir = sourceEntityPath.substring(
      0,
      sourceEntityPath.lastIndexOf("/")
    );
    const targetAssetsDir = ImageService.getAssetsDir(targetEntityPath);
    const targetSlug = entitySlug(targetEntityPath);

    while ((match = imageRegex.exec(markdown)) !== null) {
      const fullMatch = match[0];
      const alt = match[1] ?? "";
      const relativePath = match[2] ?? "";
      const width = match[3];

      // Resolve source absolute path
      const sourcePath = relativePath.startsWith("./")
        ? `${sourceDir}/${relativePath.slice(2)}`
        : `${sourceDir}/${relativePath}`;

      // Extract filename from the source path
      const filename = sourcePath.substring(sourcePath.lastIndexOf("/") + 1);
      const targetPath = `${targetAssetsDir}/${filename}`;
      const newRelativePath = `./${targetSlug}.assets/${filename}`;

      replacements.push({
        original: fullMatch,
        replacement: `![${alt}](${newRelativePath})${width ? `{width=${width}}` : ""}`,
      });

      // Copy the file
      try {
        await runtime.ensureDirectory(targetAssetsDir);
        await runtime.copyFile(sourcePath, targetPath);
      } catch {
        // If copy fails (e.g., source doesn't exist), skip silently
      }
    }

    if (replacements.length === 0) return markdown;

    // Apply replacements
    let result = markdown;
    for (const { original, replacement } of replacements) {
      result = result.replace(original, replacement);
    }
    return result;
  },

  /**
   * Delete an orphaned image from disk and update the index.
   * Only callable on orphaned images (guard check).
   */
  async deleteImage(imagePath: string): Promise<void> {
    const imageFile = indexStore.imageFiles.get(imagePath);
    if (!imageFile || !imageFile.isOrphan) return;

    await runtime.deleteFile(imagePath);

    // Update index
    const newImageFiles = new Map(indexStore.imageFiles);
    newImageFiles.delete(imagePath);
    setIndexStore("imageFiles", newImageFiles);

    // Remove from reverse map
    const newImageToEntities = new Map(indexStore.imageToEntities);
    newImageToEntities.delete(imagePath);
    setIndexStore("imageToEntities", newImageToEntities);

    // Clean up empty .assets/ directory
    const assetsDir = imagePath.substring(0, imagePath.lastIndexOf("/"));
    if (assetsDir.endsWith(".assets")) {
      try {
        const remaining = await runtime.listDirectory(assetsDir);
        if (remaining.length === 0) {
          await runtime.deleteDirectory(assetsDir);
        }
      } catch {
        // Directory may already be gone
      }
    }
  },
};

/** Update the image index store with a newly ingested image. */
function addImageToIndex(
  imagePath: string,
  filename: string,
  entityPath: string
) {
  const newImageFiles = new Map(indexStore.imageFiles);
  newImageFiles.set(imagePath, {
    path: imagePath,
    filename,
    entityPath,
    size: 0,
    isOrphan: false,
  });
  setIndexStore("imageFiles", newImageFiles);

  const newImageToEntities = new Map(indexStore.imageToEntities);
  const existing = newImageToEntities.get(imagePath);
  if (existing) {
    if (!existing.includes(entityPath)) {
      newImageToEntities.set(imagePath, [...existing, entityPath]);
    }
  } else {
    newImageToEntities.set(imagePath, [entityPath]);
  }
  setIndexStore("imageToEntities", newImageToEntities);
}

/** Extract the slug (filename without .md) from an entity path. */
function entitySlug(entityPath: string): string {
  return entityPath
    .substring(entityPath.lastIndexOf("/") + 1)
    .replace(/\.md$/, "");
}

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
