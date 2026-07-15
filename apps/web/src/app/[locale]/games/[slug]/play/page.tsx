import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { apiGet } from '@/lib/server-api';
import type { GameDetail } from '@/lib/types';
import { PlayShell } from '@/components/PlayShell';

export const dynamic = 'force-dynamic';

export default async function PlayPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const game = await apiGet<GameDetail>(`/games/${slug}?locale=${locale}`);
  if (!game || !game.activeVersion) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">{game.name}</h1>
        <Link href={`/games/${game.slug}`} className="text-sm text-slate-400 hover:text-white">
          ← {game.name}
        </Link>
      </div>
      <PlayShell game={game} />
    </div>
  );
}
