import Phaser from 'phaser';
import { FIELD_BOTTOM, FIELD_LEFT, FIELD_RIGHT, FIELD_TOP, H, W } from '../sim/constants';
import { HEX, chargeGlowHex, mixHex } from './palette';
import { TEX } from './textures';

const GRID = 48;
const DRIFT = 3;

/**
 * Dark, layered, slow. Never above ~12% luminance — if a player consciously notices
 * the grid, it is too bright (plan §3.6).
 */
export class Background {
  private readonly grid: Phaser.GameObjects.Graphics;
  private readonly vignette: Phaser.GameObjects.Image;
  private readonly walls: Phaser.GameObjects.Graphics;
  private offset = 0;
  private tint: number = HEX.pegDim;

  constructor(private readonly scene: Phaser.Scene, private readonly reducedMotion: boolean) {
    scene.add.rectangle(W / 2, H / 2, W, H, HEX.void).setDepth(-100);

    this.grid = scene.add.graphics().setDepth(-90);

    this.vignette = scene.add
      .image(W / 2, FIELD_TOP + (FIELD_BOTTOM - FIELD_TOP) * 0.42, TEX.glow)
      .setDepth(-80)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(W * 1.9, (FIELD_BOTTOM - FIELD_TOP) * 1.7)
      .setAlpha(0.16)
      .setTint(HEX.voidLift);

    this.walls = scene.add.graphics().setDepth(-70);
    this.drawWalls();
  }

  private drawWalls(): void {
    this.walls.clear();
    this.walls.lineStyle(2, HEX.wall, 0.85);
    this.walls.lineBetween(FIELD_LEFT, FIELD_TOP, FIELD_LEFT, FIELD_BOTTOM);
    this.walls.lineBetween(FIELD_RIGHT, FIELD_TOP, FIELD_RIGHT, FIELD_BOTTOM);
    this.walls.lineBetween(FIELD_LEFT, FIELD_TOP, FIELD_RIGHT, FIELD_TOP);
  }

  /** `depth` darkens the grid on deep levels, which reads as descent. */
  update(delta: number, ballCharge: number, depth: number): void {
    if (!this.reducedMotion) this.offset = (this.offset + (DRIFT * delta) / 1000) % GRID;

    const alpha = 0.5 * (1 - Math.min(0.6, depth));
    this.grid.clear();
    this.grid.lineStyle(1, HEX.grid, alpha);
    for (let x = FIELD_LEFT; x <= FIELD_RIGHT; x += GRID) {
      this.grid.lineBetween(x, FIELD_TOP, x, FIELD_BOTTOM);
    }
    for (let y = FIELD_TOP + this.offset; y <= FIELD_BOTTOM; y += GRID) {
      this.grid.lineBetween(FIELD_LEFT, y, FIELD_RIGHT, y);
    }

    // Subliminal state reinforcement: a few percent toward the ball's charge colour.
    const want = ballCharge === 0 ? HEX.voidLift : chargeGlowHex(ballCharge);
    this.tint = mixHex(this.tint, mixHex(HEX.voidLift, want, 0.5), 0.05);
    this.vignette.setTint(this.tint);
  }
}
