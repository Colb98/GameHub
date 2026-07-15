import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentPrincipal } from '../common/decorators';
import { RequireUserGuard } from '../common/guards';
import { Principal } from '../common/types';
import { AuthResult, AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { TokensService } from './tokens.service';
import { ClaimGuestDto, GuestDto, LoginDto, RefreshDto, RegisterDto } from './dto';

const STATE_COOKIE = 'oauth_state';

@Controller('auth')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
    private readonly tokens: TokensService,
  ) {}

  private respondWithAuth(reply: FastifyReply, result: AuthResult) {
    this.tokens.setAuthCookies(reply, result.accessToken, result.refreshToken);
    return result;
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.auth.register(dto.email, dto.password, dto.displayName);
    return this.respondWithAuth(reply, result);
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.auth.login(dto.email, dto.password);
    return this.respondWithAuth(reply, result);
  }

  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const raw =
      dto.refreshToken ??
      (req.cookies as Record<string, string> | undefined)?.['refresh_token'];
    if (!raw) throw new BadRequestException('Missing refresh token');
    const { user, accessToken, refreshToken } =
      await this.tokens.rotateRefreshToken(raw);
    this.tokens.setAuthCookies(reply, accessToken, refreshToken);
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      accessToken,
      refreshToken,
    };
  }

  @Post('logout')
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const raw = (req.cookies as Record<string, string> | undefined)?.[
      'refresh_token'
    ];
    if (raw) await this.tokens.revokeRefreshToken(raw);
    this.tokens.clearAuthCookies(reply);
    return { ok: true };
  }

  /** Guest play: just a display name, no account. Token goes to localStorage client-side. */
  @Post('guest')
  guest(@Body() dto: GuestDto) {
    return this.auth.createGuest(dto.name);
  }

  /** After signing up, a former guest can claim their old scores. */
  @Post('claim-guest')
  @UseGuards(RequireUserGuard)
  claimGuest(@CurrentPrincipal() p: Principal, @Body() dto: ClaimGuestDto) {
    return this.auth.claimGuest(p.userId!, dto.guestToken);
  }

  // ---- Social login ----

  @Get('google')
  google(@Res() reply: FastifyReply) {
    const state = this.oauth.newState();
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
    reply.redirect(this.oauth.googleAuthUrl(state), 302);
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    this.checkState(req, state);
    const result = await this.oauth.handleGoogleCallback(code);
    this.finishSocialLogin(reply, result);
  }

  @Get('facebook')
  facebook(@Res() reply: FastifyReply) {
    const state = this.oauth.newState();
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
    reply.redirect(this.oauth.facebookAuthUrl(state), 302);
  }

  @Get('facebook/callback')
  async facebookCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    this.checkState(req, state);
    const result = await this.oauth.handleFacebookCallback(code);
    this.finishSocialLogin(reply, result);
  }

  private checkState(req: FastifyRequest, state: string) {
    const cookieState = (req.cookies as Record<string, string> | undefined)?.[
      STATE_COOKIE
    ];
    if (!state || state !== cookieState) {
      throw new BadRequestException('OAuth state mismatch');
    }
  }

  private finishSocialLogin(reply: FastifyReply, result: AuthResult) {
    this.tokens.setAuthCookies(reply, result.accessToken, result.refreshToken);
    reply.clearCookie(STATE_COOKIE, { path: '/' });
    const web = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
    reply.redirect(`${web}/?login=success`, 302);
  }
}
