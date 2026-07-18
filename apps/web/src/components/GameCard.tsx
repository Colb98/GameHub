import { Link } from '@/i18n/routing';
import { coverGradient, isNewGame } from '@/lib/cover';
import type { GameCard as GameCardType } from '@/lib/types';
import { FavoriteButton } from './FavoriteButton';

/** Prototype game card: gradient cover with badge + favorite overlay, then a
 *  display-font title and a rating/plays meta row. */
export function GameCard({
  game,
  showMeta = true,
}: {
  game: GameCardType;
  showMeta?: boolean;
}) {
  return (
    <Link
      href={`/games/${game.slug}`}
      className="group flex cursor-pointer flex-col gap-1.5"
    >
      <div
        className="relative aspect-[4/3] overflow-hidden rounded-xl transition group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_18px_rgba(0,0,0,.12)]"
        style={{ background: coverGradient(game.slug) }}
      >
        <span className="absolute inset-0 flex items-center justify-center px-2 text-center font-display text-base font-bold break-words text-black/45 dark:text-white/70">
          {game.name}
        </span>
        {isNewGame(game.releaseDate) && (
          <span className="absolute top-2 left-2 rounded-md bg-accent px-2 py-[3px] text-[9px] font-bold text-white">
            NEW
          </span>
        )}
        <span className="absolute top-2 right-2">
          <FavoriteButton game={{ id: game.id, name: game.name }} />
        </span>
      </div>
      <span className="truncate font-display text-[13px] font-semibold text-ink">
        {game.name}
      </span>
      {showMeta && (
        <span className="flex items-center justify-between text-[11px] text-muted">
          <span>★ {game.ratingAvg ? game.ratingAvg.toFixed(1) : '—'}</span>
          <span>{game.playCount.toLocaleString()}</span>
        </span>
      )}
    </Link>
  );
}

/** Loading skeleton matching the card layout. */
export function GameCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-1.5">
      <div className="aspect-[4/3] rounded-xl bg-chip" />
      <div className="h-3.5 w-3/4 rounded bg-chip" />
      <div className="h-3 w-1/2 rounded bg-chip" />
    </div>
  );
}
