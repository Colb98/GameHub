'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { api } from '@/lib/client-api';
import type { CategoryCount, GameCard } from '@/lib/types';

const RECENT_KEY = 'gamehub_recent_searches';
const MAX_RECENT = 5;

function getRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(list) ? list.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function pushRecent(q: string) {
  try {
    const list = [q, ...getRecent().filter((r) => r !== q)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private mode */
  }
}

interface Suggestion {
  label: string;
  sub: string;
  href: string;
}

/** Debounced suggestions: matching games plus matching categories. */
function useSuggestions(query: string) {
  const locale = useLocale();
  const [games, setGames] = useState<GameCard[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(getRecent());
    api<CategoryCount[]>('/games/categories')
      .then((rows) => setCategories(rows.map((r) => r.category)))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setGames([]);
      return;
    }
    const t = setTimeout(() => {
      api<GameCard[]>(
        `/games?q=${encodeURIComponent(q)}&locale=${locale}&take=6`,
      )
        .then(setGames)
        .catch(() => setGames([]));
    }, 180);
    return () => clearTimeout(t);
  }, [query, locale]);

  const q = query.trim().toLowerCase();
  const suggestions: Suggestion[] = [
    ...games.map((g) => ({
      label: g.name,
      sub: g.category,
      href: `/games/${g.slug}`,
    })),
    ...categories
      .filter((c) => q && c.toLowerCase().includes(q))
      .slice(0, 3)
      .map((c) => ({
        label: c,
        sub: '',
        href: `/browse?category=${encodeURIComponent(c)}`,
      })),
  ];

  return { suggestions, recent, hasQuery: q.length > 0 };
}

/** Desktop header search with the prototype's suggestion dropdown. */
export function DesktopSearch() {
  const t = useTranslations('search');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const { suggestions, recent, hasQuery } = useSuggestions(query);
  const boxRef = useRef<HTMLDivElement | null>(null);

  function submit(q: string) {
    const val = q.trim();
    if (!val) return;
    pushRecent(val);
    setFocused(false);
    setQuery('');
    router.push(`/browse?q=${encodeURIComponent(val)}`);
  }

  function go(href: string) {
    if (query.trim()) pushRecent(query.trim());
    setFocused(false);
    setQuery('');
    router.push(href);
  }

  const open = focused && (hasQuery || recent.length > 0);

  return (
    <div ref={boxRef} className="relative max-w-[420px] flex-1">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => e.key === 'Enter' && submit(query)}
        placeholder={t('placeholder')}
        className="w-full rounded-full border-[1.5px] border-line bg-surface-2 px-4 py-2 text-[13px] text-ink outline-none placeholder:text-muted focus:border-accent"
      />
      {open && (
        <div className="absolute top-[calc(100%+6px)] right-0 left-0 z-50 rounded-xl border-[1.5px] border-line bg-surface p-2.5 text-[13px] shadow-[0_12px_28px_rgba(0,0,0,.1)]">
          {hasQuery && suggestions.length > 0 && (
            <>
              <div className="mb-1 text-[10px] font-semibold text-muted uppercase">
                {t('gamesAndCategories')}
              </div>
              {suggestions.map((s) => (
                <button
                  key={s.href}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(s.href)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-md px-1.5 py-[7px] text-left hover:bg-chip"
                >
                  <span className="text-ink">{s.label}</span>
                  <span className="text-muted">{s.sub}</span>
                </button>
              ))}
            </>
          )}
          {hasQuery && suggestions.length === 0 && (
            <div className="px-1.5 py-1.5 text-muted">{t('noMatches')}</div>
          )}
          {recent.length > 0 && (
            <>
              <div className="mt-1.5 mb-1 text-[10px] font-semibold text-muted uppercase">
                {t('recent')}
              </div>
              {recent.map((r) => (
                <button
                  key={r}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => submit(r)}
                  className="block w-full cursor-pointer rounded-md px-1.5 py-[7px] text-left text-ink hover:bg-chip"
                >
                  {r}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Full-screen mobile search overlay (prototype mobileSearchOpen). */
export function MobileSearchOverlay({ onClose }: { onClose: () => void }) {
  const t = useTranslations('search');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { suggestions, recent, hasQuery } = useSuggestions(query);

  function submit(q: string) {
    const val = q.trim();
    if (!val) return;
    pushRecent(val);
    onClose();
    router.push(`/browse?q=${encodeURIComponent(val)}`);
  }

  function go(href: string) {
    if (query.trim()) pushRecent(query.trim());
    onClose();
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-surface p-3.5 pt-4">
      <div className="mb-3.5 flex items-center gap-2.5">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit(query)}
          placeholder={t('placeholder')}
          className="flex-1 rounded-full border-[1.5px] border-line bg-surface-2 px-3.5 py-2 text-[13px] text-ink outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          onClick={onClose}
          className="cursor-pointer text-[13px] font-semibold text-ink"
        >
          {t('cancel')}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {hasQuery && suggestions.length > 0 && (
          <>
            <div className="mb-1 text-[10px] font-semibold text-muted uppercase">
              {t('gamesAndCategories')}
            </div>
            {suggestions.map((s) => (
              <button
                key={s.href}
                onClick={() => go(s.href)}
                className="flex w-full cursor-pointer items-center justify-between border-b border-line-soft px-1 py-[9px] text-left text-[13px]"
              >
                <span className="text-ink">{s.label}</span>
                <span className="text-muted">{s.sub}</span>
              </button>
            ))}
          </>
        )}
        {hasQuery && suggestions.length === 0 && (
          <div className="px-2 py-2 text-[13px] text-muted">{t('noMatches')}</div>
        )}
        {recent.length > 0 && (
          <>
            <div className="mt-2 mb-1 text-[10px] font-semibold text-muted uppercase">
              {t('recent')}
            </div>
            {recent.map((r) => (
              <button
                key={r}
                onClick={() => submit(r)}
                className="block w-full cursor-pointer px-1 py-[9px] text-left text-[13px] text-ink"
              >
                {r}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
