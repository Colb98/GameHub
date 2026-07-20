import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
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
      include: { versions: { orderBy: { uploadedAt: 'desc' } }, translations: true },
    });
    if (!game) throw new NotFoundException('Game not found');
    if (game.developerId !== developerId) {
      throw new ForbiddenException('Not your game');
    }
    return game;
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
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateGame(developerId: string, gameId: string, dto: UpdateGameDto) {
    const game = await this.ownedGame(developerId, gameId);
    if (!['DRAFT', 'REJECTED'].includes(game.status)) {
      throw new BadRequestException('Only draft or rejected games can be edited');
    }
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
      include: { translations: true, versions: true },
    });
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
