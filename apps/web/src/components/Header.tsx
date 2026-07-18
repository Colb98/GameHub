'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { api, getGuest } from '@/lib/client-api';
import { UserProfile } from '@/lib/types';
import { DesktopSearch } from './Search';
import { ThemeToggle } from './ThemeToggle';

/** Top bar: desktop = logo + search + lang/theme + identity;
 *  mobile = logo + search icon + theme + avatar. */
export function Header({ onOpenSearch }: { onOpenSearch: () => void }) {
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
  const avatarLetter = (user?.displayName ?? guestName ?? '?')[0]?.toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b-[1.5px] border-line bg-surface">
      {/* Desktop topbar */}
      <div className="hidden items-center gap-4 px-6 py-3.5 lg:flex">
        <Link
          href="/"
          className="font-display text-xl font-bold tracking-tight text-ink"
        >
          Game<span className="text-accent">Hub</span>
        </Link>
        <DesktopSearch />
        <div className="ml-auto flex items-center gap-3 text-sm">
          {rank >= 1 && (
            <Link
              href="/studio"
              className="text-[13px] font-semibold text-muted hover:text-ink"
            >
              {t('studio')}
            </Link>
          )}
          {rank >= 2 && (
            <Link
              href="/admin"
              className="text-[13px] font-semibold text-muted hover:text-ink"
            >
              {t('admin')}
            </Link>
          )}
          <Link
            href={pathname}
            locale={otherLocale}
            className="rounded-full border-[1.5px] border-line px-2.5 py-1 text-xs font-bold text-muted uppercase hover:bg-chip"
          >
            {otherLocale}
          </Link>
          <ThemeToggle />
          {user ? (
            <>
              <Link
                href="/profile"
                className="rounded-full bg-chip px-3.5 py-1.5 text-xs font-bold text-ink hover:brightness-95"
              >
                {user.displayName}
              </Link>
              <button
                onClick={logout}
                className="cursor-pointer text-xs text-muted hover:text-ink"
              >
                {t('logout')}
              </button>
            </>
          ) : (
            <>
              {guestName && (
                <span className="rounded-full bg-chip px-3.5 py-1.5 text-xs font-bold text-muted">
                  {guestName}
                </span>
              )}
              <Link href="/login" className="text-[13px] font-semibold text-ink">
                {t('login')}
              </Link>
              <Link href="/register" className="btn !px-4 !py-1.5 text-xs">
                {t('register')}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile topbar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 lg:hidden">
        <Link href="/" className="font-display text-base font-bold text-ink">
          Game<span className="text-accent">Hub</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenSearch}
            aria-label={t('search')}
            className="flex h-9 w-9 cursor-pointer items-center justify-center text-xl text-ink"
          >
            ⌕
          </button>
          <ThemeToggle />
          <Link
            href={user ? '/profile' : '/login'}
            aria-label={t('profile')}
            className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-line bg-chip text-xs font-bold text-ink"
          >
            {avatarLetter}
          </Link>
        </div>
      </div>
    </header>
  );
}
