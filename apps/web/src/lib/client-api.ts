'use client';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export const GAMES_BASE_URL =
  process.env.NEXT_PUBLIC_GAMES_BASE_URL ?? 'http://localhost:4000/g';

const GUEST_KEY = 'gamehub_guest';
const AUTH_RENEWED_KEY = 'gamehub_auth_renewed_at';
const ACTIVE_RENEW_INTERVAL_MS = 15 * 60 * 1000;
const NO_AUTO_REFRESH = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/change-password',
  '/auth/guest',
]);

type RenewalResult = 'renewed' | 'signed-out' | 'unavailable';
let refreshPromise: Promise<RenewalResult> | null = null;
let lastRenewalAttempt = 0;

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

export function isUnauthenticatedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

function requestHeaders(init?: RequestInit, includeGuest = true): Headers {
  const headers = new Headers(init?.headers);
  if (typeof init?.body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const guest = includeGuest ? getGuest() : null;
  if (guest && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${guest.guestToken}`);
  }
  return headers;
}

function fetchApi(
  path: string,
  init?: RequestInit,
  includeGuest = true,
): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: requestHeaders(init, includeGuest),
    credentials: 'include',
  });
}

async function performRefresh(): Promise<RenewalResult> {
  try {
    const res = await fetchApi(
      '/auth/refresh',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      false,
    );
    if (res.ok) {
      try {
        window.localStorage.setItem(AUTH_RENEWED_KEY, String(Date.now()));
      } catch {
        /* cookies still renewed when localStorage is unavailable */
      }
      return 'renewed';
    }
    return res.status === 400 || res.status === 401
      ? 'signed-out'
      : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/**
 * Rotates the HttpOnly refresh cookie. A Web Lock serializes rotations across
 * tabs; refreshPromise provides the same guarantee within the current tab.
 */
export function renewSession(): Promise<RenewalResult> {
  if (refreshPromise) return refreshPromise;

  const refresh = async () => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request('gamehub-auth-refresh', performRefresh);
    }
    return performRefresh();
  };

  refreshPromise = refresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/** Renews an active session on page open/focus without rotating excessively. */
export async function renewSessionIfStale(): Promise<void> {
  let lastRenewed = 0;
  try {
    lastRenewed = Number(window.localStorage.getItem(AUTH_RENEWED_KEY)) || 0;
  } catch {
    /* localStorage may be disabled; refreshing remains safe */
  }
  const now = Date.now();
  if (
    now - Math.max(lastRenewed, lastRenewalAttempt) <
    ACTIVE_RENEW_INTERVAL_MS
  ) {
    return;
  }
  lastRenewalAttempt = now;
  await renewSession();
}

async function toApiError(res: Response): Promise<ApiError> {
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
  return new ApiError(res.status, message);
}

/**
 * Browser fetch: sends auth cookies and retries once after renewing an expired
 * access token. Guest bearer tokens remain separate from account credentials.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await fetchApi(path, init);

  if (res.status === 401 && !NO_AUTO_REFRESH.has(path)) {
    const renewal = await renewSession();
    if (renewal === 'renewed') {
      res = await fetchApi(path, init);
    } else if (renewal === 'unavailable') {
      throw new ApiError(503, 'Unable to renew the session right now');
    }
  }

  if (!res.ok) throw await toApiError(res);
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
