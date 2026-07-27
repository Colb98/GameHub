import { AIM_LIMIT, FLIP_COOLDOWN_MS } from '../sim/constants';
import { pegCharge } from '../sim/forces';
import { PegHash } from '../sim/hash';
import type { Charge, Peg } from '../sim/types';
import { clonePegs, createWorld, launch, step } from '../sim/world';
import type { LevelParams } from './curve';
import type { Layout } from './archetypes';
import { buildLayout } from './archetypes';
import type { Rng } from './rng';

/**
 * Sample shots per candidate layout. Measured: 300 samples x 20 attempts cost up to
 * 2s per level, far too long to sit between levels on the main thread. 144 angles
 * across the aim arc still sample every reachable line to under a peg width.
 */
const SAMPLES = 144;
/** Coarser than gameplay: this is a fairness estimate, not a replay. */
const VALIDATE_DT = 1 / 120;
const VALIDATE_MAX_S = 12;
const MAX_ATTEMPTS = 10;
const MIN_MEDIAN_S = 2.5;
const MAX_MEDIAN_S = 12;

export interface Report {
  successRate: number;
  medianDuration: number;
  /** Targets never hit by any sample shot. */
  unreachable: number;
  passed: boolean;
}

interface Sweep {
  hitPegs: Set<number>;
  hitTargets: Set<number>;
  successes: number;
  medianDuration: number;
  samples: number;
  /** True when the sweep bailed out early; its sets are incomplete. */
  aborted: boolean;
  fluxZones: Layout['fluxZones'];
}

/**
 * Runs one scripted shot headlessly. The flip policy is deliberately simple — a
 * competent player will do better, so passing this bar means the layout is at least
 * fair, not that it is easy.
 */
function simulateShot(
  pegs: readonly Peg[],
  params: LevelParams,
  angle: number,
  sweep: Sweep,
): { cleared: number; duration: number } {
  const world = createWorld(
    clonePegs(pegs),
    params.bipolarCycle,
    params.bucketW,
    params.forceK,
    sweep.fluxZones,
    params.autoFluxInterval,
    params.autoFluxStart,
  );
  const hash = new PegHash(world.pegs);
  launch(world, angle, params.autoFluxInterval === null ? 0 : params.autoFluxStart);

  let pips = params.maxPips;
  let nextFlipAt = 0;
  let cleared = 0;

  while (world.ball.active && world.t < VALIDATE_MAX_S) {
    step(world, VALIDATE_DT, hash);

    for (const event of world.events) {
      if (event.type !== 'peg' && event.type !== 'target') continue;
      pips = Math.min(params.maxPips, pips + 1);
      if (event.pegIndex !== undefined) sweep.hitPegs.add(event.pegIndex);
      if (event.type === 'target') {
        cleared += 1;
        if (event.pegIndex !== undefined) sweep.hitTargets.add(event.pegIndex);
      }
    }
    world.events.length = 0;

    if (
      params.autoFluxInterval === null &&
      world.activeFluxZone < 0 &&
      world.t * 1000 >= nextFlipAt &&
      pips > 0
    ) {
      const want = desiredCharge(world.pegs, world.t, params, world.ball.x, world.ball.y);
      if (want !== 0 && want !== world.ball.charge) {
        world.ball.charge = want;
        pips -= 1;
        nextFlipAt = world.t * 1000 + FLIP_COOLDOWN_MS;
      }
    }
    if (pips === 0) world.ball.charge = 0;
  }

  return { cleared, duration: world.t };
}

/** Charge that would attract the ball toward the nearest uncleared target. */
function desiredCharge(
  pegs: readonly Peg[],
  t: number,
  params: LevelParams,
  bx: number,
  by: number,
): Charge {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < pegs.length; i += 1) {
    const peg = pegs[i]!;
    if (!peg.target || peg.cleared) continue;
    const d = (peg.x - bx) ** 2 + (peg.y - by) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  if (best < 0) return 0;
  const q = pegCharge(pegs[best]!, t, params.bipolarCycle);
  if (q === 0) return 0;
  // Opposite sign attracts.
  return q > 0 ? -1 : 1;
}

/** Fans SAMPLES shots across the full aim arc and records what they touched. */
function runSweep(layout: Layout, params: LevelParams): Sweep {
  const sweep: Sweep = {
    hitPegs: new Set(),
    hitTargets: new Set(),
    successes: 0,
    medianDuration: 0,
    samples: SAMPLES,
    aborted: false,
    fluxZones: layout.fluxZones,
  };
  const durations: number[] = [];

  for (let i = 0; i < SAMPLES; i += 1) {
    const angle = -AIM_LIMIT + (i / (SAMPLES - 1)) * AIM_LIMIT * 2;
    const result = simulateShot(layout.pegs, params, angle, sweep);
    if (result.cleared > 0) sweep.successes += 1;
    durations.push(result.duration);

    // Abandon a hopeless candidate rather than paying for the full sweep.
    const remaining = SAMPLES - (i + 1);
    if ((sweep.successes + remaining) / SAMPLES < params.validationThreshold) {
      sweep.aborted = true;
      return sweep;
    }
  }

  durations.sort((a, b) => a - b);
  sweep.medianDuration = durations[Math.floor(durations.length / 2)] ?? 0;
  return sweep;
}

function judge(layout: Layout, sweep: Sweep, params: LevelParams): Report {
  const targetCount = layout.pegs.filter((peg) => peg.target).length;
  const unreachable = targetCount - sweep.hitTargets.size;
  const successRate = sweep.successes / sweep.samples;
  return {
    successRate,
    medianDuration: sweep.medianDuration,
    unreachable,
    passed:
      !sweep.aborted &&
      successRate >= params.validationThreshold &&
      unreachable === 0 &&
      sweep.medianDuration >= MIN_MEDIAN_S &&
      sweep.medianDuration <= MAX_MEDIAN_S,
  };
}

export function validate(layout: Layout, params: LevelParams): Report {
  return judge(layout, runSweep(layout, params), params);
}

/**
 * Moves target flags off pegs no sample shot could reach and onto pegs that were
 * actually hit. Repairing is far cheaper than rejecting: scattering 20 targets over
 * a dense field almost always strands one or two, and throwing away an otherwise
 * good layout for that was costing most of the generation budget.
 */
function repairUnreachable(layout: Layout, sweep: Sweep): boolean {
  const stranded = layout.pegs
    .map((peg, index) => ({ peg, index }))
    .filter(({ peg, index }) => peg.target && !sweep.hitTargets.has(index));
  if (stranded.length === 0) return false;

  const donors = layout.pegs
    .map((peg, index) => ({ peg, index }))
    .filter(({ peg, index }) => !peg.target && !peg.permanent && sweep.hitPegs.has(index));

  for (const { peg } of stranded) {
    const donor = donors.pop();
    peg.target = false;
    // If nothing reachable is left to promote, the level simply has fewer targets.
    if (donor) donor.peg.target = true;
  }
  return true;
}

export interface GeneratedLevel extends Layout {
  report: Report;
  attempts: number;
}

/**
 * Generate-and-test (plan §5.3), with a repair step. A level is never shipped with a
 * target the sample sweep could not reach.
 */
export function generateLevel(params: LevelParams, rng: Rng): GeneratedLevel {
  let fallback: GeneratedLevel | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const layout = buildLayout(params, rng);
    let sweep = runSweep(layout, params);

    if (!sweep.aborted && repairUnreachable(layout, sweep)) {
      sweep = runSweep(layout, params);
      // A repair can only ever strand a freshly promoted target; drop those outright.
      if (!sweep.aborted) repairUnreachableFinal(layout, sweep);
    }

    const report = judge(layout, sweep, params);
    if (report.passed) return { ...layout, report, attempts: attempt };
    if (
      report.unreachable === 0 &&
      !sweep.aborted &&
      (!fallback || report.successRate > fallback.report.successRate)
    ) {
      fallback = { ...layout, report, attempts: attempt };
    }
  }

  if (fallback) return fallback;

  // Last resort: take a layout and strip every target the sweep could not reach.
  const layout = buildLayout(params, rng);
  const sweep = runSweep(layout, params);
  repairUnreachableFinal(layout, sweep);
  return { ...layout, report: judge(layout, runSweep(layout, params), params), attempts: MAX_ATTEMPTS };
}

/** Unconditionally clears target flags the sweep never reached. */
function repairUnreachableFinal(layout: Layout, sweep: Sweep): void {
  layout.pegs.forEach((peg, index) => {
    if (peg.target && !sweep.hitTargets.has(index)) peg.target = false;
  });
}
