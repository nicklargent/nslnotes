import { runtime } from "../lib/runtime";
import { SettingsService } from "./SettingsService";

const RATE_LIMIT_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const KEEP_NEWEST = 2;
const BACKUP_SUFFIX = ".bak";
const BACKUP_DIR = ".backups";

// Track the last-written path and its snapshot time. When the same path is
// written again within the rate-limit window, we skip. When a different path
// is written, we treat it as a new session and snapshot.
let lastWrittenPath: string | null = null;
let lastBackupTime = 0;

function fsSafeIso(d: Date): string {
  return d.toISOString().replace(/:/g, "-");
}

function parseIsoFromName(filename: string, originalBase: string): Date | null {
  const prefix = `${originalBase}.`;
  if (!filename.startsWith(prefix) || !filename.endsWith(BACKUP_SUFFIX))
    return null;
  let middle = filename.slice(
    prefix.length,
    filename.length - BACKUP_SUFFIX.length
  );
  // Strip optional collision-disambiguator suffix "-N"
  middle = middle.replace(/-\d+$/, "");
  const restored = middle.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
  const t = Date.parse(restored);
  return Number.isNaN(t) ? null : new Date(t);
}

function splitPath(absolutePath: string): { dir: string; base: string } {
  const idx = absolutePath.lastIndexOf("/");
  return idx === -1
    ? { dir: "", base: absolutePath }
    : { dir: absolutePath.slice(0, idx), base: absolutePath.slice(idx + 1) };
}

async function snapshotPathFor(originalPath: string): Promise<string | null> {
  const rootPath = await SettingsService.getRootPath();
  if (!rootPath) return null;
  const root = rootPath.replace(/\/+$/, "");
  if (!originalPath.startsWith(root + "/")) return null;
  const rel = originalPath.slice(root.length + 1);
  if (rel.startsWith(`${BACKUP_DIR}/`)) return null;
  const baseStamp = fsSafeIso(new Date());
  const baseDst = `${root}/${BACKUP_DIR}/${rel}.${baseStamp}${BACKUP_SUFFIX}`;
  // Disambiguate when two writes land in the same millisecond (or the test
  // clock is frozen). Try the bare stamp first, then -1, -2, ...
  if (!(await runtime.exists(baseDst))) return baseDst;
  for (let i = 1; i < 1000; i++) {
    const candidate = `${root}/${BACKUP_DIR}/${rel}.${baseStamp}-${i}${BACKUP_SUFFIX}`;
    if (!(await runtime.exists(candidate))) return candidate;
  }
  return null;
}

async function snapshot(originalPath: string): Promise<void> {
  if (!(await runtime.exists(originalPath))) return;
  const dst = await snapshotPathFor(originalPath);
  if (!dst) return;
  const { dir } = splitPath(dst);
  await runtime.ensureDirectory(dir);
  await runtime.copyFile(originalPath, dst);
  await cleanupOldBackups(originalPath, dir);
}

async function cleanupOldBackups(
  originalPath: string,
  backupDir: string
): Promise<void> {
  try {
    const { base } = splitPath(originalPath);
    const entries = await runtime.listDirectory(backupDir);
    const mine = entries
      .map((p) => {
        const { base: name } = splitPath(p);
        const ts = parseIsoFromName(name, base);
        return ts ? { path: p, ts: ts.getTime() } : null;
      })
      .filter((x): x is { path: string; ts: number } => x !== null)
      .sort((a, b) => b.ts - a.ts);

    const cutoff = Date.now() - MAX_AGE_MS;
    const candidates = mine.slice(KEEP_NEWEST);
    for (const c of candidates) {
      if (c.ts < cutoff) {
        try {
          await runtime.deleteFile(c.path);
        } catch (e) {
          console.warn(
            `SnapshotService: failed to delete old backup ${c.path}`,
            e
          );
        }
      }
    }
  } catch (e) {
    console.warn(`SnapshotService: cleanup failed for ${originalPath}`, e);
  }
}

export const SnapshotService = {
  resetWindow(): void {
    lastWrittenPath = null;
    lastBackupTime = 0;
  },

  async maybeBackup(path: string): Promise<void> {
    try {
      const samePath = path === lastWrittenPath;
      if (samePath && Date.now() - lastBackupTime <= RATE_LIMIT_MS) return;
      await snapshot(path);
      lastWrittenPath = path;
      lastBackupTime = Date.now();
    } catch (e) {
      console.warn(`SnapshotService: snapshot failed for ${path}`, e);
    }
  },
};
