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
import { createWorld, launch, step } from '../sim/world';

type State = 'intro' | 'aiming' | 'flight' | 'clearing' | 'over';

const FONT = '"Courier New", "Consolas", monospace';
const BUTTON_W = 216;
const BUTTON_H = 52;
const BUTTON_Y = H - 44;
const PIP_Y = 136;

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

  private ballGlow!: Phaser.GameObjects.Image;
  private ballCore!: Phaser.GameObjects.Image;
  private ballGlyph!: Phaser.GameObjects.Text;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private bucketGfx!: Phaser.GameObjects.Graphics;
  private pipGfx!: Phaser.GameObjects.Graphics;
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
    this.scoreText = this.add
      .text(FIELD_LEFT + 4, 24, '0', { fontFamily: FONT, fontSize: '26px', color: '#f2f5ff' })
      .setAlpha(0.85)
      .setDepth(100);
    this.levelText = this.add
      .text(W / 2, 26, 'LEVEL 1', { fontFamily: FONT, fontSize: '18px', color: '#f2f5ff' })
      .setOrigin(0.5)
      .setAlpha(0.6)
      .setDepth(100);
    this.ballsText = this.add
      .text(FIELD_RIGHT - 4, 26, '', { fontFamily: FONT, fontSize: '18px', color: '#f2f5ff' })
      .setOrigin(1, 0.5)
      .setAlpha(0.6)
      .setDepth(100);

    this.aimGfx = this.add.graphics().setDepth(45);
    this.bucketGfx = this.add.graphics().setDepth(45);
    this.pipGfx = this.add.graphics().setDepth(100);
  }

  private createBall() {
    this.ballGlow = this.add
      .image(LAUNCH_X, LAUNCH_Y, TEX.glow)
      .setDepth(48)
      .setBlendMode(Phaser.BlendModes.ADD)
      // Glow radius 1.4x the ball: present, but never blooming into the field.
      .setDisplaySize(56, 56)
      .setAlpha(0.5);
    this.ballCore = this.add.image(LAUNCH_X, LAUNCH_Y, TEX.ball).setDepth(50);
    this.ballGlyph = this.add
      .text(LAUNCH_X, LAUNCH_Y, '', { fontFamily: FONT, fontSize: '13px', color: '#05060f' })
      .setOrigin(0.5)
      .setDepth(51)
      .setAlpha(0.4);
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
    this.levelText.setText(`LEVEL ${level}`);
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
  }

  private createPegView(peg: Peg): PegView {
    const isAnchor = peg.kind === 'anchor';
    const isNeutral = peg.kind === 'neutral';
    const glowSize = (isAnchor ? 3.6 : 3.4) * peg.radius * 2;

    const glow = this.add
      .image(peg.x, peg.y, TEX.glow)
      .setDepth(10)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(glowSize, glowSize)
      // Neutral pegs get no glow at all: the absence of light is the signal.
      .setAlpha(isNeutral ? 0 : 0.55);

    const core = this.add
      .image(peg.x, peg.y, isAnchor ? TEX.anchor : TEX.core)
      .setDepth(30)
      .setDisplaySize(peg.radius * 2 + 4, peg.radius * 2 + 4);

    if (!isAnchor) core.setTint(isNeutral ? HEX.pegDim : chargeHex(peg.sign));
    if (!isNeutral && !isAnchor) glow.setTint(chargeGlowHex(peg.sign));

    let ring: Phaser.GameObjects.Image | undefined;
    if (peg.target) {
      ring = this.add
        .image(peg.x, peg.y, TEX.ring)
        .setDepth(32)
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
    this.aim = Phaser.Math.Clamp(Math.atan2(dx, dy), -AIM_LIMIT, AIM_LIMIT);
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

    // Discrete, physical: a white flash and a scale pop over 120ms.
    this.ballCore.setTint(HEX.neutral);
    this.tweens.add({
      targets: [this.ballCore, this.ballGlow],
      scaleX: { from: this.ballCore.scaleX * 1.25, to: this.ballCore.scaleX },
      scaleY: { from: this.ballCore.scaleY * 1.25, to: this.ballCore.scaleY },
      duration: 120,
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
    this.drawPips();
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
    this.ballGlow.setPosition(bx, by);
    this.ballCore.setPosition(bx, by);
    this.ballGlyph.setPosition(bx, by);
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
          this.popScore(event.x, event.y, base * multiplier, multiplier > 1);
          break;
        }
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
      scaleX: 0,
      scaleY: 0,
      duration: 180,
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
    this.ballGlow.setPosition(LAUNCH_X, LAUNCH_Y);
    this.ballCore.setPosition(LAUNCH_X, LAUNCH_Y);
    this.ballGlyph.setPosition(LAUNCH_X, LAUNCH_Y);
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
      this.ballGlow.setPosition(LAUNCH_X, LAUNCH_Y);
      this.ballCore.setPosition(LAUNCH_X, LAUNCH_Y);
      this.ballGlyph.setPosition(LAUNCH_X, LAUNCH_Y);
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
    // Launcher body.
    this.aimGfx.fillStyle(HEX.wall, 1);
    this.aimGfx.fillCircle(LAUNCH_X, LAUNCH_Y, 13);
    this.aimGfx.fillStyle(HEX.neutral, 0.75);
    this.aimGfx.fillCircle(LAUNCH_X, LAUNCH_Y, 5);
    if (this.state !== 'aiming') return;

    const dx = Math.sin(this.aim);
    const dy = Math.cos(this.aim);
    this.aimGfx.fillStyle(HEX.neutral, 0.5);
    for (let d = 26; d < 130; d += 13) {
      this.aimGfx.fillCircle(LAUNCH_X + dx * d, LAUNCH_Y + dy * d, 2.2 - d / 110);
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

  /** The only bright HUD element: pips drain toward white as they are spent. */
  private drawPips() {
    this.pipGfx.clear();
    if (this.state === 'intro') return;
    const max = this.params.maxPips;
    const spacing = 17;
    const startX = W / 2 - ((max - 1) * spacing) / 2;
    const color = chargeHex(this.world.ball.charge);
    for (let i = 0; i < max; i += 1) {
      const x = startX + i * spacing;
      if (i < this.pips) {
        this.pipGfx.fillStyle(color, 0.9);
        this.pipGfx.fillCircle(x, PIP_Y, 4.5);
      } else {
        this.pipGfx.lineStyle(1, HEX.neutral, 0.25);
        this.pipGfx.strokeCircle(x, PIP_Y, 4.5);
      }
    }
  }

  private paintBall(charge: number) {
    const color = chargeHex(charge);
    this.ballCore.setTint(color);
    this.ballGlow.setTint(color);
    this.ballGlow.setAlpha(charge === 0 ? 0.3 : 0.5);
    this.ballGlyph.setText(charge > 0 ? '+' : charge < 0 ? '−' : '○');
  }

  private paintButton() {
    const enabled = this.state === 'flight' && this.pips > 0 && this.time.now >= this.nextFlipAt;
    const next: Charge = this.lastCharge === 1 ? -1 : 1;
    const color = enabled ? chargeHex(next) : HEX.pegDim;

    this.buttonBg.clear();
    this.buttonBg.fillStyle(color, enabled ? 0.92 : 0.35);
    this.buttonBg.fillRoundedRect(-BUTTON_W / 2, -BUTTON_H / 2, BUTTON_W, BUTTON_H, 14);
    this.buttonBg.lineStyle(2, color, enabled ? 1 : 0.5);
    this.buttonBg.strokeRoundedRect(-BUTTON_W / 2, -BUTTON_H / 2, BUTTON_W, BUTTON_H, 14);
    this.buttonLabel
      .setText(enabled ? (next > 0 ? 'FLIP  +' : 'FLIP  −') : 'FLIP')
      .setColor(enabled ? '#05060f' : '#8b93c4');
    this.buttonBg.setAlpha(enabled ? 1 : 0.55);
  }

  private updateHud() {
    this.scoreText.setText(this.score.toLocaleString('en-US'));
    this.ballsText.setText(`BALLS ${this.ballsLeft}  ◉ ${this.world?.targetsLeft ?? 0}`);
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
      'White means neutral — no pips, no pull.',
      '',
      'Clear every ringed peg to descend.',
      '',
      'Tap or press Space to begin',
    ]);
  }

  private showOverlay(title: string, lines: string[]) {
    this.overlay?.destroy();
    const panel = this.add.graphics();
    panel.fillStyle(HEX.void, 0.88);
    panel.fillRoundedRect(-260, -190, 520, 380, 18);
    panel.lineStyle(2, HEX.posCyan, 0.35);
    panel.strokeRoundedRect(-260, -190, 520, 380, 18);

    const heading = this.add
      .text(0, -140, title, { fontFamily: FONT, fontSize: '34px', color: '#4de5ff' })
      .setOrigin(0.5);
    const body = this.add
      .text(0, 10, lines.join('\n'), {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#f2f5ff',
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5)
      .setAlpha(0.85);

    this.overlay = this.add
      .container(W / 2, (FIELD_TOP + FIELD_BOTTOM) / 2, [panel, heading, body])
      .setDepth(200);
  }
}

function readLevelParam(): number {
  const raw = new URLSearchParams(window.location.search).get('level');
  if (!raw) return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
