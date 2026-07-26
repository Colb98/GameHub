import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { FastifyReply } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';
import { Principal } from '../common/types';

const ACCESS_TTL = '30m';
const GUEST_TTL = '365d';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AccessPayload {
  sub: string;
  kind: 'user';
  authVersion: number;
}

export interface GuestPayload {
  sub: string;
  kind: 'guest';
  name: string;
}

export const sha256 = (v: string) =>
  createHash('sha256').update(v).digest('hex');

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private get secret() {
    return process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me';
  }

  private get guestSecret() {
    return process.env.JWT_GUEST_SECRET ?? 'dev-guest-secret-change-me';
  }

  signAccessToken(user: Pick<User, 'id' | 'authVersion'>): string {
    const payload: AccessPayload = {
      sub: user.id,
      kind: 'user',
      authVersion: user.authVersion,
    };
    return this.jwt.sign(payload, { secret: this.secret, expiresIn: ACCESS_TTL });
  }

  signGuestToken(guestId: string, name: string): string {
    const payload: GuestPayload = { sub: guestId, kind: 'guest', name };
    return this.jwt.sign(payload, {
      secret: this.guestSecret,
      expiresIn: GUEST_TTL,
    });
  }

  /** Tries user access token first, then guest token. Returns {} for anonymous/invalid. */
  async resolvePrincipal(rawToken: string | undefined): Promise<Principal> {
    if (!rawToken) return {};
    let accessPayload: AccessPayload | null = null;
    try {
      accessPayload = this.jwt.verify<AccessPayload>(rawToken, {
        secret: this.secret,
      });
    } catch {
      /* fall through to guest */
    }
    if (accessPayload?.kind === 'user') {
      // Keep database failures visible as server errors. Treating them as an
      // anonymous session would make a transient outage look like a logout.
      const user = await this.prisma.user.findUnique({
        where: { id: accessPayload.sub },
        select: {
          id: true,
          authVersion: true,
          role: true,
          displayName: true,
        },
      });
      if (!user || user.authVersion !== accessPayload.authVersion) return {};
      return {
        userId: user.id,
        role: user.role,
        displayName: user.displayName,
      };
    }
    try {
      const p = this.jwt.verify<GuestPayload>(rawToken, {
        secret: this.guestSecret,
      });
      if (p.kind === 'guest') return { guestId: p.sub, displayName: p.name };
    } catch {
      /* anonymous */
    }
    return {};
  }

  verifyGuestToken(rawToken: string): GuestPayload {
    try {
      const p = this.jwt.verify<GuestPayload>(rawToken, {
        secret: this.guestSecret,
      });
      if (p.kind !== 'guest') throw new Error('not a guest token');
      return p;
    } catch {
      throw new UnauthorizedException('Invalid guest token');
    }
  }

  async issueRefreshToken(
    user: Pick<User, 'id' | 'authVersion'>,
  ): Promise<string> {
    const raw = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(raw),
        authVersion: user.authVersion,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return raw;
  }

  /** Rotates the refresh token: revokes the presented one, returns a fresh pair. */
  async rotateRefreshToken(
    raw: string,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(raw) },
      include: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (record.authVersion !== record.user.authVersion) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const refreshToken = randomBytes(48).toString('hex');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.refreshToken.updateMany({
        where: {
          id: record.id,
          revokedAt: null,
          expiresAt: { gt: now },
          authVersion: record.user.authVersion,
        },
        data: { revokedAt: now },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      await tx.refreshToken.create({
        data: {
          userId: record.userId,
          tokenHash: sha256(refreshToken),
          authVersion: record.user.authVersion,
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        },
      });
    });

    return {
      user: record.user,
      accessToken: this.signAccessToken(record.user),
      refreshToken,
    };
  }

  async revokeRefreshToken(raw: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  setAuthCookies(reply: FastifyReply, access: string, refresh: string) {
    const secure = process.env.COOKIE_SECURE === 'true';
    const base = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };
    reply.setCookie('access_token', access, { ...base, maxAge: 60 * 30 });
    reply.setCookie('refresh_token', refresh, {
      ...base,
      maxAge: REFRESH_TTL_MS / 1000,
    });
  }

  clearAuthCookies(reply: FastifyReply) {
    reply.clearCookie('access_token', { path: '/' });
    reply.clearCookie('refresh_token', { path: '/' });
  }
}
