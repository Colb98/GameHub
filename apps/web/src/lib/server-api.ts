import { cookies } from 'next/headers';

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000/api/v1';

/** Server-component fetch that forwards the visitor's cookies to the API. */
export async function apiGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}
