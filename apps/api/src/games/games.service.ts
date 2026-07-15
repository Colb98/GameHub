import { Injectable, NotFoundException } from '@nestjs/common';
import { Game, GameTranslation, GameVersion, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Principal } from '../common/types';

const HOT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type GameWithI18n = Game & {
  translations: GameTranslation[];
  versions?: GameVersion[];
};

export function pickTranslation(
  translations: GameTranslation[],
  locale: string,
) {
  return (
    translations.find((t) => t.locale === locale) ??
    translations.find((t) => t.locale === 'en') ??
    translations[0]
  );
}

export function toGameCard(game: GameWithI18n, locale: string) {
  const t = pickTranslation(game.translations, locale);
  return {
    id: game.id,
    slug: game.slug,
    category: game.category,
    orientation: game.orientation,
    name: t?.name ?? game.slug,
    shortIntro: t?.shortIntro ?? '',
    playCount: game.playCount,
    ratingAvg: game.ratingAvg,
    ratingCount: game.ratingCount,
    releaseDate: game.releaseDate,
    featuredRank: game.featuredRank,
  };
}

@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: {
    sort?: 'hot' | 'new';
    category?: string;
    q?: string;
    locale: string;
    take?: number;
  }) {
    const where: Prisma.GameWhereInput = {
      status: 'PUBLISHED',
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.q
        ? {
            translations: {
              some: { name: { contains: opts.q, mode: 'insensitive' } },
            },
          }
        : {}),
    };
    const games = await this.prisma.game.findMany({
      where,
      include: { translations: true },
      orderBy:
        opts.sort === 'new'
          ? [{ releaseDate: 'desc' }]
          : [{ featuredRank: { sort: 'asc', nulls: 'last' } }, { playCount: 'desc' }],
      take: Math.min(opts.take ?? 24, 60),
    });

    if (opts.sort === 'hot') {
      // "Hot" = plays in the trailing 7 days, not all-time
      const counts = await this.prisma.playSession.groupBy({
        by: ['gameId'],
        where: { startedAt: { gte: new Date(Date.now() - HOT_WINDOW_MS) } },
        _count: { _all: true },
      });
      const byId = new Map(counts.map((c) => [c.gameId, c._count._all]));
      games.sort((a, b) => (byId.get(b.id) ?? 0) - (byId.get(a.id) ?? 0));
    }
    return games.map((g) => toGameCard(g, opts.locale));
  }

  async detail(slug: string, locale: string, principal: Principal) {
    const game = await this.prisma.game.findUnique({
      where: { slug },
      include: {
        translations: true,
        versions: { where: { isActive: true }, take: 1 },
        developer: { select: { displayName: true } },
      },
    });
    if (!game || game.status !== 'PUBLISHED') {
      throw new NotFoundException('Game not found');
    }
    const t = pickTranslation(game.translations, locale);
    const version = game.versions[0];
    const [favorite, rating] = await Promise.all([
      principal.userId
        ? this.prisma.favorite.findUnique({
            where: {
              userId_gameId: { userId: principal.userId, gameId: game.id },
            },
          })
        : null,
      principal.userId
        ? this.prisma.rating.findUnique({
            where: {
              gameId_userId: { gameId: game.id, userId: principal.userId },
            },
          })
        : null,
    ]);
    return {
      id: game.id,
      slug: game.slug,
      category: game.category,
      orientation: game.orientation,
      scoreOrder: game.scoreOrder,
      releaseDate: game.releaseDate,
      playCount: game.playCount,
      ratingAvg: game.ratingAvg,
      ratingCount: game.ratingCount,
      developerName: game.developer.displayName,
      name: t?.name ?? game.slug,
      shortIntro: t?.shortIntro ?? '',
      controlsHtml: t?.controlsHtml ?? '',
      activeVersion: version
        ? { semver: version.semver, path: `${version.bundlePath}/${version.entryHtml}` }
        : null,
      isFavorite: !!favorite,
      myRating: rating?.stars ?? null,
    };
  }

  async suggestions(slug: string, locale: string) {
    const game = await this.prisma.game.findUnique({ where: { slug } });
    if (!game) throw new NotFoundException('Game not found');
    // MVP heuristic: same category first, then most-played overall
    const sameCategory = await this.prisma.game.findMany({
      where: { status: 'PUBLISHED', id: { not: game.id }, category: game.category },
      include: { translations: true },
      orderBy: { playCount: 'desc' },
      take: 6,
    });
    if (sameCategory.length < 6) {
      const filler = await this.prisma.game.findMany({
        where: {
          status: 'PUBLISHED',
          id: { notIn: [game.id, ...sameCategory.map((g) => g.id)] },
        },
        include: { translations: true },
        orderBy: { playCount: 'desc' },
        take: 6 - sameCategory.length,
      });
      sameCategory.push(...filler);
    }
    return sameCategory.map((g) => toGameCard(g, locale));
  }

  async categories() {
    const rows = await this.prisma.game.groupBy({
      by: ['category'],
      where: { status: 'PUBLISHED' },
      _count: { _all: true },
    });
    return rows.map((r) => ({ category: r.category, count: r._count._all }));
  }
}
