import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameDto, UpdateGameDto } from './dto';
import { extractGameBundle, storageRoot } from './zip.util';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

@Injectable()
export class StudioService {
  constructor(private readonly prisma: PrismaService) {}

  private async ownedGame(developerId: string, gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        versions: { orderBy: { uploadedAt: 'desc' } },
        translations: true,
        screenshots: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!game) throw new NotFoundException('Game not found');
    if (game.developerId !== developerId) {
      throw new ForbiddenException('Not your game');
    }
    return game;
  }

  async getGame(developerId: string, gameId: string) {
    return this.ownedGame(developerId, gameId);
  }

  private assertEditable(game: { status: string }) {
    if (['SUBMITTED', 'IN_REVIEW'].includes(game.status)) {
      throw new BadRequestException('Wait for the current review to finish before editing');
    }
  }

  async createGame(developerId: string, dto: CreateGameDto) {
    const existing = await this.prisma.game.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) throw new ConflictException('Slug already taken');
    return this.prisma.game.create({
      data: {
        slug: dto.slug,
        developerId,
        category: dto.category,
        orientation: dto.orientation,
        scoreOrder: dto.scoreOrder,
        maxScore: dto.maxScore,
        translations: { create: dto.translations },
      },
      include: { translations: true },
    });
  }

  async myGames(developerId: string) {
    return this.prisma.game.findMany({
      where: { developerId },
      include: {
        translations: true,
        versions: { orderBy: { uploadedAt: 'desc' } },
        screenshots: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateGame(developerId: string, gameId: string, dto: UpdateGameDto) {
    const game = await this.ownedGame(developerId, gameId);
    this.assertEditable(game);
    if (dto.translations) {
      for (const t of dto.translations) {
        await this.prisma.gameTranslation.upsert({
          where: { gameId_locale: { gameId, locale: t.locale } },
          create: { gameId, ...t },
          update: { name: t.name, shortIntro: t.shortIntro, controlsHtml: t.controlsHtml },
        });
      }
    }
    return this.prisma.game.update({
      where: { id: gameId },
      data: {
        category: dto.category,
        orientation: dto.orientation,
        scoreOrder: dto.scoreOrder,
        maxScore: dto.maxScore,
      },
      include: {
        translations: true,
        versions: true,
        screenshots: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  private imageExtension(mimetype: string): string {
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const extension = extensions[mimetype];
    if (!extension) {
      throw new BadRequestException('Only PNG, JPEG, and WebP images are supported');
    }
    return extension;
  }

  private async imageBuffer(file: any, maxBytes: number) {
    const extension = this.imageExtension(file.mimetype);
    const buffer: Buffer = await file.toBuffer();
    if (buffer.length > maxBytes) {
      throw new BadRequestException(`Image must be smaller than ${Math.floor(maxBytes / 1024 / 1024)} MB`);
    }
    return { extension, buffer };
  }

  async uploadBanner(developerId: string, gameId: string, file: any) {
    const game = await this.ownedGame(developerId, gameId);
    this.assertEditable(game);
    const { extension, buffer } = await this.imageBuffer(file, 12 * 1024 * 1024);
    const directory = path.join(storageRoot(), 'game-media', gameId);
    fs.mkdirSync(directory, { recursive: true });
    if (game.bannerPath) {
      const oldPath = path.resolve(storageRoot(), game.bannerPath);
      if (oldPath.startsWith(path.resolve(storageRoot()) + path.sep)) {
        fs.rmSync(oldPath, { force: true });
      }
    }
    const relativePath = path.posix.join(
      'game-media',
      gameId,
      `banner-${randomBytes(8).toString('hex')}.${extension}`,
    );
    fs.writeFileSync(path.resolve(storageRoot(), relativePath), buffer);
    return this.prisma.game.update({
      where: { id: gameId },
      data: { bannerPath: relativePath },
      select: { id: true, bannerPath: true },
    });
  }

  async uploadScreenshot(developerId: string, gameId: string, file: any) {
    const game = await this.ownedGame(developerId, gameId);
    this.assertEditable(game);
    const { extension, buffer } = await this.imageBuffer(file, 8 * 1024 * 1024);
    const directory = path.join(storageRoot(), 'game-media', gameId);
    fs.mkdirSync(directory, { recursive: true });
    const relativePath = path.posix.join(
      'game-media',
      gameId,
      `screenshot-${randomBytes(8).toString('hex')}.${extension}`,
    );
    fs.writeFileSync(path.resolve(storageRoot(), relativePath), buffer);
    const screenshot = await this.prisma.gameScreenshot.create({
      data: {
        gameId,
        path: relativePath,
        sortOrder: game.screenshots.length,
      },
    });
    return screenshot;
  }

  async removeScreenshot(developerId: string, gameId: string, screenshotId: string) {
    const game = await this.ownedGame(developerId, gameId);
    this.assertEditable(game);
    const screenshot = await this.prisma.gameScreenshot.findFirst({
      where: { id: screenshotId, gameId },
    });
    if (!screenshot) throw new NotFoundException('Screenshot not found');
    const absolutePath = path.resolve(storageRoot(), screenshot.path);
    if (absolutePath.startsWith(path.resolve(storageRoot()) + path.sep)) {
      fs.rmSync(absolutePath, { force: true });
    }
    await this.prisma.gameScreenshot.delete({ where: { id: screenshotId } });
    return { ok: true };
  }

  async uploadVersion(
    developerId: string,
    gameId: string,
    semver: string,
    zipBuffer: Buffer,
  ) {
    if (!SEMVER_RE.test(semver)) {
      throw new BadRequestException('Version must look like 1.0.0');
    }
    const game = await this.ownedGame(developerId, gameId);
    const duplicate = game.versions.find((v) => v.semver === semver);
    if (duplicate) throw new ConflictException('Version already exists');

    const bundlePath = `${game.slug}/${semver}`;
    extractGameBundle(zipBuffer, path.join(storageRoot(), game.slug, semver));

    const version = await this.prisma.gameVersion.create({
      data: { gameId, semver, bundlePath },
    });
    if (game.status === 'PUBLISHED') {
      // Updates to live games go straight to the admin review queue;
      // the game keeps serving its active bundle until the update is approved.
      await this.prisma.game.update({
        where: { id: gameId },
        data: { updateSubmittedAt: new Date(), rejectReason: null },
      });
    }
    return version;
  }

  async submit(developerId: string, gameId: string) {
    const game = await this.ownedGame(developerId, gameId);
    if (!['DRAFT', 'REJECTED'].includes(game.status)) {
      throw new BadRequestException('Game is not in a submittable state');
    }
    if (game.versions.length === 0) {
      throw new BadRequestException('Upload a game bundle first');
    }
    return this.prisma.game.update({
      where: { id: gameId },
      data: { status: 'SUBMITTED', rejectReason: null },
    });
  }
}
