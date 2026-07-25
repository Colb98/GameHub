import Phaser from 'phaser';
import { GameHubClient, initGameHub } from '@gamehub/sdk';

const W = 640;
const H = 900;
const WORLD_LEFT = 24;
const WORLD_RIGHT = W - 24;
const FIELD_TOP = 188;
const BRICK_COLS = 8;
const BRICK_W = 64;
const BRICK_H = 24;
const BRICK_GAP_X = 8;
const BRICK_STEP_Y = 39;
const PADDLE_Y = 836;
const PADDLE_W = 128;
const DANGER_Y = 760;
const DESCENT_INTERVAL_MS = 14_000;
const FREEZE_BONUS_MS = 8_000;
const BALL_SPEED = 430;
const MAX_BALLS = 36;
const START_LIVES = 3;
const DROP_CHANCE = 0.23;
const SYNTH_VOLUME_BOOST = 1.2;
const PALETTE = {
  ink: '#11152b',
  inkDeep: '#0b1022',
  surface: '#1a2039',
  surfaceLight: '#252b49',
  cream: '#eee4cf',
  text: '#c7c3c8',
  muted: '#7e8298',
  cyan: '#78aeb2',
  cyanDark: '#436f79',
  magenta: '#ad718f',
  magentaDark: '#68445f',
  amber: '#d0a166',
  amberDark: '#7a5d43',
  violet: '#8880a6',
  violetDark: '#504a71',
  rose: '#b76f7c',
  mint: '#80ad98',
  ice: '#91adbb',
} as const;

type GameState = 'intro' | 'ready' | 'playing' | 'dead';
type BallMode = 'normal' | 'strong' | 'weak';
type PowerKey =
  | 'life'
  | 'triple'
  | 'ball1'
  | 'ball5'
  | 'paddleFast'
  | 'paddleSlow'
  | 'strong'
  | 'weak'
  | 'freeze';
type Ball = Phaser.Physics.Arcade.Image;
type Brick = Phaser.Physics.Arcade.Image;
type Power = Phaser.Physics.Arcade.Image;

interface PowerSpec {
  key: PowerKey;
  glyph: string;
  label: string;
  color: string;
  weight: number;
}

const BRICK_COLORS = [
  '#000000',
  PALETTE.cyan,
  PALETTE.magenta,
  PALETTE.amber,
  PALETTE.violet,
];
const BRICK_DARK = [
  '#000000',
  PALETTE.cyanDark,
  PALETTE.magentaDark,
  PALETTE.amberDark,
  PALETTE.violetDark,
];

// Common tactical drops dominate. Run-saving life and +5-ball drops are rare.
const POWERS: PowerSpec[] = [
  { key: 'ball1', glyph: '+1', label: 'ADD ORB', color: PALETTE.cyan, weight: 27 },
  { key: 'paddleFast', glyph: '»', label: 'PADDLE RUSH', color: PALETTE.mint, weight: 18 },
  { key: 'freeze', glyph: '❄', label: 'TIME FROZEN', color: PALETTE.ice, weight: 15 },
  { key: 'weak', glyph: '¾', label: 'LIGHTSPEED', color: '#7798b0', weight: 12 },
  { key: 'paddleSlow', glyph: '‹', label: 'PADDLE DRAG', color: PALETTE.rose, weight: 10 },
  { key: 'strong', glyph: '2×', label: 'HEAVY ORB', color: PALETTE.amber, weight: 7 },
  { key: 'triple', glyph: '×3', label: 'PRISM SPLIT', color: PALETTE.magenta, weight: 5 },
  { key: 'life', glyph: '♥', label: 'EXTRA LIFE', color: PALETTE.rose, weight: 3 },
  { key: 'ball5', glyph: '+5', label: 'STAR SWARM', color: PALETTE.violet, weight: 3 },
];

function hex(value: string): number {
  return Number.parseInt(value.slice(1), 16);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

class Synth {
  private context?: AudioContext;

  constructor(private readonly isMuted: () => boolean) {}

  tone(frequency: number, duration = 0.06, gain = 0.035, slide = 0) {
    if (this.isMuted()) return;
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    this.context ??= new AudioCtor();
    const context = this.context;
    if (context.state === 'suspended') void context.resume();
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(40, frequency + slide),
      now + duration,
    );
    volume.gain.setValueAtTime(gain * SYNTH_VOLUME_BOOST, now);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}

class NeonDescentScene extends Phaser.Scene {
  private state: GameState = 'intro';
  private balls!: Phaser.Physics.Arcade.Group;
  private bricks!: Phaser.Physics.Arcade.StaticGroup;
  private powers!: Phaser.Physics.Arcade.Group;
  private paddle!: Phaser.Physics.Arcade.Image;
  private paddleAura!: Phaser.GameObjects.Ellipse;
  private keys?: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
  };
  private pointerTargetX = W / 2;
  private pointerActive = false;
  private score = 0;
  private lives = START_LIVES;
  private wave = 1;
  private startedAt = 0;
  private nextDescentAt = 0;
  private descentBusy = false;
  private lifeTransition = false;
  private lastTrailAt = 0;
  private paddleFactor = 1;
  private paddleEffectUntil = 0;
  private paddleMotionX = 0;
  private hitStopActive = false;
  private ballMode: BallMode = 'normal';
  private ballEffectUntil = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private ballCountText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private descentText!: Phaser.GameObjects.Text;
  private descentBar!: Phaser.GameObjects.Graphics;
  private overlay?: Phaser.GameObjects.Container;
  private readyLabel?: Phaser.GameObjects.Text;
  private dangerLine!: Phaser.GameObjects.Graphics;
  private screenWash!: Phaser.GameObjects.Rectangle;
  private synth: Synth;

  constructor(private readonly gh: GameHubClient) {
    super('neon-descent');
    this.synth = new Synth(() => this.gh.muted);
  }

  create() {
    // Scene instances are reused by Phaser on a standalone restart.
    this.state = 'intro';
    this.pointerTargetX = W / 2;
    this.pointerActive = false;
    this.score = 0;
    this.lives = START_LIVES;
    this.wave = 1;
    this.startedAt = 0;
    this.nextDescentAt = 0;
    this.descentBusy = false;
    this.lifeTransition = false;
    this.lastTrailAt = 0;
    this.paddleFactor = 1;
    this.paddleEffectUntil = 0;
    this.paddleMotionX = 0;
    this.hitStopActive = false;
    this.ballMode = 'normal';
    this.ballEffectUntil = 0;
    this.overlay = undefined;
    this.readyLabel = undefined;
    this.createTextures();
    this.createBackdrop();
    this.createHud();
    this.createWorld();
    this.createControls();
    this.spawnPattern(6);
    this.spawnBall(W / 2, PADDLE_Y - 35, 0, false);
    this.createIntro();
  }

  private createTextures() {
    this.makeBallTexture();
    this.makePaddleTexture();
    for (let hp = 1; hp <= 4; hp += 1) this.makeBrickTexture(hp);
    for (const spec of POWERS) this.makePowerTexture(spec);
  }

  private makeBallTexture() {
    const texture = this.textures.createCanvas('ball', 44, 44);
    if (!texture) return;
    const ctx = texture.getContext();
    ctx.fillStyle = 'rgba(120,174,178,.12)';
    ctx.beginPath();
    ctx.arc(22, 22, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.magentaDark;
    ctx.beginPath();
    ctx.arc(22, 22, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.cyan;
    ctx.beginPath();
    ctx.arc(22, 22, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath();
    ctx.arc(22, 22, 4, 0, Math.PI * 2);
    ctx.fill();
    texture.refresh();
  }

  private makePaddleTexture() {
    const texture = this.textures.createCanvas('paddle', 172, 54);
    if (!texture) return;
    const ctx = texture.getContext();
    ctx.fillStyle = 'rgba(120,174,178,.13)';
    roundRect(ctx, 7, 8, 158, 38, 19);
    ctx.fill();
    ctx.fillStyle = PALETTE.surfaceLight;
    roundRect(ctx, 15, 14, 142, 27, 14);
    ctx.fill();
    ctx.fillStyle = PALETTE.cyan;
    roundRect(ctx, 22, 20, 128, 14, 7);
    ctx.fill();
    ctx.fillStyle = PALETTE.amber;
    roundRect(ctx, 69, 20, 45, 14, 0);
    ctx.fill();
    ctx.fillStyle = PALETTE.magenta;
    roundRect(ctx, 114, 20, 36, 14, 7);
    ctx.fill();
    ctx.fillStyle = PALETTE.surface;
    roundRect(ctx, 28, 35, 116, 3, 2);
    ctx.fill();
    texture.refresh();
  }

  private makeBrickTexture(hp: number) {
    const texture = this.textures.createCanvas(`brick-${hp}`, 80, 42);
    if (!texture) return;
    const ctx = texture.getContext();
    const color = BRICK_COLORS[hp];
    ctx.fillStyle = `${color}24`;
    roundRect(ctx, 3, 4, 74, 34, 11);
    ctx.fill();
    ctx.fillStyle = BRICK_DARK[hp];
    roundRect(ctx, 8, 9, 64, 24, 7);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, 8, 9, 64, 17, 7);
    ctx.fill();
    const pipWidth = 6;
    const total = hp * pipWidth + (hp - 1) * 4;
    for (let i = 0; i < hp; i += 1) {
      ctx.fillStyle = PALETTE.surface;
      roundRect(ctx, 40 - total / 2 + i * 10, 28, pipWidth, 2, 1);
      ctx.fill();
    }
    texture.refresh();
  }

  private makePowerTexture(spec: PowerSpec) {
    const texture = this.textures.createCanvas(`power-${spec.key}`, 52, 52);
    if (!texture) return;
    const ctx = texture.getContext();
    ctx.fillStyle = `${spec.color}22`;
    ctx.beginPath();
    ctx.arc(26, 26, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = spec.color;
    ctx.beginPath();
    ctx.arc(26, 26, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.surface;
    ctx.beginPath();
    ctx.arc(26, 26, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.cream;
    ctx.font = `bold ${spec.glyph.length > 1 ? 11 : 16}px "Trebuchet MS", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.glyph, 26, 26.5);
    texture.refresh();
  }

  private createBackdrop() {
    const texture = this.textures.createCanvas('backdrop', W, H);
    if (texture) {
      const ctx = texture.getContext();
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(0, 0, W, H);

      // Broad, flat color bands replace the old point-source neon glows.
      ctx.fillStyle = '#17213b';
      ctx.beginPath();
      ctx.moveTo(0, 215);
      ctx.bezierCurveTo(125, 174, 226, 254, 358, 215);
      ctx.bezierCurveTo(472, 181, 558, 207, W, 184);
      ctx.lineTo(W, 290);
      ctx.bezierCurveTo(500, 316, 392, 274, 271, 305);
      ctx.bezierCurveTo(145, 337, 78, 282, 0, 325);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#38243c';
      ctx.beginPath();
      ctx.moveTo(0, 600);
      ctx.bezierCurveTo(103, 534, 202, 662, 326, 593);
      ctx.bezierCurveTo(438, 530, 535, 629, W, 568);
      ctx.lineTo(W, 710);
      ctx.bezierCurveTo(506, 759, 409, 672, 300, 733);
      ctx.bezierCurveTo(187, 797, 92, 688, 0, 755);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#24354a';
      ctx.beginPath();
      ctx.moveTo(0, 744);
      ctx.bezierCurveTo(124, 679, 218, 813, 337, 752);
      ctx.bezierCurveTo(438, 700, 540, 793, W, 734);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(120,174,178,.07)';
      ctx.beginPath();
      ctx.moveTo(44, 150);
      ctx.lineTo(132, 150);
      ctx.lineTo(332, H);
      ctx.lineTo(198, H);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(173,113,143,.07)';
      ctx.beginPath();
      ctx.moveTo(505, 150);
      ctx.lineTo(588, 150);
      ctx.lineTo(510, H);
      ctx.lineTo(376, H);
      ctx.closePath();
      ctx.fill();

      let seed = 9137;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      for (let i = 0; i < 105; i += 1) {
        const alpha = 0.07 + random() * 0.18;
        ctx.fillStyle = `rgba(199,195,200,${alpha})`;
        const size = random() > 0.94 ? 2 : 1;
        ctx.fillRect(random() * W, 160 + random() * (H - 180), size, size);
      }
      texture.refresh();
    }
    this.add.image(W / 2, H / 2, 'backdrop');
    const upperBand = this.add
      .rectangle(W / 2 - 40, 515, W + 160, 24, 0x78aeb2, 0.055)
      .setAngle(-7)
      .setDepth(1);
    const lowerBand = this.add
      .rectangle(W / 2 + 50, 690, W + 170, 34, 0xad718f, 0.045)
      .setAngle(6)
      .setDepth(1);
    this.tweens.add({
      targets: upperBand,
      x: '+=24',
      duration: 6800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: lowerBand,
      x: '-=30',
      duration: 8200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.add
      .text(W / 2, H / 2 + 12, 'DESCENT', {
        fontFamily: '"Arial Black", "Trebuchet MS", sans-serif',
        fontSize: '108px',
        color: PALETTE.cream,
      })
      .setOrigin(0.5)
      .setAngle(-90)
      .setAlpha(0.025);
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x8880a6, 0.055);
    for (let x = 40; x < W; x += 40) grid.lineBetween(x, 150, x, H);
    for (let y = 160; y < H; y += 40) grid.lineBetween(WORLD_LEFT, y, WORLD_RIGHT, y);
    const rails = this.add.graphics();
    rails.lineStyle(1, 0x78aeb2, 0.3);
    rails.lineBetween(WORLD_LEFT, 148, WORLD_LEFT, H);
    rails.lineStyle(1, 0xad718f, 0.3);
    rails.lineBetween(WORLD_RIGHT, 148, WORLD_RIGHT, H);
    rails.lineStyle(7, 0x78aeb2, 0.045);
    rails.lineBetween(WORLD_LEFT + 3, 148, WORLD_LEFT + 3, H);
    rails.lineStyle(7, 0xad718f, 0.045);
    rails.lineBetween(WORLD_RIGHT - 3, 148, WORLD_RIGHT - 3, H);
  }

  private labelStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: '"Courier New", monospace',
      fontSize: '10px',
      color: PALETTE.muted,
      letterSpacing: 2,
    };
  }

  private valueStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: '"Courier New", monospace',
      fontSize: '20px',
      color: PALETTE.cream,
    };
  }

  private createHud() {
    this.add
      .text(34, 22, 'NEON', {
        fontFamily: '"Arial Black", "Trebuchet MS", sans-serif',
        fontSize: '34px',
        color: PALETTE.cream,
        letterSpacing: 2,
      });
    this.add
      .text(151, 34, '// DESCENT', {
        fontFamily: '"Courier New", monospace',
        fontSize: '15px',
        color: PALETTE.magenta,
        letterSpacing: 3,
      });
    this.add.rectangle(36, 65, 176, 3, 0x78aeb2, 0.7).setOrigin(0, 0.5);
    this.add.rectangle(212, 65, 58, 3, 0xad718f, 0.7).setOrigin(0, 0.5);
    this.add.text(36, 75, 'SCORE', this.labelStyle());
    this.scoreText = this.add.text(36, 91, '000000', this.valueStyle());
    this.add.text(241, 75, 'WAVE', this.labelStyle());
    this.waveText = this.add.text(241, 91, '01', this.valueStyle());
    this.add.text(347, 75, 'ORBITS', this.labelStyle());
    this.ballCountText = this.add.text(347, 91, '01', this.valueStyle());
    this.add.text(462, 75, 'LIVES', this.labelStyle());
    this.livesText = this.add
      .text(462, 91, '◆ ◆ ◆', {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '18px',
        color: PALETTE.rose,
      });
    this.add.text(36, 132, 'NEXT DESCENT', this.labelStyle());
    this.descentText = this.add
      .text(W - 36, 132, '14.0s', { ...this.labelStyle(), color: PALETTE.cyan })
      .setOrigin(1, 0);
    this.descentBar = this.add.graphics();
    this.statusText = this.add
      .text(W / 2, 158, 'BREAK THE COLOR. BEAT THE FALL.', {
        fontFamily: '"Courier New", monospace',
        fontSize: '11px',
        color: PALETTE.muted,
        letterSpacing: 1,
      })
      .setOrigin(0.5);
    this.dangerLine = this.add.graphics();
    this.drawDangerLine(0.24);
    this.add
      .text(33, DANGER_Y - 18, 'BREACH // LOSE LIFE', {
        fontFamily: '"Courier New", monospace',
        fontSize: '9px',
        color: PALETTE.rose,
        letterSpacing: 1,
      })
      .setAlpha(0.65);
    this.screenWash = this.add
      .rectangle(W / 2, H / 2, W, H, 0xffffff, 0)
      .setDepth(90);
  }

  private drawDangerLine(alpha: number) {
    this.dangerLine.clear();
    this.dangerLine.lineStyle(1, 0xb76f7c, alpha);
    for (let x = WORLD_LEFT + 8; x < WORLD_RIGHT; x += 18) {
      this.dangerLine.lineBetween(x, DANGER_Y, Math.min(x + 8, WORLD_RIGHT), DANGER_Y);
    }
  }

  private createWorld() {
    this.physics.world.setBounds(
      WORLD_LEFT,
      152,
      WORLD_RIGHT - WORLD_LEFT,
      H - 152,
      true,
      true,
      true,
      false,
    );
    this.balls = this.physics.add.group({ allowGravity: false });
    this.bricks = this.physics.add.staticGroup();
    this.powers = this.physics.add.group({ allowGravity: false });
    this.paddleAura = this.add
      .ellipse(W / 2, PADDLE_Y, 178, 46, 0x78aeb2, 0.08);
    this.paddle = this.physics.add.image(W / 2, PADDLE_Y, 'paddle').setDepth(10);
    this.paddle.setImmovable(true).setPushable(false);
    (this.paddle.body as Phaser.Physics.Arcade.Body)
      .setAllowGravity(false)
      .setSize(PADDLE_W, 20, true);
    this.physics.add.collider(
      this.balls,
      this.bricks,
      (ball, brick) => this.hitBrick(ball as Ball, brick as Brick),
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.paddle,
      this.powers,
      (_paddle, power) => this.collectPower(power as Power),
      undefined,
      this,
    );
  }

  private createControls() {
    this.input.setPollAlways();
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.trackPointer(pointer);
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.trackPointer(pointer);
      this.launch();
    });
    this.keys = this.input.keyboard?.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    }) as typeof this.keys;
    this.keys?.space.on('down', () => this.launch());

    // Keep a canvas-level pointer path for mobile browsers where Phaser's
    // scaled pointer polling can miss drag updates.
    const canvas = this.game.canvas;
    const trackClientX = (clientX: number) => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0) return;
      this.pointerActive = true;
      this.pointerTargetX = ((clientX - bounds.left) / bounds.width) * W;
    };
    const onCanvasPointerMove = (event: PointerEvent) => trackClientX(event.clientX);
    const onCanvasPointerDown = (event: PointerEvent) => {
      trackClientX(event.clientX);
      this.launch();
    };
    canvas.addEventListener('pointermove', onCanvasPointerMove);
    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      canvas.removeEventListener('pointermove', onCanvasPointerMove);
      canvas.removeEventListener('pointerdown', onCanvasPointerDown);
    });
  }

  private trackPointer(pointer: Phaser.Input.Pointer) {
    const position = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    this.pointerActive = true;
    this.pointerTargetX = position.x;
  }

  private createIntro() {
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x0b1022, 0.89);
    const topRule = this.add.rectangle(W / 2, 224, 92, 3, 0xad718f, 0.9);
    const eyebrow = this.add
      .text(W / 2, 190, 'A CHROMATIC SURVIVAL BREAKER', {
        fontFamily: '"Courier New", monospace',
        fontSize: '11px',
        color: PALETTE.magenta,
        letterSpacing: 2,
      })
      .setOrigin(0.5);
    const title = this.add
      .text(W / 2, 252, 'BREAK\nTHE FALL', {
        fontFamily: '"Arial Black", "Trebuchet MS", sans-serif',
        fontSize: '55px',
        align: 'center',
        color: PALETTE.cream,
        lineSpacing: -6,
      })
      .setOrigin(0.5);
    const thesis = this.add
      .text(
        W / 2,
        346,
        'Every color carries another layer.\nEvery fourteen seconds, the ceiling gets closer.',
        {
          fontFamily: '"Trebuchet MS", sans-serif',
          fontSize: '14px',
          align: 'center',
          color: PALETTE.text,
          lineSpacing: 7,
        },
      )
      .setOrigin(0.5);
    const rule = this.add
      .text(W / 2, 420, 'CYAN  1     PINK  2     AMBER  3     VIOLET  4', {
        fontFamily: '"Courier New", monospace',
        fontSize: '12px',
        color: PALETTE.cream,
        letterSpacing: 1,
      })
      .setOrigin(0.5);
    const colorBars = [178, 278, 390, 505].map((x, index) =>
      this.add
        .rectangle(x, 444, 40, 3, hex(BRICK_COLORS[index + 1]), 0.9),
    );
    const powerTitle = this.add
      .text(W / 2, 487, 'CATCH THE FALLING SIGNALS', {
        fontFamily: '"Courier New", monospace',
        fontSize: '10px',
        color: PALETTE.muted,
        letterSpacing: 2,
      })
      .setOrigin(0.5);
    const powerLine = this.add
      .text(
        W / 2,
        532,
        '♥ LIFE     ×3 SPLIT     +1 / +5 ORBS\n» PADDLE     2× HEAVY     ¾ LIGHT     ❄ FREEZE',
        {
          fontFamily: '"Courier New", monospace',
          fontSize: '12px',
          align: 'center',
          color: PALETTE.text,
          lineSpacing: 14,
        },
      )
      .setOrigin(0.5);
    const note = this.add
      .text(W / 2, 603, 'Rare signals burn brighter. Red signals are unstable.', {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: '12px',
        color: PALETTE.muted,
      })
      .setOrigin(0.5);
    const startBand = this.add.rectangle(W / 2, 692, 286, 48, 0x78aeb2, 0.1);
    const start = this.add
      .text(W / 2, 690, 'TAP / SPACE TO LAUNCH', {
        fontFamily: '"Arial Black", "Trebuchet MS", sans-serif',
        fontSize: '18px',
        color: PALETTE.cream,
        letterSpacing: 2,
      })
      .setOrigin(0.5);
    const control = this.add
      .text(W / 2, 728, 'DRAG  ·  MOVE MOUSE  ·  A / D', {
        fontFamily: '"Courier New", monospace',
        fontSize: '10px',
        color: PALETTE.muted,
        letterSpacing: 2,
      })
      .setOrigin(0.5);
    this.overlay = this.add
      .container(0, 0, [
        shade,
        topRule,
        eyebrow,
        title,
        thesis,
        rule,
        ...colorBars,
        powerTitle,
        powerLine,
        note,
        startBand,
        start,
        control,
      ])
      .setDepth(100);
    this.tweens.add({
      targets: startBand,
      scaleX: 1.08,
      alpha: 0.035,
      duration: 1450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: [title, start],
      y: '-=8',
      duration: 650,
      ease: 'Cubic.easeOut',
    });
  }

  private launch() {
    if (this.state === 'dead') {
      if (this.gh.standalone) this.scene.restart();
      return;
    }
    if (this.state !== 'intro' && this.state !== 'ready') return;
    if (this.state === 'intro') {
      this.overlay?.destroy();
      this.overlay = undefined;
      this.startedAt = this.time.now;
      this.nextDescentAt = this.time.now + DESCENT_INTERVAL_MS;
    }
    this.readyLabel?.destroy();
    this.readyLabel = undefined;
    this.state = 'playing';
    const attached = this.activeBalls().find((ball) => ball.getData('attached'));
    if (attached) {
      attached.setData('attached', false);
      const offset = clamp((attached.x - this.paddle.x) / (PADDLE_W / 2), -0.7, 0.7);
      this.setBallDirection(attached, offset * 0.72, -1);
    }
    this.flash(0x78aeb2, 0.1, 250);
  }

  private spawnPattern(rows: number) {
    for (let row = 0; row < rows; row += 1) {
      this.spawnRow(FIELD_TOP + row * BRICK_STEP_Y, row);
    }
  }

  private spawnRow(y: number, rowSeed: number) {
    const totalWidth = BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP_X;
    const startX = (W - totalWidth) / 2 + BRICK_W / 2;
    const gapIndex = (this.wave + rowSeed * 3) % BRICK_COLS;
    for (let col = 0; col < BRICK_COLS; col += 1) {
      if ((this.wave + rowSeed) % 3 === 0 && col === gapIndex) continue;
      const difficulty = Math.min(4, 1 + Math.floor((this.wave - 1) / 2));
      const roll = Math.random();
      let hp = roll > 0.93 ? 4 : roll > 0.76 ? 3 : roll > 0.45 ? 2 : 1;
      hp = Math.min(hp, difficulty + 1);
      const x = startX + col * (BRICK_W + BRICK_GAP_X);
      const brick = this.bricks.create(x, y, `brick-${hp}`) as Brick;
      brick.setData({ hp, maxHp: hp, hitLock: 0 });
      brick.setDepth(5);
      brick.body?.setSize(BRICK_W, BRICK_H);
      brick.refreshBody();
    }
  }

  private spawnBall(x: number, y: number, angle: number, moving = true): Ball | null {
    if (this.activeBalls().length >= MAX_BALLS) return null;
    const ball = this.balls.create(x, y, 'ball') as Ball;
    ball.setDepth(8).setBounce(1, 1).setCollideWorldBounds(true);
    (ball.body as Phaser.Physics.Arcade.Body).setCircle(6, 16, 16);
    ball.setData({
      attached: !moving,
      trailHue: Math.random() > 0.5 ? 0x78aeb2 : 0xad718f,
      paddleHitLock: 0,
    });
    if (moving) {
      const speed = this.currentBallSpeed();
      ball.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    }
    this.updateBallCount();
    return ball;
  }

  private activeBalls(): Ball[] {
    return (this.balls.getChildren() as Ball[]).filter((ball) => ball.active);
  }

  private movingBalls(): Ball[] {
    return this.activeBalls().filter((ball) => !ball.getData('attached'));
  }

  private currentBallSpeed(): number {
    return this.ballMode === 'strong'
      ? BALL_SPEED * 0.5
      : this.ballMode === 'weak'
        ? BALL_SPEED * 1.5
        : BALL_SPEED;
  }

  private currentBallDamage(): number {
    return this.ballMode === 'strong' ? 2 : this.ballMode === 'weak' ? 0.75 : 1;
  }

  private setBallDirection(ball: Ball, x: number, y: number) {
    const magnitude = Math.hypot(x, y) || 1;
    const speed = this.currentBallSpeed();
    ball.setVelocity((x / magnitude) * speed, (y / magnitude) * speed);
  }

  private normalizeBallSpeed(ball: Ball) {
    const body = ball.body as Phaser.Physics.Arcade.Body;
    let y = body.velocity.y;
    if (Math.abs(y) < 105) y = (y <= 0 ? -1 : 1) * 105;
    this.setBallDirection(ball, body.velocity.x, y);
  }

  private hitPaddle(ball: Ball) {
    if (!ball.active || this.state !== 'playing') return;
    const ballBody = ball.body as Phaser.Physics.Arcade.Body;
    if (
      ballBody.velocity.y <= 0 ||
      this.time.now < Number(ball.getData('paddleHitLock') ?? 0)
    ) {
      return;
    }
    const paddleBody = this.paddle.body as Phaser.Physics.Arcade.Body;
    const contact = clamp((ball.x - this.paddle.x) / (PADDLE_W / 2), -1, 1);
    const paddleMotion = clamp(this.paddleMotionX / (650 * this.paddleFactor), -1, 1);
    const aim = clamp(contact + paddleMotion * 0.12, -1, 1);
    const angle = Phaser.Math.DegToRad(aim * 68);

    ball.setData('paddleHitLock', this.time.now + 90);
    this.setBallDirection(ball, Math.sin(angle), -Math.cos(angle));
    ball.setY(PADDLE_Y - 24);
    ballBody.updateFromGameObject();
    this.paddle.setY(PADDLE_Y);
    paddleBody.setVelocityY(0);
    this.synth.tone(210, 0.045, 0.022, 90);
    this.impactRing(ball.x, PADDLE_Y - 8, 0x78aeb2, 24);
    this.tweens.killTweensOf(this.paddleAura);
    this.paddleAura.setScale(1).setAlpha(0.13);
    this.tweens.add({
      targets: this.paddleAura,
      scaleX: 1.18,
      scaleY: 1.12,
      alpha: 0.025,
      duration: 300,
    });
  }

  private ballTouchesPaddle(ball: Ball): boolean {
    if (!ball.active || ball.getData('attached') || this.state !== 'playing') return false;
    const body = ball.body as Phaser.Physics.Arcade.Body;
    const horizontalReach = PADDLE_W / 2 + 6;
    const contactTop = PADDLE_Y - 22;
    const contactBottom = PADDLE_Y + 14;
    return (
      body.velocity.y > 0 &&
      Math.abs(ball.x - this.paddle.x) <= horizontalReach &&
      ball.y >= contactTop &&
      ball.y <= contactBottom &&
      this.time.now >= Number(ball.getData('paddleHitLock') ?? 0)
    );
  }

  private hitBrick(ball: Ball, brick: Brick) {
    if (!ball.active || !brick.active || this.state !== 'playing') return;
    const now = this.time.now;
    if (now < Number(brick.getData('hitLock') ?? 0)) return;
    brick.setData('hitLock', now + 45);
    const hp = Number(brick.getData('hp')) - this.currentBallDamage();
    brick.setData('hp', hp);
    this.synth.tone(270 + Math.max(1, Math.ceil(hp)) * 95, 0.055, 0.025, 80);
    const ringColor = hp <= 0 ? 0xeee4cf : hex(BRICK_COLORS[Math.ceil(hp)]);
    this.impactRing(ball.x, ball.y, ringColor, 19);
    if (hp <= 0) {
      this.cameras.main.shake(55, 0.0011, true);
      this.breakBrick(brick);
    } else {
      this.oneFrameHitStop();
      brick.setTexture(`brick-${clamp(Math.ceil(hp), 1, 4)}`);
      brick.refreshBody();
      brick.setAlpha(0.35);
      this.tweens.add({ targets: brick, alpha: 1, duration: 120 });
    }
    this.normalizeBallSpeed(ball);
  }

  private oneFrameHitStop() {
    if (this.hitStopActive || this.physics.world.isPaused || this.state !== 'playing') return;
    this.hitStopActive = true;
    this.physics.world.pause();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.hitStopActive = false;
        if (this.state !== 'dead') this.physics.world.resume();
      });
    });
  }

  private breakBrick(brick: Brick) {
    const { x, y } = brick;
    const maxHp = Number(brick.getData('maxHp'));
    const color = hex(BRICK_COLORS[maxHp]);
    const points = maxHp * 110 + this.wave * 15;
    this.score += points;
    this.scoreText.setText(String(this.score).padStart(6, '0'));
    brick.destroy();
    this.synth.tone(520, 0.09, 0.035, 420);
    this.burst(x, y, color);
    this.floatingText(x, y - 8, `+${points}`, BRICK_COLORS[maxHp]);
    this.maybeDropPower(x, y);
    if (this.bricks.countActive(true) === 0) {
      this.wave += 1;
      this.waveText.setText(String(this.wave).padStart(2, '0'));
      this.nextDescentAt = this.time.now + DESCENT_INTERVAL_MS;
      this.statusText.setText('SPECTRUM CLEARED // NEW FORMATION');
      this.time.delayedCall(650, () => {
        if (this.state === 'dead') return;
        this.spawnPattern(Math.min(7, 5 + Math.floor(this.wave / 3)));
        this.banner(`WAVE ${String(this.wave).padStart(2, '0')}`, PALETTE.cyan);
      });
    }
  }

  private maybeDropPower(x: number, y: number) {
    if (Math.random() >= DROP_CHANCE) return;
    let roll = Math.random() * POWERS.reduce((sum, power) => sum + power.weight, 0);
    let selected = POWERS[0];
    for (const power of POWERS) {
      roll -= power.weight;
      if (roll <= 0) {
        selected = power;
        break;
      }
    }
    const item = this.powers.create(x, y, `power-${selected.key}`) as Power;
    item.setData({ key: selected.key, color: selected.color });
    item.setDepth(7).setVelocityY(122).setAngularVelocity(38);
    (item.body as Phaser.Physics.Arcade.Body).setCircle(13, 13, 13);
    this.tweens.add({
      targets: item,
      scale: 1.16,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private collectPower(item: Power) {
    if (!item.active || this.state !== 'playing') return;
    const key = item.getData('key') as PowerKey;
    const spec = POWERS.find((power) => power.key === key)!;
    const { x, y } = item;
    this.tweens.killTweensOf(item);
    item.destroy();
    this.synth.tone(430, 0.18, 0.04, 720);
    this.flash(hex(spec.color), 0.12, 300);
    this.burst(x, y, hex(spec.color), 10);
    this.banner(spec.label, spec.color);
    switch (key) {
      case 'life':
        this.lives += 1;
        this.updateLives();
        break;
      case 'triple':
        this.splitAllBalls();
        break;
      case 'ball1':
        this.addBalls(1);
        break;
      case 'ball5':
        this.addBalls(5);
        break;
      case 'paddleFast':
        this.paddleFactor = 1.55;
        this.paddleEffectUntil = this.time.now + 12_000;
        break;
      case 'paddleSlow':
        this.paddleFactor = 0.58;
        this.paddleEffectUntil = this.time.now + 9_000;
        break;
      case 'strong':
        this.setBallMode('strong', 12_000);
        break;
      case 'weak':
        this.setBallMode('weak', 10_000);
        break;
      case 'freeze':
        this.nextDescentAt += FREEZE_BONUS_MS;
        this.freezeFx();
        break;
    }
    this.updateBallCount();
  }

  private splitAllBalls() {
    const sources = this.movingBalls().slice(0, Math.floor(MAX_BALLS / 3));
    for (const source of sources) {
      const body = source.body as Phaser.Physics.Arcade.Body;
      const angle = Math.atan2(body.velocity.y, body.velocity.x);
      this.spawnBall(source.x, source.y, angle - 0.32);
      this.spawnBall(source.x, source.y, angle + 0.32);
    }
  }

  private addBalls(count: number) {
    const source = this.movingBalls()[0];
    for (let i = 0; i < count; i += 1) {
      const spread = count === 1 ? 0 : (i / Math.max(1, count - 1) - 0.5) * 1.15;
      this.spawnBall(source?.x ?? this.paddle.x, source?.y ?? PADDLE_Y - 32, -Math.PI / 2 + spread);
    }
  }

  private setBallMode(mode: BallMode, duration: number) {
    this.ballMode = mode;
    this.ballEffectUntil = this.time.now + duration;
    for (const ball of this.movingBalls()) this.normalizeBallSpeed(ball);
  }

  private updateEffects(time: number) {
    if (this.paddleFactor !== 1 && time >= this.paddleEffectUntil) {
      this.paddleFactor = 1;
      this.paddleEffectUntil = 0;
      this.banner('PADDLE STABLE', PALETTE.cream);
    }
    if (this.ballMode !== 'normal' && time >= this.ballEffectUntil) {
      this.ballMode = 'normal';
      this.ballEffectUntil = 0;
      for (const ball of this.movingBalls()) this.normalizeBallSpeed(ball);
      this.banner('ORB MASS STABLE', PALETTE.cream);
    }
    const effects: string[] = [];
    if (this.paddleFactor !== 1) {
      const seconds = Math.max(0, Math.ceil((this.paddleEffectUntil - time) / 1000));
      effects.push(`${this.paddleFactor > 1 ? 'PADDLE RUSH' : 'PADDLE DRAG'} ${seconds}s`);
    }
    if (this.ballMode !== 'normal') {
      const seconds = Math.max(0, Math.ceil((this.ballEffectUntil - time) / 1000));
      effects.push(`${this.ballMode === 'strong' ? '2× DMG · ½ SPD' : '¾ DMG · 1½ SPD'} ${seconds}s`);
    }
    if (effects.length) this.statusText.setText(effects.join('   //   '));
    else if (this.state === 'playing') this.statusText.setText('BREAK THE COLOR. BEAT THE FALL.');
  }

  private freezeFx() {
    const frost = this.add.graphics().setDepth(80);
    frost.lineStyle(2, 0x91adbb, 0.46);
    for (let i = 0; i < 24; i += 1) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const length = 8 + Math.random() * 18;
      frost.lineBetween(x - length, y, x + length, y);
      frost.lineBetween(x, y - length, x, y + length);
    }
    this.tweens.add({
      targets: frost,
      alpha: 0,
      duration: 900,
      onComplete: () => frost.destroy(),
    });
  }

  private descend() {
    if (this.descentBusy || this.state !== 'playing') return;
    this.descentBusy = true;
    this.nextDescentAt = this.time.now + DESCENT_INTERVAL_MS;
    this.banner('THE CEILING FALLS', PALETTE.rose);
    this.flash(0xad718f, 0.07, 480);
    this.cameras.main.shake(260, 0.0024);
    const active = (this.bricks.getChildren() as Brick[]).filter((brick) => brick.active);
    if (!active.length) {
      this.descentBusy = false;
      return;
    }
    let finished = 0;
    for (const brick of active) {
      this.tweens.add({
        targets: brick,
        y: brick.y + BRICK_STEP_Y,
        duration: 430,
        delay: Math.floor((brick.x / W) * 80),
        ease: 'Sine.easeInOut',
        // A ball can destroy this brick while the descent tween is still active.
        // Destroying an Arcade sprite removes its body before the tween completes.
        onUpdate: () => {
          if (brick.active && brick.body) brick.refreshBody();
        },
        onComplete: () => {
          if (brick.active && brick.body) brick.refreshBody();
          finished += 1;
          if (finished !== active.length) return;
          this.spawnRow(FIELD_TOP, this.wave + Math.floor(this.time.now / 1000));
          this.descentBusy = false;
          if (
            (this.bricks.getChildren() as Brick[]).some(
              (candidate) => candidate.active && candidate.y + BRICK_H / 2 >= DANGER_Y,
            )
          ) {
            this.handleBreach();
          }
        },
      });
    }
  }

  private handleBreach() {
    if (this.lifeTransition || this.state === 'dead') return;
    const breached = (this.bricks.getChildren() as Brick[]).filter(
      (brick) => brick.active && brick.y + BRICK_H / 2 >= DANGER_Y,
    );
    for (const brick of breached) {
      this.burst(brick.x, brick.y, 0xb76f7c, 5);
      brick.destroy();
    }
    this.loseLife('BREACH');
  }

  private loseLife(reason: 'BREACH' | 'ORB LOST') {
    if (this.lifeTransition || this.state === 'dead') return;
    this.lifeTransition = true;
    this.lives -= 1;
    this.updateLives();
    this.synth.tone(190, 0.28, 0.05, -110);
    this.banner(reason, PALETTE.rose);
    this.flash(0xb76f7c, 0.18, 520);
    this.cameras.main.shake(420, 0.009);
    if (navigator.vibrate) navigator.vibrate([80, 40, 110]);
    if (this.lives <= 0) {
      this.die();
      return;
    }
    if (reason === 'BREACH') {
      const survivors = (this.bricks.getChildren() as Brick[]).filter((brick) => brick.active);
      for (const brick of survivors) {
        brick.y = Math.max(FIELD_TOP, brick.y - BRICK_STEP_Y * 2);
        brick.refreshBody();
      }
    }
    for (const ball of this.activeBalls()) ball.destroy();
    this.updateBallCount();
    this.state = 'ready';
    this.nextDescentAt = this.time.now + DESCENT_INTERVAL_MS;
    this.time.delayedCall(620, () => {
      if (this.state === 'dead') return;
      this.spawnBall(this.paddle.x, PADDLE_Y - 35, 0, false);
      this.readyLabel = this.add
        .text(W / 2, 705, 'TAP / SPACE TO RELAUNCH', {
          fontFamily: '"Courier New", monospace',
          fontSize: '12px',
          color: PALETTE.cream,
          letterSpacing: 2,
        })
        .setOrigin(0.5)
        .setDepth(40);
      this.lifeTransition = false;
    });
  }

  private updateLives() {
    this.livesText.setText(Array.from({ length: Math.max(0, this.lives) }, () => '◆').join(' '));
  }

  private updateBallCount() {
    if (this.ballCountText) {
      this.ballCountText.setText(String(this.activeBalls().length).padStart(2, '0'));
    }
  }

  private updatePaddle(delta: number) {
    const body = this.paddle.body as Phaser.Physics.Arcade.Body;
    const keyboardLeft = this.keys?.left.isDown || this.keys?.a.isDown;
    const keyboardRight = this.keys?.right.isDown || this.keys?.d.isDown;
    const maxSpeed = 650 * this.paddleFactor;
    const safeDelta = clamp(delta || 1000 / 60, 1, 50);
    const maxStep = (maxSpeed * safeDelta) / 1000;
    const previousX = this.paddle.x;
    let nextX = previousX;
    if (keyboardLeft || keyboardRight) {
      this.pointerActive = false;
      nextX += (keyboardRight ? 1 : -1) * maxStep;
    } else if (this.pointerActive) {
      const target = clamp(
        this.pointerTargetX,
        WORLD_LEFT + PADDLE_W / 2,
        WORLD_RIGHT - PADDLE_W / 2,
      );
      nextX += clamp(target - previousX, -maxStep, maxStep);
    }
    nextX = clamp(nextX, WORLD_LEFT + PADDLE_W / 2, WORLD_RIGHT - PADDLE_W / 2);
    this.paddleMotionX = ((nextX - previousX) / safeDelta) * 1000;
    body.setVelocity(0, 0);
    this.paddle.setPosition(nextX, PADDLE_Y);
    body.updateFromGameObject();
    this.paddleAura.setPosition(this.paddle.x, this.paddle.y);
    const attachedBall = this.activeBalls().find((ball) => ball.getData('attached'));
    if (attachedBall) {
      attachedBall.setPosition(this.paddle.x, PADDLE_Y - 35);
      (attachedBall.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
    }
  }

  private updateBalls(time: number) {
    for (const ball of this.activeBalls()) {
      if (ball.getData('attached')) continue;
      const body = ball.body as Phaser.Physics.Arcade.Body;
      if (this.ballTouchesPaddle(ball)) this.hitPaddle(ball);
      if (ball.y > H + 30 || ball.x < WORLD_LEFT - 50 || ball.x > WORLD_RIGHT + 50) {
        ball.destroy();
        continue;
      }
      if (Math.abs(body.velocity.y) < 80) {
        body.velocity.y = (body.velocity.y <= 0 ? -1 : 1) * 110;
        this.normalizeBallSpeed(ball);
      }
    }
    this.updateBallCount();
    if (this.state === 'playing' && !this.lifeTransition && this.movingBalls().length === 0) {
      this.loseLife('ORB LOST');
    }
    if (time - this.lastTrailAt > 54) {
      this.lastTrailAt = time;
      for (const ball of this.movingBalls().slice(0, 18)) {
        const trail = this.add
          .rectangle(
            ball.x,
            ball.y,
            this.ballMode === 'strong' ? 15 : 9,
            this.ballMode === 'strong' ? 5 : 3,
            Number(ball.getData('trailHue')),
            0.2,
          )
          .setDepth(3)
          .setRotation(
            Math.atan2(
              (ball.body as Phaser.Physics.Arcade.Body).velocity.y,
              (ball.body as Phaser.Physics.Arcade.Body).velocity.x,
            ),
          );
        this.tweens.add({
          targets: trail,
          alpha: 0,
          scaleX: 0.25,
          duration: 260,
          onComplete: () => trail.destroy(),
        });
      }
    }
  }

  private updatePowers() {
    for (const item of this.powers.getChildren() as Power[]) {
      if (item.active && item.y > H + 40) {
        this.tweens.killTweensOf(item);
        item.destroy();
      }
    }
  }

  private updateDescent(time: number) {
    const remaining =
      this.state === 'playing' ? Math.max(0, this.nextDescentAt - time) : DESCENT_INTERVAL_MS;
    const ratio = clamp(remaining / DESCENT_INTERVAL_MS, 0, 1);
    this.descentText.setText(`${(remaining / 1000).toFixed(1)}s`);
    this.descentText.setColor(ratio < 0.23 ? PALETTE.rose : PALETTE.cyan);
    this.descentBar.clear();
    this.descentBar.fillStyle(0x2c2346, 0.75);
    this.descentBar.fillRoundedRect(36, 150, W - 72, 3, 2);
    const color = ratio < 0.23 ? 0xb76f7c : 0x78aeb2;
    this.descentBar.fillStyle(color, 0.88);
    this.descentBar.fillRoundedRect(36, 150, (W - 72) * ratio, 3, 2);
    this.descentBar.fillStyle(color, 0.13);
    this.descentBar.fillRoundedRect(36, 147, (W - 72) * ratio, 9, 4);
    this.drawDangerLine(ratio < 0.23 ? 0.58 : 0.24);
    if (this.state === 'playing' && remaining <= 0) this.descend();
  }

  private impactRing(x: number, y: number, color: number, radius: number) {
    const outer = this.add
      .circle(x, y, radius, color, 0)
      .setStrokeStyle(1.5, color, 0.8)
      .setDepth(20);
    const inner = this.add
      .circle(x, y, radius * 0.5, color, 0)
      .setStrokeStyle(4, color, 0.18)
      .setDepth(19);
    this.tweens.add({
      targets: [outer, inner],
      scale: 2.3,
      alpha: 0,
      duration: 260,
      onComplete: () => {
        outer.destroy();
        inner.destroy();
      },
    });
  }

  private burst(x: number, y: number, color: number, count = 7) {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
      const distance = 18 + Math.random() * 34;
      const shard = this.add
        .rectangle(x, y, 2 + Math.random() * 4, 2, color, 0.9)
        .setRotation(angle)
        .setDepth(17);
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scaleX: 0.2,
        duration: 300 + Math.random() * 180,
        onComplete: () => shard.destroy(),
      });
    }
    this.impactRing(x, y, color, 15);
  }

  private floatingText(x: number, y: number, message: string, color: string) {
    const text = this.add
      .text(x, y, message, {
        fontFamily: '"Courier New", monospace',
        fontSize: '10px',
        color,
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({
      targets: text,
      y: y - 28,
      alpha: 0,
      duration: 600,
      onComplete: () => text.destroy(),
    });
  }

  private banner(message: string, color: string) {
    const line = this.add.rectangle(W / 2, 662, 0, 1, hex(color), 0.82).setDepth(60);
    const label = this.add
      .text(W / 2, 640, message, {
        fontFamily: '"Arial Black", "Trebuchet MS", sans-serif',
        fontSize: '17px',
        color,
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(61);
    this.tweens.add({
      targets: line,
      width: 250,
      duration: 200,
      yoyo: true,
      hold: 620,
      onComplete: () => line.destroy(),
    });
    this.tweens.add({
      targets: label,
      alpha: 1,
      y: 632,
      duration: 180,
      yoyo: true,
      hold: 580,
      onComplete: () => label.destroy(),
    });
  }

  private flash(color: number, alpha: number, duration: number) {
    this.tweens.killTweensOf(this.screenWash);
    this.screenWash.setFillStyle(color, 1).setAlpha(alpha);
    this.tweens.add({ targets: this.screenWash, alpha: 0, duration });
  }

  private die() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.lifeTransition = true;
    this.physics.pause();
    this.time.removeAllEvents();
    this.tweens.killAll();
    this.add.rectangle(W / 2, H / 2, W, H, 0x0b1022, 0.86).setDepth(120);
    this.add.rectangle(W / 2, 337, 120, 3, 0xb76f7c).setDepth(121);
    this.add
      .text(W / 2, 390, 'LIGHTS OUT', {
        fontFamily: '"Arial Black", "Trebuchet MS", sans-serif',
        fontSize: '50px',
        color: PALETTE.cream,
      })
      .setOrigin(0.5)
      .setDepth(121);
    this.add
      .text(W / 2, 474, `${String(this.score).padStart(6, '0')}  //  WAVE ${this.wave}`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        color: PALETTE.text,
      })
      .setOrigin(0.5)
      .setDepth(121);
    this.add
      .text(W / 2, 548, this.gh.standalone ? 'TAP / SPACE TO RESTART' : 'SCORE TRANSMITTED', {
        fontFamily: '"Courier New", monospace',
        fontSize: '11px',
        color: PALETTE.cyan,
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setDepth(121);
    this.gh.gameOver({
      score: this.score,
      durationMs: Math.max(0, Math.round(this.time.now - this.startedAt)),
      meta: { wave: this.wave, bricks: this.bricks.countActive(true) },
    });
  }

  update(time: number, delta: number) {
    if (this.state === 'dead') return;
    this.updatePaddle(delta);
    this.updateBalls(time);
    this.updatePowers();
    this.updateDescent(time);
    this.updateEffects(time);
  }
}

initGameHub().then((gh) => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: PALETTE.ink,
    render: {
      antialias: true,
      roundPixels: false,
      powerPreference: 'high-performance',
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: new NeonDescentScene(gh),
  });
  (window as unknown as { game?: Phaser.Game }).game = game;
});
