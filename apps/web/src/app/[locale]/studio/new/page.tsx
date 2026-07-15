'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { api } from '@/lib/client-api';

export default function NewGamePage() {
  const t = useTranslations('studio');
  const router = useRouter();
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
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

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-black">+ {t('newGame')}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-400">{t('slug')}</span>
          <input className="input" value={form.slug} onChange={set('slug')} required pattern="[a-z0-9][a-z0-9-]+[a-z0-9]" />
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
          <textarea className="input" rows={3} value={form.controlsEn} onChange={set('controlsEn')} />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-slate-400">{t('controlsVi')}</span>
          <textarea className="input" rows={3} value={form.controlsVi} onChange={set('controlsVi')} />
        </label>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button className="btn" disabled={busy}>
        {t('create')}
      </button>
    </form>
  );
}
