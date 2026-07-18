'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, useRouter } from '@/i18n/routing';
import { api } from '@/lib/client-api';
import type { GameCard as GameCardType } from '@/lib/types';
import { useFavorites } from './FavoritesProvider';
import { GameCard, GameCardSkeleton } from './GameCard';

const PAGE_SIZE = 12;
const SORTS = ['popular', 'newest', 'rating', 'name'] as const;
type Sort = (typeof SORTS)[number];
type Orient = 'any' | 'LANDSCAPE' | 'PORTRAIT';

/** Browse/search/favorites catalog. All filter state lives in the URL so back
 *  navigation restores it (spec §9.2). */
export function BrowseClient({ categories }: { categories: string[] }) {
  const t = useTranslations('browse');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { favorites, loggedIn } = useFavorites();

  const q = searchParams.get('q') ?? '';
  const fav = searchParams.get('fav') === '1';
  const selectedCats = useMemo(
    () => new Set((searchParams.get('category') ?? '').split(',').filter(Boolean)),
    [searchParams],
  );
  const orient = (searchParams.get('orient') ?? 'any') as Orient;
  const sort = (
    SORTS.includes(searchParams.get('sort') as Sort)
      ? searchParams.get('sort')
      : 'popular'
  ) as Sort;

  const [games, setGames] = useState<GameCardType[] | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [qDraft, setQDraft] = useState(q);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => setQDraft(q), [q]);

  // Catalog fetch: API handles q + base ordering; the rest filters client-side.
  useEffect(() => {
    if (fav) return;
    let active = true;
    setGames(null);
    const apiSort = sort === 'newest' ? 'new' : 'hot';
    api<GameCardType[]>(
      `/games?sort=${apiSort}&locale=${locale}&take=100${q ? `&q=${encodeURIComponent(q)}` : ''}`,
    )
      .then((list) => active && setGames(list))
      .catch(() => active && setGames([]));
    return () => {
      active = false;
    };
  }, [q, sort, locale, fav]);

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setVisible(PAGE_SIZE);
    const qs = next.toString();
    router.replace(qs ? `/browse?${qs}` : '/browse', { scroll: false });
  }

  function toggleCategory(cat: string) {
    const next = new Set(selectedCats);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    updateParams({ category: [...next].join(',') || null });
  }

  function clearFilters() {
    updateParams({ category: null, orient: null, q: null });
  }

  const base = fav ? (favorites ?? null) : games;
  const loading = base === null;

  const filtered = useMemo(() => {
    if (!base) return [];
    let list = base;
    if (fav && q) {
      const needle = q.toLowerCase();
      list = list.filter((g) => g.name.toLowerCase().includes(needle));
    }
    if (selectedCats.size > 0) {
      list = list.filter((g) => selectedCats.has(g.category));
    }
    if (orient !== 'any') {
      list = list.filter((g) => g.orientation === orient || g.orientation === 'BOTH');
    }
    if (sort === 'rating') {
      list = [...list].sort((a, b) => b.ratingAvg - a.ratingAvg);
    } else if (sort === 'name') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, locale));
    }
    return list;
  }, [base, fav, q, selectedCats, orient, sort, locale]);

  const shown = filtered.slice(0, visible);
  const chips: { label: string; onRemove: () => void }[] = [
    ...[...selectedCats].map((c) => ({
      label: c,
      onRemove: () => toggleCategory(c),
    })),
    ...(orient !== 'any'
      ? [
          {
            label: t(orient === 'LANDSCAPE' ? 'landscape' : 'portrait'),
            onRemove: () => updateParams({ orient: null }),
          },
        ]
      : []),
    ...(q ? [{ label: `“${q}”`, onRemove: () => updateParams({ q: null }) }] : []),
  ];

  const sortLabel = t(`sort_${sort}`);

  const filterControls = (
    <>
      <div>
        <div className="mb-2 text-[11px] font-bold tracking-wide text-muted uppercase">
          {t('category')}
        </div>
        <div className="flex flex-wrap gap-2 lg:flex-col lg:gap-0">
          {categories.map((c) => {
            const checked = selectedCats.has(c);
            return (
              <button
                key={c}
                onClick={() => toggleCategory(c)}
                className={`chip lg:flex lg:cursor-pointer lg:items-center lg:gap-2 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-[5px] lg:text-[13px] lg:font-normal lg:text-ink lg:hover:bg-transparent ${
                  checked ? 'chip-active lg:text-ink' : ''
                }`}
              >
                <span
                  className={`hidden h-[15px] w-[15px] rounded border-[1.5px] border-ink lg:inline-block ${
                    checked ? 'bg-accent' : 'bg-transparent'
                  }`}
                />
                {c}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-2 text-[11px] font-bold tracking-wide text-muted uppercase">
          {t('orientation')}
        </div>
        <div className="flex gap-2 lg:flex-col lg:gap-0">
          {(['any', 'LANDSCAPE', 'PORTRAIT'] as const).map((o) => {
            const selected = orient === o;
            const label = t(
              o === 'any' ? 'anyOrientation' : o === 'LANDSCAPE' ? 'landscape' : 'portrait',
            );
            return (
              <button
                key={o}
                onClick={() => updateParams({ orient: o === 'any' ? null : o })}
                className={`chip lg:flex lg:cursor-pointer lg:items-center lg:gap-2 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-[3px] lg:text-[13px] lg:font-normal lg:text-ink lg:hover:bg-transparent ${
                  selected ? 'chip-active lg:text-ink' : ''
                }`}
              >
                <span
                  className={`hidden h-[15px] w-[15px] rounded-full border-[1.5px] border-ink lg:inline-block ${
                    selected ? 'bg-accent' : 'bg-transparent'
                  }`}
                />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  const emptyState = fav ? (
    <div className="py-14 text-center text-muted">
      <div className="mb-1.5 font-display text-base font-bold text-ink">
        {t('favEmpty')}
      </div>
      <div className="mb-3.5 text-[13px]">
        {loggedIn === false ? t('favLoginHint') : t('favEmptyHint')}
      </div>
      {loggedIn === false ? (
        <Link href="/login" className="btn-outline">
          {t('favLoginCta')}
        </Link>
      ) : (
        <Link href="/browse" className="btn-outline">
          {t('favBrowseCta')}
        </Link>
      )}
    </div>
  ) : (
    <div className="py-14 text-center text-muted">
      <div className="mb-1.5 font-display text-base font-bold text-ink">
        {t('noResults')}
      </div>
      <div className="mb-3.5 text-[13px]">{t('noResultsHint')}</div>
      <button onClick={clearFilters} className="btn-outline">
        {t('clearAll')}
      </button>
    </div>
  );

  const grid = loading ? (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <GameCardSkeleton key={i} />
      ))}
    </div>
  ) : shown.length === 0 ? (
    emptyState
  ) : (
    <>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        {shown.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </div>
      {filtered.length > visible && (
        <div className="mt-5 text-center">
          <button
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="btn-outline"
          >
            {t('loadMore')}
          </button>
        </div>
      )}
    </>
  );

  const sortMenu = (onPick: () => void) =>
    SORTS.map((s) => (
      <button
        key={s}
        onClick={() => {
          updateParams({ sort: s === 'popular' ? null : s });
          onPick();
        }}
        className={`block w-full cursor-pointer px-3.5 py-2.5 text-left text-sm hover:bg-chip lg:text-xs ${
          s === sort ? 'font-bold text-accent' : 'text-ink'
        }`}
      >
        {t(`sort_${s}`)}
      </button>
    ));

  return (
    <div className="lg:flex lg:gap-6">
      {/* Desktop filter sidebar */}
      <aside className="hidden w-[190px] shrink-0 flex-col gap-5 border-r-[1.5px] border-line pr-5 lg:flex">
        {filterControls}
        <button onClick={clearFilters} className="btn-outline !px-3 !py-2 text-xs">
          {t('clearAll')}
        </button>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Page heading */}
        <h1 className="mb-3 font-display text-lg font-bold text-ink">
          {fav ? t('favTitle') : t('title')}
        </h1>

        {/* Mobile controls */}
        <div className="mb-3 flex flex-col gap-2 lg:hidden">
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && updateParams({ q: qDraft.trim() || null })
            }
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-full border-[1.5px] border-line bg-surface-2 px-3.5 py-2 text-[13px] text-ink outline-none placeholder:text-muted focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setFilterSheetOpen(true)}
              className="btn-outline flex-1 !py-2 text-xs"
            >
              ☰ {t('filter')}
            </button>
            <button
              onClick={() => setSortOpen(true)}
              className="btn-outline flex-1 !py-2 text-xs"
            >
              {t('sort')}: {sortLabel}
            </button>
          </div>
        </div>

        {/* Result count + desktop sort */}
        <div className="mb-2.5 flex items-center justify-between">
          <div className="text-[13px] text-muted">
            {loading ? '…' : t('results', { count: filtered.length })}
          </div>
          <div className="relative hidden lg:block">
            <button
              onClick={() => setSortOpen((v) => !v)}
              className="cursor-pointer rounded-lg border-[1.5px] border-line bg-surface px-3 py-[7px] text-xs font-semibold text-ink hover:bg-chip"
            >
              {t('sort')}: {sortLabel} ▾
            </button>
            {sortOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setSortOpen(false)}
                />
                <div className="absolute top-[calc(100%+4px)] right-0 z-40 min-w-[150px] overflow-hidden rounded-[10px] border-[1.5px] border-line bg-surface py-1 shadow-[0_10px_24px_rgba(0,0,0,.1)]">
                  {sortMenu(() => setSortOpen(false))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {chips.length > 0 && (
          <div className="mb-3.5 flex flex-wrap gap-1.5">
            {chips.map((ch) => (
              <span
                key={ch.label}
                className="flex items-center gap-1.5 rounded-full border-[1.5px] border-accent px-2.5 py-1 text-[11px] font-semibold text-accent"
              >
                {ch.label}
                <button
                  onClick={ch.onRemove}
                  className="cursor-pointer font-bold"
                  aria-label={`Remove ${ch.label}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {grid}
      </div>

      {/* Mobile filter bottom sheet */}
      {filterSheetOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end bg-black/35 lg:hidden"
          onClick={() => setFilterSheetOpen(false)}
        >
          <div
            className="flex max-h-[75%] w-full flex-col gap-4 overflow-y-auto rounded-t-[20px] bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto h-1 w-8 rounded-full bg-line" />
            {filterControls}
            <div className="flex gap-2.5">
              <button onClick={clearFilters} className="btn-outline flex-1">
                {t('clearAll')}
              </button>
              <button onClick={() => setFilterSheetOpen(false)} className="btn flex-1">
                {t('apply')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile sort bottom sheet */}
      {sortOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end bg-black/35 lg:hidden"
          onClick={() => setSortOpen(false)}
        >
          <div
            className="w-full rounded-t-[20px] bg-surface p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-line" />
            {sortMenu(() => setSortOpen(false))}
          </div>
        </div>
      )}
    </div>
  );
}
