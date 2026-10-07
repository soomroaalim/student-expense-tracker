/**
 * Restores the PWA icon PNGs from the base64 bundle.
 * PNGs are binary and can't travel through text-only file APIs,
 * so they live here as text and are materialized on install.
 * Pure Node.js — no dependencies.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
const bundle = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'icons.base64.json'), 'utf8'));

mkdirSync(outDir, { recursive: true });
for (const [name, b64] of Object.entries(bundle)) {
  writeFileSync(join(outDir, name), Buffer.from(b64, 'base64'));
  console.log(`restored public/icons/${name}`);
}
