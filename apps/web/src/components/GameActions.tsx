'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { api, ApiError } from '@/lib/client-api';
import { useFavorites } from './FavoritesProvider';
import { useToast } from './Toaster';

/** Interactive 1–5 star rating with average readout (prototype detail page).
 *  Anonymous visitors get a toast instead of a rating (spec §11.5). */
export function RatingStars({
  gameId,
  initialRating,
  ratingAvg,
  ratingCount,
}: {
  gameId: string;
  initialRating: number | null;
  ratingAvg: number;
  ratingCount: number;
}) {
  const t = useTranslations('game');
  const showToast = useToast();
  const [myRating, setMyRating] = useState(initialRating);
  const [avg, setAvg] = useState(ratingAvg);
  const [count, setCount] = useState(ratingCount);

  async function rate(stars: number) {
    try {
      const res = await api<{ myRating: number; ratingAvg: number; ratingCount: number }>(
        `/games/${gameId}/rating`,
        { method: 'PUT', body: JSON.stringify({ stars }) },
      );
      setMyRating(res.myRating);
      setAvg(res.ratingAvg);
      setCount(res.ratingCount);
      showToast(t('ratingSaved', { stars }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        showToast(t('loginToRate'));
      }
    }
  }

  const displayed = myRating ?? Math.round(avg);

  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-0.5 text-[19px] text-star">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            onClick={() => rate(s)}
            aria-label={`${s} stars`}
            className="cursor-pointer transition hover:scale-110"
          >
            {displayed >= s ? '★' : '☆'}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted">
        {avg ? avg.toFixed(1) : '—'} ({count.toLocaleString()})
      </span>
    </div>
  );
}

/** Play / Favorite / Share row (prototype detail page). */
export function DetailActions({
  game,
  initialFavorite,
}: {
  game: { id: string; slug: string; name: string };
  initialFavorite: boolean;
}) {
  const t = useTranslations('game');
  const showToast = useToast();
  const { favorites, isFavorite, toggle } = useFavorites();
  const fav = favorites === null ? initialFavorite : isFavorite(game.id);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: game.name, url });
        return;
      } catch {
        /* cancelled — fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast(t('linkCopied'));
    } catch {
      showToast(url);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
      <Link
        href={`/games/${game.slug}/play`}
        className="btn w-full !px-7 !py-3 !text-[15px] lg:w-auto"
      >
        ▶ {t('play')}
      </Link>
      <div className="flex gap-2.5">
        <button
          onClick={() => void toggle({ id: game.id, name: game.name })}
          className={`flex-1 cursor-pointer rounded-[10px] border-[1.5px] border-line bg-surface px-4 py-2.5 text-[13px] font-bold transition hover:bg-chip lg:flex-none ${
            fav ? 'text-accent' : 'text-muted'
          }`}
        >
          {fav ? `♥ ${t('favorited')}` : `♡ ${t('favorite')}`}
        </button>
        <button
          onClick={share}
          className="flex-1 cursor-pointer rounded-[10px] border-[1.5px] border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink transition hover:bg-chip lg:flex-none"
        >
          ⇪ {t('share')}
        </button>
      </div>
    </div>
  );
}
