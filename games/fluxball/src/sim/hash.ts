import { FORCE_RADIUS } from './constants';
import type { Peg } from './types';

/**
 * Uniform-grid spatial hash over the peg field (plan §4). Cell size is the force
 * radius, so a 3x3 neighborhood query is guaranteed to cover every peg that could
 * influence the ball. Built once per level — pegs never move.
 */
export class PegHash {
  private readonly cells = new Map<number, number[]>();
  private readonly cell = FORCE_RADIUS;

  constructor(pegs: readonly Peg[]) {
    pegs.forEach((peg, index) => {
      const key = this.key(peg.x, peg.y);
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(index);
      else this.cells.set(key, [index]);
    });
  }

  private key(x: number, y: number): number {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    // Fits comfortably in a 32-bit int for our field size.
    return (cx + 512) * 4096 + (cy + 512);
  }

  /** Appends indices of pegs in the 3x3 neighborhood around (x, y) to `out`. */
  query(x: number, y: number, out: number[]): void {
    out.length = 0;
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = this.cells.get((cx + dx + 512) * 4096 + (cy + dy + 512));
        if (!bucket) continue;
        for (const index of bucket) out.push(index);
      }
    }
  }
}
