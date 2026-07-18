'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createGameHost, type GameOverPayload } from '@gamehub/sdk';
import { Link } from '@/i18n/routing';
import { api, ensureGuest, getGuest, GAMES_BASE_URL } from '@/lib/client-api';
import { coverGradient } from '@/lib/cover';
import type { GameDetail, SubmitScoreResult, UserProfile } from '@/lib/types';
import { Leaderboard } from './Leaderboard';
import { useToast } from './Toaster';

type Identity =
  | { kind: 'loading' }
  | { kind: 'need-name' }
  | { kind: 'user'; name: string }
  | { kind: 'guest'; name: string };

/** Frosted control button used on the player toolbar. */
function ToolButton({
  label,
  onClick,
  className = '',
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`cursor-pointer rounded-md border border-white/30 bg-white/15 px-2.5 py-1.5 text-xs text-white transition hover:bg-white/25 ${className}`}
    >
      {children}
    </button>
  );
}

export function PlayShell({ game }: { game: GameDetail }) {
  const t = useTranslations('play');
  const locale = useLocale();
  const showToast = useToast();
  const [identity, setIdentity] = useState<Identity>({ kind: 'loading' });
  const [session, setSession] = useState<{ sessionId: string; sessionToken: string } | null>(null);
  const [result, setResult] = useState<SubmitScoreResult | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const [rotateDismissed, setRotateDismissed] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [muted, setMuted] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const frameRef = useRef<HTMLDivElement | null>(null);
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
    setReady(false);
    setProgress(0);
    const s = await api<{ sessionId: string; sessionToken: string }>(
      `/games/${game.id}/sessions`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    setSession(s);
    setRunKey((k) => k + 1);
  }, [game.id]);

  // Rotate gate: landscape-only games on a portrait screen wait for a rotation
  // or an explicit "continue anyway" before loading (spec §12.3).
  const rotateGate =
    game.orientation === 'LANDSCAPE' && portrait && !rotateDismissed;

  // Start the first session once identity is known and the rotate gate is open
  useEffect(() => {
    if (
      (identity.kind === 'user' || identity.kind === 'guest') &&
      !session &&
      !rotateGate
    ) {
      startRun().catch(() => undefined);
    }
  }, [identity, session, startRun, rotateGate]);

  // Fake load progress that completes when the game reports ready
  useEffect(() => {
    if (!session || ready) return;
    const timer = setInterval(() => {
      setProgress((p) => Math.min(90, p + 4 + Math.random() * 8));
    }, 200);
    return () => clearInterval(timer);
  }, [session, runKey, ready]);

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
        muted,
      },
      onReady: () => {
        setProgress(100);
        setReady(true);
      },
      onGameOver,
    });
    return () => host.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- muted only applies to the next run
  }, [session, runKey, identity, locale, game.orientation, onGameOver]);

  async function submitName() {
    const name = nameDraft.trim();
    if (!name) return;
    const guest = await ensureGuest(name);
    setIdentity({ kind: 'guest', name: guest.name });
  }

  function toggleFullscreen() {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => showToast(t('fullscreenFailed')));
  }

  function toggleMute() {
    setMuted((m) => {
      showToast(m ? t('soundOn') : t('mutedNextRun'));
      return !m;
    });
  }

  if (!game.activeVersion) return null;
  const gameUrl = `${GAMES_BASE_URL}/${game.activeVersion.path}`;

  const frameSizing =
    game.orientation === 'PORTRAIT'
      ? 'mx-auto aspect-[9/16] w-full max-w-[420px]'
      : game.orientation === 'LANDSCAPE'
        ? 'mx-auto aspect-video w-full max-w-4xl'
        : 'mx-auto h-[70vh] w-full max-w-4xl';

  const isRecord =
    result != null &&
    result.personalBest != null &&
    result.score === result.personalBest;

  const boardPanel = (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-bold text-ink">{game.name}</span>
        <button
          onClick={() => setBoardOpen(false)}
          aria-label="Close"
          className="cursor-pointer text-base text-muted hover:text-ink"
        >
          ✕
        </button>
      </div>
      <Leaderboard gameId={game.id} refreshKey={refreshKey} compact />
      <div>
        <div className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">
          {t('controls')}
        </div>
        <div
          className="controls-prose"
          // Trusted content: authored by developers, sanitized/reviewed before publish
          dangerouslySetInnerHTML={{ __html: game.controlsHtml }}
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={frameRef}
        className="relative overflow-hidden rounded-2xl bg-player p-2.5 lg:p-4"
      >
        {/* Rotate prompt (landscape game, portrait screen) */}
        {rotateGate ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-5 text-center text-white">
            <div className="h-[30px] w-[50px] rotate-90 rounded-[5px] border-2 border-white" />
            <p className="text-[13px]">{t('rotate')}</p>
            <button
              onClick={() => setRotateDismissed(true)}
              className="mt-1.5 cursor-pointer rounded-lg border-[1.5px] border-white px-4 py-2 text-xs text-white transition hover:bg-white/10"
            >
              {t('continueAnyway')}
            </button>
            <Link
              href={`/games/${game.slug}`}
              className="mt-1 text-xs text-white/80 underline"
            >
              {t('backToGame')}
            </Link>
          </div>
        ) : (
          <div className={`relative ${frameSizing}`}>
            {session && identity.kind !== 'need-name' && (
              <iframe
                key={runKey}
                ref={iframeRef}
                src={gameUrl}
                sandbox="allow-scripts allow-same-origin allow-pointer-lock"
                className="absolute inset-0 h-full w-full rounded-xl bg-black"
                allow="autoplay; fullscreen"
                title={game.name}
              />
            )}

            {/* Loading overlay (prototype §12.4) */}
            {!ready && identity.kind !== 'need-name' && !result && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-player text-center text-white">
                <div
                  className="h-[90px] w-[90px] rounded-[14px] lg:h-[120px] lg:w-[120px]"
                  style={{ background: coverGradient(game.slug) }}
                />
                <div className="font-display text-base font-bold lg:text-lg">
                  {game.name}
                </div>
                <div className="h-1.5 w-[200px] overflow-hidden rounded bg-white/20">
                  <div
                    className="h-full bg-accent transition-[width] duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-xs opacity-70">
                  {t('loading')} {Math.round(progress)}%
                </div>
                <Link
                  href={`/games/${game.slug}`}
                  className="text-xs text-white/80 underline"
                >
                  {t('cancel')}
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Toolbar */}
        {!rotateGate && identity.kind !== 'need-name' && (
          <>
            <div className="absolute top-4 left-4 z-20 lg:top-6 lg:left-6">
              <Link
                href={`/games/${game.slug}`}
                className="rounded-md border border-white/30 bg-white/15 px-3 py-1.5 text-xs text-white transition hover:bg-white/25"
              >
                ← {t('back')}
              </Link>
            </div>
            <div className="absolute top-4 right-4 z-20 flex gap-1.5 rounded-[10px] bg-black/50 p-1.5 lg:top-6 lg:right-6">
              <ToolButton label={t('fullscreen')} onClick={toggleFullscreen}>
                ⤢
              </ToolButton>
              <ToolButton label={muted ? t('unmute') : t('mute')} onClick={toggleMute}>
                {muted ? '♪̶' : '♪'}
              </ToolButton>
              <ToolButton
                label={t('restart')}
                onClick={() => void startRun().catch(() => undefined)}
              >
                ↻
              </ToolButton>
              <ToolButton
                label={t('panel')}
                onClick={() => setBoardOpen((v) => !v)}
                className="hidden lg:block"
              >
                ☰
              </ToolButton>
            </div>
          </>
        )}

        {/* Who's playing? (guest name before first run) */}
        {identity.kind === 'need-name' && (
          <div className="flex min-h-[60vh] items-center justify-center p-5">
            <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-[0_20px_50px_rgba(0,0,0,.3)]">
              <h2 className="mb-2 font-display text-lg font-bold text-ink">
                {t('whoAreYou')}
              </h2>
              <p className="mb-3.5 text-xs text-muted">{t('guestHint')}</p>
              <input
                className="input mb-3 text-center"
                placeholder={t('namePlaceholder')}
                value={nameDraft}
                maxLength={40}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitName()}
                autoFocus
              />
              <button
                className="btn w-full"
                onClick={submitName}
                disabled={!nameDraft.trim()}
              >
                {t('letsGo')}
              </button>
              <Link
                href="/login"
                className="mt-3 block text-xs text-accent underline"
              >
                {t('orLogin')}
              </Link>
            </div>
          </div>
        )}

        {/* Game-over overlay (prototype §12.6) */}
        {result && (
          <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
            <div className="w-[340px] max-w-full rounded-[18px] bg-surface p-7 text-center shadow-[0_20px_50px_rgba(0,0,0,.3)]">
              <div className="mb-2.5 font-display text-2xl font-bold text-ink">
                {t('gameOver')}
              </div>
              {isRecord && (
                <div className="mb-2.5 inline-block rounded-full bg-accent px-3 py-1 text-[10px] font-bold text-white">
                  {t('newRecord')}
                </div>
              )}
              <div className="mb-1.5 font-display text-[42px] leading-none font-bold text-ink tabular-nums">
                {result.score.toLocaleString()}
              </div>
              <div className="mb-5 text-[13px] text-muted">
                {result.personalBest != null && (
                  <>
                    {t('personalBest')} {result.personalBest.toLocaleString()}
                  </>
                )}
                {result.personalBest != null && result.rank > 0 && ' · '}
                {result.rank > 0 && <>{t('yourRank')} #{result.rank}</>}
              </div>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => void startRun().catch(() => undefined)}
                  className="btn w-full !rounded-xl !py-3.5 !text-base shadow-[0_10px_22px_color-mix(in_oklch,var(--accent)_40%,transparent)]"
                >
                  ▶ {t('playAgain')}
                </button>
                <button
                  onClick={() => setBoardOpen(true)}
                  className="btn-ghost w-full"
                >
                  {t('viewLeaderboard')}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(window.location.href);
                        showToast(t('linkCopied'));
                      } catch {
                        /* clipboard unavailable */
                      }
                    }}
                    className="btn-ghost flex-1 !px-3 !py-2.5 text-xs"
                  >
                    {t('share')}
                  </button>
                  <Link
                    href={`/games/${game.slug}`}
                    className="btn-ghost flex-1 !px-3 !py-2.5 text-xs"
                  >
                    {t('backToGame')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Desktop leaderboard/controls side panel */}
        {boardOpen && (
          <div className="absolute inset-y-0 right-0 z-40 hidden w-[280px] bg-surface p-4 shadow-[-8px_0_24px_rgba(0,0,0,.2)] lg:block">
            {boardPanel}
          </div>
        )}
      </div>

      {/* Mobile: pull-up handle for leaderboard & controls */}
      {!rotateGate && identity.kind !== 'need-name' && (
        <button
          onClick={() => setBoardOpen(true)}
          className="cursor-pointer py-1 text-center text-[11px] text-muted lg:hidden"
        >
          ▲ {t('boardHandle')}
        </button>
      )}

      {/* Mobile bottom sheet */}
      {boardOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end bg-black/40 lg:hidden"
          onClick={() => setBoardOpen(false)}
        >
          <div
            className="max-h-[60%] w-full overflow-y-auto rounded-t-2xl bg-surface p-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2.5 h-1 w-8 rounded-full bg-line" />
            {boardPanel}
          </div>
        </div>
      )}

      {game.orientation === 'LANDSCAPE' && portrait && rotateDismissed && (
        <p className="rounded-lg border-[1.5px] border-line bg-chip p-2.5 text-center text-xs text-muted">
          📱↻ {t('rotate')}
        </p>
      )}
    </div>
  );
}
