import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { sha256 } from '../auth/tokens.service';
import { Principal } from '../common/types';

const LEADERBOARD_SCAN = 300;

@Injectable()
export class PlayService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Starts a play session and returns a single-use session token.
   * The token — not the client's word — is what authorizes a later score submit.
   */
  async startSession(gameId: string, principal: Principal) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException('Game not found');
    const isPrivileged =
      principal.role === 'ADMIN' ||
      principal.role === 'MODERATOR' ||
      (principal.userId && principal.userId === game.developerId);
    if (game.status !== 'PUBLISHED' && !isPrivileged) {
      throw new ForbiddenException('Game is not published');
    }

    const raw = randomBytes(32).toString('hex');
    const session = await this.prisma.playSession.create({
      data: {
        gameId,
        userId: principal.userId,
        guestId: principal.guestId,
        tokenHash: sha256(raw),
      },
    });
    if (game.status === 'PUBLISHED') {
      await this.prisma.game.update({
        where: { id: gameId },
        data: { playCount: { increment: 1 } },
      });
    }
    return { sessionId: session.id, sessionToken: raw };
  }

  async submitScore(
    sessionId: string,
    sessionToken: string | undefined,
    body: { score: number; durationMs: number; name?: string },
    principal: Principal,
  ) {
    if (!sessionToken) throw new UnauthorizedException('Missing session token');
    const session = await this.prisma.playSession.findUnique({
      where: { id: sessionId },
      include: { game: true, user: true, guest: true, score: true },
    });
    if (!session || session.tokenHash !== sha256(sessionToken)) {
      throw new UnauthorizedException('Invalid session');
    }
    if (session.score || session.endedAt) {
      throw new BadRequestException('Session already finished');
    }

    // Anti-cheat sanity checks (MVP tier — leaderboards stay admin-moderatable)
    const { game } = session;
    if (!Number.isInteger(body.score) || body.score < 0) {
      throw new BadRequestException('Invalid score');
    }
    if (game.maxScore != null && body.score > game.maxScore) {
      throw new BadRequestException('Score exceeds game ceiling');
    }
    if (body.durationMs < game.minDurationMs) {
      throw new BadRequestException('Match too short');
    }
    const elapsed = Date.now() - session.startedAt.getTime();
    if (body.durationMs > elapsed + 30_000) {
      throw new BadRequestException('Reported duration exceeds session age');
    }

    const nameSnapshot =
      session.user?.displayName ??
      session.guest?.displayName ??
      (body.name?.trim().slice(0, 40) || 'Anonymous');

    const score = await this.prisma.score.create({
      data: {
        gameId: game.id,
        userId: session.userId,
        guestId: session.guestId,
        nameSnapshot,
        score: body.score,
        durationMs: Math.floor(body.durationMs),
        sessionId: session.id,
      },
    });
    await this.prisma.playSession.update({
      where: { id: session.id },
      data: { endedAt: new Date() },
    });

    const better = await this.prisma.score.count({
      where: {
        gameId: game.id,
        score:
          game.scoreOrder === 'ASC'
            ? { lt: body.score }
            : { gt: body.score },
      },
    });
    const personalBest = await this.personalBest(game.id, game.scoreOrder, principal);
    return {
      scoreId: score.id,
      score: score.score,
      name: nameSnapshot,
      rank: better + 1,
      personalBest,
    };
  }

  private async personalBest(
    gameId: string,
    order: 'ASC' | 'DESC',
    principal: Principal,
  ) {
    if (!principal.userId && !principal.guestId) return null;
    const best = await this.prisma.score.findFirst({
      where: {
        gameId,
        ...(principal.userId
          ? { userId: principal.userId }
          : { guestId: principal.guestId }),
      },
      orderBy: { score: order === 'ASC' ? 'asc' : 'desc' },
    });
    return best?.score ?? null;
  }

  async leaderboard(
    gameId: string,
    period: 'all' | 'weekly' | 'daily',
    principal: Principal,
    limit = 20,
  ) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException('Game not found');
    const since =
      period === 'daily'
        ? new Date(Date.now() - 24 * 60 * 60 * 1000)
        : period === 'weekly'
          ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          : undefined;

    const rows = await this.prisma.score.findMany({
      where: { gameId, ...(since ? { createdAt: { gte: since } } : {}) },
      orderBy: [
        { score: game.scoreOrder === 'ASC' ? 'asc' : 'desc' },
        { createdAt: 'asc' },
      ],
      take: LEADERBOARD_SCAN,
    });

    // Best entry per player (users and guests dedupe on their id; true anonymous rows stand alone)
    const seen = new Set<string>();
    const entries: {
      rank: number;
      name: string;
      score: number;
      isMe: boolean;
      createdAt: Date;
    }[] = [];
    let myEntry: (typeof entries)[number] | null = null;
    for (const row of rows) {
      const key = row.userId
        ? `u:${row.userId}`
        : row.guestId
          ? `g:${row.guestId}`
          : `s:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isMe =
        (!!principal.userId && row.userId === principal.userId) ||
        (!!principal.guestId && row.guestId === principal.guestId);
      const entry = {
        rank: entries.length + 1,
        name: row.nameSnapshot,
        score: row.score,
        isMe,
        createdAt: row.createdAt,
      };
      entries.push(entry);
      if (isMe && !myEntry) myEntry = entry;
    }
    return {
      period,
      scoreOrder: game.scoreOrder,
      entries: entries.slice(0, limit),
      // Pinned "your rank" row when the caller is outside the top N
      me: myEntry && myEntry.rank > limit ? myEntry : null,
    };
  }
}
