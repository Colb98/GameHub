'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { api, API_URL, claimGuestIfAny } from '@/lib/client-api';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(
          mode === 'login' ? { email, password } : { email, password, displayName },
        ),
      });
      await claimGuestIfAny();
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-8 w-full max-w-sm space-y-6">
      <h1 className="text-center text-2xl font-black">
        {mode === 'login' ? t('login') : t('register')}
      </h1>
      <div className="space-y-2">
        <a href={`${API_URL}/auth/google`} className="btn-ghost w-full">
          {t('withGoogle')}
        </a>
        <a href={`${API_URL}/auth/facebook`} className="btn-ghost w-full">
          {t('withFacebook')}
        </a>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-600">
        <div className="h-px flex-1 bg-slate-800" />
        ●
        <div className="h-px flex-1 bg-slate-800" />
      </div>
      <form onSubmit={submit} className="space-y-3">
        {mode === 'register' && (
          <input
            className="input"
            placeholder={t('displayName')}
            value={displayName}
            maxLength={40}
            required
            onChange={(e) => setDisplayName(e.target.value)}
          />
        )}
        <input
          className="input"
          type="email"
          placeholder={t('email')}
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder={t('password')}
          value={password}
          minLength={mode === 'register' ? 8 : undefined}
          required
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button className="btn w-full" disabled={busy}>
          {mode === 'login' ? t('login') : t('register')}
        </button>
      </form>
      <p className="text-center text-sm text-slate-400">
        {mode === 'login' ? (
          <>
            {t('noAccount')}{' '}
            <Link href="/register" className="text-indigo-300 underline">
              {t('register')}
            </Link>
          </>
        ) : (
          <>
            {t('haveAccount')}{' '}
            <Link href="/login" className="text-indigo-300 underline">
              {t('login')}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
