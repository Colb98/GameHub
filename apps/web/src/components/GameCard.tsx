import { Link } from '@/i18n/routing';
import type { GameCard as GameCardType } from '@/lib/types';

/** Deterministic gradient per game so tiles look distinct without cover art. */
function tileColors(slug: string): { from: string; to: string } {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue1 = hash % 360;
  const hue2 = (hue1 + 60) % 360;
  return {
    from: `hsl(${hue1} 70% 45%)`,
    to: `hsl(${hue2} 70% 35%)`,
  };
}

export function GameCard({ game }: { game: GameCardType }) {
  const { from, to } = tileColors(game.slug);
  return (
    <Link
      href={`/games/${game.slug}`}
      className="card group block overflow-hidden transition hover:border-indigo-500/60"
    >
      <div
        className="game-tile-gradient flex h-32 items-center justify-center p-3 text-center"
        style={{ '--tile-from': from, '--tile-to': to } as React.CSSProperties}
      >
        <span className="text-xl font-black text-white drop-shadow-md">
          {game.name}
        </span>
      </div>
      <div className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold group-hover:text-indigo-300">
            {game.name}
          </span>
          <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
            {game.category}
          </span>
        </div>
        <p className="line-clamp-2 text-xs text-slate-400">{game.shortIntro}</p>
        <div className="flex items-center gap-3 pt-1 text-xs text-slate-500">
          <span>⭐ {game.ratingAvg ? game.ratingAvg.toFixed(1) : '—'}</span>
          <span>▶ {game.playCount.toLocaleString()}</span>
        </div>
      </div>
    </Link>
  );
}
