'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/client-api';

/** Star rating + favorite toggle. Prompts nothing for anonymous users; API returns 401. */
export function GameActions({
  gameId,
  initialRating,
  initialFavorite,
  ratingAvg,
  ratingCount,
}: {
  gameId: string;
  initialRating: number | null;
  initialFavorite: boolean;
  ratingAvg: number;
  ratingCount: number;
}) {
  const t = useTranslations('game');
  const [myRating, setMyRating] = useState(initialRating);
  const [favorite, setFavorite] = useState(initialFavorite);
  const [avg, setAvg] = useState(ratingAvg);
  const [count, setCount] = useState(ratingCount);
  const [error, setError] = useState(false);

  async function rate(stars: number) {
    try {
      const res = await api<{ myRating: number; ratingAvg: number; ratingCount: number }>(
        `/games/${gameId}/rating`,
        { method: 'PUT', body: JSON.stringify({ stars }) },
      );
      setMyRating(res.myRating);
      setAvg(res.ratingAvg);
      setCount(res.ratingCount);
      setError(false);
    } catch {
      setError(true);
    }
  }

  async function toggleFavorite() {
    try {
      await api(`/games/${gameId}/favorite`, {
        method: favorite ? 'DELETE' : 'PUT',
        ...(favorite ? {} : { body: JSON.stringify({}) }),
      });
      setFavorite(!favorite);
      setError(false);
    } catch {
      setError(true);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-1" title={t('rateThis')}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            onClick={() => rate(s)}
            className={`text-xl transition hover:scale-110 ${
              (myRating ?? 0) >= s ? 'text-yellow-400' : 'text-slate-600'
            }`}
            aria-label={`${s} stars`}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-sm text-slate-400">
          {avg ? avg.toFixed(1) : '—'} ({count})
        </span>
      </div>
      <button className="btn-ghost !py-1.5" onClick={toggleFavorite}>
        {favorite ? `💜 ${t('unfavorite')}` : `🤍 ${t('favorite')}`}
      </button>
      {error && (
        <span className="text-xs text-rose-400">{t('loginToComment')}</span>
      )}
    </div>
  );
}
