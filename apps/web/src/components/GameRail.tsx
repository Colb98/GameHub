import { GameCard } from './GameCard';
import type { GameCard as GameCardType } from '@/lib/types';

/** Homepage section: horizontal swipe rail on mobile, 6-column grid on desktop. */
export function GameRail({
  title,
  games,
  emptyText,
  showMeta = true,
}: {
  title: string;
  games: GameCardType[];
  emptyText?: string;
  showMeta?: boolean;
}) {
  if (games.length === 0 && !emptyText) return null;
  return (
    <section>
      <h2 className="mb-2.5 font-display text-sm font-semibold text-ink lg:text-base">
        {title}
      </h2>
      {games.length === 0 ? (
        <p className="text-[13px] text-muted">{emptyText}</p>
      ) : (
        <div className="rail-scroll flex gap-2.5 overflow-x-auto pb-1 lg:grid lg:grid-cols-6 lg:gap-3.5 lg:overflow-visible lg:pb-0">
          {games.map((g) => (
            <div key={g.id} className="w-[110px] shrink-0 lg:w-auto">
              <GameCard game={g} showMeta={showMeta} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
