import { getTranslations, setRequestLocale } from 'next-intl/server';
import { apiGet } from '@/lib/server-api';
import type { GameCard as GameCardType } from '@/lib/types';
import { GameCard } from '@/components/GameCard';
import { FavoritesRail } from '@/components/FavoritesRail';

export const dynamic = 'force-dynamic';

function Rail({ title, games, emptyText }: { title: string; games: GameCardType[]; emptyText: string }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">{title}</h2>
      {games.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {games.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      )}
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

  const [hot, fresh] = await Promise.all([
    apiGet<GameCardType[]>(`/games?sort=hot&locale=${locale}`),
    apiGet<GameCardType[]>(`/games?sort=new&locale=${locale}&take=12`),
  ]);

  return (
    <div className="space-y-10">
      <FavoritesRail />
      <Rail title={`🔥 ${t('hot')}`} games={hot ?? []} emptyText={t('empty')} />
      <Rail title={`✨ ${t('new')}`} games={fresh ?? []} emptyText={t('empty')} />
    </div>
  );
}
