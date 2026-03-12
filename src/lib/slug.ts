import { runtime } from "./runtime";

/**
 * Generate a kebab-case slug from a title.
 * Per FR-FS-030:
 * - Converts to lowercase
 * - Replaces spaces with hyphens
 * - Removes special characters
 * - Collapses multiple consecutive hyphens
 * - Removes leading and trailing hyphens
 *
 * @param title - The title to convert to a slug
 * @returns A kebab-case slug
 */
export function generateSlug(title: string): string {
  return (
    title
      // Convert to lowercase
      .toLowerCase()
      // Replace spaces and underscores with hyphens
      .replace(/[\s_]+/g, "-")
      // Remove special characters (keep only alphanumeric and hyphens)
      .replace(/[^a-z0-9-]/g, "")
      // Collapse multiple consecutive hyphens
      .replace(/-+/g, "-")
      // Remove leading hyphens
      .replace(/^-+/, "")
      // Remove trailing hyphens
      .replace(/-+$/, "")
  );
}

/**
 * Generate a unique slug that doesn't collide with existing files.
 * Per FR-FS-031:
 * - First collision appends "-2"
 * - Subsequent collisions increment the number ("-3", "-4", etc.)
 *
 * @param title - The title to convert to a slug
 * @param directory - The directory to check for collisions
 * @param existingFiles - Optional pre-fetched list of existing filenames (for testing or batch operations)
 * @returns A unique slug that won't collide with existing files
 */
export async function generateUniqueSlug(
  title: string,
  directory: string,
  existingFiles?: string[]
): Promise<string> {
  const baseSlug = generateSlug(title);

  if (baseSlug === "") {
    // Edge case: title resulted in empty slug
    // Use a fallback
    return generateUniqueSlug("untitled", directory, existingFiles);
  }

  // Get existing files if not provided
  let files: string[];
  if (existingFiles !== undefined) {
    files = existingFiles;
  } else {
    try {
      files = await runtime.listDirectory(directory);
    } catch {
      // Directory doesn't exist or isn't accessible - no collisions possible
      return baseSlug;
    }
  }

  // Build a set of existing slugs (filenames without .md)
  const existingSlugs = new Set<string>();
  for (const file of files) {
    if (file.endsWith(".md")) {
      existingSlugs.add(file.slice(0, -3));
    }
  }

  // Check if base slug is available
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  // Find the next available suffix (starting at 2)
  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix++;
  }

  return `${baseSlug}-${suffix}`;
}

/**
 * Synchronous version of generateUniqueSlug for cases where
 * existing files are already known.
 *
 * @param title - The title to convert to a slug
 * @param existingFiles - List of existing filenames (with .md extension)
 * @returns A unique slug
 */
export function generateUniqueSlugSync(
  title: string,
  existingFiles: string[]
): string {
  const baseSlug = generateSlug(title);

  if (baseSlug === "") {
    return generateUniqueSlugSync("untitled", existingFiles);
  }

  // Build a set of existing slugs (filenames without .md)
  const existingSlugs = new Set<string>();
  for (const file of existingFiles) {
    if (file.endsWith(".md")) {
      existingSlugs.add(file.slice(0, -3));
    }
  }

  // Check if base slug is available
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  // Find the next available suffix (starting at 2)
  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix++;
  }

  return `${baseSlug}-${suffix}`;
}
