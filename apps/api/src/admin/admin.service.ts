import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommentStatus, GameStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  listGames(status?: GameStatus) {
    return this.prisma.game.findMany({
      where: status
        ? { status }
        : {
            OR: [
              { status: { in: ['SUBMITTED', 'IN_REVIEW'] } },
              // Published games whose developer uploaded a new version
              { status: 'PUBLISHED', updateSubmittedAt: { not: null } },
            ],
          },
      include: {
        translations: true,
        versions: { orderBy: { uploadedAt: 'desc' } },
        developer: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async gameDetail(id: string) {
    const game = await this.prisma.game.findUnique({
      where: { id },
      include: {
        translations: true,
        versions: { orderBy: { uploadedAt: 'desc' } },
        developer: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!game) throw new NotFoundException('Game not found');
    return game;
  }

  /** Publishes the game and activates its most recent bundle. */
  async approve(id: string) {
    const game = await this.gameDetail(id);
    const latest = game.versions[0];
    if (!latest) throw new BadRequestException('Game has no uploaded version');
    await this.prisma.$transaction([
      this.prisma.gameVersion.updateMany({
        where: { gameId: id },
        data: { isActive: false },
      }),
      this.prisma.gameVersion.update({
        where: { id: latest.id },
        data: { isActive: true },
      }),
      this.prisma.game.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          releaseDate: game.releaseDate ?? new Date(),
          rejectReason: null,
          updateSubmittedAt: null,
        },
      }),
    ]);
    return this.gameDetail(id);
  }

  async reject(id: string, reason: string) {
    const game = await this.gameDetail(id);
    if (game.status === 'PUBLISHED') {
      // Rejecting a version update: the game stays live on its active bundle
      return this.prisma.game.update({
        where: { id },
        data: { updateSubmittedAt: null, rejectReason: reason },
      });
    }
    return this.prisma.game.update({
      where: { id },
      data: { status: 'REJECTED', rejectReason: reason },
    });
  }

  async delist(id: string) {
    await this.gameDetail(id);
    return this.prisma.game.update({
      where: { id },
      data: { status: 'DELISTED' },
    });
  }

  async feature(id: string, rank: number | null) {
    await this.gameDetail(id);
    return this.prisma.game.update({
      where: { id },
      data: { featuredRank: rank },
    });
  }

  async activateVersion(gameId: string, versionId: string) {
    const version = await this.prisma.gameVersion.findUnique({
      where: { id: versionId },
    });
    if (!version || version.gameId !== gameId) {
      throw new NotFoundException('Version not found');
    }
    await this.prisma.$transaction([
      this.prisma.gameVersion.updateMany({
        where: { gameId },
        data: { isActive: false },
      }),
      this.prisma.gameVersion.update({
        where: { id: versionId },
        data: { isActive: true },
      }),
    ]);
    return { ok: true };
  }

  listUsers(q?: string) {
    return this.prisma.user.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {},
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async setRole(userId: string, role: Role) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, displayName: true, role: true },
    });
  }

  async deleteScore(scoreId: string) {
    await this.prisma.score.delete({ where: { id: scoreId } });
    return { ok: true };
  }

  async setCommentStatus(commentId: string, status: CommentStatus) {
    return this.prisma.comment.update({
      where: { id: commentId },
      data: { status },
    });
  }
}
