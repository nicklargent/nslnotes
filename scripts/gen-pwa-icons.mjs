#!/usr/bin/env node
/**
 * Generate PWA icons from the app SVG.
 *
 *   node scripts/gen-pwa-icons.mjs
 *
 * Writes PNG icons into public/icons/. Run after any update to
 * src/assets/app-icon.svg. The vite-plugin-pwa config references these files
 * from the manifest.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const source = path.join(root, "src", "assets", "app-icon.svg");
const outDir = path.join(root, "public", "icons");

// (filename, size, background or null for transparent).
const targets = [
  ["icon-192.png", 192, null],
  ["icon-512.png", 512, null],
  ["icon-512-maskable.png", 512, "#4338CA"],
  ["apple-touch-icon.png", 180, "#4338CA"],
  ["apple-touch-icon-167.png", 167, "#4338CA"],
  ["apple-touch-icon-152.png", 152, "#4338CA"],
];

fs.mkdirSync(outDir, { recursive: true });
const svg = fs.readFileSync(source);

for (const [name, size, background] of targets) {
  let pipeline = sharp(svg, { density: 384 }).resize(size, size, {
    fit: "contain",
    background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (background) {
    pipeline = pipeline.flatten({ background });
  }
  await pipeline.png().toFile(path.join(outDir, name));
  console.log(`wrote icons/${name} (${size}x${size})`);
}
