'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/client-api';
import type { LeaderboardResponse } from '@/lib/types';

const PERIODS = ['all', 'weekly', 'daily'] as const;

export function Leaderboard({
  gameId,
  refreshKey = 0,
}: {
  gameId: string;
  refreshKey?: number;
}) {
  const t = useTranslations('game');
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('all');
  const [data, setData] = useState<LeaderboardResponse | null>(null);

  useEffect(() => {
    api<LeaderboardResponse>(`/games/${gameId}/leaderboard?period=${period}`)
      .then(setData)
      .catch(() => setData(null));
  }, [gameId, period, refreshKey]);

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-bold">🏆 {t('leaderboard')}</h3>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded px-2 py-1 text-xs ${
                period === p
                  ? 'bg-indigo-500 text-white'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              {t(`period.${p}`)}
            </button>
          ))}
        </div>
      </div>
      {!data || data.entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">{t('noScores')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="w-10 pb-2">{t('rank')}</th>
              <th className="pb-2">{t('player')}</th>
              <th className="pb-2 text-right">{t('score')}</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <tr
                key={`${e.rank}-${e.name}`}
                className={
                  e.isMe
                    ? 'rounded bg-indigo-500/15 font-bold text-indigo-200'
                    : 'text-slate-300'
                }
              >
                <td className="py-1.5">{medal(e.rank)}</td>
                <td className="py-1.5">
                  {e.name}
                  {e.isMe && (
                    <span className="ml-2 rounded bg-indigo-500 px-1.5 py-0.5 text-[10px] uppercase text-white">
                      {t('you')}
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {e.score.toLocaleString()}
                </td>
              </tr>
            ))}
            {data.me && (
              <tr className="border-t border-slate-800 bg-indigo-500/15 font-bold text-indigo-200">
                <td className="py-1.5">{data.me.rank}</td>
                <td className="py-1.5">
                  {data.me.name}
                  <span className="ml-2 rounded bg-indigo-500 px-1.5 py-0.5 text-[10px] uppercase text-white">
                    {t('you')}
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {data.me.score.toLocaleString()}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function medal(rank: number) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
}
