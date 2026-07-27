interface BubbleProps {
  index: number;
  lit: boolean;
  interactive: boolean;
  correctReveal: boolean;
  wrongPress: boolean;
  rippling: boolean;
  rippleDelayMs: number;
  pressed: boolean;
  pressToken: number;
  onPress: (index: number) => void;
}

export function Bubble({
  index,
  lit,
  interactive,
  correctReveal,
  wrongPress,
  rippling,
  rippleDelayMs,
  pressed,
  pressToken,
  onPress,
}: BubbleProps) {
  const faceKey = pressed ? `${index}-${pressToken}` : `${index}-rest`;
  const classes = [
    'bubble-face',
    lit ? 'is-lit' : '',
    correctReveal ? 'is-correct-reveal' : '',
    wrongPress ? 'is-wrong' : '',
    rippling ? 'is-rippling' : '',
    pressed ? 'is-pressed-feedback' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className="bubble"
      type="button"
      aria-label={`Bubble ${index + 1}`}
      disabled={!interactive}
      onClick={() => onPress(index)}
    >
      <span
        key={faceKey}
        className={classes}
        style={{ '--ripple-delay': `${rippleDelayMs}ms` } as React.CSSProperties}
        aria-hidden="true"
      />
      <span className="bubble-key" aria-hidden="true">
        {index === 9 ? '0' : index + 1}
      </span>
    </button>
  );
}
