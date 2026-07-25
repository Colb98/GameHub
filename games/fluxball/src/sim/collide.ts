import { FIELD_LEFT, FIELD_RIGHT, FIELD_TOP, RESTITUTION } from './constants';
import type { Ball, Peg } from './types';

/** Reflects `ball` off the unit normal (nx, ny) and applies restitution. */
export function reflect(ball: Ball, nx: number, ny: number): void {
  const dot = ball.vx * nx + ball.vy * ny;
  ball.vx = (ball.vx - 2 * dot * nx) * RESTITUTION;
  ball.vy = (ball.vy - 2 * dot * ny) * RESTITUTION;
}

/**
 * Circle-circle test against a peg. Reflects and de-penetrates on contact so the
 * ball never sticks. Returns true when the peg was hit.
 */
export function hitPeg(ball: Ball, peg: Peg): boolean {
  const dx = ball.x - peg.x;
  const dy = ball.y - peg.y;
  const sum = ball.radius + peg.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 > sum * sum) return false;
  const d = Math.sqrt(d2) || 0.0001;
  const nx = dx / d;
  const ny = dy / d;
  // Push out of the peg before reflecting, otherwise fast balls tunnel-stick.
  ball.x = peg.x + nx * sum;
  ball.y = peg.y + ny * sum;
  reflect(ball, nx, ny);
  return true;
}

/** Side and ceiling walls. Returns true when a wall was hit. */
export function hitWalls(ball: Ball): boolean {
  let hit = false;
  if (ball.x - ball.radius < FIELD_LEFT) {
    ball.x = FIELD_LEFT + ball.radius;
    reflect(ball, 1, 0);
    hit = true;
  } else if (ball.x + ball.radius > FIELD_RIGHT) {
    ball.x = FIELD_RIGHT - ball.radius;
    reflect(ball, -1, 0);
    hit = true;
  }
  if (ball.y - ball.radius < FIELD_TOP) {
    ball.y = FIELD_TOP + ball.radius;
    reflect(ball, 0, 1);
    hit = true;
  }
  return hit;
}
