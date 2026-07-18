'use client';

import { useFavorites } from './FavoritesProvider';

/** Prototype heart-in-circle overlay button for game covers. */
export function FavoriteButton({
  game,
  size = 'sm',
}: {
  game: { id: string; name: string };
  size?: 'sm' | 'lg';
}) {
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(game.id);
  const dim = size === 'lg' ? 'h-9 w-9 text-base' : 'h-[26px] w-[26px] text-[13px]';

  return (
    <button
      aria-label={fav ? `Remove ${game.name} from favorites` : `Add ${game.name} to favorites`}
      aria-pressed={fav}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle(game);
      }}
      className={`flex ${dim} cursor-pointer items-center justify-center rounded-full bg-white/85 transition hover:bg-white ${
        fav ? 'text-accent' : 'text-[#8a8578]'
      }`}
    >
      {fav ? '♥' : '♡'}
    </button>
  );
}
