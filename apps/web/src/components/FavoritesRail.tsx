'use client';

import { useTranslations } from 'next-intl';
import { useFavorites } from './FavoritesProvider';
import { GameRail } from './GameRail';

/** Homepage favorites rail: only renders for logged-in users with favorites. */
export function FavoritesRail() {
  const t = useTranslations('home');
  const { favorites } = useFavorites();

  if (!favorites || favorites.length === 0) return null;

  return <GameRail title={t('favorites')} games={favorites} showMeta={false} />;
}
