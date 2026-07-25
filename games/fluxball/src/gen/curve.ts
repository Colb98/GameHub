import { FORCE_K } from '../sim/constants';

export type Archetype = 'lattice' | 'arcs' | 'funnel' | 'spiral' | 'islands' | 'chambers';

export interface LevelParams {
  level: number;
  pegs: number;
  targets: number;
  neutralRatio: number;
  bipolarRatio: number;
  anchors: number;
  balls: number;
  maxPips: number;
  bucketW: number;
  bipolarCycle: number;
  /** Magnet strength for this level; decays late so steering authority narrows. */
  forceK: number;
  archetypes: Archetype[];
  /**
   * How far targets are pushed out of the launcher's straight-drop cone.
   * 0 places them anywhere; 1 restricts them to the hardest-to-reach half.
   */
  targetBias: number;
  /** Fraction of sample shots that must clear a target for the layout to pass. */
  validationThreshold: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/** Difficulty curve from plan §6. Aggressive early, asymptotic late. */
export function levelParams(level: number): LevelParams {
  const t = Math.min(1, (level - 1) / 18);
  const archetypes: Archetype[] = ['lattice', 'arcs'];
  if (level >= 3) archetypes.push('funnel');
  if (level >= 5) archetypes.push('spiral');
  if (level >= 7) archetypes.push('islands');
  if (level >= 10) archetypes.push('chambers');

  return {
    level,
    // The plan asked for 140 at the top of the curve, but pegs must stay far enough
    // apart for the ball to physically pass between any two of them, and random fill
    // saturates this field around ~105. Asking for more just burns generation time.
    pegs: Math.round(lerp(60, 105, t)),
    targets: Math.round(lerp(6, 22, t)),
    neutralRatio: level <= 1 ? 0 : lerp(0.05, 0.25, t),
    bipolarRatio: level < 6 ? 0 : lerp(0.1, 0.25, (level - 6) / 13),
    anchors: level < 9 ? 0 : Math.min(4, 1 + Math.floor((level - 9) / 4)),
    balls: level >= 19 ? 3 : level >= 9 ? 4 : level >= 4 ? 5 : 6,
    maxPips: level >= 19 ? 4 : level >= 9 ? 5 : level >= 4 ? 6 : level >= 2 ? 7 : 8,
    bucketW: Math.round(lerp(140, 90, Math.max(0, (level - 13) / 6))),
    bipolarCycle: lerp(1, 0.6, Math.max(0, (level - 13) / 6)),
    // -2% per level past 10, floor at 70%.
    forceK: FORCE_K * Math.max(0.7, 1 - Math.max(0, level - 10) * 0.02),
    archetypes,
    targetBias: lerp(0.1, 1, t),
    validationThreshold: lerp(0.6, 0.45, t),
  };
}
