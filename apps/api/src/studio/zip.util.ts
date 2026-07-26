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
const PACKAGE_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const PACKAGE_MANIFEST = 'gamehub.json';
const PACKAGE_SCREENSHOTS_DIR = 'screenshots/';
const MAX_ENTRIES = 2000;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SCREENSHOTS = 12;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

export interface BundleFile {
  relPath: string;
  data: Buffer;
}

export interface GamePackageImage extends BundleFile {
  extension: 'png' | 'jpg' | 'webp';
}

export interface GamePackageMetadata {
  slug: string;
  version: string;
  name: string;
  description: string;
  controls: string;
  nameVi?: string;
  descriptionVi?: string;
  controlsVi?: string;
  category: string;
  orientation: 'LANDSCAPE' | 'PORTRAIT' | 'BOTH';
  scoreOrder: 'DESC' | 'ASC';
  maxScore: number | null;
  banner?: string;
}

export interface ParsedGamePackage {
  metadata: GamePackageMetadata;
  bundleFiles: BundleFile[];
  screenshots: GamePackageImage[];
  banner: GamePackageImage;
}

export function storageRoot(): string {
  return path.resolve(
    process.cwd(),
    process.env.GAMES_STORAGE_DIR ?? '../../storage/games',
  );
}

function archiveFiles(zipBuffer: Buffer): BundleFile[] {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw new BadRequestException('Invalid zip file');
  }

  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (entries.length === 0) throw new BadRequestException('Empty zip');
  if (entries.length > MAX_ENTRIES) {
    throw new BadRequestException('Too many files in bundle');
  }

  const names = entries.map((entry) => entry.entryName.replace(/\\/g, '/'));
  const firstSegment = names[0].split('/')[0];
  const hasCommonPrefix =
    firstSegment !== '.' &&
    firstSegment !== '..' &&
    !/^[a-zA-Z]:/.test(firstSegment) &&
    names[0].includes('/') &&
    names.every((name) => name.startsWith(firstSegment + '/'));
  const prefix = hasCommonPrefix ? firstSegment + '/' : '';

  let totalBytes = 0;
  const seen = new Set<string>();
  const files: BundleFile[] = [];
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
    if (seen.has(relPath)) {
      throw new BadRequestException(`Duplicate path in zip: ${relPath}`);
    }
    seen.add(relPath);

    const ext = path.extname(relPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`File type not allowed: ${relPath}`);
    }
    totalBytes += entry.header.size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new BadRequestException('Bundle too large when extracted');
    }
    files.push({ relPath, data: entry.getData() });
  }
  return files;
}

export function writeGameBundle(files: BundleFile[], destDir: string): void {
  const resolvedDest = path.resolve(destDir);
  fs.rmSync(resolvedDest, { recursive: true, force: true });
  for (const file of files) {
    const target = path.resolve(resolvedDest, file.relPath);
    if (!target.startsWith(resolvedDest + path.sep)) {
      throw new BadRequestException(`Unsafe path in zip: ${file.relPath}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.data);
  }
}

/**
 * Validates and extracts an uploaded H5 game bundle.
 * Guards against zip-slip, disallowed file types, and decompression bombs.
 * Accepts either index.html at the zip root or inside a single top-level folder.
 */
export function extractGameBundle(zipBuffer: Buffer, destDir: string): void {
  const files = archiveFiles(zipBuffer);
  if (!files.some((file) => file.relPath === 'index.html')) {
    throw new BadRequestException('Bundle must contain index.html at its root');
  }
  writeGameBundle(files, destDir);
}

function recordValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${PACKAGE_MANIFEST} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(
  manifest: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  const value = manifest[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${PACKAGE_MANIFEST}: ${key} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new BadRequestException(
      `${PACKAGE_MANIFEST}: ${key} must be at most ${maxLength} characters`,
    );
  }
  return trimmed;
}

function optionalString(
  manifest: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = manifest[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${PACKAGE_MANIFEST}: ${key} must be text`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new BadRequestException(
      `${PACKAGE_MANIFEST}: ${key} must be at most ${maxLength} characters`,
    );
  }
  return trimmed || undefined;
}

function enumValue<T extends string>(
  manifest: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = manifest[key] ?? fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BadRequestException(
      `${PACKAGE_MANIFEST}: ${key} must be one of ${allowed.join(', ')}`,
    );
  }
  return value as T;
}

function packagePath(value: string, field: string): string {
  const normalized = value.replace(/\\/g, '/');
  if (
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new BadRequestException(`${PACKAGE_MANIFEST}: unsafe ${field} path`);
  }
  return normalized;
}

function imageExtension(file: BundleFile): 'png' | 'jpg' | 'webp' {
  const ext = path.extname(file.relPath).toLowerCase();
  if (!PACKAGE_IMAGE_EXTENSIONS.has(ext)) {
    throw new BadRequestException(
      `Package screenshots must be PNG, JPEG, or WebP: ${file.relPath}`,
    );
  }
  if (file.data.length > MAX_SCREENSHOT_BYTES) {
    throw new BadRequestException(
      `Package screenshot must be smaller than 8 MB: ${file.relPath}`,
    );
  }

  const isPng =
    file.data.length >= 8 &&
    file.data.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  const isJpeg =
    file.data.length >= 3 &&
    file.data[0] === 0xff &&
    file.data[1] === 0xd8 &&
    file.data[2] === 0xff;
  const isWebp =
    file.data.length >= 12 &&
    file.data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    file.data.subarray(8, 12).toString('ascii') === 'WEBP';

  if (isPng && ext === '.png') return 'png';
  if (isJpeg && (ext === '.jpg' || ext === '.jpeg')) return 'jpg';
  if (isWebp && ext === '.webp') return 'webp';
  throw new BadRequestException(
    `Screenshot contents do not match its file type: ${file.relPath}`,
  );
}

function parseMetadata(file: BundleFile): GamePackageMetadata {
  if (file.data.length > MAX_MANIFEST_BYTES) {
    throw new BadRequestException(`${PACKAGE_MANIFEST} is too large`);
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = recordValue(JSON.parse(file.data.toString('utf8')));
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(`${PACKAGE_MANIFEST} is not valid JSON`);
  }

  const slug = requiredString(manifest, 'slug', 50);
  if (!SLUG_RE.test(slug)) {
    throw new BadRequestException(
      `${PACKAGE_MANIFEST}: slug must use lowercase letters, digits, and dashes`,
    );
  }
  const version = requiredString(manifest, 'version', 32);
  if (!SEMVER_RE.test(version)) {
    throw new BadRequestException(
      `${PACKAGE_MANIFEST}: version must look like 1.0.0`,
    );
  }

  const categoryValue = manifest.category ?? manifest.genre ?? 'arcade';
  if (
    typeof categoryValue !== 'string' ||
    !categoryValue.trim() ||
    categoryValue.trim().length > 40
  ) {
    throw new BadRequestException(
      `${PACKAGE_MANIFEST}: category must be 1 to 40 characters`,
    );
  }

  const maxScoreValue = manifest.maxScore;
  if (
    maxScoreValue !== undefined &&
    maxScoreValue !== null &&
    (!Number.isInteger(maxScoreValue) || (maxScoreValue as number) < 1)
  ) {
    throw new BadRequestException(
      `${PACKAGE_MANIFEST}: maxScore must be a positive integer`,
    );
  }

  const bannerValue = optionalString(manifest, 'banner', 240);
  return {
    slug,
    version,
    name: requiredString(manifest, 'name', 80),
    description: requiredString(manifest, 'description', 500),
    controls: optionalString(manifest, 'controls', 5000) ?? '',
    nameVi: optionalString(manifest, 'nameVi', 80),
    descriptionVi: optionalString(manifest, 'descriptionVi', 500),
    controlsVi: optionalString(manifest, 'controlsVi', 5000),
    category: categoryValue.trim(),
    orientation: enumValue(
      manifest,
      'orientation',
      ['LANDSCAPE', 'PORTRAIT', 'BOTH'] as const,
      'BOTH',
    ),
    scoreOrder: enumValue(
      manifest,
      'scoreOrder',
      ['DESC', 'ASC'] as const,
      'DESC',
    ),
    maxScore:
      maxScoreValue === undefined || maxScoreValue === null
        ? null
        : (maxScoreValue as number),
    banner: bannerValue ? packagePath(bannerValue, 'banner') : undefined,
  };
}

/**
 * Parses GameHub's all-in-one package format:
 * - gamehub.json at the root
 * - the runnable H5 bundle, including root index.html
 * - one or more PNG/JPEG/WebP files under screenshots/
 */
export function parseGamePackage(zipBuffer: Buffer): ParsedGamePackage {
  const files = archiveFiles(zipBuffer);
  const manifestFile = files.find((file) => file.relPath === PACKAGE_MANIFEST);
  if (!manifestFile) {
    throw new BadRequestException(
      `Package must contain ${PACKAGE_MANIFEST} at its root`,
    );
  }
  const metadata = parseMetadata(manifestFile);

  const screenshotFiles = files.filter((file) =>
    file.relPath.startsWith(PACKAGE_SCREENSHOTS_DIR),
  );
  if (screenshotFiles.length === 0) {
    throw new BadRequestException(
      `Package must contain at least one image in ${PACKAGE_SCREENSHOTS_DIR}`,
    );
  }
  if (screenshotFiles.length > MAX_SCREENSHOTS) {
    throw new BadRequestException(
      `Package may contain at most ${MAX_SCREENSHOTS} screenshots`,
    );
  }
  const screenshots = screenshotFiles
    .sort((a, b) => a.relPath.localeCompare(b.relPath))
    .map((file) => ({ ...file, extension: imageExtension(file) }));

  const bundleFiles = files.filter(
    (file) =>
      file.relPath !== PACKAGE_MANIFEST &&
      !file.relPath.startsWith(PACKAGE_SCREENSHOTS_DIR),
  );
  if (!bundleFiles.some((file) => file.relPath === 'index.html')) {
    throw new BadRequestException('Package must contain index.html at its root');
  }

  const banner = metadata.banner
    ? screenshots.find((image) => image.relPath === metadata.banner)
    : screenshots[0];
  if (!banner) {
    throw new BadRequestException(
      `${PACKAGE_MANIFEST}: banner must point to an image in ${PACKAGE_SCREENSHOTS_DIR}`,
    );
  }

  return { metadata, bundleFiles, screenshots, banner };
}
