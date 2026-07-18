import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { apiGet } from '@/lib/server-api';
import { coverGradient } from '@/lib/cover';
import type { CategoryCount, GameCard as GameCardType } from '@/lib/types';
import { FavoriteButton } from '@/components/FavoriteButton';
import { FavoritesRail } from '@/components/FavoritesRail';
import { GameCard } from '@/components/GameCard';
import { GameRail } from '@/components/GameRail';

export const dynamic = 'force-dynamic';

function Hero({
  game,
  playLabel,
  detailsLabel,
  featuredLabel,
}: {
  game: GameCardType;
  playLabel: string;
  detailsLabel: string;
  featuredLabel: string;
}) {
  return (
    <section
      className="relative h-[150px] overflow-hidden rounded-2xl lg:h-[220px]"
      style={{ background: coverGradient(game.slug) }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent to-60%" />
      <div className="absolute top-3 right-3 lg:top-4 lg:right-4">
        <FavoriteButton game={{ id: game.id, name: game.name }} size="lg" />
      </div>
      <div className="absolute right-3.5 bottom-3 left-3.5 text-white lg:right-6 lg:bottom-5 lg:left-6">
        <div className="mb-1 hidden text-[11px] font-semibold tracking-wider uppercase opacity-85 lg:block">
          {featuredLabel} · {game.category}
        </div>
        <div className="mb-1.5 font-display text-base font-bold lg:text-3xl">
          {game.name}
        </div>
        <p className="mb-3 hidden max-w-[520px] text-sm opacity-90 lg:block">
          {game.shortIntro}
        </p>
        <div className="flex gap-2.5">
          <Link
            href={`/games/${game.slug}/play`}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:brightness-110 lg:rounded-[10px] lg:px-5 lg:py-2.5 lg:text-sm"
          >
            ▶ {playLabel}
          </Link>
          <Link
            href={`/games/${game.slug}`}
            className="hidden rounded-[10px] bg-white/90 px-5 py-2.5 text-sm font-bold text-[#211f1c] transition hover:bg-white lg:block"
          >
            {detailsLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');

  const [hotRaw, fresh, categoryRows] = await Promise.all([
    apiGet<GameCardType[]>(`/games?sort=hot&locale=${locale}&take=13`),
    apiGet<GameCardType[]>(`/games?sort=new&locale=${locale}&take=6`),
    apiGet<CategoryCount[]>('/games/categories'),
  ]);
  const categories = (categoryRows ?? []).map((c) => c.category);

  const all = hotRaw ?? [];
  const hero =
    all.find((g) => g.featuredRank != null) ?? (all.length > 0 ? all[0] : null);
  const hot = all.filter((g) => g.id !== hero?.id).slice(0, 6);
  const recommended = all.filter((g) => g.id !== hero?.id).slice(6, 12);

  return (
    <div className="flex flex-col gap-5 lg:gap-7">
      {hero && (
        <Hero
          game={hero}
          playLabel={t('playNow')}
          detailsLabel={t('viewDetails')}
          featuredLabel={t('featured')}
        />
      )}

      <GameRail title={t('hot')} games={hot} emptyText={t('empty')} />
      <FavoritesRail />
      <GameRail title={t('new')} games={fresh ?? []} emptyText={t('empty')} />

      {categories && categories.length > 0 && (
        <section>
          <h2 className="mb-2.5 font-display text-sm font-semibold text-ink lg:text-base">
            {t('categories')}
          </h2>
          <div className="rail-scroll flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
            {categories.map((c) => (
              <Link
                key={c}
                href={`/browse?category=${encodeURIComponent(c)}`}
                className="chip shrink-0"
              >
                {c}
              </Link>
            ))}
          </div>
        </section>
      )}

      {recommended.length > 0 && (
        <section className="lg:hidden">
          <h2 className="mb-2.5 font-display text-sm font-semibold text-ink">
            {t('recommended')}
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {recommended.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
