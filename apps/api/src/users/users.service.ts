import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { pickTranslation, toGameCard } from '../games/games.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        locale: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    // Surface the applicant's latest developer-role application so the client
    // can render the right "Become a developer" state without a second call.
    const devRequest = await this.prisma.developerRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        message: true,
        reviewReason: true,
        createdAt: true,
        reviewedAt: true,
      },
    });
    return { ...user, developerRequest: devRequest };
  }

  /** A PLAYER applies for the DEVELOPER role. */
  async requestDeveloper(userId: string, message?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'PLAYER') {
      throw new BadRequestException('You already have developer access');
    }
    const pending = await this.prisma.developerRequest.findFirst({
      where: { userId, status: 'PENDING' },
    });
    if (pending) {
      throw new ConflictException('You already have a pending request');
    }
    return this.prisma.developerRequest.create({
      data: { userId, message: message?.trim() || null },
      select: { status: true, message: true, createdAt: true },
    });
  }

  async bestScores(userId: string, locale: string) {
    const grouped = await this.prisma.score.groupBy({
      by: ['gameId'],
      where: { userId },
      _max: { score: true },
      _count: { _all: true },
    });
    const games = await this.prisma.game.findMany({
      where: { id: { in: grouped.map((g) => g.gameId) } },
      include: { translations: true },
    });
    const byId = new Map(games.map((g) => [g.id, g]));
    return grouped
      .map((g) => {
        const game = byId.get(g.gameId);
        if (!game) return null;
        const t = pickTranslation(game.translations, locale);
        return {
          gameId: g.gameId,
          slug: game.slug,
          gameName: t?.name ?? game.slug,
          bestScore: g._max.score,
          plays: g._count._all,
        };
      })
      .filter(Boolean);
  }

  async history(userId: string, locale: string) {
    const sessions = await this.prisma.playSession.findMany({
      where: { userId },
      include: {
        game: { include: { translations: true } },
        score: true,
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return sessions.map((s) => {
      const t = pickTranslation(s.game.translations, locale);
      return {
        sessionId: s.id,
        slug: s.game.slug,
        gameName: t?.name ?? s.game.slug,
        startedAt: s.startedAt,
        score: s.score?.score ?? null,
      };
    });
  }

  async favorites(userId: string, locale: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      include: { game: { include: { translations: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return favorites
      .filter((f) => f.game.status === 'PUBLISHED')
      .map((f) => toGameCard(f.game, locale));
  }
}
