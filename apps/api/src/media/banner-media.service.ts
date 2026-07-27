import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import sharp, { Metadata } from 'sharp';
import { storageRoot } from '../studio/zip.util';

export const BANNER_WIDTHS = [256, 512, 768, 1280] as const;

const BANNER_PATH_RE =
  /^game-media\/[a-zA-Z0-9_-]+\/banner-[a-f0-9]+\.(?:png|jpe?g|webp)$/;
const CACHE_DIRECTORY = '.banner-cache';
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export interface CachedBanner {
  absolutePath: string;
  cacheControl: string;
  contentLength: number;
  contentType: string;
  resized: boolean;
}

function displayWidth(metadata: Metadata): number | undefined {
  const orientation = metadata.orientation ?? 1;
  return orientation >= 5 && orientation <= 8
    ? metadata.height
    : metadata.width;
}

@Injectable()
export class BannerMediaService {
  private readonly pendingVariants = new Map<string, Promise<void>>();

  async getBanner(
    mediaPath: string | undefined,
    requestedWidth: string | undefined,
  ): Promise<CachedBanner> {
    const width = Number(requestedWidth);
    if (!BANNER_WIDTHS.includes(width as (typeof BANNER_WIDTHS)[number])) {
      throw new BadRequestException(
        `Banner width must be one of: ${BANNER_WIDTHS.join(', ')}`,
      );
    }

    const source = this.resolveSource(mediaPath);
    const variant = this.variantPath(source, width);
    if (await this.isFile(variant)) {
      return this.response(variant, true);
    }

    const metadata = await this.readMetadata(source);
    const sourceWidth = displayWidth(metadata);
    if (!sourceWidth) {
      throw new NotFoundException('Banner image is invalid');
    }

    // The original is already the smallest useful version. Serving it directly
    // avoids both upscaling and a duplicate cache file.
    if (sourceWidth <= width) {
      return this.response(source, false);
    }

    await this.createVariantOnce(source, variant, width);
    return this.response(variant, true);
  }

  private resolveSource(mediaPath: string | undefined): string {
    const normalized = mediaPath?.replace(/\\/g, '/');
    if (!normalized || !BANNER_PATH_RE.test(normalized)) {
      throw new NotFoundException('Banner not found');
    }

    const root = storageRoot();
    const absolutePath = path.resolve(root, normalized);
    if (!absolutePath.startsWith(root + path.sep) || !fs.existsSync(absolutePath)) {
      throw new NotFoundException('Banner not found');
    }
    return absolutePath;
  }

  private variantPath(source: string, width: number): string {
    const extension = path.extname(source);
    const basename = path.basename(source, extension);
    return path.join(
      path.dirname(source),
      CACHE_DIRECTORY,
      `${basename}-w${width}.webp`,
    );
  }

  private async readMetadata(source: string): Promise<Metadata> {
    try {
      return await sharp(source).metadata();
    } catch {
      throw new NotFoundException('Banner image is invalid');
    }
  }

  private async isFile(filePath: string): Promise<boolean> {
    try {
      return (await fs.promises.stat(filePath)).isFile();
    } catch {
      return false;
    }
  }

  private async createVariantOnce(
    source: string,
    destination: string,
    width: number,
  ): Promise<void> {
    let pending = this.pendingVariants.get(destination);
    if (!pending) {
      pending = this.createVariant(source, destination, width).finally(() => {
        this.pendingVariants.delete(destination);
      });
      this.pendingVariants.set(destination, pending);
    }
    await pending;
  }

  private async createVariant(
    source: string,
    destination: string,
    width: number,
  ): Promise<void> {
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    const temporaryPath = `${destination}.${randomBytes(6).toString('hex')}.tmp`;
    try {
      await sharp(source)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toFile(temporaryPath);
      await fs.promises.rename(temporaryPath, destination);
    } catch {
      throw new NotFoundException('Banner image could not be resized');
    } finally {
      await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  private response(absolutePath: string, resized: boolean): CachedBanner {
    const contentType = resized
      ? 'image/webp'
      : CONTENT_TYPES[path.extname(absolutePath).toLowerCase()];
    if (!contentType) {
      throw new NotFoundException('Banner image is invalid');
    }
    return {
      absolutePath,
      cacheControl: CACHE_CONTROL,
      contentLength: fs.statSync(absolutePath).size,
      contentType,
      resized,
    };
  }
}
