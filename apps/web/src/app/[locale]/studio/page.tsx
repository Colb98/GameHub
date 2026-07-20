'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { api } from '@/lib/client-api';
import type { StudioGame } from '@/lib/types';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-chip text-ink',
  SUBMITTED: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  IN_REVIEW: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  PUBLISHED: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  REJECTED: 'bg-rose-500/20 text-rose-700 dark:text-rose-300',
  DELISTED: 'bg-chip text-muted',
};

export default function StudioPage() {
  const t = useTranslations('studio');
  const router = useRouter();
  const [games, setGames] = useState<StudioGame[] | null>(null);
  const [uploadBusy, setUploadBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(() => {
    api<StudioGame[]>('/studio/games')
      .then(setGames)
      .catch(() => router.push('/login'));
  }, [router]);

  useEffect(load, [load]);

  async function uploadVersion(game: StudioGame, file: File, semver: string) {
    setUploadBusy(game.id);
    setError(null);
    setSuccess(null);
    try {
      const form = new FormData();
      form.append('file', file);
      await api(`/studio/games/${game.id}/versions?semver=${encodeURIComponent(semver)}`, {
        method: 'POST',
        body: form,
      });
      const name = game.translations.find((tr) => tr.locale === 'en')?.name ?? game.slug;
      // Published games: the upload is auto-submitted and waits for admin approval
      setSuccess(
        t(game.status === 'PUBLISHED' ? 'uploadSuccessPending' : 'uploadSuccess', {
          semver,
          name,
        }),
      );
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadBusy(null);
    }
  }

  async function submitForReview(game: StudioGame) {
    setError(null);
    setSuccess(null);
    try {
      await api(`/studio/games/${game.id}/submit`, { method: 'POST', body: JSON.stringify({}) });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    }
  }

  if (!games) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold">🛠 {t('title')}</h1>
        <Link href="/studio/new" className="btn">
          + {t('newGame')}
        </Link>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {success && (
        <p className="rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-sm text-emerald-700 dark:text-emerald-300">
          ✓ {success}
        </p>
      )}
      {games.length === 0 ? (
        <p className="text-slate-500">{t('noGames')}</p>
      ) : (
        <div className="space-y-4">
          {games.map((g) => (
            <StudioGameRow
              key={g.id}
              game={g}
              busy={uploadBusy === g.id}
              onUpload={uploadVersion}
              onSubmit={submitForReview}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StudioGameRow({
  game,
  busy,
  onUpload,
  onSubmit,
  t,
}: {
  game: StudioGame;
  busy: boolean;
  onUpload: (g: StudioGame, file: File, semver: string) => void;
  onSubmit: (g: StudioGame) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [semver, setSemver] = useState('1.0.0');
  const [file, setFile] = useState<File | null>(null);
  const name = game.translations.find((tr) => tr.locale === 'en')?.name ?? game.slug;

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">{name}</h2>
        <code className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">/{game.slug}</code>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[game.status] ?? ''}`}>
          {game.status}
        </span>
        {game.updateSubmittedAt && (
          <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            {t('updatePending')}
          </span>
        )}
        {game.status === 'PUBLISHED' && (
          <Link href={`/games/${game.slug}`} className="text-sm text-indigo-300 underline">
            → {game.slug}
          </Link>
        )}
      </div>
      {game.rejectReason && (
        <p className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-sm text-rose-700 dark:text-rose-300">
          {game.rejectReason}
        </p>
      )}
      <div className="text-sm text-slate-400">
        {t('versions')}:{' '}
        {game.versions.length === 0
          ? '—'
          : game.versions.map((v) => `${v.semver}${v.isActive ? ' ✓' : ''}`).join(', ')}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input !w-28"
          value={semver}
          onChange={(e) => setSemver(e.target.value)}
          placeholder="1.0.0"
        />
        <input
          type="file"
          accept=".zip"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-slate-400 file:mr-3 file:rounded file:border-0 file:bg-chip file:px-3 file:py-1.5 file:text-sm file:text-ink"
        />
        <button
          className="btn-ghost"
          disabled={!file || busy}
          onClick={() => file && onUpload(game, file, semver)}
        >
          ⬆ {t('upload')}
        </button>
        {['DRAFT', 'REJECTED'].includes(game.status) && game.versions.length > 0 && (
          <button className="btn" onClick={() => onSubmit(game)}>
            {t('submitReview')}
          </button>
        )}
      </div>
    </div>
  );
}
