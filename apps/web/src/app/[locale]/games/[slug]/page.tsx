import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { apiGet } from '@/lib/server-api';
import { coverGradient } from '@/lib/cover';
import type { GameCard as GameCardType, GameDetail } from '@/lib/types';
import { GameCard } from '@/components/GameCard';
import { DetailActions, RatingStars } from '@/components/GameActions';
import { Comments } from '@/components/Comments';
import { Leaderboard } from '@/components/Leaderboard';

export const dynamic = 'force-dynamic';

export default async function GamePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('game');

  const [game, suggestions] = await Promise.all([
    apiGet<GameDetail>(`/games/${slug}?locale=${locale}`),
    apiGet<GameCardType[]>(`/games/${slug}/suggestions?locale=${locale}`),
  ]);
  if (!game) notFound();

  return (
    <div className="flex flex-col gap-6 lg:gap-7">
      {/* Top section: cover left, metadata right (prototype two-column) */}
      <section className="flex flex-col gap-4 lg:flex-row lg:gap-7">
        <div
          className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-2xl lg:aspect-[4/3] lg:w-[380px] lg:shrink-0"
          style={{ background: coverGradient(game.slug) }}
        >
          <span className="px-6 text-center font-display text-2xl font-bold text-black/45 dark:text-white/70">
            {game.name}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <span className="w-fit rounded-full border-[1.5px] border-line px-3 py-1 text-[11px] font-semibold text-ink">
            {game.category}
          </span>
          <h1 className="font-display text-xl font-bold text-ink lg:text-[28px]">
            {game.name}
          </h1>
          <p className="text-xs text-muted">
            {t('by')} {game.developerName}
            {game.releaseDate && (
              <>
                {' · '}
                {t('released')}{' '}
                {new Date(game.releaseDate).toLocaleDateString(locale)}
              </>
            )}
            {' · '}
            {game.playCount.toLocaleString()} {t('plays')}
          </p>
          <RatingStars
            gameId={game.id}
            initialRating={game.myRating}
            ratingAvg={game.ratingAvg}
            ratingCount={game.ratingCount}
          />
          {/* Play stays above the intro on mobile (spec §11.3), below it on desktop */}
          <div className="order-none lg:order-1">
            <p className="max-w-[520px] text-sm leading-relaxed text-body">
              {game.shortIntro}
            </p>
          </div>
          <div className="order-none lg:order-2 lg:mt-1">
            <DetailActions
              game={{ id: game.id, slug: game.slug, name: game.name }}
              initialFavorite={game.isFavorite}
            />
          </div>
        </div>
      </section>

      {/* Controls */}
      <section>
        <h3 className="mb-2.5 font-display text-[15px] font-semibold text-ink">
          {t('controls')}
        </h3>
        <div
          className="controls-prose max-w-[420px]"
          // Trusted content: authored by developers, sanitized/reviewed before publish
          dangerouslySetInnerHTML={{ __html: game.controlsHtml }}
        />
      </section>

      {/* Leaderboard + comments */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="max-w-[520px]">
          <Leaderboard gameId={game.id} />
        </section>
        <section>
          <Comments gameId={game.id} />
        </section>
      </div>

      {/* More like this */}
      {suggestions && suggestions.length > 0 && (
        <section>
          <h3 className="mb-2.5 font-display text-[15px] font-semibold text-ink">
            {t('suggestions')}
          </h3>
          <div className="grid grid-cols-2 gap-3.5 lg:max-w-[640px] lg:grid-cols-4">
            {suggestions.map((g) => (
              <GameCard key={g.id} game={g} showMeta={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
