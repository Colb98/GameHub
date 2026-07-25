import {
  FORCE_ACCEL_MAX,
  FORCE_RADIUS,
  FORCE_R_MIN,
  MAX_INFLUENCERS,
} from './constants';
import type { Influence, Peg, World } from './types';

/**
 * Charge of a peg at simulated time `t`. Bipolar pegs crossfade continuously rather
 * than snapping, so the player can anticipate the switch (plan §3.4) and the physics
 * stays smooth. The midpoint of the crossfade genuinely is neutral.
 */
export function pegCharge(peg: Peg, t: number, cycle: number): number {
  if (peg.cleared || peg.sign === 0) return 0;
  if (peg.kind !== 'bipolar') return peg.sign * peg.strength;
  return Math.cos((t / cycle) * Math.PI * 2 + peg.phase) * peg.strength;
}

const scratch: Influence[] = [];

/**
 * Accumulates magnetic acceleration on the ball from every peg within FORCE_RADIUS,
 * keeping only the MAX_INFLUENCERS strongest. Writes the surviving set to
 * `world.influences` for the field-line renderer, and returns the acceleration.
 *
 * `candidates` comes from the spatial hash; this function does not allocate.
 */
export function magneticAccel(
  world: World,
  candidates: readonly number[],
  out: { ax: number; ay: number },
): void {
  out.ax = 0;
  out.ay = 0;
  world.influences.length = 0;
  if (world.magnetDead || world.ball.charge === 0) return;

  scratch.length = 0;
  const { ball } = world;
  const r2Max = FORCE_RADIUS * FORCE_RADIUS;
  const rMin2 = FORCE_R_MIN * FORCE_R_MIN;

  for (const index of candidates) {
    const peg = world.pegs[index]!;
    if (peg.cleared) continue;
    const dx = ball.x - peg.x;
    const dy = ball.y - peg.y;
    const r2 = dx * dx + dy * dy;
    if (r2 > r2Max || r2 === 0) continue;
    const q = pegCharge(peg, world.t, world.bipolarCycle);
    if (q === 0) continue;
    // Positive => repulsion (same sign), negative => attraction.
    const accel = (world.forceK * ball.charge * q) / Math.max(r2, rMin2);
    scratch.push({ pegIndex: index, accel });
  }

  if (scratch.length > MAX_INFLUENCERS) {
    scratch.sort((a, b) => Math.abs(b.accel) - Math.abs(a.accel));
    scratch.length = MAX_INFLUENCERS;
  }

  for (const influence of scratch) {
    const peg = world.pegs[influence.pegIndex]!;
    const dx = ball.x - peg.x;
    const dy = ball.y - peg.y;
    const r = Math.sqrt(dx * dx + dy * dy) || 1;
    out.ax += (dx / r) * influence.accel;
    out.ay += (dy / r) * influence.accel;
    world.influences.push(influence);
  }

  // Clamp total magnetic acceleration: without this, dense clusters are unreadable.
  const mag = Math.hypot(out.ax, out.ay);
  if (mag > FORCE_ACCEL_MAX) {
    const scale = FORCE_ACCEL_MAX / mag;
    out.ax *= scale;
    out.ay *= scale;
  }
}
