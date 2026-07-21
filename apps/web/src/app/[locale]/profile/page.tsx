'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { api } from '@/lib/client-api';
import type { GameCard as GameCardType, UserProfile } from '@/lib/types';
import { GameCard } from '@/components/GameCard';

const ROLE_RANK = { PLAYER: 0, DEVELOPER: 1, MODERATOR: 2, ADMIN: 3 } as const;

interface BestScore {
  gameId: string;
  slug: string;
  gameName: string;
  bestScore: number;
  plays: number;
}

interface HistoryRow {
  sessionId: string;
  slug: string;
  gameName: string;
  startedAt: string;
  score: number | null;
}

export default function ProfilePage() {
  const t = useTranslations('profile');
  const locale = useLocale();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [scores, setScores] = useState<BestScore[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [favorites, setFavorites] = useState<GameCardType[]>([]);

  useEffect(() => {
    api<UserProfile>('/me')
      .then((u) => {
        setUser(u);
        api<BestScore[]>(`/me/scores?locale=${locale}`).then(setScores).catch(() => undefined);
        api<HistoryRow[]>(`/me/history?locale=${locale}`).then(setHistory).catch(() => undefined);
        api<GameCardType[]>(`/me/favorites?locale=${locale}`).then(setFavorites).catch(() => undefined);
      })
      .catch(() => router.push('/login'));
  }, [locale, router]);

  if (!user) return null;

  return (
    <div className="space-y-8">
      <div className="card flex items-center gap-4 p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500 text-2xl font-display font-bold">
          {user.displayName[0]?.toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold">{user.displayName}</h1>
          <p className="text-sm text-slate-400">
            {user.email} · {user.role}
          </p>
        </div>
      </div>

      <DeveloperCard user={user} t={t} />

      <section className="space-y-3">
        <h2 className="text-xl font-bold">🏅 {t('bestScores')}</h2>
        {scores.length === 0 ? (
          <p className="text-sm text-slate-500">{t('empty')}</p>
        ) : (
          <div className="card divide-y divide-slate-800">
            {scores.map((s) => (
              <div key={s.gameId} className="flex items-center justify-between p-3 text-sm">
                <Link href={`/games/${s.slug}`} className="font-semibold text-indigo-300 hover:underline">
                  {s.gameName}
                </Link>
                <span className="tabular-nums">
                  {s.bestScore.toLocaleString()} <span className="text-slate-500">({s.plays}×)</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">🕹 {t('history')}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">{t('empty')}</p>
        ) : (
          <div className="card divide-y divide-slate-800">
            {history.slice(0, 15).map((h) => (
              <div key={h.sessionId} className="flex items-center justify-between p-3 text-sm">
                <span>
                  <Link href={`/games/${h.slug}`} className="font-semibold text-indigo-300 hover:underline">
                    {h.gameName}
                  </Link>{' '}
                  <span className="text-xs text-slate-500">
                    {new Date(h.startedAt).toLocaleString(locale)}
                  </span>
                </span>
                <span className="tabular-nums">{h.score?.toLocaleString() ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">💜 {t('favorites')}</h2>
        {favorites.length === 0 ? (
          <p className="text-sm text-slate-500">{t('empty')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {favorites.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DeveloperCard({
  user,
  t,
}: {
  user: UserProfile;
  t: ReturnType<typeof useTranslations>;
}) {
  // Developers and above: link straight to Studio.
  if (ROLE_RANK[user.role] >= ROLE_RANK.DEVELOPER) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-display font-bold text-ink">🛠 {t('studioCardTitle')}</h2>
          <p className="text-sm text-body">{t('studioCardBody')}</p>
        </div>
        <Link href="/studio" className="btn-ghost">
          {t('studioCardCta')}
        </Link>
      </div>
    );
  }

  const status = user.developerRequest?.status;
  const note =
    status === 'PENDING'
      ? t('devPending')
      : status === 'REJECTED'
        ? t('devRejected')
        : t('becomeDevBody');

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <h2 className="font-display font-bold text-ink">🚀 {t('becomeDevTitle')}</h2>
        <p className="text-sm text-body">{note}</p>
      </div>
      <Link href="/developer" className="btn">
        {status === 'PENDING' || status === 'REJECTED' ? t('devView') : t('becomeDevCta')}
      </Link>
    </div>
  );
}
