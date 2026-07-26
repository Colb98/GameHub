import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { TokensService } from './tokens.service';

/**
 * Global guard that never rejects: it resolves the caller's identity
 * (user JWT from cookie/bearer, or guest JWT from bearer) onto req.principal.
 * Endpoint-level guards (RequireUserGuard, RolesGuard) enforce requirements.
 */
@Injectable()
export class PrincipalGuard implements CanActivate {
  constructor(private readonly tokens: TokensService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const cookie = (req.cookies as Record<string, string> | undefined)?.[
      'access_token'
    ];
    // Cookie (logged-in user) wins over a leftover guest bearer token
    const fromCookie = await this.tokens.resolvePrincipal(cookie);
    req.principal =
      fromCookie.userId || fromCookie.guestId
        ? fromCookie
        : await this.tokens.resolvePrincipal(bearer);
    return true;
  }
}
