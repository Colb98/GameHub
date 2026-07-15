import 'fastify';
import { Role } from '@prisma/client';

/** Resolved identity of the caller: a logged-in user, a named guest, or nobody. */
export interface Principal {
  userId?: string;
  guestId?: string;
  role?: Role;
  displayName?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}
