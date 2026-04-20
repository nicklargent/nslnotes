import { FileService } from "./FileService";
import { IndexService } from "./IndexService";
import { SettingsService } from "./SettingsService";
import { ImageService, entitySlug } from "./ImageService";
import { parse, serialize } from "../lib/frontmatter";
import { getCodeBlockLines } from "../lib/markdown";
import { getTodayISO, isValidISODate } from "../lib/dates";
import { runtime } from "../lib/runtime";
import { indexStore } from "../stores/indexStore";
import type { Entity, EntityType } from "../types/entities";

export interface RenameOrConvertParams {
  entityPath: string;
  targetType: EntityType;
  targetSlug: string;
  /** Required iff targetType === "note". ISO YYYY-MM-DD. */
  targetDate?: string;
}

export type RenameOrConvertResult = { entity: Entity } | { error: string };

export const ENTITY_TYPE_DIRS: Record<EntityType, string> = {
  note: "notes",
  task: "tasks",
  doc: "docs",
};

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-?/;

/**
 * For a note path (`notes/YYYY-MM-DD-foo.md`), return just `foo`.
 * Daily notes (`notes/YYYY-MM-DD.md`) return "".
 */
export function noteSlugSuffix(noteFileSlug: string): string {
  return noteFileSlug.replace(ISO_DATE_PREFIX, "");
}

function detectSourceType(parsed: {
  frontmatter: Record<string, unknown>;
}): EntityType | null {
  const t = parsed.frontmatter["type"];
  if (t === "note" || t === "task" || t === "doc") return t;
  return null;
}

export function computeTargetPath(
  rootPath: string,
  targetType: EntityType,
  targetSlug: string,
  targetDate: string | undefined
): { path: string; fileSlug: string } | { error: string } {
  if (targetType === "note") {
    if (!targetDate || !isValidISODate(targetDate)) {
      return { error: "A valid date (YYYY-MM-DD) is required for notes" };
    }
    const fileSlug = `${targetDate}-${targetSlug}`;
    return {
      path: `${rootPath}/${ENTITY_TYPE_DIRS.note}/${fileSlug}.md`,
      fileSlug,
    };
  }
  return {
    path: `${rootPath}/${ENTITY_TYPE_DIRS[targetType]}/${targetSlug}.md`,
    fileSlug: targetSlug,
  };
}

interface FrontmatterTransformInput {
  source: Record<string, unknown>;
  sourceType: EntityType;
  targetType: EntityType;
  targetDate: string | undefined;
}

/**
 * Build the new frontmatter. Stashes source-unique fields under `_<sourceType>`
 * and restores from `_<targetType>` if a stash from a prior round-trip exists.
 * Unknown keys (and the `_<otherType>` stashes that aren't being restored) pass
 * through unchanged.
 */
export function transformFrontmatter({
  source,
  sourceType,
  targetType,
  targetDate,
}: FrontmatterTransformInput):
  | { frontmatter: Record<string, unknown> }
  | { error: string } {
  const next: Record<string, unknown> = { ...source };

  const stashUnique = (type: EntityType) => {
    if (type === "task") {
      const stash: Record<string, unknown> = {};
      if (typeof next["status"] === "string") stash["status"] = next["status"];
      if (typeof next["due"] === "string") stash["due"] = next["due"];
      delete next["status"];
      delete next["due"];
      if (Object.keys(stash).length > 0) next["_task"] = stash;
    } else if (type === "doc") {
      if (next["pinned"] === true) {
        next["_doc"] = { pinned: true };
      }
      delete next["pinned"];
    } else {
      // note
      if (typeof next["date"] === "string") {
        next["_note"] = { date: next["date"] };
      }
      delete next["date"];
    }
  };

  if (sourceType !== targetType) {
    stashUnique(sourceType);
  }

  next["type"] = targetType;

  if (targetType === "task") {
    const stashed = (next["_task"] ?? {}) as Record<string, unknown>;
    next["status"] =
      typeof stashed["status"] === "string" ? stashed["status"] : "open";
    if (typeof stashed["due"] === "string") {
      next["due"] = stashed["due"];
    }
    delete next["_task"];
    if (
      typeof next["created"] !== "string" ||
      !isValidISODate(next["created"])
    ) {
      next["created"] = getTodayISO();
    }
  } else if (targetType === "doc") {
    const stashed = (next["_doc"] ?? {}) as Record<string, unknown>;
    if (stashed["pinned"] === true) {
      next["pinned"] = true;
    }
    delete next["_doc"];
    if (
      typeof next["created"] !== "string" ||
      !isValidISODate(next["created"])
    ) {
      next["created"] = getTodayISO();
    }
    if (typeof next["title"] !== "string" || next["title"].trim() === "") {
      return { error: "Doc requires a title — set one before converting" };
    }
  } else {
    // note
    const stashedDate =
      typeof (next["_note"] as Record<string, unknown> | undefined)?.[
        "date"
      ] === "string"
        ? ((next["_note"] as Record<string, unknown>)["date"] as string)
        : undefined;
    delete next["_note"];
    const date = targetDate ?? stashedDate;
    if (!date || !isValidISODate(date)) {
      return { error: "A valid date (YYYY-MM-DD) is required for notes" };
    }
    next["date"] = date;
    // Notes don't carry `created` — drop it so frontmatter stays minimal.
    delete next["created"];
  }

  return { frontmatter: next };
}

/**
 * Rewrite `[[oldType:oldSlug]]` → `[[newType:newSlug]]` in `content`,
 * skipping fenced code blocks. Uses the same code-block detection as
 * the wikilink parser so behavior is consistent with how backlinks
 * are indexed.
 */
export function rewriteWikilinks(
  content: string,
  oldType: EntityType,
  oldSlug: string,
  newType: EntityType,
  newSlug: string
): string {
  const lines = content.split("\n");
  const codeLines = getCodeBlockLines(lines);
  const oldRef = `[[${oldType}:${oldSlug}]]`;
  const newRef = `[[${newType}:${newSlug}]]`;
  let changed = false;
  const out = lines.map((line, i) => {
    if (codeLines.has(i)) return line;
    if (line.includes(oldRef)) {
      changed = true;
      return line.split(oldRef).join(newRef);
    }
    return line;
  });
  return changed ? out.join("\n") : content;
}

async function copyAssetsDir(
  sourceAssetsDir: string,
  targetAssetsDir: string
): Promise<void> {
  if (sourceAssetsDir === targetAssetsDir) return;
  if (!(await runtime.exists(sourceAssetsDir))) return;
  await runtime.ensureDirectory(targetAssetsDir);
  const entries = await runtime.listDirectory(sourceAssetsDir);
  for (const entry of entries) {
    const filename = entry.substring(entry.lastIndexOf("/") + 1);
    await runtime.copyFile(entry, `${targetAssetsDir}/${filename}`);
  }
}

export const RenameService = {
  async renameOrConvert(
    params: RenameOrConvertParams
  ): Promise<RenameOrConvertResult> {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return { error: "No root path configured" };

    const sourcePath = params.entityPath;
    const sourceContent = await FileService.read(sourcePath);
    const parsed = parse(sourceContent);
    if (!parsed) return { error: "Could not parse source frontmatter" };

    const sourceType = detectSourceType(parsed);
    if (!sourceType) return { error: "Source has no recognized type" };

    const sourceFileSlug = entitySlug(sourcePath);

    const targetSlug = params.targetSlug.trim();
    if (!targetSlug) return { error: "Slug is required" };

    const target = computeTargetPath(
      rootPath,
      params.targetType,
      targetSlug,
      params.targetDate
    );
    if ("error" in target) return target;

    if (target.path === sourcePath) {
      const entity = IndexService.resolveEntityByPath(target.path);
      return entity ? { entity } : { error: "Entity not found in index" };
    }

    if (await FileService.exists(target.path)) {
      return { error: "An entity already exists at that location" };
    }

    const transformed = transformFrontmatter({
      source: parsed.frontmatter,
      sourceType,
      targetType: params.targetType,
      targetDate: params.targetDate,
    });
    if ("error" in transformed) return transformed;

    let body = parsed.body;
    if (sourceFileSlug !== target.fileSlug) {
      const oldRef = `./${sourceFileSlug}.assets/`;
      const newRef = `./${target.fileSlug}.assets/`;
      body = body.split(oldRef).join(newRef);
    }

    const sourceAssetsDir = ImageService.getAssetsDir(sourcePath);
    const targetAssetsDir = ImageService.getAssetsDir(target.path);
    await copyAssetsDir(sourceAssetsDir, targetAssetsDir);

    const newContent = serialize(transformed.frontmatter, body);
    await FileService.write(target.path, newContent);

    const backlinks = indexStore.backlinkIndex.get(sourcePath) ?? [];
    const rewriteResults = await Promise.all(
      backlinks.map(async (back) => {
        try {
          const refContent = await FileService.read(back.sourcePath);
          const updated = rewriteWikilinks(
            refContent,
            sourceType,
            sourceFileSlug,
            params.targetType,
            target.fileSlug
          );
          if (updated !== refContent) {
            await FileService.write(back.sourcePath, updated);
            return back.sourcePath;
          }
        } catch {
          // Per-file failures don't roll back the move.
        }
        return null;
      })
    );
    const rewrittenSourcePaths = rewriteResults.filter(
      (p): p is string => p !== null
    );

    await FileService.delete(sourcePath);
    if (sourceAssetsDir !== targetAssetsDir) {
      try {
        await runtime.deleteDirectory(sourceAssetsDir);
      } catch {
        // Source assets dir may not exist; ignore.
      }
    }

    await IndexService.invalidate(target.path, rootPath);
    await IndexService.invalidate(sourcePath, rootPath);
    for (const refPath of rewrittenSourcePaths) {
      await IndexService.invalidate(refPath, rootPath);
    }

    const entity = IndexService.resolveEntityByPath(target.path);
    return entity ? { entity } : { error: "Renamed entity not found in index" };
  },
};
