import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from './tokens.service';

export interface AuthResult {
  user: {
    id: string;
    email: string | null;
    displayName: string;
    role: string;
    avatarUrl: string | null;
  };
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  private async toAuthResult(user: User): Promise<AuthResult> {
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      accessToken: this.tokens.signAccessToken(user),
      refreshToken: await this.tokens.issueRefreshToken(user.id),
    };
  }

  async register(
    email: string,
    password: string,
    displayName: string,
  ): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await argon2.hash(password),
        displayName,
      },
    });
    return this.toAuthResult(user);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.toAuthResult(user);
  }

  async createGuest(name: string) {
    const guest = await this.prisma.guest.create({
      data: { displayName: name },
    });
    return {
      guestId: guest.id,
      name: guest.displayName,
      guestToken: this.tokens.signGuestToken(guest.id, guest.displayName),
    };
  }

  /** Moves a guest's sessions/scores into the logged-in user's account. */
  async claimGuest(userId: string, guestToken: string) {
    const payload = this.tokens.verifyGuestToken(guestToken);
    const [scores] = await this.prisma.$transaction([
      this.prisma.score.updateMany({
        where: { guestId: payload.sub },
        data: { guestId: null, userId },
      }),
      this.prisma.playSession.updateMany({
        where: { guestId: payload.sub },
        data: { guestId: null, userId },
      }),
    ]);
    return { claimedScores: scores.count };
  }

  /** Find-or-create a user from a verified social identity. */
  async upsertSocialUser(
    provider: 'GOOGLE' | 'FACEBOOK',
    providerUid: string,
    profile: { email?: string; name: string; avatarUrl?: string },
  ): Promise<AuthResult> {
    const identity = await this.prisma.identity.findUnique({
      where: { provider_providerUid: { provider, providerUid } },
      include: { user: true },
    });
    if (identity) return this.toAuthResult(identity.user);

    // Link to an existing account with the same verified email, else create one
    let user =
      profile.email != null
        ? await this.prisma.user.findUnique({ where: { email: profile.email } })
        : null;
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          displayName: profile.name,
          avatarUrl: profile.avatarUrl,
        },
      });
    }
    await this.prisma.identity.create({
      data: { userId: user.id, provider, providerUid },
    });
    return this.toAuthResult(user);
  }
}
