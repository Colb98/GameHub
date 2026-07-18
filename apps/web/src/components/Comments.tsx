'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/client-api';
import { useToast } from './Toaster';
import type { CommentItem, UserProfile } from '@/lib/types';

export function Comments({ gameId }: { gameId: string }) {
  const t = useTranslations('game');
  const showToast = useToast();
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
      showToast(t('commentPosted'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3 className="mb-2.5 font-display text-[15px] font-semibold text-ink">
        {t('comments')}
      </h3>
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
        <p className="text-[13px] text-muted">
          <Link href="/login" className="font-semibold text-accent underline">
            {t('loginToComment')}
          </Link>
        </p>
      )}
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((c) => (
          <li key={c.id} className="flex gap-2.5 border-t border-line-soft pt-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line bg-chip text-xs font-bold text-ink">
              {c.user.displayName[0]?.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <div className="mb-0.5 flex items-baseline gap-2">
                <span className="font-bold text-ink">{c.user.displayName}</span>
                <span className="text-[11px] text-muted">
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-[13px] whitespace-pre-wrap text-body">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
      {cursor && (
        <button className="btn-outline mt-3 w-full" onClick={() => load(cursor)}>
          {t('loadMore')}
        </button>
      )}
    </div>
  );
}
