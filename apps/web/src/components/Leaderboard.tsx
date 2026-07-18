'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/client-api';
import type { LeaderboardResponse } from '@/lib/types';

const PERIODS = ['daily', 'weekly', 'all'] as const;

/** Prototype leaderboard: pill period tabs + bordered row list with the
 *  current identity highlighted and pinned when outside the top list. */
export function Leaderboard({
  gameId,
  refreshKey = 0,
  compact = false,
}: {
  gameId: string;
  refreshKey?: number;
  compact?: boolean;
}) {
  const t = useTranslations('game');
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('daily');
  const [data, setData] = useState<LeaderboardResponse | null>(null);

  useEffect(() => {
    api<LeaderboardResponse>(`/games/${gameId}/leaderboard?period=${period}`)
      .then(setData)
      .catch(() => setData(null));
  }, [gameId, period, refreshKey]);

  const rowPad = compact ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5';

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        {!compact && (
          <h3 className="font-display text-[15px] font-semibold text-ink">
            {t('leaderboard')}
          </h3>
        )}
        <div className={`flex gap-1.5 ${compact ? '' : 'justify-end'}`}>
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`tab-pill ${
                period === p
                  ? 'bg-accent text-white'
                  : 'bg-chip text-ink hover:brightness-95'
              }`}
            >
              {t(`period.${p}`)}
            </button>
          ))}
        </div>
      </div>
      {!data || data.entries.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted">{t('noScores')}</p>
      ) : (
        <div
          className={`mt-2 overflow-hidden rounded-xl border-[1.5px] border-line ${
            compact ? 'text-xs' : 'text-[13px]'
          }`}
        >
          {data.entries.map((e) => (
            <div
              key={`${e.rank}-${e.name}`}
              className={`flex items-center gap-2.5 border-b border-line-soft last:border-b-0 ${rowPad} ${
                e.isMe ? 'row-me font-bold' : ''
              }`}
            >
              <span className="w-7 shrink-0 font-bold">#{e.rank}</span>
              <span className="flex-1 truncate">
                {e.name}
                {e.isMe && (
                  <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">
                    {t('you')}
                  </span>
                )}
              </span>
              <span className="font-bold tabular-nums">
                {e.score.toLocaleString()}
              </span>
            </div>
          ))}
          {data.me && (
            <div
              className={`row-me flex items-center gap-2.5 border-t-[1.5px] border-line font-bold ${rowPad}`}
            >
              <span className="w-7 shrink-0">#{data.me.rank}</span>
              <span className="flex-1 truncate">
                {data.me.name}
                <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">
                  {t('you')}
                </span>
              </span>
              <span className="tabular-nums">{data.me.score.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
