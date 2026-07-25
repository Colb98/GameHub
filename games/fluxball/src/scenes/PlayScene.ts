import Phaser from 'phaser';
import type { GameHubClient } from '@gamehub/sdk';
import { Synth } from '../audio';
import { levelParams, type LevelParams } from '../gen/curve';
import { levelSeed, mulberry32, readSeedParam } from '../gen/rng';
import { generateLevel, type GeneratedLevel } from '../gen/validate';
import { Background } from '../render/background';
import { FieldLines } from '../render/field';
import { HEX, chargeHex, chargeGlowHex } from '../render/palette';
import { TEX, createTextures } from '../render/textures';
import {
  AIM_LIMIT,
  BUCKET_H,
  BUCKET_Y,
  FIELD_BOTTOM,
  FIELD_LEFT,
  FIELD_RIGHT,
  FIELD_TOP,
  FLIP_COOLDOWN_MS,
  H,
  LAUNCH_X,
  LAUNCH_Y,
  MAX_FRAME_S,
  ORBIT_MULTIPLIER,
  SCORE_BUCKET,
  SCORE_PEG,
  SCORE_TARGET,
  SIM_DT,
  W,
} from '../sim/constants';
import { PegHash } from '../sim/hash';
import { pegCharge } from '../sim/forces';
import type { Charge, Peg, World } from '../sim/types';
import { clonePegs, createWorld, launch, step } from '../sim/world';

type State = 'intro' | 'aiming' | 'flight' | 'clearing' | 'over';

const FONT = '"Arial Narrow", "Segoe UI", sans-serif';
const MONO = '"Courier New", "Consolas", monospace';
const BUTTON_W = 216;
const BUTTON_H = 52;
const BUTTON_Y = H - 44;

interface PegView {
  glow: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
  ring?: Phaser.GameObjects.Image;
  baseScale: number;
}

export class PlayScene extends Phaser.Scene {
  private state: State = 'intro';
  private readonly synth: Synth;
  private readonly reducedMotion: boolean;

  private background!: Background;
  private field!: FieldLines;
  private world!: World;
  private hash!: PegHash;
  private params!: LevelParams;
  private pegViews: PegView[] = [];

  private runSeed = 0;
  private level = 1;
  private score = 0;
  private ballsLeft = 0;
  private pips = 0;
  private pegsCleared = 0;
  private startedAt = 0;

  private aim = 0;
  private lastCharge: Charge = -1;
  private nextFlipAt = 0;
  private accumulator = 0;
  private simDt = SIM_DT;
  private slowFrames = 0;
  private prevBall = { x: 0, y: 0 };
  private aimPath: { x: number; y: number }[] = [];

  private ballVisual!: Phaser.GameObjects.Container;
  private ballGlow!: Phaser.GameObjects.Image;
  private ballCore!: Phaser.GameObjects.Image;
  private ballGlyph!: Phaser.GameObjects.Text;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private bucketGfx!: Phaser.GameObjects.Graphics;
  private hudGfx!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private ballsText!: Phaser.GameObjects.Text;
  private button!: Phaser.GameObjects.Zone;
  private buttonBg!: Phaser.GameObjects.Graphics;
  private buttonLabel!: Phaser.GameObjects.Text;
  private overlay?: Phaser.GameObjects.Container;

  private keys?: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    f: Phaser.Input.Keyboard.Key;
    enter: Phaser.Input.Keyboard.Key;
  };

  constructor(private readonly gh: GameHubClient) {
    super('fluxball');
    this.synth = new Synth(() => this.gh.muted);
    this.reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  create() {
    // Phaser reuses the scene instance on a standalone restart.
    this.state = 'intro';
    this.score = 0;
    this.pegsCleared = 0;
    this.accumulator = 0;
    this.simDt = SIM_DT;
    this.slowFrames = 0;
    this.overlay = undefined;
    this.pegViews = [];

    this.runSeed = readSeedParam();
    this.level = readLevelParam();

    createTextures(this);
    this.background = new Background(this, this.reducedMotion);
    this.field = new FieldLines(this);
    this.createHud();
    this.createBall();
    this.createButton();
    this.createControls();

    this.loadLevel(this.level);
    this.createIntro();
  }

  // --- setup ---------------------------------------------------------------

  private createHud() {
    this.hudGfx = this.add.graphics().setDepth(99).setBlendMode(Phaser.BlendModes.ADD);
    this.hudGfx.lineStyle(7, HEX.posGlow, 0.08);
    this.hudGfx.lineBetween(FIELD_LEFT, 66, FIELD_RIGHT, 66);
    this.hudGfx.lineStyle(1, HEX.posCyan, 0.5);
    this.hudGfx.lineBetween(FIELD_LEFT, 66, FIELD_RIGHT, 66);

    this.scoreText = this.add
      .text(FIELD_LEFT + 4, 30, 'SCORE  0', {
        fontFamily: MONO,
        fontSize: '17px',
        color: '#f7fbff',
      })
      .setAlpha(0.92)
      .setDepth(100);
    this.levelText = this.add
      .text(W / 2, 31, 'DEPTH 01', { fontFamily: FONT, fontSize: '17px', color: '#2cf6ff' })
      .setOrigin(0.5)
      .setAlpha(0.88)
      .setDepth(100);
    this.ballsText = this.add
      .text(FIELD_RIGHT - 4, 31, '', { fontFamily: MONO, fontSize: '15px', color: '#f7fbff' })
      .setOrigin(1, 0.5)
      .setAlpha(0.78)
      .setDepth(100);

    this.aimGfx = this.add.graphics().setDepth(45);
    this.bucketGfx = this.add.graphics().setDepth(45);
  }

  private createBall() {
    this.ballGlow = this.add
      .image(0, 0, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(72, 72)
      .setAlpha(0.62);
    this.ballCore = this.add.image(0, 0, TEX.ball);
    this.ballGlyph = this.add
      .text(0, 0, '', { fontFamily: MONO, fontSize: '13px', color: '#02030a' })
      .setOrigin(0.5)
      .setAlpha(0.55);
    this.ballVisual = this.add
      .container(LAUNCH_X, LAUNCH_Y, [this.ballGlow, this.ballCore, this.ballGlyph])
      .setDepth(50);
    this.paintBall(0);
  }

  /**
   * The flip button. A Zone carries the hit area rather than an interactive Container:
   * container hit-testing silently never fires here (verified against a Zone at the
   * same coordinates), and a Zone also keeps the hit area independent of the visual.
   */
  private createButton() {
    this.buttonBg = this.add.graphics().setPosition(W / 2, BUTTON_Y).setDepth(100);
    this.buttonLabel = this.add
      .text(W / 2, BUTTON_Y, 'FLIP', { fontFamily: FONT, fontSize: '22px', color: '#05060f' })
      .setOrigin(0.5)
      .setDepth(101);
    this.button = this.add.zone(W / 2, BUTTON_Y, BUTTON_W, BUTTON_H).setInteractive();
    this.button.on('pointerdown', () => this.flip());
    this.paintButton();
  }

  private createControls() {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y < BUTTON_Y - BUTTON_H) this.aimAt(pointer.x, pointer.y);
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y >= BUTTON_Y - BUTTON_H) return;
      this.aimAt(pointer.x, pointer.y);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y >= BUTTON_Y - BUTTON_H) return;
      if (this.state === 'intro' || this.state === 'over') this.startRun();
      else this.fire();
    });

    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.keys = {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      space: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      f: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      enter: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
    };
    // Space is contextual: fire while aiming, flip in flight. F always flips.
    this.keys.space.on('down', () => {
      if (this.state === 'intro' || this.state === 'over') this.startRun();
      else if (this.state === 'flight') this.flip();
      else this.fire();
    });
    this.keys.f.on('down', () => this.flip());
    this.keys.enter.on('down', () => {
      if (this.state === 'intro' || this.state === 'over') this.startRun();
    });
  }

  // --- level lifecycle -----------------------------------------------------

  private loadLevel(level: number) {
    this.params = levelParams(level);
    const rng = mulberry32(levelSeed(this.runSeed, level));
    const generated = generateLevel(this.params, rng);
    this.buildLevel(generated);
    this.ballsLeft = this.params.balls;
    this.pips = this.params.maxPips;
    this.lastCharge = -1;
    this.levelText.setText(`DEPTH ${String(level).padStart(2, '0')}`);
    this.updateHud();
  }

  private buildLevel(generated: GeneratedLevel) {
    for (const view of this.pegViews) {
      view.glow.destroy();
      view.core.destroy();
      view.ring?.destroy();
    }
    this.pegViews = [];

    this.world = createWorld(
      generated.pegs,
      this.params.bipolarCycle,
      this.params.bucketW,
      this.params.forceK,
    );
    this.hash = new PegHash(this.world.pegs);

    for (const peg of this.world.pegs) {
      this.pegViews.push(this.createPegView(peg));
    }
    this.field.clearTrail();
    this.rebuildAimPath();
  }

  private createPegView(peg: Peg): PegView {
    const isAnchor = peg.kind === 'anchor';
    const isNeutral = peg.kind === 'neutral';
    const glowSize = (isAnchor ? 4.5 : 4.1) * peg.radius * 2;

    const glow = this.add
      .image(peg.x, peg.y, TEX.glow)
      .setDepth(10)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(glowSize, glowSize)
      .setAlpha(isNeutral ? 0.13 : isAnchor ? 0.62 : 0.72);

    const core = this.add
      .image(peg.x, peg.y, isAnchor ? TEX.anchor : TEX.core)
      .setDepth(30)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(peg.radius * 2 + 7, peg.radius * 2 + 7);

    if (!isAnchor) core.setTint(isNeutral ? HEX.pegDim : chargeHex(peg.sign));
    glow.setTint(
      isAnchor ? HEX.violet : isNeutral ? HEX.pegDim : chargeGlowHex(peg.sign),
    );

    let ring: Phaser.GameObjects.Image | undefined;
    if (peg.target) {
      ring = this.add
        .image(peg.x, peg.y, TEX.ring)
        .setDepth(32)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(peg.radius * 4.4, peg.radius * 4.4);
      glow.setDisplaySize(glowSize * 1.15, glowSize * 1.15);
    }

    return { glow, core, ring, baseScale: glow.scaleX };
  }

  private startRun() {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.score = 0;
    this.pegsCleared = 0;
    this.level = readLevelParam();
    this.runSeed = readSeedParam();
    this.startedAt = this.time.now;
    this.loadLevel(this.level);
    this.state = 'aiming';
    this.updateHud();
  }

  // --- input actions -------------------------------------------------------

  private aimAt(x: number, y: number) {
    const dx = x - LAUNCH_X;
    const dy = Math.max(24, y - LAUNCH_Y);
    const next = Phaser.Math.Clamp(Math.atan2(dx, dy), -AIM_LIMIT, AIM_LIMIT);
    if (Math.abs(next - this.aim) < 0.002) return;
    this.aim = next;
    this.rebuildAimPath();
  }

  /**
   * Uses the same world, fixed step, gravity, damping, peg collision, and wall
   * collision as the real shot. The preview therefore agrees with the neutral
   * opening trajectory until the player changes polarity.
   */
  private rebuildAimPath() {
    if (!this.world || !this.params) return;

    const pegs = clonePegs(this.world.pegs);
    const preview = createWorld(
      pegs,
      this.params.bipolarCycle,
      this.params.bucketW,
      this.params.forceK,
    );
    const previewHash = new PegHash(pegs);
    launch(preview, this.aim);

    this.aimPath = [{ x: LAUNCH_X, y: LAUNCH_Y }];
    const dt = this.simDt;
    const sampleEvery = Math.max(1, Math.round(1 / 45 / dt));
    const steps = Math.ceil(1.05 / dt);

    for (let i = 0; i < steps && preview.ball.active; i += 1) {
      step(preview, dt, previewHash);
      preview.events.length = 0;
      if (i % sampleEvery === 0 || !preview.ball.active) {
        this.aimPath.push({ x: preview.ball.x, y: preview.ball.y });
      }
    }
  }

  private fire() {
    if (this.state !== 'aiming') return;
    this.pips = this.params.maxPips;
    this.lastCharge = -1;
    this.nextFlipAt = 0;
    this.field.clearTrail();
    launch(this.world, this.aim);
    this.prevBall = { x: this.world.ball.x, y: this.world.ball.y };
    this.state = 'flight';
    this.synth.launch();
    this.paintBall(0);
    this.updateHud();
  }

  /**
   * The core verb. Toggles between + and -, costs one pip, and is gated by a cooldown
   * so the input stays readable. Difficulty never comes from making this fail.
   */
  private flip() {
    if (this.state !== 'flight' || !this.world.ball.active) return;
    if (this.pips <= 0 || this.time.now < this.nextFlipAt) return;

    const next: Charge = this.lastCharge === 1 ? -1 : 1;
    this.lastCharge = next;
    this.world.ball.charge = next;
    this.pips -= 1;
    this.nextFlipAt = this.time.now + FLIP_COOLDOWN_MS;
    this.synth.flip(next);
    this.paintBall(next);

    // Discrete, physical: a white flash and an elastic scale pop.
    this.tweens.killTweensOf(this.ballVisual);
    this.ballCore.setTint(HEX.neutral);
    this.ballGlow.setTint(HEX.neutral);
    this.ballVisual.setScale(1.24);
    this.tweens.add({
      targets: this.ballVisual,
      scaleX: 1,
      scaleY: 1,
      duration: 170,
      ease: 'Back.easeOut',
      onComplete: () => this.paintBall(this.world.ball.charge),
    });
    this.updateHud();
  }

  // --- frame ---------------------------------------------------------------

  update(_time: number, delta: number) {
    this.background.update(delta, this.world?.ball.charge ?? 0, Math.min(1, (this.level - 1) / 18));

    if (this.state === 'flight') {
      this.stepSimulation(delta);
    } else if (this.world) {
      // Keep the bucket sweeping while the player aims.
      step(this.world, Math.min(delta / 1000, MAX_FRAME_S), this.hash);
      this.world.events.length = 0;
    }

    this.drawPegs(delta);
    this.drawAim();
    this.drawBucket();
    this.field.draw(this.world, delta);
    this.paintButton();
  }

  private stepSimulation(delta: number) {
    // Adaptive: sustained slow frames drop the sim rate rather than the peg count.
    if (delta > 20) this.slowFrames += 1;
    else this.slowFrames = 0;
    if (this.slowFrames > 30 && this.simDt === SIM_DT) {
      this.simDt = SIM_DT * 2;
      this.slowFrames = 0;
    }

    this.accumulator += Math.min(delta / 1000, MAX_FRAME_S);
    this.prevBall = { x: this.world.ball.x, y: this.world.ball.y };

    let steps = 0;
    while (this.accumulator >= this.simDt && steps < 600) {
      step(this.world, this.simDt, this.hash);
      this.accumulator -= this.simDt;
      steps += 1;
      if (!this.world.ball.active) break;
    }

    this.drainEvents();

    const alpha = this.simDt > 0 ? Phaser.Math.Clamp(this.accumulator / this.simDt, 0, 1) : 0;
    const bx = Phaser.Math.Linear(this.prevBall.x, this.world.ball.x, alpha);
    const by = Phaser.Math.Linear(this.prevBall.y, this.world.ball.y, alpha);
    this.setBallPosition(bx, by);
    this.field.pushTrail(bx, by, this.world.ball.charge);
  }

  private drainEvents() {
    for (const event of this.world.events) {
      switch (event.type) {
        case 'peg':
        case 'target': {
          const multiplier = this.world.orbitArmed ? ORBIT_MULTIPLIER : 1;
          const base = event.type === 'target' ? SCORE_TARGET : SCORE_PEG;
          this.score += base * multiplier;
          this.pegsCleared += 1;
          this.world.orbitArmed = false;
          this.pips = Math.min(this.params.maxPips, this.pips + 1);
          if (event.pegIndex !== undefined) this.clearPegView(event.pegIndex);
          if (event.type === 'target') this.synth.target();
          else this.synth.peg(Math.min(12, this.pegsCleared % 12));
          this.bounceBallVisual(event.type === 'target' ? 1.18 : 1);
          this.impactBurst(
            event.x,
            event.y,
            event.type === 'target' ? HEX.amber : chargeHex(this.world.ball.charge),
            event.type === 'target' ? 9 : 5,
          );
          this.popScore(event.x, event.y, base * multiplier, multiplier > 1);
          break;
        }
        case 'wall':
          this.bounceBallVisual(0.72);
          this.impactBurst(event.x, event.y, chargeHex(this.world.ball.charge), 3);
          break;
        case 'orbit':
          this.popScore(event.x, event.y, 0, true, 'ORBIT x2');
          this.synth.tone(880, 0.18, 0.04, 220, 'triangle');
          break;
        case 'bucket':
          this.ballsLeft += 1;
          this.score += SCORE_BUCKET;
          this.synth.bucket();
          this.popScore(event.x, BUCKET_Y - 30, SCORE_BUCKET, true);
          this.endShot();
          break;
        case 'exit':
          this.endShot();
          break;
        default:
          break;
      }
    }
    this.world.events.length = 0;
    this.updateHud();
  }

  private clearPegView(index: number) {
    const view = this.pegViews[index];
    const peg = this.world.pegs[index];
    if (!view || !peg || peg.permanent) return;
    if (view.ring) {
      this.tweens.add({ targets: view.ring, alpha: 0, duration: 180 });
    }
    // Light leaving the field is the reward.
    this.tweens.add({
      targets: view.glow,
      scaleX: view.glow.scaleX * 2,
      scaleY: view.glow.scaleY * 2,
      alpha: 0,
      duration: 180,
    });
    this.tweens.add({
      targets: view.core,
      scaleX: view.core.scaleX * 1.7,
      scaleY: view.core.scaleY * 1.7,
      alpha: 0,
      duration: 180,
      ease: 'Cubic.easeOut',
      onComplete: () => view.core.setVisible(false),
    });
  }

  private endShot() {
    this.field.clearTrail();
    if (this.world.targetsLeft <= 0) {
      this.completeLevel();
      return;
    }
    this.ballsLeft -= 1;
    if (this.ballsLeft <= 0) {
      this.gameOver();
      return;
    }
    this.state = 'aiming';
    this.pips = this.params.maxPips;
    this.world.ball.x = LAUNCH_X;
    this.world.ball.y = LAUNCH_Y;
    this.world.ball.charge = 0;
    this.paintBall(0);
    this.setBallPosition(LAUNCH_X, LAUNCH_Y, true);
    this.rebuildAimPath();
    this.updateHud();
  }

  private completeLevel() {
    this.state = 'clearing';
    const bonus = 1000 * this.level * (this.ballsLeft + 1);
    this.score += bonus;
    this.synth.levelClear();
    this.popScore(W / 2, (FIELD_TOP + FIELD_BOTTOM) / 2, bonus, true, `LEVEL ${this.level} CLEAR`);
    this.updateHud();

    // Generation is synchronous; delaying it lets the clear burst start drawing first.
    this.time.delayedCall(220, () => {
      this.level += 1;
      this.loadLevel(this.level);
      this.state = 'aiming';
      this.setBallPosition(LAUNCH_X, LAUNCH_Y, true);
      this.paintBall(0);
    });
  }

  private gameOver() {
    this.state = 'over';
    this.synth.fail();
    this.gh.gameOver({
      score: this.score,
      durationMs: Math.max(0, Math.round(this.time.now - this.startedAt)),
      meta: { level: this.level, seed: this.runSeed, pegsCleared: this.pegsCleared },
    });
    this.showOverlay('FIELD COLLAPSED', [
      `Score ${this.score.toLocaleString('en-US')}`,
      `Reached level ${this.level}`,
      '',
      'Tap or press Space to run again',
    ]);
  }

  // --- drawing -------------------------------------------------------------

  private drawPegs(delta: number) {
    const t = this.world.t;
    const breathe = this.reducedMotion ? 0 : 0.08;
    const clock = this.time.now / 1000;

    for (let i = 0; i < this.pegViews.length; i += 1) {
      const peg = this.world.pegs[i]!;
      const view = this.pegViews[i]!;
      if (peg.cleared && !peg.permanent) continue;

      if (breathe > 0) {
        const pulse = 1 + Math.sin((clock / 2.5) * Math.PI * 2 + peg.phase) * breathe;
        view.glow.setScale(view.baseScale * pulse);
      }
      if (peg.kind === 'bipolar') {
        // Crossfade through white — the midpoint genuinely is neutral.
        const q = pegCharge(peg, t, this.world.bipolarCycle);
        view.core.setTint(chargeHex(q));
        view.glow.setTint(chargeGlowHex(q));
        view.glow.setAlpha(0.25 + Math.abs(q) * 0.35);
      }
      if (view.ring) view.ring.rotation += (delta / 3000) * Math.PI * 2;
    }
  }

  private drawAim() {
    this.aimGfx.clear();
    // Hollow launcher: a neon origin, not another ball/ammo indicator.
    this.aimGfx.lineStyle(10, HEX.posGlow, 0.09);
    this.aimGfx.strokeCircle(LAUNCH_X, LAUNCH_Y, 18);
    this.aimGfx.lineStyle(2, HEX.posCyan, 0.82);
    this.aimGfx.strokeCircle(LAUNCH_X, LAUNCH_Y, 15);
    if (this.state !== 'aiming') return;

    // Glow pass, followed by a crisp core pass. Both use the exact simulated path.
    for (let i = 1; i < this.aimPath.length; i += 1) {
      const from = this.aimPath[i - 1]!;
      const to = this.aimPath[i]!;
      const fade = 1 - i / this.aimPath.length;
      this.aimGfx.lineStyle(8, HEX.posGlow, 0.12 * fade);
      this.aimGfx.lineBetween(from.x, from.y, to.x, to.y);
    }
    for (let i = 1; i < this.aimPath.length; i += 1) {
      const from = this.aimPath[i - 1]!;
      const to = this.aimPath[i]!;
      const fade = 1 - i / this.aimPath.length;
      this.aimGfx.lineStyle(1.8, HEX.neutral, 0.82 * fade);
      this.aimGfx.lineBetween(from.x, from.y, to.x, to.y);
    }
  }

  private drawBucket() {
    this.bucketGfx.clear();
    const half = this.world.bucketW / 2;
    this.bucketGfx.lineStyle(2, HEX.mint, 0.55);
    this.bucketGfx.strokeRect(this.world.bucketX - half, BUCKET_Y, this.world.bucketW, BUCKET_H);
    this.bucketGfx.fillStyle(HEX.mint, 0.08);
    this.bucketGfx.fillRect(this.world.bucketX - half, BUCKET_Y, this.world.bucketW, BUCKET_H);
  }

  private paintBall(charge: number) {
    const color = chargeHex(charge);
    this.ballCore.setTint(color);
    this.ballGlow.setTint(color);
    this.ballGlow.setAlpha(charge === 0 ? 0.38 : 0.7);
    this.ballGlyph.setText(charge > 0 ? '+' : charge < 0 ? '−' : '○');
  }

  private paintButton() {
    const inFlight = this.state === 'flight';
    const hasFlux = this.pips > 0;
    const enabled = inFlight && hasFlux && this.time.now >= this.nextFlipAt;
    const next: Charge = this.lastCharge === 1 ? -1 : 1;
    const color = hasFlux ? chargeHex(next) : HEX.pegDim;

    this.buttonBg.clear();
    this.buttonBg.fillStyle(HEX.voidLift, 0.94);
    this.buttonBg.fillRoundedRect(-BUTTON_W / 2, -BUTTON_H / 2, BUTTON_W, BUTTON_H, 14);
    this.buttonBg.lineStyle(10, color, enabled ? 0.1 : 0.035);
    this.buttonBg.strokeRoundedRect(-BUTTON_W / 2, -BUTTON_H / 2, BUTTON_W, BUTTON_H, 14);
    this.buttonBg.lineStyle(2, color, enabled ? 1 : 0.38);
    this.buttonBg.strokeRoundedRect(-BUTTON_W / 2, -BUTTON_H / 2, BUTTON_W, BUTTON_H, 14);

    const label = !hasFlux
      ? 'FIELD NEUTRAL'
      : inFlight
        ? `FLIP ${next > 0 ? '+' : '−'}   ${this.pips} FLUX`
        : `FLIP   ${this.pips} FLUX`;
    this.buttonLabel
      .setText(label)
      .setColor(enabled ? (next > 0 ? '#2cf6ff' : '#ff3dcc') : '#7f8bb4');
    this.buttonBg.setAlpha(enabled ? 1 : 0.68);
  }

  private updateHud() {
    this.scoreText.setText(`SCORE  ${this.score.toLocaleString('en-US')}`);
    this.ballsText.setText(
      `${this.ballsLeft} SHOTS  ·  ${this.world?.targetsLeft ?? 0} TARGETS`,
    );
  }

  private setBallPosition(x: number, y: number, resetScale = false) {
    this.ballVisual.setPosition(x, y);
    if (resetScale) {
      this.tweens.killTweensOf(this.ballVisual);
      this.ballVisual.setScale(1);
    }
  }

  private bounceBallVisual(strength: number) {
    if (this.reducedMotion) return;
    this.tweens.killTweensOf(this.ballVisual);
    const mostlyVertical = Math.abs(this.world.ball.vy) >= Math.abs(this.world.ball.vx);
    const squash = 0.82 - strength * 0.04;
    const stretch = 1.14 + strength * 0.05;
    this.ballVisual.setScale(
      mostlyVertical ? stretch : squash,
      mostlyVertical ? squash : stretch,
    );
    this.tweens.add({
      targets: this.ballVisual,
      scaleX: 1,
      scaleY: 1,
      duration: 155,
      ease: 'Back.easeOut',
    });
  }

  private impactBurst(x: number, y: number, color: number, count: number) {
    if (this.reducedMotion) return;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + this.world.t * 0.7;
      const distance = 18 + (i % 3) * 7;
      const spark = this.add
        .image(x, y, TEX.spark)
        .setDepth(49)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(color)
        .setAlpha(0.9);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        scaleX: 0.15,
        scaleY: 0.15,
        alpha: 0,
        duration: 170 + (i % 3) * 35,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private popScore(x: number, y: number, value: number, bright: boolean, label?: string) {
    const text = this.add
      .text(x, y, label ?? `+${value}`, {
        fontFamily: FONT,
        fontSize: bright ? '20px' : '15px',
        color: bright ? '#63f4bd' : '#f2f5ff',
      })
      .setOrigin(0.5)
      .setDepth(90)
      .setAlpha(0.95);
    this.tweens.add({
      targets: text,
      y: y - (this.reducedMotion ? 12 : 34),
      alpha: 0,
      duration: this.reducedMotion ? 420 : 720,
      onComplete: () => text.destroy(),
    });
  }

  private createIntro() {
    this.showOverlay('FLUXBALL', [
      'Every peg carries a charge.',
      'Cyan pushes cyan. Cyan pulls magenta.',
      '',
      'Aim, drop the ball, then hit FLIP',
      'to steer it through the field.',
      'White means neutral — no flux, no pull.',
      '',
      'Clear every ringed peg to descend.',
      '',
      'Tap or press Space to begin',
    ]);
  }

  private showOverlay(title: string, lines: string[]) {
    this.overlay?.destroy();
    for (const view of this.pegViews) {
      view.glow.setVisible(false);
      view.core.setVisible(false);
      view.ring?.setVisible(false);
    }

    const panel = this.add.graphics();
    const height = FIELD_BOTTOM - FIELD_TOP;
    panel.fillStyle(HEX.void, 0.985);
    panel.fillRect(-W / 2, -height / 2, W, height);
    panel.fillStyle(HEX.posGlow, 0.035);
    panel.fillRect(-W / 2, -height / 2, W, 150);
    panel.lineStyle(8, HEX.posGlow, 0.08);
    panel.lineBetween(-W / 2, -height / 2, W / 2, -height / 2);
    panel.lineBetween(-W / 2, height / 2, W / 2, height / 2);
    panel.lineStyle(1, HEX.posCyan, 0.6);
    panel.lineBetween(-W / 2, -height / 2, W / 2, -height / 2);
    panel.lineBetween(-W / 2, height / 2, W / 2, height / 2);

    const halo = this.add
      .image(0, -118, TEX.glow)
      .setDisplaySize(500, 260)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(HEX.posGlow)
      .setAlpha(0.15);

    const heading = this.add
      .text(0, -126, title, { fontFamily: FONT, fontSize: '46px', color: '#2cf6ff' })
      .setOrigin(0.5)
      .setLetterSpacing(6)
      .setShadow(0, 2, '#02030a', 8, true, true);
    const body = this.add
      .text(0, 40, lines.join('\n'), {
        fontFamily: FONT,
        fontSize: '17px',
        color: '#f7fbff',
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5)
      .setAlpha(0.96)
      .setShadow(0, 2, '#02030a', 6, true, true);

    const centerY = (FIELD_TOP + FIELD_BOTTOM) / 2;
    this.overlay = this.add
      .container(W / 2, centerY, [panel, halo, heading, body])
      .setDepth(200)
      .setAlpha(this.reducedMotion ? 1 : 0);

    if (!this.reducedMotion) {
      this.overlay.y = centerY + 18;
      this.tweens.add({
        targets: this.overlay,
        y: centerY,
        alpha: 1,
        duration: 280,
        ease: 'Cubic.easeOut',
      });
    }
  }
}

function readLevelParam(): number {
  const raw = new URLSearchParams(window.location.search).get('level');
  if (!raw) return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
