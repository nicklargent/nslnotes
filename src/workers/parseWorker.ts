/**
 * Web Worker for off-thread entity parsing (T7.3).
 * Handles YAML frontmatter + markdown parsing to keep main thread responsive.
 */

import { parse as parseYaml } from "yaml";

interface ParseRequest {
  id: number;
  type: "parse-file";
  path: string;
  content: string;
}

interface ParseResponse {
  id: number;
  result: {
    frontmatter: Record<string, unknown>;
    body: string;
  } | null;
}

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  const { id, content } = e.data;

  try {
    const result = parseFrontmatter(content);
    const response: ParseResponse = { id, result };
    self.postMessage(response);
  } catch {
    const response: ParseResponse = { id, result: null };
    self.postMessage(response);
  }
};

function parseFrontmatter(
  content: string
): { frontmatter: Record<string, unknown>; body: string } | null {
  const delimiter = "---";
  const trimmed = content.trimStart();

  if (!trimmed.startsWith(delimiter)) return null;

  const afterFirst = trimmed.indexOf("\n", delimiter.length);
  if (afterFirst === -1) return null;

  const endDelimiter = trimmed.indexOf(`\n${delimiter}`, afterFirst);
  if (endDelimiter === -1) return null;

  const yamlContent = trimmed.slice(afterFirst + 1, endDelimiter);
  const body = trimmed.slice(endDelimiter + delimiter.length + 2);

  try {
    const frontmatter = parseYaml(yamlContent) as Record<string, unknown>;
    if (typeof frontmatter !== "object" || frontmatter === null) return null;
    return { frontmatter, body };
  } catch {
    return null;
  }
}
