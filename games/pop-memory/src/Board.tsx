import { Bubble } from './Bubble';
import type { Failure, GamePhase } from './lib/machine';
import type { LevelTheme } from './lib/levels';

interface PressFeedback {
  index: number;
  token: number;
}

interface BoardProps {
  phase: GamePhase;
  litIndex: number | null;
  inputIndex: number;
  timeoutMs: number;
  timeWarning: boolean;
  failure: Failure | null;
  nextTheme: LevelTheme;
  pressFeedback: PressFeedback;
  onPress: (index: number) => void;
}

const ROWS = [
  [0, 1, 2],
  [3, 4, 5, 6],
  [7, 8, 9],
] as const;

// Center pair, inner verticals, upper/lower corners, then outer middle pair.
const RIPPLE_RANK = [2, 1, 2, 3, 0, 0, 3, 2, 1, 2] as const;

export function Board({
  phase,
  litIndex,
  inputIndex,
  timeoutMs,
  timeWarning,
  failure,
  nextTheme,
  pressFeedback,
  onPress,
}: BoardProps) {
  const interactive = phase === 'awaiting';
  const rippling = phase === 'levelUp';
  const frameClasses = [
    'board-frame',
    phase === 'fail' ? 'is-failing' : '',
    phase === 'gameOver' ? 'is-game-over' : '',
    rippling ? 'is-level-up' : '',
    timeWarning ? 'is-time-warning' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const rippleStyle = {
    '--ripple-fill': nextTheme.fillLit,
    '--ripple-glow-rgb': nextTheme.glowRgb,
  } as React.CSSProperties;

  return (
    <div
      className={frameClasses}
      data-interactive={interactive}
      style={rippleStyle}
      aria-label="Ten-bubble memory board"
    >
      {interactive && (
        <svg
          key={`timer-${inputIndex}`}
          className={`timer-ring ${timeWarning ? 'is-warning' : ''}`}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ '--timeout-ms': `${timeoutMs}ms` } as React.CSSProperties}
        >
          <rect
            className="timer-track"
            x="1.5"
            y="1.5"
            width="97"
            height="97"
            rx="10"
            pathLength="1"
          />
          <rect
            className="timer-progress"
            x="1.5"
            y="1.5"
            width="97"
            height="97"
            rx="10"
            pathLength="1"
          />
        </svg>
      )}

      <div className="board-grid">
        {ROWS.map((row, rowIndex) => (
          <div
            className={`bubble-row ${row.length === 3 ? 'is-three' : 'is-four'}`}
            key={rowIndex}
          >
            {row.map((index) => (
              <Bubble
                key={index}
                index={index}
                lit={litIndex === index}
                interactive={interactive}
                correctReveal={phase === 'fail' && failure?.expected === index}
                wrongPress={phase === 'fail' && failure?.pressed === index}
                rippling={rippling}
                rippleDelayMs={RIPPLE_RANK[index] * 105}
                pressed={pressFeedback.index === index}
                pressToken={pressFeedback.token}
                onPress={onPress}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
