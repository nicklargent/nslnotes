import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export interface CorpusConfig {
  /** Absolute paths to nslnotes vault roots (each containing notes/, tasks/, docs/). */
  dirs: string[];
}

export interface CorpusFile {
  vaultRoot: string;
  relPath: string;
  absPath: string;
  body: string;
}

/**
 * Load the user's corpus.config.ts if it exists and has at least one dir.
 * Returns null if not configured — tests should skip in that case.
 */
export async function loadCorpus(): Promise<CorpusConfig | null> {
  const configPath = path.resolve(HERE, "..", "corpus.config.ts");
  if (!fs.existsSync(configPath)) return null;

  const mod = (await import(configPath)) as { corpus?: CorpusConfig };
  if (!mod.corpus || mod.corpus.dirs.length === 0) return null;

  return mod.corpus;
}

/** Walk a vault root and return every .md file with its body stripped of frontmatter. */
export function collectMarkdown(vaultRoot: string): CorpusFile[] {
  const files: CorpusFile[] = [];
  for (const sub of ["notes", "tasks", "docs"]) {
    const dir = path.join(vaultRoot, sub);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const absPath = path.join(dir, entry.name);
      const raw = fs.readFileSync(absPath, "utf-8");
      const body = stripFrontmatter(raw);
      files.push({
        vaultRoot,
        relPath: path.join(sub, entry.name),
        absPath,
        body,
      });
    }
  }
  return files;
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length) : content;
}
