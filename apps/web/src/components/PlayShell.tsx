'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createGameHost, type GameOverPayload } from '@gamehub/sdk';
import { Link } from '@/i18n/routing';
import { api, ensureGuest, getGuest, GAMES_BASE_URL } from '@/lib/client-api';
import type { GameDetail, SubmitScoreResult, UserProfile } from '@/lib/types';
import { Leaderboard } from './Leaderboard';

type Identity =
  | { kind: 'loading' }
  | { kind: 'need-name' }
  | { kind: 'user'; name: string }
  | { kind: 'guest'; name: string };

export function PlayShell({ game }: { game: GameDetail }) {
  const t = useTranslations('play');
  const locale = useLocale();
  const [identity, setIdentity] = useState<Identity>({ kind: 'loading' });
  const [session, setSession] = useState<{ sessionId: string; sessionToken: string } | null>(null);
  const [result, setResult] = useState<SubmitScoreResult | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Resolve who is playing: account -> stored guest -> ask for a name
  useEffect(() => {
    api<UserProfile>('/me')
      .then((u) => setIdentity({ kind: 'user', name: u.displayName }))
      .catch(() => {
        const guest = getGuest();
        setIdentity(
          guest ? { kind: 'guest', name: guest.name } : { kind: 'need-name' },
        );
      });
  }, []);

  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const startRun = useCallback(async () => {
    setResult(null);
    const s = await api<{ sessionId: string; sessionToken: string }>(
      `/games/${game.id}/sessions`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    setSession(s);
    setRunKey((k) => k + 1);
  }, [game.id]);

  // Start the first session once identity is known
  useEffect(() => {
    if ((identity.kind === 'user' || identity.kind === 'guest') && !session) {
      startRun().catch(() => undefined);
    }
  }, [identity, session, startRun]);

  const onGameOver = useCallback(
    async (payload: GameOverPayload) => {
      const s = sessionRef.current;
      if (!s) return;
      try {
        const res = await api<SubmitScoreResult>(`/sessions/${s.sessionId}/score`, {
          method: 'POST',
          headers: { 'x-session-token': s.sessionToken },
          body: JSON.stringify({
            score: Math.round(payload.score),
            durationMs: Math.round(payload.durationMs),
          }),
        });
        setResult(res);
        setRefreshKey((k) => k + 1);
      } catch {
        // Score rejected (anti-cheat or expired session): still show the overlay
        setResult({
          scoreId: '',
          score: Math.round(payload.score),
          name: identity.kind === 'user' || identity.kind === 'guest' ? identity.name : '',
          rank: 0,
          personalBest: null,
        });
      }
    },
    [identity],
  );

  // Wire the postMessage bridge to the current iframe/run
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !session || identity.kind === 'loading' || identity.kind === 'need-name') {
      return;
    }
    const host = createGameHost(iframe, {
      gameOrigin: new URL(GAMES_BASE_URL).origin,
      init: {
        locale,
        player: { name: identity.name },
        orientation: game.orientation,
        muted: false,
      },
      onGameOver,
    });
    return () => host.dispose();
  }, [session, runKey, identity, locale, game.orientation, onGameOver]);

  async function submitName() {
    const name = nameDraft.trim();
    if (!name) return;
    const guest = await ensureGuest(name);
    setIdentity({ kind: 'guest', name: guest.name });
  }

  if (!game.activeVersion) return null;
  const gameUrl = `${GAMES_BASE_URL}/${game.activeVersion.path}`;

  const frameSizing =
    game.orientation === 'PORTRAIT'
      ? 'mx-auto aspect-[9/16] w-full max-w-[420px]'
      : game.orientation === 'LANDSCAPE'
        ? 'mx-auto aspect-video w-full max-w-4xl'
        : 'mx-auto h-[75vh] w-full max-w-4xl';

  return (
    <div className="space-y-4">
      <div className={`relative overflow-hidden rounded-xl border border-slate-800 bg-black ${frameSizing}`}>
        {identity.kind === 'need-name' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/95 p-6">
            <div className="w-full max-w-sm space-y-4 text-center">
              <h2 className="text-2xl font-black">{t('whoAreYou')}</h2>
              <p className="text-sm text-slate-400">{t('guestHint')}</p>
              <input
                className="input text-center"
                placeholder={t('namePlaceholder')}
                value={nameDraft}
                maxLength={40}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitName()}
                autoFocus
              />
              <button className="btn w-full" onClick={submitName} disabled={!nameDraft.trim()}>
                {t('letsGo')}
              </button>
              <Link href="/login" className="block text-xs text-indigo-300 underline">
                {t('orLogin')}
              </Link>
            </div>
          </div>
        )}

        {session && identity.kind !== 'need-name' ? (
          <iframe
            key={runKey}
            ref={iframeRef}
            src={gameUrl}
            sandbox="allow-scripts allow-same-origin allow-pointer-lock"
            className="absolute inset-0 h-full w-full"
            allow="autoplay; fullscreen"
            title={game.name}
          />
        ) : (
          identity.kind !== 'need-name' && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
              {t('loading')}
            </div>
          )
        )}

        {result && (
          <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-slate-950/95 p-6">
            <div className="w-full max-w-md space-y-4">
              <div className="text-center">
                <h2 className="text-3xl font-black">{t('gameOver')}</h2>
                <p className="mt-2 text-5xl font-black text-indigo-300 tabular-nums">
                  {result.score.toLocaleString()}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {result.rank > 0 && (
                    <>
                      {t('yourRank')}: <b className="text-slate-200">#{result.rank}</b>
                      {' · '}
                    </>
                  )}
                  {result.personalBest != null && (
                    <>
                      {t('personalBest')}:{' '}
                      <b className="text-slate-200">
                        {result.personalBest.toLocaleString()}
                      </b>
                    </>
                  )}
                </p>
              </div>
              <Leaderboard gameId={game.id} refreshKey={refreshKey} />
              <div className="flex gap-2">
                <button className="btn flex-1" onClick={() => startRun()}>
                  ↻ {t('playAgain')}
                </button>
                <Link href={`/games/${game.slug}`} className="btn-ghost flex-1">
                  {t('backToGame')}
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {game.orientation === 'LANDSCAPE' && portrait && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-center text-sm text-amber-300">
          📱↻ {t('rotate')}
        </p>
      )}
    </div>
  );
}
