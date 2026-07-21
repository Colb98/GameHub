'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/client-api';
import type { UserProfile } from '@/lib/types';

const ROLE_RANK = { PLAYER: 0, DEVELOPER: 1, MODERATOR: 2, ADMIN: 3 } as const;

export default function DeveloperPage() {
  const t = useTranslations('developer');
  // undefined = still loading; null = logged out; object = logged in
  const [user, setUser] = useState<UserProfile | null | undefined>(undefined);

  useEffect(() => {
    api<UserProfile>('/me')
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const perks = [1, 2, 3] as const;
  const steps = [1, 2, 3, 4, 5, 6] as const;
  const reqs = ['req1', 'req2', 'req3'] as const;

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-display font-bold text-ink">{t('title')}</h1>
        <p className="text-body">{t('subtitle')}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-display font-bold text-ink">{t('whatYouGet')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {perks.map((n) => (
            <div key={n} className="card space-y-1.5 p-4">
              <h3 className="font-bold text-ink">{t(`perk${n}Title`)}</h3>
              <p className="text-sm text-body">{t(`perk${n}Body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-display font-bold text-ink">{t('howTitle')}</h2>
        <ol className="space-y-4">
          {steps.map((n) => (
            <li key={n} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                {n}
              </span>
              <div className="space-y-1 pt-0.5">
                <h3 className="font-bold text-ink">{t(`step${n}Title`)}</h3>
                <p className="text-sm text-body">{t(`step${n}Body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-display font-bold text-ink">{t('requirementsTitle')}</h2>
        <ul className="card divide-y divide-line">
          {reqs.map((k) => (
            <li key={k} className="flex items-start gap-2.5 p-3.5 text-sm text-body">
              <span className="text-accent">✓</span>
              <span>{t(k)}</span>
            </li>
          ))}
        </ul>
      </section>

      <ApplySection user={user} onApplied={(dr) => user && setUser({ ...user, developerRequest: dr })} />
    </div>
  );
}

function ApplySection({
  user,
  onApplied,
}: {
  user: UserProfile | null | undefined;
  onApplied: (dr: UserProfile['developerRequest']) => void;
}) {
  const t = useTranslations('developer');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user === undefined) return null; // still loading

  // Logged out
  if (user === null) {
    return (
      <section className="card space-y-3 p-6 text-center">
        <p className="text-body">{t('loginRequired')}</p>
        <Link href="/login" className="btn inline-flex">
          {t('loginCta')}
        </Link>
      </section>
    );
  }

  // Already a developer (or higher)
  if (ROLE_RANK[user.role] >= ROLE_RANK.DEVELOPER) {
    return (
      <section className="card space-y-3 p-6">
        <h2 className="text-lg font-display font-bold text-ink">{t('alreadyTitle')}</h2>
        <p className="text-body">{t('alreadyBody')}</p>
        <Link href="/studio" className="btn inline-flex">
          {t('goToStudio')}
        </Link>
      </section>
    );
  }

  const request = user.developerRequest;

  // Pending application
  if (request?.status === 'PENDING') {
    return (
      <section className="card space-y-2 border-accent/40 p-6">
        <h2 className="text-lg font-display font-bold text-ink">{t('pendingTitle')}</h2>
        <p className="text-body">{t('pendingBody')}</p>
        {request.message && (
          <p className="rounded-lg bg-chip p-3 text-sm text-body">“{request.message}”</p>
        )}
      </section>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ status: 'PENDING'; message: string | null; createdAt: string }>(
        '/me/developer-request',
        { method: 'POST', body: JSON.stringify({ message: message.trim() || undefined }) },
      );
      onApplied({
        status: created.status,
        message: created.message,
        reviewReason: null,
        createdAt: created.createdAt,
        reviewedAt: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  // Rejected previously → show reason, then the form again
  const rejected = request?.status === 'REJECTED';

  return (
    <section className="card space-y-4 p-6">
      {rejected && (
        <div className="space-y-1 rounded-lg border-[1.5px] border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
          <p className="font-bold">{t('rejectedTitle')}</p>
          {request?.reviewReason && <p>{t('rejectedReason', { reason: request.reviewReason })}</p>}
          <p>{t('rejectedRetry')}</p>
        </div>
      )}
      <div className="space-y-1">
        <h2 className="text-lg font-display font-bold text-ink">{t('applyTitle')}</h2>
        <p className="text-sm text-body">{t('applyHint')}</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <textarea
          className="input"
          rows={4}
          maxLength={1000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('messagePlaceholder')}
        />
        {error && <p className="text-sm text-rose-500">{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? t('submitting') : t('submit')}
        </button>
      </form>
    </section>
  );
}
