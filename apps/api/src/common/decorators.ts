import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { FastifyRequest } from 'fastify';
import { Principal } from './types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const SKIP_PRINCIPAL_KEY = 'skipPrincipal';
export const SkipPrincipal = () => SetMetadata(SKIP_PRINCIPAL_KEY, true);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    return req.principal ?? {};
  },
);
