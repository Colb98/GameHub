'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { api } from '@/lib/client-api';
import type { AdminDeveloperRequest, StudioGame, UserProfile } from '@/lib/types';

export default function AdminPage() {
  const t = useTranslations('admin');
  const router = useRouter();
  const [games, setGames] = useState<StudioGame[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    api<UserProfile>('/me')
      .then((u) => setIsAdmin(u.role === 'ADMIN'))
      .catch(() => undefined);
    api<StudioGame[]>('/admin/games')
      .then(setGames)
      .catch(() => router.push('/login'));
  }, [router]);

  if (!games) return null;

  return (
    <div className="space-y-8">
      {isAdmin && <DeveloperRequests t={t} />}

      <section className="space-y-4">
        <h1 className="text-2xl font-display font-bold">🛡 {t('title')}</h1>
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
                  <span className="flex flex-col items-end gap-1">
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {g.status}
                    </span>
                    {g.updateSubmittedAt && (
                      <span className="rounded bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
                        {t('updateBadge')}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function DeveloperRequests({ t }: { t: ReturnType<typeof useTranslations> }) {
  const locale = useLocale();
  const [requests, setRequests] = useState<AdminDeveloperRequest[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api<AdminDeveloperRequest[]>('/admin/developer-requests')
      .then(setRequests)
      .catch(() => setRequests([]));
  }, []);

  useEffect(load, [load]);

  async function approve(req: AdminDeveloperRequest) {
    setBusy(req.id);
    try {
      await api(`/admin/developer-requests/${req.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNotice(t('reqApproved', { name: req.user.displayName }));
      load();
    } finally {
      setBusy(null);
    }
  }

  async function reject(req: AdminDeveloperRequest) {
    const reason = reasons[req.id]?.trim();
    if (!reason) return;
    setBusy(req.id);
    try {
      await api(`/admin/developer-requests/${req.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setNotice(t('reqRejected', { name: req.user.displayName }));
      load();
    } finally {
      setBusy(null);
    }
  }

  if (!requests) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-display font-bold">🧑‍💻 {t('reqTitle')}</h2>
      {notice && (
        <p className="rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-sm text-emerald-700 dark:text-emerald-300">
          ✓ {notice}
        </p>
      )}
      {requests.length === 0 ? (
        <p className="text-slate-500">{t('reqEmpty')}</p>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div key={req.id} className="card space-y-3 p-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-bold text-ink">{req.user.displayName}</span>
                <span className="text-sm text-muted">{req.user.email}</span>
                <span className="text-xs text-muted">
                  · {t('reqApplied', { date: new Date(req.createdAt).toLocaleDateString(locale) })}
                </span>
              </div>
              <p className="rounded-lg bg-chip p-3 text-sm text-body">
                {req.message ? req.message : <em className="text-muted">{t('reqNoMessage')}</em>}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="btn !bg-emerald-600 hover:!bg-emerald-500"
                  disabled={busy === req.id}
                  onClick={() => approve(req)}
                >
                  ✓ {t('reqApprove')}
                </button>
                <input
                  className="input !w-64"
                  placeholder={t('reqReason')}
                  value={reasons[req.id] ?? ''}
                  onChange={(e) => setReasons((r) => ({ ...r, [req.id]: e.target.value }))}
                />
                <button
                  className="btn !bg-rose-600 hover:!bg-rose-500"
                  disabled={busy === req.id || !reasons[req.id]?.trim()}
                  onClick={() => reject(req)}
                >
                  ✕ {t('reqReject')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
