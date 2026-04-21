import { invoke } from "@tauri-apps/api/core";
import { runtime } from "../lib/runtime";

export interface BackupSource {
  name: string;
  path: string;
}

export interface BackupStats {
  notebookCount: number;
  fileCount: number;
  bytesWritten: number;
  skippedSymlinks: number;
}

const ZERO_STATS: BackupStats = {
  notebookCount: 0,
  fileCount: 0,
  bytesWritten: 0,
  skippedSymlinks: 0,
};

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
  const m = /filename="([^"]+)"/.exec(disposition);
  return m?.[1] ?? null;
}

export const BackupService = {
  /**
   * Native mode: invoke the Tauri command, which writes directly to the
   * user-picked `outputPath`.
   *
   * Web mode: POST to the axum `/api/backup` endpoint and trigger a browser
   * download; `outputPath` is interpreted as a suggested filename.
   */
  async createBackup(
    sources: BackupSource[],
    outputPath: string
  ): Promise<BackupStats> {
    if (runtime.isNative()) {
      return invoke<BackupStats>("create_backup", { sources, outputPath });
    }

    const filename = outputPath.split(/[\\/]/).pop() ?? outputPath;
    const res = await fetch("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources, filename }),
    });
    if (!res.ok) {
      let msg = `Backup failed (${res.status})`;
      try {
        const err = (await res.json()) as { error?: string };
        if (err.error) msg = err.error;
      } catch {
        /* response wasn't JSON */
      }
      throw new Error(msg);
    }

    let stats: BackupStats = ZERO_STATS;
    const statsHeader = res.headers.get("X-Backup-Stats");
    if (statsHeader) {
      try {
        stats = { ...ZERO_STATS, ...(JSON.parse(statsHeader) as BackupStats) };
      } catch {
        /* ignore; fall back to ZERO_STATS */
      }
    }

    const blob = await res.blob();
    if (!stats.bytesWritten) {
      stats = { ...stats, bytesWritten: blob.size };
    }
    const suggested =
      filenameFromDisposition(res.headers.get("Content-Disposition")) ??
      filename ??
      "nslnotes-backup.tar.gz";
    triggerBrowserDownload(blob, suggested);
    return stats;
  },
};
