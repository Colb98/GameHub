import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { GameHubClient } from '@gamehub/sdk';
import { Board } from './Board';
import { GameAudio } from './lib/audio';
import { levelConfig, levelTheme } from './lib/levels';
import { gameReducer, initialGameState } from './lib/machine';
import { createSequence, extendSequence } from './lib/sequence';
import { loadStats, saveStats } from './lib/storage';

interface AppProps {
  gameHub: GameHubClient;
}

type ThemeStyle = CSSProperties & Record<`--${string}`, string>;

const KEY_TO_BUBBLE: Readonly<Record<string, number>> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Digit6: 5,
  Digit7: 6,
  Digit8: 7,
  Digit9: 8,
  Digit0: 9,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
  Numpad5: 4,
  Numpad6: 5,
  Numpad7: 6,
  Numpad8: 7,
  Numpad9: 8,
  Numpad0: 9,
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

function themeStyle(level: number): ThemeStyle {
  const theme = levelTheme(level);
  return {
    '--fill': theme.fill,
    '--fill-lit': theme.fillLit,
    '--fill-muted': theme.fillMuted,
    '--glow': theme.glow,
    '--glow-rgb': theme.glowRgb,
    '--tray': theme.tray,
    '--shell': theme.shell,
  };
}

function statusCopy(
  phase: ReturnType<typeof initialGameState>['phase'],
  level: number,
  inputIndex: number,
  sequenceLength: number,
  failureReason?: 'wrong' | 'timeout',
): { title: string; detail: string } {
  switch (phase) {
    case 'idle':
      return { title: 'Ready when you are', detail: 'Watch the glow, then repeat it.' };
    case 'showing':
      return { title: 'Watch closely', detail: `${sequenceLength} pops to remember` };
    case 'awaiting':
      return {
        title: 'Your turn',
        detail: `Pop ${Math.min(inputIndex + 1, sequenceLength)} of ${sequenceLength}`,
      };
    case 'levelUp':
      return { title: `Level ${level} clear`, detail: 'A new color is waking up.' };
    case 'fail':
      return failureReason === 'timeout'
        ? { title: 'Time slipped away', detail: 'Here was the next pop.' }
        : { title: 'Almost', detail: 'Here was the next pop.' };
    case 'gameOver':
      return {
        title: 'Run complete',
        detail: `${Math.max(0, level - 1)} level${level === 2 ? '' : 's'} cleared`,
      };
  }
}

function ModeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 7h12M6 12h12M6 17h8" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v9M7.4 6.8a7 7 0 1 0 9.2 0" />
    </svg>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 10v4h3l4 3V7L8 10H5Z" />
      {muted ? (
        <path d="m16 9 4 6M20 9l-4 6" />
      ) : (
        <path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" />
      )}
    </svg>
  );
}

export function App({ gameHub }: AppProps) {
  const [state, dispatch] = useReducer(gameReducer, undefined, initialGameState);
  const [stats, setStats] = useState(loadStats);
  const [portalMuted, setPortalMuted] = useState(gameHub.muted);
  const [helpOpen, setHelpOpen] = useState(false);
  const [litIndex, setLitIndex] = useState<number | null>(null);
  const [pressFeedback, setPressFeedback] = useState({ index: -1, token: 0 });
  const [timeWarning, setTimeWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();
  const audioRef = useRef(new GameAudio());
  const timerRef = useRef<number | null>(null);
  const countdownFrameRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const reportedRunRef = useRef(false);
  const config = useMemo(
    () => levelConfig(state.level, reducedMotion),
    [state.level, reducedMotion],
  );
  const theme = levelTheme(state.level);
  const nextTheme = levelTheme(state.level + 1);
  const effectiveMuted = portalMuted || !stats.soundEnabled;
  const status = statusCopy(
    state.phase,
    state.level,
    state.inputIndex,
    state.sequence.length || config.sequenceLength,
    state.failure?.reason,
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearCountdownFrame = useCallback(() => {
    if (countdownFrameRef.current !== null) {
      window.cancelAnimationFrame(countdownFrameRef.current);
      countdownFrameRef.current = null;
    }
  }, []);

  const schedule = useCallback(
    (callback: () => void, delayMs: number) => {
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        callback();
      }, delayMs);
    },
    [clearTimer],
  );

  useEffect(
    () => () => {
      clearTimer();
      clearCountdownFrame();
    },
    [clearCountdownFrame, clearTimer],
  );

  useEffect(() => {
    gameHub.onMutedChange(setPortalMuted);
  }, [gameHub]);

  useEffect(() => {
    audioRef.current.setMuted(effectiveMuted);
  }, [effectiveMuted]);

  useEffect(() => {
    if (state.phase !== 'showing') return;
    let cancelled = false;
    let playbackIndex = 0;

    const showNext = () => {
      if (cancelled) return;
      if (playbackIndex >= state.sequence.length) {
        setLitIndex(null);
        dispatch({ type: 'PLAYBACK_FINISHED' });
        return;
      }

      const index = state.sequence[playbackIndex];
      setLitIndex(index);
      audioRef.current.playBubble(index);
      schedule(() => {
        setLitIndex(null);
        playbackIndex += 1;
        schedule(showNext, config.gapMs);
      }, config.flashMs);
    };

    schedule(showNext, reducedMotion ? 390 : 300);
    return () => {
      cancelled = true;
      clearTimer();
      setLitIndex(null);
    };
  }, [
    clearTimer,
    config.flashMs,
    config.gapMs,
    reducedMotion,
    schedule,
    state.phase,
    state.sequence,
  ]);

  useEffect(() => {
    clearCountdownFrame();
    setTimeWarning(false);
    setRemainingSeconds(null);
    if (state.phase !== 'awaiting') return;

    const deadline = performance.now() + config.timeoutMs;
    const updateCountdown = (now: number) => {
      const remainingMs = Math.max(0, deadline - now);
      if (remainingMs <= config.warningMs) {
        setTimeWarning(true);
        setRemainingSeconds(Math.max(1, Math.ceil(remainingMs / 1000)));
      }
      if (remainingMs > 0) {
        countdownFrameRef.current = window.requestAnimationFrame(updateCountdown);
      }
    };

    countdownFrameRef.current = window.requestAnimationFrame(updateCountdown);
    schedule(() => dispatch({ type: 'INPUT_TIMEOUT' }), config.timeoutMs);
    return () => {
      clearTimer();
      clearCountdownFrame();
    };
  }, [
    clearCountdownFrame,
    clearTimer,
    config.timeoutMs,
    config.warningMs,
    schedule,
    state.inputIndex,
    state.phase,
  ]);

  useEffect(() => {
    if (state.phase !== 'fail') return;
    audioRef.current.playFail();
    schedule(
      () => dispatch({ type: 'FAIL_FEEDBACK_FINISHED' }),
      reducedMotion ? 1050 : 1250,
    );
    return clearTimer;
  }, [clearTimer, reducedMotion, schedule, state.phase]);

  useEffect(() => {
    if (state.phase !== 'levelUp') return;
    const nextLevel = state.level + 1;
    const targetLength = levelConfig(nextLevel).sequenceLength;
    const nextSequence = extendSequence(state.sequence, targetLength);
    audioRef.current.playBubble(4);
    schedule(
      () => dispatch({ type: 'NEXT_LEVEL_READY', sequence: nextSequence }),
      reducedMotion ? 700 : 1100,
    );
    return clearTimer;
  }, [clearTimer, reducedMotion, schedule, state.level, state.phase, state.sequence]);

  useEffect(() => {
    if (state.phase !== 'gameOver' || reportedRunRef.current) return;
    reportedRunRef.current = true;
    const score = Math.max(0, state.level - 1);
    const nextStats = {
      ...stats,
      bestLevel: Math.max(stats.bestLevel, score),
      totalGames: stats.totalGames + 1,
    };
    setStats(nextStats);
    saveStats(nextStats);
    gameHub.gameOver({
      score,
      durationMs: Math.max(0, Math.round(performance.now() - startedAtRef.current)),
      meta: { levelReached: state.level, palette: theme.name },
    });
  }, [gameHub, state.level, state.phase, stats, theme.name]);

  const startRun = useCallback(() => {
    clearTimer();
    setHelpOpen(false);
    setLitIndex(null);
    setPressFeedback({ index: -1, token: 0 });
    setTimeWarning(false);
    setRemainingSeconds(null);
    reportedRunRef.current = false;
    startedAtRef.current = performance.now();
    if (!effectiveMuted) void audioRef.current.unlock();
    const sequence = createSequence(levelConfig(1, reducedMotion).sequenceLength);
    dispatch({
      type: state.phase === 'idle' ? 'START' : 'RESTART',
      sequence,
    });
  }, [clearTimer, effectiveMuted, reducedMotion, state.phase]);

  const handleBubblePress = useCallback(
    (index: number) => {
      if (state.phase !== 'awaiting') return;
      void audioRef.current.unlock();
      audioRef.current.playBubble(index);
      navigator.vibrate?.(12);
      setPressFeedback((current) => ({ index, token: current.token + 1 }));
      dispatch({ type: 'BUBBLE_PRESSED', index });
    },
    [state.phase],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const index = KEY_TO_BUBBLE[event.code];
      if (index === undefined) return;
      event.preventDefault();
      handleBubblePress(index);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleBubblePress]);

  const toggleSound = () => {
    if (portalMuted) return;
    const soundEnabled = !stats.soundEnabled;
    const nextStats = { ...stats, soundEnabled };
    setStats(nextStats);
    saveStats(nextStats);
    audioRef.current.setMuted(!soundEnabled);
    if (soundEnabled) {
      void audioRef.current.unlock().then(() => audioRef.current.playBubble(4));
    }
  };

  return (
    <main className={`game phase-${state.phase}`} style={themeStyle(state.level)}>
      <div className="ambient-glow" aria-hidden="true" />

      <header className="game-header">
        <div className="brand">
          <span className="brand-kicker">A little pattern game</span>
          <h1>Pop Memory</h1>
        </div>
        <dl className="run-stats" aria-label="Run statistics">
          <div>
            <dt>Level</dt>
            <dd>{String(state.level).padStart(2, '0')}</dd>
          </div>
          <div>
            <dt>Steps</dt>
            <dd>{String(config.sequenceLength).padStart(2, '0')}</dd>
          </div>
          <div>
            <dt>Best</dt>
            <dd>{String(stats.bestLevel).padStart(2, '0')}</dd>
          </div>
        </dl>
      </header>

      <section className="play-space" aria-labelledby="level-label">
        <div className="level-label" id="level-label">
          <span>{theme.name}</span>
          <span aria-hidden="true">·</span>
          <span>Level {state.level}</span>
        </div>

        <div className="toy-shell">
          <div className="toy-highlight" aria-hidden="true" />
          <nav className="toy-controls" aria-label="Toy controls">
            <div className="toy-control-group">
              <button
                className="toy-control"
                type="button"
                aria-label="How to play"
                aria-expanded={helpOpen}
                onClick={() => setHelpOpen((open) => !open)}
              >
                <ModeIcon />
              </button>
              <span className="toy-control-label" aria-hidden="true">
                Mode
              </span>
            </div>
            <div className="toy-control-group">
              <button
                className="toy-control is-power"
                type="button"
                aria-label={state.phase === 'idle' ? 'Start game' : 'Restart game'}
                onClick={startRun}
              >
                <PowerIcon />
              </button>
              <span className="toy-control-label" aria-hidden="true">
                {state.phase === 'idle' ? 'Start' : 'Restart'}
              </span>
            </div>
            <div className="toy-control-group">
              <button
                className="toy-control"
                type="button"
                aria-label={
                  portalMuted
                    ? 'Sound is muted by GameHub'
                    : stats.soundEnabled
                      ? 'Mute sound'
                      : 'Turn on sound'
                }
                aria-pressed={stats.soundEnabled && !portalMuted}
                disabled={portalMuted}
                onClick={toggleSound}
              >
                <SoundIcon muted={effectiveMuted} />
              </button>
              <span className="toy-control-label" aria-hidden="true">
                Sound
              </span>
            </div>
          </nav>

          <div className={`help-strip ${helpOpen ? 'is-open' : ''}`} aria-hidden={!helpOpen}>
            <span>Watch the glow.</span>
            <span>Repeat with taps or keys 1–9, 0.</span>
            <span>Each correct pop resets the timer.</span>
          </div>

          <Board
            phase={state.phase}
            litIndex={litIndex}
            inputIndex={state.inputIndex}
            timeoutMs={config.timeoutMs}
            timeWarning={timeWarning}
            failure={state.failure}
            nextTheme={nextTheme}
            pressFeedback={pressFeedback}
            onPress={handleBubblePress}
          />
        </div>

        <div className={`game-status ${timeWarning ? 'has-time-warning' : ''}`}>
          <div className="status-copy" aria-live="polite" aria-atomic="true">
            <strong>{status.title}</strong>
            <span>{status.detail}</span>
          </div>
          {timeWarning && remainingSeconds !== null && (
            <div
              className="countdown-warning"
              role="timer"
              aria-live="assertive"
              aria-atomic="true"
            >
              <span className="sr-only">
                {remainingSeconds} second{remainingSeconds === 1 ? '' : 's'} left
              </span>
              <strong aria-hidden="true">{remainingSeconds}</strong>
              <span aria-hidden="true">sec</span>
            </div>
          )}
        </div>

        {(state.phase === 'idle' || state.phase === 'gameOver') && (
          <button className="primary-action" type="button" onClick={startRun}>
            {state.phase === 'idle' ? 'Start pattern' : 'Play again'}
            <span aria-hidden="true">→</span>
          </button>
        )}
      </section>

      <footer className="game-footer">
        <span>Keys 1–9 + 0</span>
        <span>{stats.totalGames} run{stats.totalGames === 1 ? '' : 's'} played</span>
      </footer>
    </main>
  );
}
