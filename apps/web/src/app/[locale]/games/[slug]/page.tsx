import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { apiGet } from '@/lib/server-api';
import type { GameCard as GameCardType, GameDetail } from '@/lib/types';
import { GameCard } from '@/components/GameCard';
import { GameActions } from '@/components/GameActions';
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
    <div className="space-y-8">
      <section className="card flex flex-col gap-6 p-6 md:flex-row md:items-start">
        <div className="flex-1 space-y-3">
          <h1 className="text-3xl font-black">{game.name}</h1>
          <p className="text-sm text-slate-400">
            {t('by')} <span className="text-slate-300">{game.developerName}</span>
            {game.releaseDate && (
              <>
                {' · '}
                {t('released')}{' '}
                {new Date(game.releaseDate).toLocaleDateString(locale)}
              </>
            )}
            {' · '}▶ {game.playCount.toLocaleString()} {t('plays')}
          </p>
          <p className="text-slate-300">{game.shortIntro}</p>
          <GameActions
            gameId={game.id}
            initialRating={game.myRating}
            initialFavorite={game.isFavorite}
            ratingAvg={game.ratingAvg}
            ratingCount={game.ratingCount}
          />
          <div className="pt-2">
            <Link href={`/games/${game.slug}/play`} className="btn !px-8 !py-3 text-base">
              ▶ {t('play')}
            </Link>
          </div>
        </div>
        <div className="w-full space-y-2 md:w-80">
          <h3 className="font-bold">🎮 {t('controls')}</h3>
          <div
            className="prose prose-sm prose-invert text-slate-300"
            // Trusted content: authored by developers, sanitized/reviewed before publish
            dangerouslySetInnerHTML={{ __html: game.controlsHtml }}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Leaderboard gameId={game.id} />
        <Comments gameId={game.id} />
      </div>

      {suggestions && suggestions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">{t('suggestions')}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {suggestions.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
