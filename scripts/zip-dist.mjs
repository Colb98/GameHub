/**
 * Packages a built game's dist/ into an upload-ready zip with index.html at the
 * archive root (exactly what the studio uploader requires). Cross-platform —
 * used by each game's `build` script after `vite build`.
 *
 * Run from a game package directory (pnpm sets cwd to the package):
 *   node ../../scripts/zip-dist.mjs
 * Writes <package-dir>/<package-name>.zip.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

const pkgDir = process.cwd();
const distDir = path.join(pkgDir, 'dist');

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error(
    `zip-dist: no dist/index.html found in ${pkgDir} — build the game first`,
  );
  process.exit(1);
}

const name = path.basename(pkgDir);
const outFile = path.join(pkgDir, `${name}.zip`);
fs.rmSync(outFile, { force: true });

const zip = new AdmZip();
// addLocalFolder adds the folder CONTENTS at the archive root, so dist/index.html
// becomes index.html and dist/assets/x.js becomes assets/x.js — no "dist/" prefix.
zip.addLocalFolder(distDir);
zip.writeZip(outFile);

console.log(`zip-dist: wrote ${name}.zip (index.html at root) — ready to upload`);
