'use client';

import { use, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { api, isUnauthenticatedError } from '@/lib/client-api';
import { gameMediaUrl } from '@/lib/cover';
import type { StudioGame } from '@/lib/types';

type FormState = {
  category: string;
  orientation: 'LANDSCAPE' | 'PORTRAIT' | 'BOTH';
  scoreOrder: 'DESC' | 'ASC';
  maxScore: string;
  nameEn: string;
  nameVi: string;
  introEn: string;
  introVi: string;
  controlsEn: string;
  controlsVi: string;
};

export default function EditGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations('studio');
  const router = useRouter();
  const [game, setGame] = useState<StudioGame | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    api<StudioGame>(`/studio/games/${id}`)
      .then((loaded) => {
        const en = loaded.translations.find((translation) => translation.locale === 'en');
        const vi = loaded.translations.find((translation) => translation.locale === 'vi');
        setGame(loaded);
        setForm({
          category: loaded.category,
          orientation: loaded.orientation,
          scoreOrder: loaded.scoreOrder,
          maxScore: loaded.maxScore == null ? '' : String(loaded.maxScore),
          nameEn: en?.name ?? '',
          nameVi: vi?.name ?? '',
          introEn: en?.shortIntro ?? '',
          introVi: vi?.shortIntro ?? '',
          controlsEn: en?.controlsHtml ?? '',
          controlsVi: vi?.controlsHtml ?? '',
        });
      })
      .catch((loadError) => {
        if (isUnauthenticatedError(loadError)) router.push('/login');
        else setError(loadError instanceof Error ? loadError.message : t('loadFailed'));
      });
  }, [id, router, t]);

  const set = (key: keyof FormState) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm((current) => (current ? { ...current, [key]: event.target.value } : current));

  async function saveInfo(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const translations = [
        { locale: 'en', name: form.nameEn, shortIntro: form.introEn, controlsHtml: form.controlsEn },
        { locale: 'vi', name: form.nameVi || form.nameEn, shortIntro: form.introVi || form.introEn, controlsHtml: form.controlsVi || form.controlsEn },
      ];
      const updated = await api<StudioGame>(`/studio/games/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          category: form.category,
          orientation: form.orientation,
          scoreOrder: form.scoreOrder,
          maxScore: form.maxScore ? Number(form.maxScore) : null,
          translations,
        }),
      });
      setGame(updated);
      setSuccess(t('saved'));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function uploadMedia() {
    if (!game) return;
    setMediaBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (bannerFile) {
        const body = new FormData();
        body.append('file', bannerFile);
        await api(`/studio/games/${id}/banner`, { method: 'POST', body });
      }
      for (const file of screenshotFiles) {
        const body = new FormData();
        body.append('file', file);
        await api(`/studio/games/${id}/screenshots`, { method: 'POST', body });
      }
      const refreshed = await api<StudioGame>(`/studio/games/${id}`);
      setGame(refreshed);
      setBannerFile(null);
      setScreenshotFiles([]);
      setSuccess(t('mediaSaved'));
    } catch (mediaError) {
      setError(mediaError instanceof Error ? mediaError.message : t('mediaFailed'));
    } finally {
      setMediaBusy(false);
    }
  }

  async function removeScreenshot(screenshotId: string) {
    setMediaBusy(true);
    setError(null);
    try {
      await api(`/studio/games/${id}/screenshots/${screenshotId}`, { method: 'DELETE' });
      setGame((current) => current ? {
        ...current,
        screenshots: current.screenshots.filter((screenshot) => screenshot.id !== screenshotId),
      } : current);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : t('mediaFailed'));
    } finally {
      setMediaBusy(false);
    }
  }

  if (!game || !form) return <p className="text-sm text-muted">{error ?? t('loading')}</p>;

  const bannerUrl = gameMediaUrl(game.bannerPath);
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">/{game.slug}</p>
          <h1 className="text-2xl font-display font-bold text-ink">{t('editInfo')}</h1>
        </div>
        <button type="button" className="btn-ghost" onClick={() => router.push('/studio')}>
          {t('backToStudio')}
        </button>
      </div>

      <form onSubmit={saveInfo} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span>{t('category')}</span><input className="input" value={form.category} onChange={set('category')} required /></label>
          <label className="space-y-1 text-sm"><span>{t('maxScore')}</span><input className="input" type="number" min="1" value={form.maxScore} onChange={set('maxScore')} /></label>
          <label className="space-y-1 text-sm"><span>{t('orientation')}</span><select className="input" value={form.orientation} onChange={set('orientation')}><option value="BOTH">BOTH</option><option value="PORTRAIT">PORTRAIT</option><option value="LANDSCAPE">LANDSCAPE</option></select></label>
          <label className="space-y-1 text-sm"><span>{t('scoreOrder')}</span><select className="input" value={form.scoreOrder} onChange={set('scoreOrder')}><option value="DESC">{t('highScore')}</option><option value="ASC">{t('lowScore')}</option></select></label>
          <label className="space-y-1 text-sm"><span>{t('nameEn')}</span><input className="input" value={form.nameEn} onChange={set('nameEn')} required /></label>
          <label className="space-y-1 text-sm"><span>{t('nameVi')}</span><input className="input" value={form.nameVi} onChange={set('nameVi')} /></label>
          <label className="space-y-1 text-sm sm:col-span-2"><span>{t('introEn')}</span><textarea className="input" rows={3} value={form.introEn} onChange={set('introEn')} /></label>
          <label className="space-y-1 text-sm sm:col-span-2"><span>{t('introVi')}</span><textarea className="input" rows={3} value={form.introVi} onChange={set('introVi')} /></label>
          <label className="space-y-1 text-sm sm:col-span-2"><span>{t('controlsEn')}</span><textarea className="input" rows={4} value={form.controlsEn} onChange={set('controlsEn')} /></label>
          <label className="space-y-1 text-sm sm:col-span-2"><span>{t('controlsVi')}</span><textarea className="input" rows={4} value={form.controlsVi} onChange={set('controlsVi')} /></label>
        </div>
        <button className="btn" disabled={busy}>{busy ? t('saving') : t('saveInfo')}</button>
      </form>

      <section className="space-y-4 border-t-[1.5px] border-line pt-6">
        <div><h2 className="text-lg font-display font-bold text-ink">{t('mediaTitle')}</h2><p className="text-sm text-body">{t('mediaBody')}</p></div>
        {bannerUrl && <img src={bannerUrl} alt="" className="aspect-[2.4/1] w-full rounded-xl object-cover" />}
        <label className="block space-y-1 text-sm"><span>{t('banner')}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setBannerFile(event.target.files?.[0] ?? null)} className="text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-chip file:px-3 file:py-1.5 file:text-sm file:text-ink" /></label>
        <label className="block space-y-1 text-sm"><span>{t('screenshots')}</span><input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => setScreenshotFiles(Array.from(event.target.files ?? []))} className="text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-chip file:px-3 file:py-1.5 file:text-sm file:text-ink" /></label>
        <button type="button" className="btn-ghost" disabled={mediaBusy || (!bannerFile && screenshotFiles.length === 0)} onClick={uploadMedia}>{mediaBusy ? t('uploadingMedia') : t('uploadMedia')}</button>
        {game.screenshots.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{game.screenshots.map((screenshot) => { const url = gameMediaUrl(screenshot.path); return url ? <div key={screenshot.id} className="relative"><img src={url} alt={screenshot.altText ?? game.slug} className="aspect-video w-full rounded-xl object-cover" /><button type="button" onClick={() => removeScreenshot(screenshot.id)} disabled={mediaBusy} className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-white">{t('remove')}</button></div> : null; })}</div>}
      </section>

      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {success && <p className="text-sm text-emerald-700 dark:text-emerald-300">{success}</p>}
    </div>
  );
}
