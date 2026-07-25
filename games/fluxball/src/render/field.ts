import Phaser from 'phaser';
import { FORCE_ACCEL_MAX } from '../sim/constants';
import { pegCharge } from '../sim/forces';
import type { World } from '../sim/types';
import { chargeHex } from './palette';

const DASH = 7;
const GAP = 6;
const TRAIL_LENGTH = 14;

interface TrailPoint {
  x: number;
  y: number;
  charge: number;
}

/**
 * The signature element (plan §3.5). Attraction versus repulsion is carried by dash
 * direction, not colour — colour is already spoken for by charge, and this is the one
 * piece of state it cannot express.
 */
export class FieldLines {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly trail: TrailPoint[] = [];
  private phase = 0;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(40).setBlendMode(Phaser.BlendModes.ADD);
  }

  pushTrail(x: number, y: number, charge: number): void {
    this.trail.push({ x, y, charge });
    if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
  }

  clearTrail(): void {
    this.trail.length = 0;
  }

  draw(world: World, delta: number): void {
    this.phase += delta / 1000;
    this.gfx.clear();
    this.drawTrail();
    if (!world.ball.active) return;

    for (const influence of world.influences) {
      const peg = world.pegs[influence.pegIndex];
      if (!peg || peg.cleared) continue;
      const alpha = Math.min(0.5, Math.max(0.05, Math.abs(influence.accel) / FORCE_ACCEL_MAX));
      const color = chargeHex(pegCharge(peg, world.t, world.bipolarCycle));
      // accel < 0 is attraction: dashes crawl toward the ball.
      this.dashedLine(peg.x, peg.y, world.ball.x, world.ball.y, color, alpha, influence.accel < 0);
    }
  }

  private dashedLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: number,
    alpha: number,
    toBall: boolean,
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const ux = dx / length;
    const uy = dy / length;
    const period = DASH + GAP;
    const drift = (this.phase * 46) % period;
    let start = toBall ? -drift : drift - period;

    this.gfx.lineStyle(1.5, color, alpha);
    while (start < length) {
      const a = Math.max(0, start);
      const b = Math.min(length, start + DASH);
      if (b > a) this.gfx.lineBetween(x0 + ux * a, y0 + uy * a, x0 + ux * b, y0 + uy * b);
      start += period;
    }
  }

  /** Functional, not decorative — this is how curvature is perceived, so it survives
   * reduced-motion mode. */
  private drawTrail(): void {
    for (let i = 0; i < this.trail.length; i += 1) {
      const point = this.trail[i]!;
      const t = i / TRAIL_LENGTH;
      this.gfx.lineStyle(1 + t * 4, chargeHex(point.charge), t * 0.5);
      const next = this.trail[i + 1];
      if (next) this.gfx.lineBetween(point.x, point.y, next.x, next.y);
    }
  }
}
