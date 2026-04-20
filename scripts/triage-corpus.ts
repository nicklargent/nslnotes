#!/usr/bin/env npx tsx
/**
 * Inspect corpus round-trip failures: for each failing .md file, show
 * whether md2 is a stable fixed point and a simple diff between the source
 * body and md2. Pass --apply to overwrite each stable file with its md2.
 *
 * Run:  npx tsx scripts/triage-corpus.ts [--apply]
 */
import { Window } from "happy-dom";
const window = new Window();
(globalThis as unknown as { DOMParser: typeof window.DOMParser }).DOMParser =
  window.DOMParser;
(globalThis as unknown as { Node: typeof window.Node }).Node = window.Node;

const { htmlFromMarkdown } = await import(
  "../src/components/editor/markdownToHtml"
);
const { markdownFromHtml } = await import(
  "../src/components/editor/htmlToMarkdown"
);
const { loadCorpus, collectMarkdown } = await import(
  "../tests/helpers/corpus"
);

import * as fs from "fs";

const APPLY = process.argv.includes("--apply");

const config = await loadCorpus();
if (!config) {
  console.error("No tests/corpus.config.ts");
  process.exit(1);
}

/**
 * Very simple diff: pair lines by index, show only the differing ones with
 * some surrounding context. Good enough to eyeball small shifts.
 */
function simpleDiff(a: string, b: string, context = 1, maxLines = 30): string {
  const la = a.split("\n");
  const lb = b.split("\n");
  const len = Math.max(la.length, lb.length);
  const diffs: number[] = [];
  for (let i = 0; i < len; i++) {
    if (la[i] !== lb[i]) diffs.push(i);
  }
  if (diffs.length === 0) return "  (no line-indexed differences)";
  const shown = new Set<number>();
  for (const d of diffs) {
    for (let k = d - context; k <= d + context; k++) {
      if (k >= 0 && k < len) shown.add(k);
    }
  }
  const out: string[] = [];
  let prev = -2;
  for (const idx of [...shown].sort((x, y) => x - y)) {
    if (idx - prev > 1) out.push("  @@");
    if (la[idx] === lb[idx]) {
      out.push(`    ${la[idx] ?? ""}`);
    } else {
      out.push(`  - ${JSON.stringify(la[idx] ?? "")}`);
      out.push(`  + ${JSON.stringify(lb[idx] ?? "")}`);
    }
    prev = idx;
    if (out.length > maxLines) {
      out.push("  ...(truncated)");
      break;
    }
  }
  return out.join("\n");
}

interface FileResult {
  absPath: string;
  relPath: string;
  md1: string;
  md2: string;
  md3: string;
  sourceBody: string;
  stable: boolean;
}

const failed: FileResult[] = [];

for (const vault of config.dirs) {
  for (const f of collectMarkdown(vault)) {
    const md1 = markdownFromHtml(htmlFromMarkdown(f.body));
    const md2 = markdownFromHtml(htmlFromMarkdown(md1));
    if (md1 === md2) continue;
    const md3 = markdownFromHtml(htmlFromMarkdown(md2));
    failed.push({
      absPath: f.absPath,
      relPath: `${vault}/${f.relPath}`,
      md1,
      md2,
      md3,
      sourceBody: f.body,
      stable: md2 === md3,
    });
  }
}

console.log(`\n${failed.length} failing files\n`);
console.log(`  ${failed.filter((f) => f.stable).length} where md2 is a stable fixed point (safe to rewrite)`);
console.log(`  ${failed.filter((f) => !f.stable).length} oscillating (needs manual review)\n`);

for (const r of failed) {
  console.log(`\n=== ${r.relPath} ===`);
  console.log(`  md2 stable: ${r.stable ? "yes" : "NO — oscillates or grows"}`);
  console.log(`  --- diff (source body → md2 canonical form) ---`);
  console.log(simpleDiff(r.sourceBody.replace(/\n+$/, ""), r.md2.replace(/\n+$/, "")));
}

if (APPLY) {
  console.log(`\n=== applying fixes to ${failed.filter((f) => f.stable).length} stable files ===`);
  for (const r of failed) {
    if (!r.stable) continue;
    const orig = fs.readFileSync(r.absPath, "utf-8");
    const fmMatch = orig.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    const fm = fmMatch ? fmMatch[0] : "";
    const newContent = fm + r.md2;
    fs.writeFileSync(r.absPath, newContent);
    console.log(`  wrote ${r.relPath}`);
  }
}
