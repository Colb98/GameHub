'use client';

import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '@/i18n/routing';
import { Header } from './Header';
import { MobileSearchOverlay } from './Search';

/** Nav destinations shared by the desktop rail and the mobile tab bar. */
function useNavActive() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fav = searchParams.get('fav') === '1';
  return {
    home: pathname === '/',
    browse: pathname === '/browse' && !fav,
    favorites: pathname === '/browse' && fav,
    profile: pathname === '/profile' || pathname === '/login',
  };
}

function RailItem({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-0.5 text-[10px] font-bold transition ${
        active ? 'text-accent' : 'text-muted hover:text-ink'
      }`}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

const NAV_INACTIVE = {
  home: false,
  browse: false,
  favorites: false,
  profile: false,
};

type NavActive = typeof NAV_INACTIVE;

function DesktopRailItems({ active }: { active: NavActive }) {
  const t = useTranslations('nav');
  return (
    <>
      <RailItem href="/" icon="⌂" label={t('home')} active={active.home} />
      <RailItem
        href="/browse"
        icon="▤"
        label={t('browse')}
        active={active.browse}
      />
      <RailItem
        href="/browse?fav=1"
        icon="♡"
        label={t('favorites')}
        active={active.favorites}
      />
    </>
  );
}

function DesktopRail() {
  const active = useNavActive();
  return <DesktopRailItems active={active} />;
}

function TabItem({
  href,
  icon,
  label,
  active,
  onClick,
}: {
  href?: string;
  icon: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const cls = `flex min-h-[50px] min-w-[56px] cursor-pointer flex-col items-center justify-center gap-0.5 font-bold ${
    active ? 'text-accent' : 'text-muted'
  }`;
  const body = (
    <>
      <span className="text-[21px] leading-none">{icon}</span>
      <span className="text-[10.5px]">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

function BottomTabItems({
  onOpenSearch,
  active,
}: {
  onOpenSearch: () => void;
  active: NavActive;
}) {
  const t = useTranslations('nav');
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t-[1.5px] border-line bg-surface px-0.5 py-1.5 lg:hidden">
      <TabItem href="/" icon="⌂" label={t('home')} active={active.home} />
      <TabItem
        href="/browse"
        icon="▤"
        label={t('browse')}
        active={active.browse}
      />
      <TabItem icon="⌕" label={t('search')} onClick={onOpenSearch} />
      <TabItem
        href="/browse?fav=1"
        icon="♡"
        label={t('favorites')}
        active={active.favorites}
      />
      <TabItem
        href="/profile"
        icon="☻"
        label={t('profile')}
        active={active.profile}
      />
    </nav>
  );
}

function BottomTabs({ onOpenSearch }: { onOpenSearch: () => void }) {
  const active = useNavActive();
  return <BottomTabItems onOpenSearch={onOpenSearch} active={active} />;
}

/** Prototype shell: cream canvas, framed surface with a left icon rail on
 *  desktop; full-bleed surface with a bottom tab bar on mobile. The player
 *  page runs shell-less ("immersive") so nothing competes with the game. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const immersive = /^\/games\/[^/]+\/play$/.test(pathname);

  if (immersive) {
    return (
      <main className="mx-auto w-full max-w-[1180px] px-3 py-4 lg:px-4 lg:py-6">
        {children}
      </main>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[1180px] lg:px-4 lg:py-6">
        <div className="min-h-screen bg-surface lg:flex lg:min-h-[calc(100vh-3rem)] lg:overflow-hidden lg:rounded-2xl lg:border-[1.5px] lg:border-line">
          <aside className="hidden w-[66px] shrink-0 flex-col items-center gap-6 border-r-[1.5px] border-line bg-surface-2 py-6 lg:flex">
            <Suspense fallback={<DesktopRailItems active={NAV_INACTIVE} />}>
              <DesktopRail />
            </Suspense>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <Header onOpenSearch={() => setSearchOpen(true)} />
            <main className="flex-1 p-3.5 pb-24 lg:p-6 lg:pb-8">{children}</main>
          </div>
        </div>
      </div>
      <Suspense
        fallback={
          <BottomTabItems
            onOpenSearch={() => setSearchOpen(true)}
            active={NAV_INACTIVE}
          />
        }
      >
        <BottomTabs onOpenSearch={() => setSearchOpen(true)} />
      </Suspense>
      {searchOpen && <MobileSearchOverlay onClose={() => setSearchOpen(false)} />}
    </>
  );
}
