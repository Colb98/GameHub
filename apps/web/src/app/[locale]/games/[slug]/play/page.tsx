import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
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

  return <PlayShell game={game} />;
}
