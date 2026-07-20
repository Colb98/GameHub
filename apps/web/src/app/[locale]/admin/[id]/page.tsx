'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { api, GAMES_BASE_URL } from '@/lib/client-api';
import type { StudioGame } from '@/lib/types';

export default function AdminReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations('admin');
  const router = useRouter();
  const [game, setGame] = useState<StudioGame | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<StudioGame>(`/admin/games/${id}`)
      .then(setGame)
      .catch(() => router.push('/admin'));
  }, [id, router]);

  useEffect(load, [load]);

  async function act(action: 'approve' | 'reject') {
    setError(null);
    try {
      await api(`/admin/games/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(action === 'reject' ? { reason } : {}),
      });
      router.push('/admin');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  if (!game) return null;
  const latest = game.versions[0];
  const live = game.versions.find((v) => v.isActive);
  const name = game.translations.find((tr) => tr.locale === 'en')?.name ?? game.slug;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-display font-bold">{name}</h1>
        <code className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">/{game.slug}</code>
        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
          {game.status}
        </span>
        {game.updateSubmittedAt && (
          <span className="rounded bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
            {t('updateBadge')}
          </span>
        )}
        <span className="text-sm text-slate-500">
          {t('developer')}: {game.developer?.displayName} ({game.developer?.email})
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {game.translations.map((tr) => (
          <div key={tr.locale} className="card space-y-2 p-4 text-sm">
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs uppercase text-slate-400">
              {tr.locale}
            </span>
            <p className="font-bold">{tr.name}</p>
            <p className="text-slate-400">{tr.shortIntro}</p>
            <div
              className="controls-prose"
              dangerouslySetInnerHTML={{ __html: tr.controlsHtml }}
            />
          </div>
        ))}
      </div>

      {latest && (
        <section className="space-y-2">
          <h2 className="font-bold">
            🎮 {t('testPlay')} — v{latest.semver}
          </h2>
          {live && live.id !== latest.id && (
            <p className="text-sm text-slate-500">
              {t('currentlyLive', { semver: live.semver, next: latest.semver })}
            </p>
          )}
          {/* Standalone test-play: the bundle runs without a session (SDK falls back) */}
          <iframe
            src={`${GAMES_BASE_URL}/${latest.bundlePath}/index.html`}
            sandbox="allow-scripts allow-same-origin"
            className="mx-auto block h-[70vh] w-full max-w-2xl rounded-xl border border-slate-800 bg-black"
            title={`Review: ${name}`}
          />
        </section>
      )}

      <section className="card space-y-3 p-4">
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn !bg-emerald-600 hover:!bg-emerald-500" onClick={() => act('approve')}>
            ✓ {t('approve')}
          </button>
          <input
            className="input !w-72"
            placeholder={t('rejectReason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="btn !bg-rose-600 hover:!bg-rose-500"
            disabled={!reason.trim()}
            onClick={() => act('reject')}
          >
            ✕ {t('reject')}
          </button>
        </div>
      </section>
    </div>
  );
}
