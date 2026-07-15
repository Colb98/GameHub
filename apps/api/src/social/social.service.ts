import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';
import { PrismaService } from '../prisma/prisma.service';
import { Principal } from '../common/types';

@Injectable()
export class SocialService {
  constructor(private readonly prisma: PrismaService) {}

  async listComments(gameId: string, take = 20, cursor?: string) {
    const comments = await this.prisma.comment.findMany({
      where: { gameId, status: 'VISIBLE' },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = comments.length > take;
    return {
      items: comments.slice(0, take).map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        user: c.user,
      })),
      nextCursor: hasMore ? comments[take - 1].id : null,
    };
  }

  async addComment(gameId: string, userId: string, body: string) {
    // Comments render as plain text on the web; sanitize anyway (defense in depth)
    const clean = sanitizeHtml(body, { allowedTags: [], allowedAttributes: {} })
      .trim()
      .slice(0, 2000);
    if (!clean) throw new ForbiddenException('Empty comment');
    return this.prisma.comment.create({
      data: { gameId, userId, body: clean },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
  }

  async deleteComment(commentId: string, principal: Principal) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    const isModerator =
      principal.role === 'MODERATOR' || principal.role === 'ADMIN';
    if (comment.userId !== principal.userId && !isModerator) {
      throw new ForbiddenException('Not your comment');
    }
    await this.prisma.comment.delete({ where: { id: commentId } });
    return { ok: true };
  }

  async rate(gameId: string, userId: string, stars: number) {
    await this.prisma.rating.upsert({
      where: { gameId_userId: { gameId, userId } },
      create: { gameId, userId, stars },
      update: { stars },
    });
    const agg = await this.prisma.rating.aggregate({
      where: { gameId },
      _avg: { stars: true },
      _count: { _all: true },
    });
    const ratingAvg = agg._avg.stars ?? 0;
    const ratingCount = agg._count._all;
    await this.prisma.game.update({
      where: { id: gameId },
      data: { ratingAvg, ratingCount },
    });
    return { myRating: stars, ratingAvg, ratingCount };
  }

  async setFavorite(gameId: string, userId: string, favorite: boolean) {
    if (favorite) {
      await this.prisma.favorite.upsert({
        where: { userId_gameId: { userId, gameId } },
        create: { userId, gameId },
        update: {},
      });
    } else {
      await this.prisma.favorite.deleteMany({ where: { userId, gameId } });
    }
    return { isFavorite: favorite };
  }
}
