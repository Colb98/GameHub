'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@/lib/client-api';
import type { GameCard as GameCardType } from '@/lib/types';
import { GameCard } from './GameCard';

/** Client-side rail: only renders for logged-in users with favorites. */
export function FavoritesRail() {
  const t = useTranslations('home');
  const locale = useLocale();
  const [games, setGames] = useState<GameCardType[] | null>(null);

  useEffect(() => {
    api<GameCardType[]>(`/me/favorites?locale=${locale}`)
      .then(setGames)
      .catch(() => setGames(null));
  }, [locale]);

  if (!games || games.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">💜 {t('favorites')}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {games.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </div>
    </section>
  );
}
