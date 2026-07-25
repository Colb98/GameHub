import {
  BALL_RADIUS,
  BUCKET_Y,
  DAMPING,
  FIELD_BOTTOM,
  FIELD_LEFT,
  FIELD_RIGHT,
  GRAVITY,
  LAUNCH_SPEED,
  LAUNCH_X,
  LAUNCH_Y,
  SHOT_HARD_TIMEOUT_S,
  SHOT_MAGNET_TIMEOUT_S,
} from './constants';
import { hitPeg, hitWalls } from './collide';
import { magneticAccel } from './forces';
import { PegHash } from './hash';
import type { Ball, Charge, Peg, World } from './types';

export function createWorld(
  pegs: Peg[],
  bipolarCycle: number,
  bucketW: number,
  forceK: number,
): World {
  return {
    pegs,
    ball: makeBall(),
    t: 0,
    bipolarCycle,
    forceK,
    bucketX: (FIELD_LEFT + FIELD_RIGHT) / 2,
    bucketVx: 150,
    bucketW,
    events: [],
    influences: [],
    magnetDead: false,
    targetsLeft: pegs.filter((peg) => peg.target).length,
    orbitAngle: 0,
    orbitPeg: -1,
    orbitLastAngle: 0,
    orbitArmed: false,
  };
}

function makeBall(): Ball {
  return {
    x: LAUNCH_X,
    y: LAUNCH_Y,
    vx: 0,
    vy: 0,
    // The ball launches neutral, so the opening of every shot is pure ballistics.
    charge: 0,
    radius: BALL_RADIUS,
    active: false,
  };
}

/** `angle` is measured from straight down, positive to the right. */
export function launch(world: World, angle: number): void {
  const ball = world.ball;
  ball.x = LAUNCH_X;
  ball.y = LAUNCH_Y;
  ball.vx = Math.sin(angle) * LAUNCH_SPEED;
  ball.vy = Math.cos(angle) * LAUNCH_SPEED;
  ball.charge = 0;
  ball.active = true;
  world.t = 0;
  world.magnetDead = false;
  world.orbitAngle = 0;
  world.orbitPeg = -1;
  world.orbitArmed = false;
}

export function setCharge(world: World, charge: Charge): void {
  world.ball.charge = charge;
}

const accel = { ax: 0, ay: 0 };
const candidates: number[] = [];

/**
 * Advances the world by one fixed sub-step. Pure: no rendering, no wall-clock reads,
 * no Math.random. Events land in `world.events` for the caller to drain.
 */
export function step(world: World, dt: number, hash: PegHash): void {
  const ball = world.ball;
  if (!ball.active) {
    stepBucket(world, dt);
    return;
  }

  world.t += dt;
  if (!world.magnetDead && world.t > SHOT_MAGNET_TIMEOUT_S) {
    world.magnetDead = true;
    world.events.push({ type: 'timeout', x: ball.x, y: ball.y });
  }

  hash.query(ball.x, ball.y, candidates);
  magneticAccel(world, candidates, accel);

  ball.vx += accel.ax * dt;
  ball.vy += (accel.ay + GRAVITY) * dt;
  ball.vx *= DAMPING;
  ball.vy *= DAMPING;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  trackOrbit(world);

  let touched = false;
  for (const index of candidates) {
    const peg = world.pegs[index]!;
    if (peg.cleared) continue;
    if (!hitPeg(ball, peg)) continue;
    touched = true;
    if (peg.permanent) {
      world.events.push({ type: 'peg', x: peg.x, y: peg.y, pegIndex: index });
      continue;
    }
    peg.cleared = true;
    if (peg.target) {
      world.targetsLeft -= 1;
      world.events.push({ type: 'target', x: peg.x, y: peg.y, pegIndex: index });
    } else {
      world.events.push({ type: 'peg', x: peg.x, y: peg.y, pegIndex: index });
    }
  }
  if (touched) {
    world.orbitPeg = -1;
    world.orbitAngle = 0;
  }

  if (hitWalls(ball)) world.events.push({ type: 'wall', x: ball.x, y: ball.y });

  if (world.t > SHOT_HARD_TIMEOUT_S) {
    ball.active = false;
    world.events.push({ type: 'exit', x: ball.x, y: ball.y });
  } else if (ball.y - ball.radius > FIELD_BOTTOM) {
    ball.active = false;
    const caught =
      Math.abs(ball.x - world.bucketX) < world.bucketW / 2 && ball.y < BUCKET_Y + 80;
    world.events.push({ type: caught ? 'bucket' : 'exit', x: ball.x, y: ball.y });
  }

  stepBucket(world, dt);
}

function stepBucket(world: World, dt: number): void {
  world.bucketX += world.bucketVx * dt;
  const half = world.bucketW / 2;
  if (world.bucketX - half < FIELD_LEFT) {
    world.bucketX = FIELD_LEFT + half;
    world.bucketVx = Math.abs(world.bucketVx);
  } else if (world.bucketX + half > FIELD_RIGHT) {
    world.bucketX = FIELD_RIGHT - half;
    world.bucketVx = -Math.abs(world.bucketVx);
  }
}

/**
 * Accumulates turn around the peg currently exerting the most force. A full 360deg
 * without touching anything arms the orbit multiplier (plan §2.5).
 */
function trackOrbit(world: World): void {
  const strongest = world.influences[0];
  if (!strongest) {
    world.orbitPeg = -1;
    world.orbitAngle = 0;
    return;
  }
  const peg = world.pegs[strongest.pegIndex]!;
  const angle = Math.atan2(world.ball.y - peg.y, world.ball.x - peg.x);
  if (strongest.pegIndex !== world.orbitPeg) {
    world.orbitPeg = strongest.pegIndex;
    world.orbitAngle = 0;
    world.orbitLastAngle = angle;
    return;
  }
  let delta = angle - world.orbitLastAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  world.orbitLastAngle = angle;
  world.orbitAngle += delta;
  if (Math.abs(world.orbitAngle) >= Math.PI * 2 && !world.orbitArmed) {
    world.orbitArmed = true;
    world.orbitAngle = 0;
    world.events.push({ type: 'orbit', x: world.ball.x, y: world.ball.y });
  }
}

export function clonePegs(pegs: readonly Peg[]): Peg[] {
  return pegs.map((peg) => ({ ...peg }));
}
