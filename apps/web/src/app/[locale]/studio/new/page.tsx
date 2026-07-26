'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { api } from '@/lib/client-api';

const MANIFEST_EXAMPLE = `{
  "slug": "star-runner",
  "version": "1.0.0",
  "name": "Star Runner",
  "description": "Dodge asteroids and chase a high score.",
  "category": "arcade",
  "orientation": "LANDSCAPE",
  "scoreOrder": "DESC",
  "controls": "Use the arrow keys to move.",
  "banner": "screenshots/banner.webp"
}`;

export default function NewGamePage() {
  const t = useTranslations('studio');
  const router = useRouter();
  const [mode, setMode] = useState<'manual' | 'package'>('manual');
  const [form, setForm] = useState({
    slug: '',
    category: 'arcade',
    orientation: 'BOTH',
    scoreOrder: 'DESC',
    nameEn: '',
    nameVi: '',
    introEn: '',
    introVi: '',
    controlsEn: '',
    controlsVi: '',
  });
  const [packageFile, setPackageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm((current) => ({ ...current, [key]: e.target.value }));

  function selectMode(nextMode: 'manual' | 'package') {
    setMode(nextMode);
    setError(null);
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/studio/games', {
        method: 'POST',
        body: JSON.stringify({
          slug: form.slug,
          category: form.category,
          orientation: form.orientation,
          scoreOrder: form.scoreOrder,
          translations: [
            {
              locale: 'en',
              name: form.nameEn,
              shortIntro: form.introEn,
              controlsHtml: form.controlsEn,
            },
            {
              locale: 'vi',
              name: form.nameVi || form.nameEn,
              shortIntro: form.introVi || form.introEn,
              controlsHtml: form.controlsVi || form.controlsEn,
            },
          ],
        }),
      });
      router.push('/studio');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitPackage(e: React.FormEvent) {
    e.preventDefault();
    if (!packageFile) {
      setError(t('packageRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', packageFile);
      await api('/studio/games/import', { method: 'POST', body });
      router.push('/studio');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-display font-bold">+ {t('newGame')}</h1>

      <div className="grid gap-3 sm:grid-cols-2" role="tablist" aria-label={t('createMethod')}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'manual'}
          className={`card p-4 text-left transition ${
            mode === 'manual' ? 'border-accent bg-chip' : 'hover:bg-chip'
          }`}
          onClick={() => selectMode('manual')}
        >
          <span className="block font-bold">{t('manualCreate')}</span>
          <span className="mt-1 block text-sm text-muted">{t('manualCreateBody')}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'package'}
          className={`card p-4 text-left transition ${
            mode === 'package' ? 'border-accent bg-chip' : 'hover:bg-chip'
          }`}
          onClick={() => selectMode('package')}
        >
          <span className="block font-bold">{t('packageCreate')}</span>
          <span className="mt-1 block text-sm text-muted">{t('packageCreateBody')}</span>
        </button>
      </div>

      {mode === 'manual' ? (
        <form onSubmit={submitManual} className="space-y-4" role="tabpanel">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">{t('slug')}</span>
              <input
                className="input"
                value={form.slug}
                onChange={set('slug')}
                required
                pattern="[a-z0-9][a-z0-9-]+[a-z0-9]"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">{t('category')}</span>
              <input className="input" value={form.category} onChange={set('category')} required />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">{t('orientation')}</span>
              <select className="input" value={form.orientation} onChange={set('orientation')}>
                <option value="BOTH">BOTH</option>
                <option value="PORTRAIT">PORTRAIT</option>
                <option value="LANDSCAPE">LANDSCAPE</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">{t('scoreOrder')}</span>
              <select className="input" value={form.scoreOrder} onChange={set('scoreOrder')}>
                <option value="DESC">High is better (DESC)</option>
                <option value="ASC">Low is better (ASC)</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">{t('nameEn')}</span>
              <input className="input" value={form.nameEn} onChange={set('nameEn')} required />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">{t('nameVi')}</span>
              <input className="input" value={form.nameVi} onChange={set('nameVi')} />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-slate-400">{t('introEn')}</span>
              <textarea className="input" rows={2} value={form.introEn} onChange={set('introEn')} />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-slate-400">{t('introVi')}</span>
              <textarea className="input" rows={2} value={form.introVi} onChange={set('introVi')} />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-slate-400">{t('controlsEn')}</span>
              <textarea
                className="input"
                rows={3}
                value={form.controlsEn}
                onChange={set('controlsEn')}
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-slate-400">{t('controlsVi')}</span>
              <textarea
                className="input"
                rows={3}
                value={form.controlsVi}
                onChange={set('controlsVi')}
              />
            </label>
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button className="btn" disabled={busy}>
            {t('create')}
          </button>
        </form>
      ) : (
        <form onSubmit={submitPackage} className="space-y-5" role="tabpanel">
          <div className="card space-y-3 p-5">
            <div>
              <h2 className="font-bold">{t('packageZip')}</h2>
              <p className="mt-1 text-sm text-muted">{t('packageHint')}</p>
            </div>
            <input
              className="input"
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              required
              onChange={(event) => setPackageFile(event.target.files?.[0] ?? null)}
            />
          </div>

          <details className="card p-5">
            <summary className="cursor-pointer font-bold">{t('packageFormat')}</summary>
            <div className="mt-4 space-y-4 text-sm text-muted">
              <p>{t('packageFormatBody')}</p>
              <pre className="overflow-x-auto rounded-xl bg-surface-2 p-4 text-xs text-ink">{`game.zip
├── gamehub.json
├── index.html
├── assets/
└── screenshots/
    ├── banner.webp
    └── gameplay.webp`}</pre>
              <p>{t('manifestExample')}</p>
              <pre className="overflow-x-auto rounded-xl bg-surface-2 p-4 text-xs text-ink">
                {MANIFEST_EXAMPLE}
              </pre>
              <p>{t('packageDefaults')}</p>
            </div>
          </details>

          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button className="btn" disabled={busy}>
            {busy ? t('importingPackage') : t('importPackage')}
          </button>
        </form>
      )}
    </div>
  );
}
