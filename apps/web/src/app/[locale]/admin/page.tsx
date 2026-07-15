'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { api } from '@/lib/client-api';
import type { StudioGame } from '@/lib/types';

export default function AdminPage() {
  const t = useTranslations('admin');
  const router = useRouter();
  const [games, setGames] = useState<StudioGame[] | null>(null);

  useEffect(() => {
    api<StudioGame[]>('/admin/games')
      .then(setGames)
      .catch(() => router.push('/login'));
  }, [router]);

  if (!games) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">🛡 {t('title')}</h1>
      {games.length === 0 ? (
        <p className="text-slate-500">{t('empty')}</p>
      ) : (
        <div className="card divide-y divide-slate-800">
          {games.map((g) => {
            const name = g.translations.find((tr) => tr.locale === 'en')?.name ?? g.slug;
            return (
              <Link
                key={g.id}
                href={`/admin/${g.id}`}
                className="flex items-center justify-between gap-3 p-4 hover:bg-slate-900"
              >
                <div>
                  <span className="font-bold">{name}</span>{' '}
                  <code className="text-xs text-slate-500">/{g.slug}</code>
                  <p className="text-xs text-slate-500">
                    {t('developer')}: {g.developer?.displayName} · {t('versions')}:{' '}
                    {g.versions.map((v) => v.semver).join(', ') || '—'}
                  </p>
                </div>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                  {g.status}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
