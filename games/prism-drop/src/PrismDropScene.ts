import Phaser from 'phaser';
import type { GameHubClient } from '@gamehub/sdk';
import { ArcadeAudio } from './audio';
import {
  COLORS,
  COLOR_ORDER,
  DEPTH_BANDS,
  DISPLAY_FONT,
  FIELD_LEFT,
  FIELD_RIGHT,
  FIRST_ROW_Y,
  FORCED_MISMATCH_CHANCE,
  H,
  HUD_BOTTOM,
  MAX_HP,
  METERS_PER_PIXEL,
  MOVE_SPEED,
  PAPER,
  PICKUP_CHANCE,
  PLATFORM_H,
  PLATFORM_W,
  PLAYER_H,
  PLAYER_W,
  PRESS_BOTTOM,
  PrismColor,
  ROW_GAP,
  START_HP,
  TERMINAL_SPEED,
  UI_FONT,
  W,
  clamp,
  colorNumber,
  mixColor,
} from './config';
import { createGameTextures, platformTextureKey, tintFor } from './render';
import { SeededRng, readSeed } from './rng';

type GameState = 'intro' | 'playing' | 'over';
type PlatformImage = Phaser.Physics.Arcade.Image;
type PickupImage = Phaser.Physics.Arcade.Image;

interface PlatformData {
  uid: number;
  row: number;
  color: PrismColor;
  used: boolean;
  direction: -1 | 1;
  retracted: boolean;
  movingUntil: number;
  pickup?: PickupImage;
}

interface Keys {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  enter: Phaser.Input.Keyboard.Key;
}

const TUTORIAL_ROWS: ReadonlyArray<{
  x: number;
  color: PrismColor;
  label: string;
}> = [
  { x: 320, color: 'red', label: '1  ACCEPT THE HIT → BECOME RED' },
  { x: 226, color: 'red', label: '2  RED BLOCKS THIS ONE' },
  { x: 350, color: 'green', label: '3  GREEN HEALS + REPAINTS' },
];

const LANES = [96, 208, 320, 432, 544] as const;
const SCROLL_START = 70;
const SCROLL_END = 150;
const SCROLL_RAMP_MS = 90_000;
const PRESS_DAMAGE_INTERVAL = 500;
const REPAINT_SCORE = 120;
const PICKUP_SCORE = 500;
const PRISM_SCORE = 900;

function dataOf(platform: PlatformImage): PlatformData {
  return platform.getData('platform') as PlatformData;
}

export class PrismDropScene extends Phaser.Scene {
  private state: GameState = 'intro';
  private rng!: SeededRng;
  private runSeed = 0;
  private startedAt = 0;
  private score = 0;
  private bonusScore = 0;
  private depthMeters = 0;
  private hp = START_HP;
  private playerColor: PrismColor = 'yellow';
  private prismRemaining = 0;
  private chain = new Set<PrismColor>();
  private platformUid = 0;
  private lastGeneratedRow = -1;
  private lastGeneratedY = 0;
  private rows = new Map<number, PlatformImage[]>();
  private colorChanges = 0;
  private pickupsCollected = 0;
  private hitStopActive = false;
  private controlsLockedUntil = 0;
  private blueControlUntil = 0;
  private blueDirection: -1 | 1 = 1;
  private nextPressDamageAt = 0;
  private touchDirection: -1 | 0 | 1 = 0;
  private touchPointerId: number | null = null;
  private reducedMotion = false;

  private player!: Phaser.Physics.Arcade.Image;
  private playerOverlay!: Phaser.GameObjects.Image;
  private platforms!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;
  private keys?: Keys;

  private background!: Phaser.GameObjects.Rectangle;
  private paperSpecks: Phaser.GameObjects.Rectangle[] = [];
  private leftTicks!: Phaser.GameObjects.TileSprite;
  private rightTicks!: Phaser.GameObjects.TileSprite;
  private scoreText!: Phaser.GameObjects.Text;
  private depthText!: Phaser.GameObjects.Text;
  private hpGraphics!: Phaser.GameObjects.Graphics;
  private chainGraphics!: Phaser.GameObjects.Graphics;
  private chainLabel!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private screenWash!: Phaser.GameObjects.Rectangle;
  private overlay?: Phaser.GameObjects.Container;
  private tutorialLabels: Phaser.GameObjects.Text[] = [];

  private readonly audio: ArcadeAudio;

  constructor(private readonly gh: GameHubClient) {
    super('prism-drop');
    this.audio = new ArcadeAudio(() => this.gh.muted);
  }

  init() {
    this.state = 'intro';
    this.runSeed = readSeed();
    this.rng = new SeededRng(this.runSeed);
    this.startedAt = 0;
    this.score = 0;
    this.bonusScore = 0;
    this.depthMeters = 0;
    this.hp = START_HP;
    this.playerColor = 'yellow';
    this.prismRemaining = 0;
    this.chain = new Set<PrismColor>();
    this.platformUid = 0;
    this.lastGeneratedRow = -1;
    this.lastGeneratedY = 0;
    this.rows = new Map<number, PlatformImage[]>();
    this.colorChanges = 0;
    this.pickupsCollected = 0;
    this.hitStopActive = false;
    this.controlsLockedUntil = 0;
    this.blueControlUntil = 0;
    this.blueDirection = 1;
    this.nextPressDamageAt = 0;
    this.touchDirection = 0;
    this.touchPointerId = null;
    this.tutorialLabels = [];
    this.paperSpecks = [];
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  create() {
    this.cameras.main.setScroll(0, 0);
    createGameTextures(this);
    this.createBackdrop();
    this.createWorld();
    this.createHud();
    this.createControls();
    this.createIntro();
    this.physics.pause();
    const query = new URLSearchParams(window.location.search);
    if (query.has('autostart')) {
      this.startRun();
    }
  }

  private createBackdrop() {
    this.background = this.add
      .rectangle(W / 2, H / 2, W, H, colorNumber(DEPTH_BANDS[0]))
      .setScrollFactor(0)
      .setDepth(-100);

    const grainRandom = new SeededRng(77123);
    for (let i = 0; i < 115; i += 1) {
      const speck = this.add
        .rectangle(
          grainRandom.next() * W,
          grainRandom.next() * H,
          grainRandom.next() > 0.9 ? 2 : 1,
          grainRandom.next() > 0.94 ? 2 : 1,
          colorNumber(PAPER.ink),
          0.035 + grainRandom.next() * 0.045,
        )
        .setScrollFactor(0)
        .setDepth(-96);
      this.paperSpecks.push(speck);
    }

    this.add
      .rectangle(FIELD_LEFT / 2, H / 2, FIELD_LEFT, H, colorNumber(PAPER.wall))
      .setScrollFactor(0)
      .setDepth(-80);
    this.add
      .rectangle(
        FIELD_RIGHT + (W - FIELD_RIGHT) / 2,
        H / 2,
        W - FIELD_RIGHT,
        H,
        colorNumber(PAPER.wall),
      )
      .setScrollFactor(0)
      .setDepth(-80);

    this.leftTicks = this.add
      .tileSprite(FIELD_LEFT / 2, H / 2, 30, H, 'wall-ticks')
      .setFlipX(true)
      .setScrollFactor(0)
      .setDepth(-70);
    this.rightTicks = this.add
      .tileSprite(FIELD_RIGHT + 15, H / 2, 30, H, 'wall-ticks')
      .setScrollFactor(0)
      .setDepth(-70);

    const edge = this.add.graphics().setScrollFactor(0).setDepth(-60);
    edge.lineStyle(2, colorNumber(PAPER.ink), 0.52);
    edge.lineBetween(FIELD_LEFT, HUD_BOTTOM, FIELD_LEFT, H);
    edge.lineBetween(FIELD_RIGHT, HUD_BOTTOM, FIELD_RIGHT, H);

    this.createPress();
  }

  private createPress() {
    const press = this.add.container(0, HUD_BOTTOM).setScrollFactor(0).setDepth(100);
    const shadow = this.add.rectangle(W / 2 + 3, 24, W + 8, 41, 0x000000, 0.1);
    const body = this.add.rectangle(W / 2, 20, W + 4, 40, colorNumber(PAPER.ink));
    const face = this.add.rectangle(W / 2, 16, W + 4, 27, colorNumber(PAPER.wallDeep));
    const highlight = this.add.rectangle(
      W / 2,
      5,
      W + 4,
      4,
      colorNumber(PAPER.highlight),
      0.62,
    );
    press.add([shadow, body, face, highlight]);
    for (let x = 48; x < W; x += 92) {
      const bolt = this.add.circle(x, 17, 6, colorNumber(PAPER.ink), 0.72);
      const core = this.add.circle(x - 1, 15, 2, colorNumber(PAPER.highlight), 0.55);
      press.add([bolt, core]);
    }
    press.add(
      this.add
        .text(W / 2, 15, 'D E S C E N T   P R E S S', {
          fontFamily: UI_FONT,
          fontSize: '9px',
          color: PAPER.highlight,
          letterSpacing: 3,
        })
        .setOrigin(0.5),
    );
  }

  private createWorld() {
    this.physics.world.setBounds(
      FIELD_LEFT,
      -10_000,
      FIELD_RIGHT - FIELD_LEFT,
      10_000_000,
      true,
      true,
      false,
      false,
    );

    this.platforms = this.physics.add.group({ allowGravity: false, immovable: true });
    this.pickups = this.physics.add.group({ allowGravity: false, immovable: true });

    this.player = this.physics.add
      .image(W / 2, 272, `player-${this.playerColor}`)
      .setDepth(20)
      .setCollideWorldBounds(true);
    this.player.setMaxVelocity(430, TERMINAL_SPEED);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER_W - 7, PLAYER_H - 4, true);
    body.setAllowGravity(false);

    this.playerOverlay = this.add
      .image(this.player.x, this.player.y, `player-${this.playerColor}`)
      .setVisible(false)
      .setDepth(21);

    this.physics.add.collider(
      this.player,
      this.platforms,
      (_player, platform) => this.onPlatformContact(platform as PlatformImage),
      (_player, platform) => this.canLand(platform as PlatformImage),
      this,
    );
    this.physics.add.overlap(
      this.player,
      this.pickups,
      (_player, pickup) => this.collectPickup(pickup as PickupImage),
      undefined,
      this,
    );

    this.spawnTutorialRows();
    while (this.lastGeneratedY < H + ROW_GAP * 2) this.generateNextRow();
  }

  private spawnTutorialRows() {
    TUTORIAL_ROWS.forEach((row, index) => {
      const y = FIRST_ROW_Y + index * ROW_GAP;
      this.spawnPlatform(row.x, y, index, row.color, index % 2 === 0 ? 1 : -1, false);
      const label = this.add
        .text(row.x, y - 49, row.label, {
          fontFamily: UI_FONT,
          fontStyle: 'bold',
          fontSize: '11px',
          color: PAPER.ink,
          backgroundColor: '#fffaf0d9',
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5)
        .setDepth(8);
      this.tutorialLabels.push(label);
      this.lastGeneratedRow = index;
      this.lastGeneratedY = y;
    });
  }

  private createHud() {
    this.add
      .rectangle(W / 2, HUD_BOTTOM / 2, W, HUD_BOTTOM, colorNumber(PAPER.top), 0.97)
      .setScrollFactor(0)
      .setDepth(110);
    this.add
      .rectangle(W / 2, HUD_BOTTOM - 2, W, 3, colorNumber(PAPER.ink), 0.86)
      .setScrollFactor(0)
      .setDepth(111);

    this.add
      .text(24, 15, 'PRISM DROP', {
        fontFamily: DISPLAY_FONT,
        fontSize: '27px',
        color: PAPER.ink,
        letterSpacing: 1,
      })
      .setScrollFactor(0)
      .setDepth(112);
    this.add
      .text(27, 52, 'SCORE', this.smallLabelStyle())
      .setScrollFactor(0)
      .setDepth(112);
    this.scoreText = this.add
      .text(27, 69, '000000', {
        fontFamily: DISPLAY_FONT,
        fontSize: '19px',
        color: PAPER.ink,
      })
      .setScrollFactor(0)
      .setDepth(112);

    this.add
      .text(W / 2, 20, 'DEPTH', this.smallLabelStyle())
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(112);
    this.depthText = this.add
      .text(W / 2, 37, '000 m', {
        fontFamily: DISPLAY_FONT,
        fontSize: '20px',
        color: PAPER.ink,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(112);

    this.add
      .text(466, 17, 'HP', this.smallLabelStyle())
      .setScrollFactor(0)
      .setDepth(112);
    this.hpGraphics = this.add.graphics().setScrollFactor(0).setDepth(112);

    this.chainLabel = this.add
      .text(224, 77, 'CHAIN', this.smallLabelStyle())
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(112);
    this.chainGraphics = this.add.graphics().setScrollFactor(0).setDepth(112);
    this.drawHealth();
    this.drawChain();

    this.statusText = this.add
      .text(W / 2, 188, '', {
        fontFamily: DISPLAY_FONT,
        fontSize: '16px',
        color: PAPER.ink,
        stroke: PAPER.highlight,
        strokeThickness: 5,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(130)
      .setAlpha(0);

    this.screenWash = this.add
      .rectangle(W / 2, H / 2, W, H, 0xffffff, 0)
      .setScrollFactor(0)
      .setDepth(150);
  }

  private smallLabelStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: UI_FONT,
      fontSize: '10px',
      fontStyle: 'bold',
      color: PAPER.inkSoft,
      letterSpacing: 1.5,
    };
  }

  private createControls() {
    this.input.setPollAlways();
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.keys = keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.LEFT,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        a: Phaser.Input.Keyboard.KeyCodes.A,
        d: Phaser.Input.Keyboard.KeyCodes.D,
        space: Phaser.Input.Keyboard.KeyCodes.SPACE,
        enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      }) as Keys;
      this.keys.space.on('down', () => this.handleStartInput());
      this.keys.enter.on('down', () => this.handleStartInput());
    }

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.state !== 'playing') {
        this.handleStartInput();
        return;
      }
      if (this.touchPointerId !== null && this.touchPointerId !== pointer.id) return;
      this.touchPointerId = pointer.id;
      this.touchDirection = pointer.x < W / 2 ? -1 : 1;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.state !== 'playing' || !pointer.isDown || pointer.id !== this.touchPointerId) return;
      this.touchDirection = pointer.x < W / 2 ? -1 : 1;
    });
    const releasePointer = (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== this.touchPointerId) return;
      this.touchPointerId = null;
      this.touchDirection = 0;
    };
    this.input.on('pointerup', releasePointer);
    this.input.on('pointerupoutside', releasePointer);
  }

  private handleStartInput() {
    if (this.state === 'intro') this.startRun();
    else if (this.state === 'over' && this.gh.standalone) this.scene.restart();
  }

  private createIntro() {
    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(220);
    const background = this.add.rectangle(
      W / 2,
      H / 2,
      W,
      H,
      colorNumber(PAPER.top),
      0.985,
    );
    const title = this.add
      .text(W / 2, 166, 'PRISM\nDROP', {
        fontFamily: DISPLAY_FONT,
        fontSize: '74px',
        color: PAPER.ink,
        align: 'center',
        lineSpacing: -16,
      })
      .setOrigin(0.5);
    const promise = this.add
      .text(W / 2, 276, 'BECOME IT. BLOCK IT. DROP.', {
        fontFamily: UI_FONT,
        fontStyle: 'bold',
        fontSize: '14px',
        color: PAPER.inkSoft,
        letterSpacing: 2.5,
      })
      .setOrigin(0.5);

    const samples: Phaser.GameObjects.Image[] = [];
    COLOR_ORDER.forEach((color, index) => {
      samples.push(
        this.add
          .image(96 + index * 112, 372 + (index % 2) * 18, platformTextureKey(color))
          .setScale(0.76),
      );
    });
    const blob = this.add.image(W / 2, 442, 'player-blue').setScale(1.25);
    const rule = this.add
      .text(W / 2, 535, 'Your color disables every matching platform.', {
        fontFamily: DISPLAY_FONT,
        fontSize: '20px',
        color: PAPER.ink,
      })
      .setOrigin(0.5);
    const detail = this.add
      .text(
        W / 2,
        580,
        'Every fresh platform triggers once.\nFive distinct colors complete the prism.',
        {
          fontFamily: UI_FONT,
          fontSize: '14px',
          color: PAPER.inkSoft,
          align: 'center',
          lineSpacing: 7,
        },
      )
      .setOrigin(0.5);
    const controls = this.add
      .text(W / 2, 683, 'HOLD LEFT / RIGHT SIDE\nor use A / D · ← / →', {
        fontFamily: UI_FONT,
        fontStyle: 'bold',
        fontSize: '16px',
        color: PAPER.ink,
        align: 'center',
        lineSpacing: 7,
      })
      .setOrigin(0.5);
    const start = this.add
      .text(W / 2, 793, 'TAP OR PRESS SPACE TO DROP', {
        fontFamily: DISPLAY_FONT,
        fontSize: '17px',
        color: PAPER.highlight,
        backgroundColor: PAPER.ink,
        padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5);

    container.add([
      background,
      ...samples,
      blob,
      title,
      promise,
      rule,
      detail,
      controls,
      start,
    ]);
    this.overlay = container;

    if (!this.reducedMotion) {
      this.tweens.add({
        targets: start,
        scaleX: 1.035,
        scaleY: 1.035,
        duration: 720,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private startRun() {
    if (this.state !== 'intro') return;
    this.state = 'playing';
    this.startedAt = this.time.now;
    this.nextPressDamageAt = this.time.now;
    this.overlay?.destroy();
    this.overlay = undefined;
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
    this.physics.resume();
  }

  private spawnPlatform(
    x: number,
    y: number,
    row: number,
    color: PrismColor,
    direction: -1 | 1,
    allowPickup: boolean,
  ): PlatformImage {
    const platform = this.platforms.create(
      x,
      y,
      platformTextureKey(color, false, direction),
    ) as PlatformImage;
    platform.setDepth(6).setImmovable(true).setPushable(false);
    const body = platform.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(PLATFORM_W, PLATFORM_H, true);
    const data: PlatformData = {
      uid: ++this.platformUid,
      row,
      color,
      used: false,
      direction,
      retracted: false,
      movingUntil: 0,
    };
    platform.setData('platform', data);
    const rowPlatforms = this.rows.get(row) ?? [];
    rowPlatforms.push(platform);
    this.rows.set(row, rowPlatforms);

    if (allowPickup && this.rng.next() < PICKUP_CHANCE) {
      const pickup = this.pickups.create(x, y - 37, 'score-pickup') as PickupImage;
      pickup.setDepth(9);
      (pickup.body as Phaser.Physics.Arcade.Body).setAllowGravity(false).setCircle(13, 8, 8);
      pickup.setData('platformUid', data.uid);
      data.pickup = pickup;
      if (!this.reducedMotion) {
        this.tweens.add({
          targets: pickup,
          y: y - 43,
          duration: 650,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
    return platform;
  }

  private generateNextRow() {
    const row = this.lastGeneratedRow + 1;
    const y = this.lastGeneratedY + ROW_GAP;
    const previous = this.rows.get(row - 1)?.filter((platform) => platform.active) ?? [];
    const reachable = LANES.filter((lane) =>
      previous.length === 0 || previous.some((platform) => Math.abs(platform.x - lane) <= 224),
    );
    const firstX = this.rng.pick(reachable.length ? reachable : LANES);
    const xs = [firstX];
    if (this.rng.next() < 0.56) {
      const secondChoices = LANES.filter(
        (lane) => Math.abs(lane - firstX) >= 180 && previous.some((p) => Math.abs(p.x - lane) <= 224),
      );
      if (secondChoices.length) xs.push(this.rng.pick(secondChoices));
    }

    for (const x of xs) {
      const directAbove = previous.reduce<PlatformImage | undefined>((closest, candidate) => {
        if (!closest) return candidate;
        return Math.abs(candidate.x - x) < Math.abs(closest.x - x) ? candidate : closest;
      }, undefined);
      const forbid =
        directAbove && this.rng.next() < FORCED_MISMATCH_CHANCE
          ? new Set<PrismColor>([dataOf(directAbove).color])
          : undefined;
      const color = this.pickPlatformColor(y * METERS_PER_PIXEL, forbid);
      const direction: -1 | 1 = this.rng.next() < 0.5 ? -1 : 1;
      this.spawnPlatform(x, y, row, color, direction, true);
    }
    this.lastGeneratedRow = row;
    this.lastGeneratedY = y;
  }

  private pickPlatformColor(depth: number, forbid?: Set<PrismColor>): PrismColor {
    const late = clamp((depth - 220) / 500, 0, 1);
    const weights: Record<PrismColor, number> = {
      red: 17 + 12 * late,
      yellow: 29 - 9 * late,
      green: 9 - 2 * late,
      blue: 27 - 4 * late,
      purple: 18 + 7 * late,
    };
    const entries = COLOR_ORDER.filter((color) => !forbid?.has(color)).map((color) => ({
      value: color,
      weight: weights[color],
    }));
    return this.rng.weighted(entries);
  }

  private canLand(platform: PlatformImage): boolean {
    if (!platform.active || this.state !== 'playing' || this.hitStopActive) return false;
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const platformBody = platform.body as Phaser.Physics.Arcade.Body;
    return playerBody.velocity.y >= -5 && playerBody.bottom <= platformBody.top + 18;
  }

  private onPlatformContact(platform: PlatformImage) {
    if (this.state !== 'playing' || !platform.active) return;
    const data = dataOf(platform);
    if (data.used) return;
    data.used = true;
    this.audio.land();
    this.landSquash();
    this.landingBurst(platform.x, platform.y - 8, data.color);
    data.pickup?.setData('platformUsed', true);

    if (this.prismRemaining > 0) {
      platform.setTexture(platformTextureKey(data.color, true, data.direction));
      if (data.color === 'green') this.heal(1);
      this.prismRemaining -= 1;
      this.audio.match();
      this.staticCue(`PRISM SAFE · ${this.prismRemaining} LEFT`, COLORS[data.color].fill);
      this.drawChain();
      return;
    }

    const completesChain = this.recordChain(data.color);
    const safeMatch = data.color === this.playerColor;
    platform.setTexture(platformTextureKey(data.color, true, data.direction));

    if (safeMatch) {
      this.audio.match();
      this.staticCue('MATCH · GIMMICK DISABLED', COLORS[data.color].fill);
    } else {
      this.audio.mismatch();
      this.applyGimmick(platform, data, completesChain);
      if (data.color !== this.playerColor) {
        this.playerColor = data.color;
        this.colorChanges += 1;
        this.bonusScore += REPAINT_SCORE;
        this.repaintPlayer(data.color);
        this.drawHealth();
        this.audio.repaint();
      }
    }

    if (completesChain && this.state === 'playing') this.activatePrism();
    if (this.hp <= 0 && this.state === 'playing') this.endRun('OUT OF COLOR');
  }

  private applyGimmick(
    platform: PlatformImage,
    data: PlatformData,
    rainbowRescuePending: boolean,
  ) {
    switch (data.color) {
      case 'red':
        this.damage(2, 'SPIKE', rainbowRescuePending);
        this.player.setVelocityY(-230);
        this.beginHitStop(120);
        this.shake(0.008, 150);
        break;
      case 'yellow':
        this.player.setVelocityY(-810);
        this.staticCue('SPRING · TIME LOST', COLORS.yellow.fill);
        break;
      case 'blue':
        this.blueControlUntil = this.time.now + 400;
        this.blueDirection = data.direction;
        data.movingUntil = this.time.now + 400;
        platform.setVelocityX(data.direction * 115);
        this.player.setVelocityX(data.direction * 390);
        this.staticCue(data.direction < 0 ? 'SLIDE LEFT' : 'SLIDE RIGHT', COLORS.blue.fill);
        break;
      case 'purple':
        this.warnAndCrumble(platform);
        this.staticCue('CRUMBLE · MOVE', COLORS.purple.fill);
        break;
      case 'green':
        this.heal(1);
        this.audio.heal();
        this.staticCue('+1 HP · BLOOM', COLORS.green.fill);
        break;
    }
  }

  private warnAndCrumble(platform: PlatformImage) {
    if (!platform.active) return;
    if (!this.reducedMotion) {
      this.tweens.add({
        targets: platform,
        angle: { from: -1.2, to: 1.2 },
        alpha: { from: 1, to: 0.52 },
        duration: 62,
        yoyo: true,
        repeat: 1,
      });
    } else {
      platform.setTint(colorNumber(PAPER.highlight));
    }
    this.time.delayedCall(250, () => {
      if (!platform.active) return;
      const data = dataOf(platform);
      data.pickup?.destroy();
      this.crumbleBurst(platform.x, platform.y);
      platform.destroy();
    });
  }

  private recordChain(color: PrismColor): boolean {
    if (this.chain.has(color)) this.chain.clear();
    this.chain.add(color);
    this.drawChain();
    return this.chain.size === COLOR_ORDER.length;
  }

  private activatePrism() {
    this.prismRemaining = 3;
    this.chain.clear();
    this.bonusScore += PRISM_SCORE;
    this.heal(MAX_HP);
    this.audio.prism();
    this.drawChain();
    this.prismBurst();
    this.banner('PRISM COMPLETE · 3 SAFE DROPS', PAPER.ink);
  }

  private collectPickup(pickup: PickupImage) {
    if (!pickup.active || this.state !== 'playing') return;
    const x = pickup.x;
    const y = pickup.y;
    this.tweens.killTweensOf(pickup);
    pickup.destroy();
    this.pickupsCollected += 1;
    this.bonusScore += PICKUP_SCORE;
    this.audio.pickup();
    this.popText(x, y, `+${PICKUP_SCORE}`, PAPER.ink);
    this.paperBurst(x, y);
  }

  private heal(amount: number) {
    const previous = this.hp;
    this.hp = Math.min(MAX_HP, this.hp + amount);
    if (this.hp !== previous) this.drawHealth();
  }

  private damage(amount: number, source: string, deferDeath = false) {
    if (this.state !== 'playing') return;
    this.hp = Math.max(0, this.hp - amount);
    this.drawHealth();
    this.flash(colorNumber(COLORS.red.fill), 0.17, 210);
    this.staticCue(`-${amount} HP · ${source}`, COLORS.red.fill);
    if (navigator.vibrate) navigator.vibrate(amount > 1 ? [55, 25, 70] : 45);
    if (this.hp <= 0 && !deferDeath) this.endRun('OUT OF COLOR');
  }

  private repaintPlayer(color: PrismColor) {
    if (this.reducedMotion) {
      this.player.setTexture(`player-${color}`);
      this.resizePlayerBody();
      this.flash(tintFor(color), 0.22, 180);
      this.staticCue(
        `COLOR → ${color.toUpperCase()} · MATCHES DISABLED`,
        COLORS[color].fill,
      );
      return;
    }

    this.playerOverlay
      .setTexture(`player-${color}`)
      .setVisible(true)
      .setCrop(0, 67, 58, 1);
    const wipe = { amount: 0 };
    this.tweens.add({
      targets: wipe,
      amount: 1,
      duration: 100,
      ease: 'Sine.easeOut',
      onUpdate: () => {
        const height = Math.max(1, Math.round(68 * wipe.amount));
        this.playerOverlay.setCrop(0, 68 - height, 58, height);
      },
      onComplete: () => {
        this.player.setTexture(`player-${color}`);
        this.resizePlayerBody();
        this.playerOverlay.setVisible(false).setCrop();
      },
    });
    this.flash(tintFor(color), 0.1, 160);
    this.staticCue(
      `COLOR → ${color.toUpperCase()} · MATCHES DISABLED`,
      COLORS[color].fill,
    );
  }

  private resizePlayerBody() {
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(
      PLAYER_W - 7,
      PLAYER_H - 4,
      true,
    );
  }

  private landSquash() {
    if (this.reducedMotion) return;
    this.tweens.killTweensOf(this.player);
    this.tweens.killTweensOf(this.playerOverlay);
    this.player.setScale(1.16, 0.82);
    this.playerOverlay.setScale(1.16, 0.82);
    this.tweens.add({
      targets: [this.player, this.playerOverlay],
      scaleX: 1,
      scaleY: 1,
      duration: 165,
      ease: 'Back.easeOut',
    });
  }

  private beginHitStop(duration: number) {
    if (this.hitStopActive || this.state !== 'playing') return;
    this.hitStopActive = true;
    this.controlsLockedUntil = this.time.now + duration;
    this.player.setVelocityX(0);
    this.physics.pause();
    this.time.delayedCall(duration, () => {
      this.hitStopActive = false;
      if (this.state === 'playing') this.physics.resume();
    });
  }

  private updateMovement(time: number) {
    if (this.state !== 'playing' || this.hitStopActive) return;
    const left = Boolean(this.keys?.left.isDown || this.keys?.a.isDown);
    const right = Boolean(this.keys?.right.isDown || this.keys?.d.isDown);
    let direction = (right ? 1 : 0) - (left ? 1 : 0);
    if (direction === 0) direction = this.touchDirection;
    if (time < this.controlsLockedUntil) direction = 0;

    if (time < this.blueControlUntil) {
      this.player.setVelocityX(this.blueDirection * 330 + direction * 72);
    } else {
      this.player.setVelocityX(direction * MOVE_SPEED);
    }
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (body.velocity.y > TERMINAL_SPEED) body.setVelocityY(TERMINAL_SPEED);
  }

  private updateCamera(delta: number) {
    if (this.hitStopActive) return;
    const elapsed = this.time.now - this.startedAt;
    const speed = Phaser.Math.Linear(
      SCROLL_START,
      SCROLL_END,
      clamp(elapsed / SCROLL_RAMP_MS, 0, 1),
    );
    this.cameras.main.scrollY += (speed * clamp(delta, 0, 50)) / 1000;
    this.depthMeters = Math.max(0, this.cameras.main.scrollY * METERS_PER_PIXEL);

    const bandProgress = this.depthMeters / 250;
    const bandIndex = Math.floor(bandProgress) % DEPTH_BANDS.length;
    const nextBand = (bandIndex + 1) % DEPTH_BANDS.length;
    const color = mixColor(
      DEPTH_BANDS[bandIndex]!,
      DEPTH_BANDS[nextBand]!,
      bandProgress - Math.floor(bandProgress),
    );
    this.background.setFillStyle(colorNumber(color));
    this.leftTicks.tilePositionY = this.cameras.main.scrollY;
    this.rightTicks.tilePositionY = this.cameras.main.scrollY;
  }

  private updatePressure(time: number) {
    const screenY = this.player.y - this.cameras.main.scrollY;
    const top = screenY - PLAYER_H / 2;
    if (top < PRESS_BOTTOM) {
      this.player.y = this.cameras.main.scrollY + PRESS_BOTTOM + PLAYER_H / 2;
      this.player.setVelocityY(Math.max(245, this.player.body!.velocity.y));
      (this.player.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
      if (time >= this.nextPressDamageAt) {
        this.nextPressDamageAt = time + PRESS_DAMAGE_INTERVAL;
        this.audio.press();
        this.damage(1, 'PRESS');
        this.shake(0.004, 100);
      }
    } else {
      this.nextPressDamageAt = Math.min(this.nextPressDamageAt, time);
    }
    if (screenY - PLAYER_H / 2 > H + 28) this.endRun('LOST BELOW');
  }

  private updatePlatforms(time: number) {
    const cleanupY = this.cameras.main.scrollY + 60;
    for (const platform of this.platforms.getChildren() as PlatformImage[]) {
      if (!platform.active) continue;
      const data = dataOf(platform);
      if (data.movingUntil > 0 && time >= data.movingUntil) {
        data.movingUntil = 0;
        platform.setVelocityX(0);
      }
      if (data.pickup?.active) {
        data.pickup.x = platform.x;
        (data.pickup.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
      }
      if (platform.x - PLATFORM_W / 2 < FIELD_LEFT) {
        platform.x = FIELD_LEFT + PLATFORM_W / 2;
        platform.setVelocityX(0);
        (platform.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
      } else if (platform.x + PLATFORM_W / 2 > FIELD_RIGHT) {
        platform.x = FIELD_RIGHT - PLATFORM_W / 2;
        platform.setVelocityX(0);
        (platform.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
      }

      if (data.color === 'red' && !data.used) {
        const shouldRetract =
          this.playerColor === 'red' &&
          this.player.y < platform.y &&
          platform.y - this.player.y <= ROW_GAP * 1.38;
        if (shouldRetract !== data.retracted) {
          data.retracted = shouldRetract;
          platform.setTexture(
            platformTextureKey('red', false, data.direction, shouldRetract),
          );
        }
      }

      if (platform.y < cleanupY) {
        data.pickup?.destroy();
        platform.destroy();
      }
    }
    for (const pickup of this.pickups.getChildren() as PickupImage[]) {
      if (pickup.active && pickup.y < cleanupY) {
        this.tweens.killTweensOf(pickup);
        pickup.destroy();
      }
    }
    for (const [row, rowPlatforms] of this.rows) {
      if (
        row < this.lastGeneratedRow - 10 &&
        rowPlatforms.every((platform) => !platform.active)
      ) {
        this.rows.delete(row);
      }
    }
    while (this.lastGeneratedY < this.cameras.main.scrollY + H + ROW_GAP * 2) {
      this.generateNextRow();
    }
  }

  private updatePlayerVisuals() {
    this.playerOverlay
      .setPosition(this.player.x, this.player.y)
      .setAngle(this.player.angle);
  }

  private updateHud() {
    const elapsedSeconds =
      this.state === 'playing' ? Math.max(0, (this.time.now - this.startedAt) / 1000) : 0;
    this.score = Math.max(
      this.score,
      Math.floor(this.depthMeters * 10 + elapsedSeconds * 5 + this.bonusScore),
    );
    this.scoreText.setText(String(this.score).padStart(6, '0'));
    this.depthText.setText(`${Math.floor(this.depthMeters).toString().padStart(3, '0')} m`);
  }

  private drawHealth() {
    if (!this.hpGraphics) return;
    const x = 466;
    const y = 44;
    const width = 148;
    const ratio = this.hp / MAX_HP;
    this.hpGraphics.clear();
    this.hpGraphics.fillStyle(colorNumber(PAPER.wall), 1);
    this.hpGraphics.fillRoundedRect(x, y, width, 15, 7);
    this.hpGraphics.fillStyle(tintFor(this.playerColor), 1);
    this.hpGraphics.fillRoundedRect(x + 2, y + 2, (width - 4) * ratio, 11, 5);
    this.hpGraphics.lineStyle(2, colorNumber(PAPER.ink), 0.92);
    this.hpGraphics.strokeRoundedRect(x, y, width, 15, 7);
    for (let i = 1; i < MAX_HP; i += 1) {
      const tickX = x + (width * i) / MAX_HP;
      this.hpGraphics.lineStyle(1, colorNumber(PAPER.ink), 0.23);
      this.hpGraphics.lineBetween(tickX, y + 3, tickX, y + 12);
    }
  }

  private drawChain() {
    if (!this.chainGraphics || !this.chainLabel) return;
    this.chainGraphics.clear();
    const complete = this.prismRemaining > 0;
    const startX = 239;
    COLOR_ORDER.forEach((color, index) => {
      const bright = complete || this.chain.has(color);
      const x = startX + index * 36;
      const spec = COLORS[color];
      this.chainGraphics.fillStyle(
        colorNumber(bright ? spec.fill : spec.usedShade),
        bright ? 1 : 0.52,
      );
      this.chainGraphics.fillRoundedRect(x, 68, 25, 18, 5);
      this.chainGraphics.lineStyle(
        bright ? 2 : 1,
        colorNumber(bright ? PAPER.highlight : PAPER.ink),
        bright ? 0.95 : 0.46,
      );
      this.chainGraphics.strokeRoundedRect(x, 68, 25, 18, 5);
      if (bright) {
        this.chainGraphics.fillStyle(colorNumber(PAPER.highlight), 0.55);
        this.chainGraphics.fillRect(x + 4, 71, 12, 2);
      }
    });
    this.chainLabel.setText(complete ? `PRISM ×${this.prismRemaining}` : 'CHAIN');
  }

  private landingBurst(x: number, y: number, color: PrismColor) {
    if (this.reducedMotion) {
      const ring = this.add
        .ellipse(x, y, 76, 18, tintFor(color), 0.12)
        .setStrokeStyle(3, tintFor(color), 0.9)
        .setDepth(14);
      this.time.delayedCall(150, () => ring.destroy());
      return;
    }
    for (let i = 0; i < 9; i += 1) {
      const shard = this.add.image(x, y, `shard-${color}`).setDepth(14);
      const direction = i / 8 - 0.5;
      this.tweens.add({
        targets: shard,
        x: x + direction * (64 + Math.random() * 35),
        y: y - 12 - Math.random() * 24,
        angle: direction * 160,
        alpha: 0,
        duration: 260 + Math.random() * 170,
        ease: 'Quad.easeOut',
        onComplete: () => shard.destroy(),
      });
    }
  }

  private crumbleBurst(x: number, y: number) {
    const count = this.reducedMotion ? 7 : 17;
    for (let i = 0; i < count; i += 1) {
      const shard = this.add.image(
        x - 48 + (i / Math.max(1, count - 1)) * 96,
        y,
        'shard-purple',
      );
      shard.setDepth(13).setAngle(this.rng.integer(-40, 40));
      if (this.reducedMotion) {
        this.time.delayedCall(180, () => shard.destroy());
      } else {
        this.tweens.add({
          targets: shard,
          x: shard.x + this.rng.integer(-32, 32),
          y: y + this.rng.integer(48, 104),
          angle: shard.angle + this.rng.integer(-180, 180),
          alpha: 0,
          duration: this.rng.integer(320, 560),
          ease: 'Quad.easeIn',
          onComplete: () => shard.destroy(),
        });
      }
    }
  }

  private paperBurst(x: number, y: number) {
    for (let i = 0; i < (this.reducedMotion ? 4 : 10); i += 1) {
      const fleck = this.add
        .rectangle(x, y, 5, 3, colorNumber(PAPER.pickup))
        .setStrokeStyle(1, colorNumber(PAPER.ink), 0.7)
        .setDepth(30);
      if (this.reducedMotion) {
        fleck.x += (i - 2) * 8;
        this.time.delayedCall(150, () => fleck.destroy());
      } else {
        const angle = (Math.PI * 2 * i) / 10;
        this.tweens.add({
          targets: fleck,
          x: x + Math.cos(angle) * 52,
          y: y + Math.sin(angle) * 52,
          angle: Phaser.Math.RadToDeg(angle),
          alpha: 0,
          duration: 430,
          onComplete: () => fleck.destroy(),
        });
      }
    }
  }

  private prismBurst() {
    this.flash(colorNumber(PAPER.highlight), 0.55, 420);
    COLOR_ORDER.forEach((color, index) => {
      const band = this.add
        .rectangle(
          -W,
          250 + index * 72,
          W * 1.5,
          18,
          tintFor(color),
          this.reducedMotion ? 0.32 : 0.52,
        )
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(145)
        .setAngle(-8);
      if (this.reducedMotion) {
        band.x = -80;
        this.time.delayedCall(260, () => band.destroy());
      } else {
        this.tweens.add({
          targets: band,
          x: W + 120,
          duration: 520 + index * 45,
          ease: 'Cubic.easeOut',
          onComplete: () => band.destroy(),
        });
      }
    });
  }

  private staticCue(message: string, color: string) {
    this.statusText.setText(message).setColor(color).setAlpha(1).setY(188);
    this.tweens.killTweensOf(this.statusText);
    if (this.reducedMotion) {
      this.time.delayedCall(440, () => this.statusText.setAlpha(0));
    } else {
      this.tweens.add({
        targets: this.statusText,
        y: 178,
        alpha: 0,
        delay: 250,
        duration: 420,
        ease: 'Quad.easeOut',
      });
    }
  }

  private banner(message: string, color: string) {
    const line = this.add
      .rectangle(W / 2, 228, 268, 3, colorNumber(color), 0.9)
      .setScrollFactor(0)
      .setDepth(165);
    const label = this.add
      .text(W / 2, 207, message, {
        fontFamily: DISPLAY_FONT,
        fontSize: '16px',
        color,
        stroke: PAPER.highlight,
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(166);
    if (this.reducedMotion) {
      this.time.delayedCall(700, () => {
        line.destroy();
        label.destroy();
      });
      return;
    }
    line.setScale(0, 1);
    label.setAlpha(0).setY(216);
    this.tweens.add({
      targets: line,
      scaleX: 1,
      duration: 180,
      yoyo: true,
      hold: 650,
      onComplete: () => line.destroy(),
    });
    this.tweens.add({
      targets: label,
      y: 207,
      alpha: 1,
      duration: 180,
      yoyo: true,
      hold: 610,
      onComplete: () => label.destroy(),
    });
  }

  private popText(x: number, y: number, message: string, color: string) {
    const text = this.add
      .text(x, y, message, {
        fontFamily: DISPLAY_FONT,
        fontSize: '16px',
        color,
        stroke: PAPER.highlight,
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(40);
    if (this.reducedMotion) {
      this.time.delayedCall(260, () => text.destroy());
    } else {
      this.tweens.add({
        targets: text,
        y: y - 38,
        alpha: 0,
        duration: 620,
        ease: 'Quad.easeOut',
        onComplete: () => text.destroy(),
      });
    }
  }

  private flash(color: number, alpha: number, duration: number) {
    this.tweens.killTweensOf(this.screenWash);
    this.screenWash.setFillStyle(color, 1).setAlpha(alpha);
    if (this.reducedMotion) {
      this.time.delayedCall(Math.min(160, duration), () => this.screenWash.setAlpha(0));
    } else {
      this.tweens.add({ targets: this.screenWash, alpha: 0, duration });
    }
  }

  private shake(intensity: number, duration: number) {
    if (!this.reducedMotion) this.cameras.main.shake(duration, intensity, true);
  }

  private endRun(reason: 'OUT OF COLOR' | 'LOST BELOW') {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.physics.pause();
    this.touchDirection = 0;
    this.audio.gameOver();
    this.updateHud();

    const veil = this.add
      .rectangle(W / 2, H / 2, W, H, colorNumber(PAPER.ink), 0.82)
      .setScrollFactor(0)
      .setDepth(250);
    const title = this.add
      .text(W / 2, 360, reason, {
        fontFamily: DISPLAY_FONT,
        fontSize: '43px',
        color: PAPER.highlight,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(251);
    const result = this.add
      .text(
        W / 2,
        443,
        `${this.score.toLocaleString('en-US')} POINTS\n${Math.floor(this.depthMeters)} m DEEP`,
        {
          fontFamily: UI_FONT,
          fontStyle: 'bold',
          fontSize: '18px',
          color: PAPER.highlight,
          align: 'center',
          lineSpacing: 9,
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(251);
    const restart = this.add
      .text(
        W / 2,
        548,
        this.gh.standalone ? 'TAP OR PRESS SPACE TO DROP AGAIN' : 'SCORE TRANSMITTED',
        {
          fontFamily: UI_FONT,
          fontStyle: 'bold',
          fontSize: '13px',
          color: PAPER.pickup,
          letterSpacing: 1.5,
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(251);
    this.overlay = this.add.container(0, 0, [veil, title, result, restart]).setDepth(250);

    this.gh.gameOver({
      score: this.score,
      durationMs: Math.max(0, Math.round(this.time.now - this.startedAt)),
      meta: {
        depthMeters: Math.floor(this.depthMeters),
        seed: this.runSeed,
        colorChanges: this.colorChanges,
        pickups: this.pickupsCollected,
        reason,
      },
    });
  }

  update(time: number, delta: number) {
    this.updatePlayerVisuals();
    if (this.state !== 'playing') return;
    if (this.hitStopActive) {
      this.updateHud();
      return;
    }
    this.updateMovement(time);
    this.updateCamera(delta);
    this.updatePressure(time);
    if (this.state !== 'playing') return;
    this.updatePlatforms(time);
    this.updateHud();
  }
}
