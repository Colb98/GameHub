'use client';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export const GAMES_BASE_URL =
  process.env.NEXT_PUBLIC_GAMES_BASE_URL ?? 'http://localhost:4000/g';

const GUEST_KEY = 'gamehub_guest';

export interface GuestIdentity {
  guestId: string;
  name: string;
  guestToken: string;
}

export function getGuest(): GuestIdentity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    return raw ? (JSON.parse(raw) as GuestIdentity) : null;
  } catch {
    return null;
  }
}

export function saveGuest(guest: GuestIdentity) {
  window.localStorage.setItem(GUEST_KEY, JSON.stringify(guest));
}

export function clearGuest() {
  window.localStorage.removeItem(GUEST_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Browser fetch: sends auth cookies, and — for visitors without an account —
 * the guest bearer token, so leaderboards can highlight "you" either way.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const guest = getGuest();
  const headers: Record<string, string> = {
    // FormData bodies set their own multipart boundary — only tag JSON strings
    ...(typeof init?.body === 'string' ? { 'content-type': 'application/json' } : {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (guest && !headers['authorization']) {
    headers['authorization'] = `Bearer ${guest.guestToken}`;
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) {
        message = Array.isArray(body.message)
          ? body.message.join(', ')
          : String(body.message);
      }
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

/** Registers a guest identity with the API and stores it locally. */
export async function ensureGuest(name: string): Promise<GuestIdentity> {
  const existing = getGuest();
  if (existing) return existing;
  const created = await api<GuestIdentity>('/auth/guest', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  saveGuest(created);
  return created;
}

/** After login/signup, migrate any local guest scores into the account. */
export async function claimGuestIfAny(): Promise<void> {
  const guest = getGuest();
  if (!guest) return;
  try {
    // The user's auth cookie outranks the guest bearer on the API side
    await api('/auth/claim-guest', {
      method: 'POST',
      body: JSON.stringify({ guestToken: guest.guestToken }),
    });
    clearGuest();
  } catch {
    // Non-fatal: the guest scores just stay unclaimed
  }
}
