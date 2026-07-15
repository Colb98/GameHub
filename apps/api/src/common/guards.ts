import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { FastifyRequest } from 'fastify';
import { ROLES_KEY } from './decorators';

/** Requires a logged-in user (guests and anonymous callers are rejected). */
@Injectable()
export class RequireUserGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!req.principal?.userId) {
      throw new UnauthorizedException('Login required');
    }
    return true;
  }
}

const ROLE_RANK: Record<Role, number> = {
  PLAYER: 0,
  DEVELOPER: 1,
  MODERATOR: 2,
  ADMIN: 3,
};

/** Requires one of the roles set via @Roles(...). Higher roles satisfy lower requirements. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const role = req.principal?.role;
    if (!req.principal?.userId || !role) {
      throw new UnauthorizedException('Login required');
    }
    const rank = ROLE_RANK[role];
    if (!roles.some((r) => rank >= ROLE_RANK[r])) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
