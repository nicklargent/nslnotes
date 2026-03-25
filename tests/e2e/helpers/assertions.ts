/**
 * File system assertions for E2E tests.
 */
import * as fs from "node:fs";
import { expect } from "@playwright/test";
import { parse as parseYaml } from "yaml";

/**
 * Parse frontmatter from a markdown file on disk.
 */
export function readFrontmatter(filePath: string): Record<string, unknown> {
  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`No frontmatter found in ${filePath}`);
  return parseYaml(match[1]) as Record<string, unknown>;
}

/**
 * Assert that a frontmatter field has the expected value.
 */
export function expectFrontmatter(
  filePath: string,
  key: string,
  value: unknown,
): void {
  const fm = readFrontmatter(filePath);
  expect(fm[key]).toEqual(value);
}

/**
 * Assert that a file contains a given substring.
 */
export function expectFileContains(filePath: string, substring: string): void {
  const content = fs.readFileSync(filePath, "utf-8");
  expect(content).toContain(substring);
}

/**
 * Assert that a file does not exist.
 */
export function expectFileNotExists(filePath: string): void {
  expect(fs.existsSync(filePath)).toBe(false);
}

/**
 * Assert that a file exists.
 */
export function expectFileExists(filePath: string): void {
  expect(fs.existsSync(filePath)).toBe(true);
}

/**
 * Read full file content as string.
 */
export function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}
