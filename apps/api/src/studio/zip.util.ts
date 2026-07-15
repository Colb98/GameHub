import { BadRequestException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_EXTENSIONS = new Set([
  '.html', '.js', '.mjs', '.css', '.json', '.txt', '.xml', '.map',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.mp3', '.ogg', '.wav', '.m4a',
  '.ttf', '.otf', '.woff', '.woff2', '.fnt', '.atlas',
  '.wasm', '.bin', '.glsl',
]);
const MAX_ENTRIES = 2000;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

export function storageRoot(): string {
  return path.resolve(
    process.cwd(),
    process.env.GAMES_STORAGE_DIR ?? '../../storage/games',
  );
}

/**
 * Validates and extracts an uploaded H5 game bundle.
 * Guards against zip-slip, disallowed file types, and decompression bombs.
 * Accepts either index.html at the zip root or inside a single top-level folder.
 */
export function extractGameBundle(zipBuffer: Buffer, destDir: string): void {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw new BadRequestException('Invalid zip file');
  }
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  if (entries.length === 0) throw new BadRequestException('Empty zip');
  if (entries.length > MAX_ENTRIES) {
    throw new BadRequestException('Too many files in bundle');
  }

  let totalBytes = 0;
  const names = entries.map((e) => e.entryName.replace(/\\/g, '/'));

  // If everything lives under one top-level folder, strip that prefix
  const firstSegment = names[0].split('/')[0];
  const hasCommonPrefix =
    names[0].includes('/') &&
    names.every((n) => n.startsWith(firstSegment + '/'));
  const prefix = hasCommonPrefix ? firstSegment + '/' : '';

  const files: { relPath: string; data: Buffer }[] = [];
  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/');
    const relPath = name.slice(prefix.length);
    if (!relPath) continue;
    if (
      relPath.startsWith('/') ||
      /^[a-zA-Z]:/.test(relPath) ||
      relPath.split('/').includes('..')
    ) {
      throw new BadRequestException(`Unsafe path in zip: ${name}`);
    }
    const ext = path.extname(relPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`File type not allowed: ${relPath}`);
    }
    totalBytes += entry.header.size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new BadRequestException('Bundle too large when extracted');
    }
    // Belt and braces: the resolved path must stay inside destDir
    const target = path.resolve(destDir, relPath);
    if (!target.startsWith(path.resolve(destDir) + path.sep)) {
      throw new BadRequestException(`Unsafe path in zip: ${name}`);
    }
    files.push({ relPath, data: entry.getData() });
  }

  if (!files.some((f) => f.relPath === 'index.html')) {
    throw new BadRequestException('Bundle must contain index.html at its root');
  }

  fs.rmSync(destDir, { recursive: true, force: true });
  for (const file of files) {
    const target = path.resolve(destDir, file.relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.data);
  }
}
