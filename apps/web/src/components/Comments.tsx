'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/client-api';
import type { CommentItem, UserProfile } from '@/lib/types';

export function Comments({ gameId }: { gameId: string }) {
  const t = useTranslations('game');
  const [items, setItems] = useState<CommentItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (after?: string | null) => {
      const res = await api<{ items: CommentItem[]; nextCursor: string | null }>(
        `/games/${gameId}/comments${after ? `?cursor=${after}` : ''}`,
      );
      setItems((prev) => (after ? [...prev, ...res.items] : res.items));
      setCursor(res.nextCursor);
    },
    [gameId],
  );

  useEffect(() => {
    load().catch(() => undefined);
    api<UserProfile>('/me')
      .then(setUser)
      .catch(() => setUser(null));
  }, [load]);

  async function submit() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const created = await api<CommentItem>(`/games/${gameId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: draft.trim() }),
      });
      setItems((prev) => [created, ...prev]);
      setDraft('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4 p-4">
      <h3 className="font-bold">💬 {t('comments')}</h3>
      {user ? (
        <div className="flex gap-2">
          <input
            className="input"
            value={draft}
            maxLength={2000}
            placeholder={t('commentPlaceholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button className="btn" onClick={submit} disabled={busy || !draft.trim()}>
            {t('send')}
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          <Link href="/login" className="text-indigo-300 underline">
            {t('loginToComment')}
          </Link>
        </p>
      )}
      <ul className="space-y-3">
        {items.map((c) => (
          <li key={c.id} className="border-t border-slate-800 pt-3 text-sm">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-semibold text-slate-200">
                {c.user.displayName}
              </span>
              <span className="text-xs text-slate-500">
                {new Date(c.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-slate-300">{c.body}</p>
          </li>
        ))}
      </ul>
      {cursor && (
        <button className="btn-ghost w-full" onClick={() => load(cursor)}>
          {t('loadMore')}
        </button>
      )}
    </div>
  );
}
