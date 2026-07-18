'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { api, getGuest } from '@/lib/client-api';
import { UserProfile } from '@/lib/types';

export function Header() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);

  // Re-check auth on every client navigation. The header lives in the
  // persistent layout, so after a client-side login redirect (router.push)
  // it would otherwise keep its logged-out state until a full page reload.
  useEffect(() => {
    let active = true;
    api<UserProfile>('/me')
      .then((u) => {
        if (!active) return;
        setUser(u);
        setGuestName(null);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setGuestName(getGuest()?.name ?? null);
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  async function logout() {
    await api('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    setUser(null);
    router.refresh();
  }

  const otherLocale = locale === 'en' ? 'vi' : 'en';
  const roleRank = { PLAYER: 0, DEVELOPER: 1, MODERATOR: 2, ADMIN: 3 } as const;
  const rank = user ? roleRank[user.role] : -1;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="text-lg font-black tracking-tight">
          <span className="text-indigo-400">Game</span>Hub
        </Link>
        <nav className="flex items-center gap-3 text-sm text-slate-300">
          <Link href="/" className="hover:text-white">
            {t('home')}
          </Link>
          {rank >= 1 && (
            <Link href="/studio" className="hover:text-white">
              {t('studio')}
            </Link>
          )}
          {rank >= 2 && (
            <Link href="/admin" className="hover:text-white">
              {t('admin')}
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <Link
            href={pathname}
            locale={otherLocale}
            className="rounded border border-slate-700 px-2 py-1 text-xs uppercase text-slate-300 hover:bg-slate-800"
          >
            {otherLocale}
          </Link>
          {user ? (
            <>
              <Link href="/profile" className="font-semibold text-indigo-300 hover:text-indigo-200">
                {user.displayName}
              </Link>
              <button onClick={logout} className="text-slate-400 hover:text-white">
                {t('logout')}
              </button>
            </>
          ) : (
            <>
              {guestName && (
                <span className="hidden text-slate-400 sm:inline">👤 {guestName}</span>
              )}
              <Link href="/login" className="text-slate-300 hover:text-white">
                {t('login')}
              </Link>
              <Link href="/register" className="btn !py-1.5">
                {t('register')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
