import Phaser from 'phaser';
import { GameHubClient, initGameHub } from '@gamehub/sdk';
import bgmUrl from '../res/sound/bgm_bullet_hell.mp3';
import gameOverUrl from '../res/sound/game_over.mp3';
import hitUrl from '../res/sound/hit.mp3';
import itemUrl from '../res/sound/item.mp3';
import shootUrl from '../res/sound/shoot.mp3';
import successUrl from '../res/sound/success.mp3';

const W = 600;
const H = 800;
const START_LIVES = 3;

/* ------------------------------- wave config ------------------------------- */
const WAVES_PER_CYCLE = 5; // last wave of each cycle is the boss wave
const WAVE_BANNER_MS = 1500;
const WAVE_CLEAR_DELAY_MS = 800;

/* --------------------------------- scoring -------------------------------- */
const KILL_SCORE = 100; // per normal enemy; the SCORE pickup grants the same
const BOSS_KILL_SCORE = 500;

/* --------------------------------- player --------------------------------- */
const PLAYER_FIRE_MS = 160;
const PLAYER_BULLET_SPEED = 520;
const PLAYER_MAX_LINES = 5;
const DIAGONAL_RAD = Phaser.Math.DegToRad(15); // outer lines at 4+ lines
const DMG_PER_TYPE1 = 0.01; // additive: 5 pickups = +5%

/* ---------------------------------- drops --------------------------------- */
const DROP_RATE_TYPE2 = 0.05; // fire-line power-up on normal mobs (boss: always)
const DROP_RATE_TYPE1 = 0.4; // damage power-up
const DROP_RATE_SCORE = 0.25; // bonus score pickup
const ITEM_FALL_SPEED = 110;
const BOSS_HP_ITEM_EVERY = 4; // every 4th boss (waves 20, 40, ...) drops a heart

/* --------------------------------- enemies -------------------------------- */
const ENEMY_FAN_MAX_LEVEL = 8; // levels 1..8 only have the cone attack, on a timer
const ENEMY_CONE_MAX_LINES = 6; // enemy cone lines = min(level, 6)
const BOSS_CONE_LINES = 8;
const RADIAL_RAYS = 8; // bullets per radial volley (level 9+ and bosses)
const ENEMY_ROTATE_STEPS = 3; // burst waves per full sweep between two rays (level 9+)
const BOSS_ROTATE_STEPS = 4; // same, for bosses
const ENEMY_HP_BASE = 2; // level 1 HP; +1 per level up to level 9
const ENEMY_HP_GROWTH = 0.1; // +10% of level-9 HP per level past 9
const ENEMY_BULLET_SPEED = 175;
const RADIAL_BULLET_SPEED = 85; // moving-radial bullet speed (boss scales off its own)
const FAN_STEP_RAD = Phaser.Math.DegToRad(10);
const VOLLEY_GAP_MS = 500; // between volleys inside a moving-radial move
const ENEMY_MOVE_GAP_MS = 1100; // pause between level-9+ enemy moves
const ENEMY_MOVING_VOLLEYS = 3; // moving-radial volleys per move
const BOSS_MOVING_VOLLEYS = 4;

/* ------------------------------ burst radial ------------------------------ */
const BURST_SPEED_FACTOR = 0.7; // burst bullets fly at 70% of the moving-radial speed
const BURST_WAVE_GAP_MS = 300;
const BURST_STANDSTILL_MIN_MS = 500; // stand still (charge-up) before bursting
const BURST_STANDSTILL_MAX_MS = 1000;
const BURST_MIN_WAVES = 4;
const BURST_WAVES_EVERY_LEVELS = 2; // +1 wave every 2 levels
const ENEMY_BURST_MAX_WAVES = 6;
const BOSS_BURST_MAX_WAVES = 20;

/* ---------------------------------- boss ----------------------------------- */
const BOSS_BASE_HP = 100;
const BOSS_HP_PER_LEVEL = 150;
const BOSS_RADIAL_SPEED = 95;
const BOSS_AIMED_SPEED = 270;
const BOSS_SKILL_GAP_MS = 900; // pause between boss moves (moves never overlap)
const BOSS_AIMED_SHOTS = 6;
const BOSS_AIMED_GAP_MS = 110;

/* ---------------------------------- audio ---------------------------------- */
const BGM_VOLUME = 0.45;
const SFX_VOLUME: Record<SfxKey, number> = {
  shoot: 0.07,
  hit: 0.7,
  item: 0.7,
  success: 0.7,
  game_over: 0.7,
};
type SfxKey = 'shoot' | 'hit' | 'item' | 'success' | 'game_over';

/* --------------------------------- visuals -------------------------------- */
// Player bullet color per damage tier (x1, x2, x3, ...); clamps at the last.
const PLAYER_TIER_COLORS = [0xfff275, 0xffb347, 0xff5d8f, 0xc084fc, 0x8ef6ff];
// Enemy body tint by level; clamps at the last (level 9+).
const ENEMY_TINTS = [
  0xff5d8f, 0xffb347, 0xfff275, 0x9dff4d, 0x4dffc3, 0x4dd2ff, 0x8f7bff, 0xff5df2, 0xff4d4d,
];
const BOSS_TINTS = [0xff4d6d, 0xb44dff, 0x4dd2ff, 0x9dff4d];
// [straight shots, radial rays A, radial rays B] — cycles with boss level.
const BOSS_PALETTES: [number, number, number][] = [
  [0xff4d4d, 0xffd93d, 0xff8f3d],
  [0x4dd2ff, 0xff5df2, 0x8f7bff],
  [0x9dff4d, 0xfff275, 0x4dffc3],
];

// x offset and firing angle (from straight up) for each line count.
const LINE_GEOMETRY: { dx: number; rad: number }[][] = [
  [{ dx: 0, rad: 0 }],
  [
    { dx: -6, rad: 0 },
    { dx: 6, rad: 0 },
  ],
  [
    { dx: -11, rad: 0 },
    { dx: 0, rad: 0 },
    { dx: 11, rad: 0 },
  ],
  [
    { dx: -14, rad: -DIAGONAL_RAD },
    { dx: -6, rad: 0 },
    { dx: 6, rad: 0 },
    { dx: 14, rad: DIAGONAL_RAD },
  ],
  [
    { dx: -16, rad: -DIAGONAL_RAD },
    { dx: -9, rad: 0 },
    { dx: 0, rad: 0 },
    { dx: 9, rad: 0 },
    { dx: 16, rad: DIAGONAL_RAD },
  ],
];

function enemyHp(level: number): number {
  const hp9 = ENEMY_HP_BASE + Math.min(level, 9) - 1;
  if (level <= 9) return hp9;
  return hp9 * (1 + ENEMY_HP_GROWTH * (level - 9));
}

function enemyFireMs(level: number): number {
  return 2600 - (Math.min(level, ENEMY_FAN_MAX_LEVEL) - 1) * 150;
}

function burstWaves(level: number, isBoss: boolean): number {
  const waves = BURST_MIN_WAVES + Math.floor((level - 1) / BURST_WAVES_EVERY_LEVELS);
  return Math.min(waves, isBoss ? BOSS_BURST_MAX_WAVES : ENEMY_BURST_MAX_WAVES);
}

// Damage multiplier per line. Extra points (type-2 pickups past the line cap)
// upgrade lines one tier at a time from the center outward.
function lineMultipliers(lines: number, extra: number): number[] {
  const mults: number[] = new Array(lines).fill(1 + Math.floor(extra / lines));
  const centerOut = Array.from({ length: lines }, (_, i) => i).sort(
    (a, b) => Math.abs(a - (lines - 1) / 2) - Math.abs(b - (lines - 1) / 2),
  );
  for (let i = 0; i < extra % lines; i++) mults[centerOut[i]] += 1;
  return mults;
}

type State = 'ready' | 'playing' | 'dead';
type Sprite = Phaser.Physics.Arcade.Sprite;

class BulletHellScene extends Phaser.Scene {
  private state: State = 'ready';
  private ship!: Sprite;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private items!: Phaser.Physics.Arcade.Group;
  private lives = START_LIVES;
  private score = 0;
  private wave = 0;
  private type1 = 0; // damage power-ups collected
  private type2 = 0; // fire-line power-ups collected
  private boss: Sprite | null = null;
  private spawningWave = false;
  private waveTransitionQueued = false;
  private startedAt = 0;
  private invulnUntil = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private powerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private bossBarBg?: Phaser.GameObjects.Rectangle;
  private bossBarFill?: Phaser.GameObjects.Rectangle;
  private bossLabel?: Phaser.GameObjects.Text;
  private borderFlash!: Phaser.GameObjects.Rectangle;
  private target = new Phaser.Math.Vector2(W / 2, H * 0.8);

  constructor(private readonly gh: GameHubClient) {
    super('bullet-hell');
  }

  preload() {
    this.load.audio('bgm', bgmUrl);
    this.load.audio('shoot', shootUrl);
    this.load.audio('hit', hitUrl);
    this.load.audio('item', itemUrl);
    this.load.audio('success', successUrl);
    this.load.audio('game_over', gameOverUrl);
  }

  create() {
    // Honor the shell's Sound Control: initial state + live toggles.
    this.sound.mute = this.gh.muted;
    this.gh.onMutedChange((muted) => {
      this.sound.mute = muted;
    });

    this.makeTextures();
    this.addStarfield();

    this.playerBullets = this.physics.add.group({ maxSize: 120 });
    this.enemyBullets = this.physics.add.group({ maxSize: 400 });
    this.enemies = this.physics.add.group();
    this.items = this.physics.add.group();

    this.ship = this.physics.add.sprite(W / 2, H * 0.8, 'ship');
    this.ship.setCircle(8, 8, 10);
    this.ship.setDepth(5);

    this.scoreText = this.add
      .text(12, 10, 'SCORE 0', { fontFamily: 'monospace', fontSize: '22px', color: '#8ef6ff' })
      .setDepth(10);
    this.waveText = this.add
      .text(W / 2, 10, '', { fontFamily: 'monospace', fontSize: '22px', color: '#fff275' })
      .setOrigin(0.5, 0)
      .setDepth(10);
    this.livesText = this.add
      .text(W - 12, 10, '♥'.repeat(START_LIVES), {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#ff5d8f',
      })
      .setOrigin(1, 0)
      .setDepth(10);
    this.powerText = this.add
      .text(12, H - 8, '', { fontFamily: 'monospace', fontSize: '14px', color: '#9fb2c8' })
      .setOrigin(0, 1)
      .setDepth(10);
    const hello = this.gh.playerName ? `${this.gh.playerName} — ` : '';
    this.hintText = this.add
      .text(
        W / 2,
        H / 2,
        `${hello}${this.gh.locale === 'vi' ? 'chạm / di chuột để bắt đầu' : 'tap / move mouse to start'}`,
        { fontFamily: 'monospace', fontSize: '22px', color: '#ffffff', align: 'center' },
      )
      .setOrigin(0.5)
      .setDepth(10);

    this.borderFlash = this.add
      .rectangle(W / 2, H / 2, W - 12, H - 12)
      .setStrokeStyle(14, 0xff3355)
      .setDepth(20)
      .setAlpha(0);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));

    this.physics.add.overlap(this.playerBullets, this.enemies, (bullet, enemy) =>
      this.onPlayerBulletHit(bullet as Sprite, enemy as Sprite),
    );
    this.physics.add.overlap(this.ship, this.enemyBullets, (_ship, bullet) =>
      this.hitPlayer(bullet as Sprite),
    );
    this.physics.add.overlap(this.ship, this.enemies, (_ship, enemy) =>
      this.hitPlayer(enemy as Sprite),
    );
    this.physics.add.overlap(this.ship, this.items, (_ship, item) =>
      this.collectItem(item as Sprite),
    );
  }

  private makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x53f2e6).fillTriangle(16, 0, 0, 30, 32, 30);
    g.fillStyle(0x1a7f8a).fillTriangle(16, 10, 8, 28, 24, 28);
    g.generateTexture('ship', 32, 32);
    g.clear();
    // Enemy and boss bodies are white so per-level tints read true.
    g.fillStyle(0xffffff);
    g.fillPoints(
      [
        new Phaser.Geom.Point(14, 0),
        new Phaser.Geom.Point(28, 14),
        new Phaser.Geom.Point(14, 28),
        new Phaser.Geom.Point(0, 14),
      ],
      true,
    );
    g.fillStyle(0x222233).fillCircle(14, 14, 5);
    g.generateTexture('enemy', 28, 28);
    g.clear();
    g.fillStyle(0xffffff);
    g.fillPoints(
      [
        new Phaser.Geom.Point(28, 0),
        new Phaser.Geom.Point(56, 28),
        new Phaser.Geom.Point(28, 56),
        new Phaser.Geom.Point(0, 28),
      ],
      true,
    );
    g.fillStyle(0xdddddd).fillTriangle(28, 8, 10, 28, 46, 28);
    g.fillStyle(0x222233).fillCircle(28, 28, 10);
    g.generateTexture('boss', 56, 56);
    g.clear();
    PLAYER_TIER_COLORS.forEach((color, i) => {
      const w = 4 + i;
      g.fillStyle(color).fillRect(0, 0, w, 12);
      g.generateTexture(`pb${i + 1}`, w, 12);
      g.clear();
    });
    g.fillStyle(0xff4d4d).fillCircle(5, 5, 5);
    g.fillStyle(0xffd0d0).fillCircle(5, 5, 2);
    g.generateTexture('ebullet', 10, 10);
    g.clear();
    g.fillStyle(0xff8f3d).fillRoundedRect(0, 0, 20, 20, 5);
    g.fillStyle(0xffffff).fillTriangle(10, 3, 3, 12, 17, 12);
    g.fillRect(8, 12, 4, 5);
    g.generateTexture('item_dmg', 20, 20);
    g.clear();
    g.fillStyle(0x2dd4bf).fillRoundedRect(0, 0, 20, 20, 5);
    g.lineStyle(2, 0xffffff);
    g.strokeLineShape(new Phaser.Geom.Line(10, 17, 4, 4));
    g.strokeLineShape(new Phaser.Geom.Line(10, 17, 10, 3));
    g.strokeLineShape(new Phaser.Geom.Line(10, 17, 16, 4));
    g.generateTexture('item_line', 20, 20);
    g.clear();
    g.fillStyle(0xffd93d).fillCircle(10, 10, 9);
    g.fillStyle(0xb8860b).fillCircle(10, 10, 6);
    g.fillStyle(0xffd93d).fillRect(8, 5, 4, 10);
    g.generateTexture('item_score', 20, 20);
    g.clear();
    g.fillStyle(0xff5d8f);
    g.fillCircle(6, 8, 5.5);
    g.fillCircle(14, 8, 5.5);
    g.fillTriangle(1, 10, 19, 10, 10, 19);
    g.generateTexture('item_hp', 20, 20);
    g.clear();
    g.fillStyle(0xffffff).fillCircle(2, 2, 2);
    g.generateTexture('star', 4, 4);
    g.destroy();
  }

  // Lazily builds an enemy-bullet texture in an arbitrary color (boss palettes).
  private bulletTexture(color: number): string {
    const key = `eb_${color.toString(16)}`;
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(color).fillCircle(5, 5, 5);
      g.fillStyle(0xffffff, 0.85).fillCircle(5, 5, 2);
      g.generateTexture(key, 10, 10);
      g.destroy();
    }
    return key;
  }

  private addStarfield() {
    for (let i = 0; i < 60; i++) {
      const star = this.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 'star');
      star.setAlpha(Phaser.Math.FloatBetween(0.2, 0.8)).setScale(Phaser.Math.FloatBetween(0.5, 1.2));
      this.tweens.add({
        targets: star,
        y: `+=${H}`,
        duration: Phaser.Math.Between(6000, 16000),
        repeat: -1,
        onRepeat: () => star.setY(-4).setX(Phaser.Math.Between(0, W)),
      });
    }
  }

  private onPointer(p: Phaser.Input.Pointer) {
    this.target.set(p.worldX, p.worldY);
    if (this.state === 'ready') this.startRun();
  }

  private sfx(key: SfxKey) {
    this.sound.play(key, { volume: SFX_VOLUME[key] });
  }

  private startRun() {
    this.state = 'playing';
    this.startedAt = this.time.now;
    this.hintText.setVisible(false);
    this.updatePowerText();
    this.sound.play('bgm', { loop: true, volume: BGM_VOLUME });

    this.time.addEvent({ delay: PLAYER_FIRE_MS, loop: true, callback: () => this.firePlayer() });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickScore() });

    // Dev helpers: ?wave=5 starts at that wave, ?p1=10&p2=7 pre-loads power-ups.
    const params = new URLSearchParams(location.search);
    this.type1 = Math.max(0, Number(params.get('p1')) || 0);
    this.type2 = Math.max(0, Number(params.get('p2')) || 0);
    this.updatePowerText();
    this.startWave(Math.max(1, Number(params.get('wave')) || 1));
  }

  /* --------------------------------- waves --------------------------------- */

  private startWave(n: number) {
    if (this.state !== 'playing') return;
    this.wave = n;
    this.waveTransitionQueued = false;
    this.spawningWave = true;
    this.waveText.setText(`WAVE ${n}`);

    const isBoss = n % WAVES_PER_CYCLE === 0;
    const level = Math.floor((n - 1) / WAVES_PER_CYCLE) + 1;

    const banner = this.add
      .text(W / 2, H * 0.4, isBoss ? `WAVE ${n}\nBOSS` : `WAVE ${n}`, {
        fontFamily: 'monospace',
        fontSize: '44px',
        color: isBoss ? '#ff5d8f' : '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(11)
      .setAlpha(0);
    this.tweens.add({
      targets: banner,
      alpha: { from: 0, to: 1 },
      duration: 250,
      yoyo: true,
      hold: WAVE_BANNER_MS - 500,
      onComplete: () => banner.destroy(),
    });

    this.time.delayedCall(WAVE_BANNER_MS, () => {
      if (this.state !== 'playing') return;
      if (isBoss) {
        this.spawnBoss(level);
        this.spawningWave = false;
        return;
      }
      const count = ((n - 1) % WAVES_PER_CYCLE) + 1;
      for (let i = 0; i < count; i++) {
        this.time.delayedCall(i * 250, () => this.spawnEnemy(level, i, count));
      }
      this.time.delayedCall(count * 250 + 50, () => {
        this.spawningWave = false;
        this.checkWaveClear();
      });
    });
  }

  private checkWaveClear() {
    if (this.state !== 'playing' || this.spawningWave || this.waveTransitionQueued) return;
    if (this.enemies.countActive(true) > 0) return;
    this.waveTransitionQueued = true;
    this.time.delayedCall(WAVE_CLEAR_DELAY_MS, () => this.startWave(this.wave + 1));
  }

  /* -------------------------------- enemies -------------------------------- */

  private spawnEnemy(level: number, slot: number, count: number) {
    if (this.state !== 'playing') return;
    const x = Phaser.Math.Clamp(
      (W * (slot + 1)) / (count + 1) + Phaser.Math.Between(-30, 30),
      40,
      W - 40,
    );
    const enemy = this.enemies.create(x, -30, 'enemy') as Sprite;
    enemy.setCircle(12, 2, 2);
    enemy.setDepth(2);
    const tint = ENEMY_TINTS[Math.min(level, ENEMY_TINTS.length) - 1];
    enemy.setTint(tint);
    enemy.setData({ hp: enemyHp(level), maxHp: enemyHp(level), level, boss: false, tint });

    this.tweens.add({
      targets: enemy,
      y: Phaser.Math.Between(80, 250),
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (!enemy.active || this.state !== 'playing') return;
        const sway = Phaser.Math.Between(30, 60) * (enemy.x > W / 2 ? -1 : 1);
        const drift = this.tweens.add({
          targets: enemy,
          x: enemy.x + sway,
          duration: Phaser.Math.Between(1200, 2000),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        enemy.setData('drift', drift);
        if (level <= ENEMY_FAN_MAX_LEVEL) {
          const fire = this.time.addEvent({
            delay: enemyFireMs(level),
            loop: true,
            callback: () => this.coneAttack(enemy, Math.min(level, ENEMY_CONE_MAX_LINES)),
          });
          enemy.setData('fire', fire);
        } else {
          this.time.delayedCall(ENEMY_MOVE_GAP_MS / 2, () => this.enemyMoveLoop(enemy));
        }
      },
    });
  }

  // Cone attack: `lines` bullets fanned around straight ahead (down).
  private coneAttack(src: Sprite, lines: number, tex = 'ebullet') {
    if (!src.active || this.state !== 'playing') return;
    for (let i = 0; i < lines; i++) {
      const angle = Math.PI / 2 + (i - (lines - 1) / 2) * FAN_STEP_RAD;
      this.spawnEnemyBullet(src.x, src.y + src.displayHeight * 0.4, angle, ENEMY_BULLET_SPEED, tex);
    }
  }

  // Level 9+ enemies pick a random move each turn, never repeating the last.
  private enemyMoveLoop(enemy: Sprite) {
    if (!enemy.active || this.state !== 'playing') return;
    const last = enemy.getData('lastMove') as string | undefined;
    const move = Phaser.Math.RND.pick(['radial', 'burst', 'cone'].filter((m) => m !== last));
    enemy.setData('lastMove', move);
    const next = () => {
      if (!enemy.active || this.state !== 'playing') return;
      this.time.delayedCall(ENEMY_MOVE_GAP_MS, () => this.enemyMoveLoop(enemy));
    };
    if (move === 'radial') {
      this.movingRadial(enemy, ENEMY_MOVING_VOLLEYS, RADIAL_BULLET_SPEED, 'ebullet', 'ebullet', next);
    } else if (move === 'burst') {
      this.burstRadial(
        enemy,
        ENEMY_ROTATE_STEPS,
        RADIAL_BULLET_SPEED * BURST_SPEED_FACTOR,
        'ebullet',
        'ebullet',
        next,
      );
    } else {
      this.coneAttack(enemy, ENEMY_CONE_MAX_LINES);
      next();
    }
  }

  // One radial volley of RADIAL_RAYS bullets rotated by offsetRad; rays alternate texA/texB.
  private fireRadial(source: Sprite, offsetRad: number, speed: number, texA: string, texB: string) {
    const gap = (Math.PI * 2) / RADIAL_RAYS;
    for (let i = 0; i < RADIAL_RAYS; i++) {
      this.spawnEnemyBullet(
        source.x,
        source.y,
        offsetRad + i * gap,
        speed,
        i % 2 === 0 ? texA : texB,
      );
    }
  }

  // Radial move 1: identical volleys with no rotation offset, fired while the
  // entity keeps moving — the same pattern repeats from different centers.
  private movingRadial(
    src: Sprite,
    volleys: number,
    speed: number,
    texA: string,
    texB: string,
    done: () => void,
  ) {
    let fired = 0;
    const fireNext = () => {
      if (!src.active || this.state !== 'playing') return;
      this.fireRadial(src, 0, speed, texA, texB);
      fired += 1;
      if (fired < volleys) this.time.delayedCall(VOLLEY_GAP_MS, fireNext);
      else done();
    };
    fireNext();
  }

  // Radial move 2: stop, stand still charging up, then burst waves of slow
  // bullets whose rotation offset advances by (ray gap / steps) each wave.
  private burstRadial(
    src: Sprite,
    steps: number,
    speed: number,
    texA: string,
    texB: string,
    done: () => void,
  ) {
    if (!src.active || this.state !== 'playing') return;
    const waves = burstWaves(src.getData('level') as number, src.getData('boss') as boolean);
    (src.getData('drift') as Phaser.Tweens.Tween | undefined)?.pause();
    const charge = this.tweens.add({ targets: src, scale: 1.12, yoyo: true, repeat: -1, duration: 140 });
    this.time.delayedCall(
      Phaser.Math.Between(BURST_STANDSTILL_MIN_MS, BURST_STANDSTILL_MAX_MS),
      () => {
        charge.stop();
        if (!src.active || this.state !== 'playing') return;
        src.setScale(1);
        const gap = (Math.PI * 2) / RADIAL_RAYS;
        let wave = 0;
        const fireWave = () => {
          if (!src.active || this.state !== 'playing') return;
          this.fireRadial(src, (wave % steps) * (gap / steps), speed, texA, texB);
          wave += 1;
          if (wave < waves) this.time.delayedCall(BURST_WAVE_GAP_MS, fireWave);
          else {
            (src.getData('drift') as Phaser.Tweens.Tween | undefined)?.resume();
            done();
          }
        };
        fireWave();
      },
    );
  }

  private spawnEnemyBullet(x: number, y: number, angle: number, speed: number, tex: string) {
    const bullet = this.enemyBullets.get(x, y, tex) as Sprite | null;
    if (!bullet) return;
    bullet.setActive(true).setVisible(true).setTexture(tex);
    bullet.body!.reset(x, y);
    bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    (bullet.body as Phaser.Physics.Arcade.Body).setCircle(5);
  }

  /* ---------------------------------- boss ---------------------------------- */

  private spawnBoss(level: number) {
    const hp = BOSS_BASE_HP + BOSS_HP_PER_LEVEL * (level - 1);
    const boss = this.enemies.create(W / 2, -60, 'boss') as Sprite;
    boss.setCircle(24, 4, 4);
    boss.setDepth(2);
    const tint = BOSS_TINTS[(level - 1) % BOSS_TINTS.length];
    boss.setTint(tint);
    boss.setData({ hp, maxHp: hp, level, boss: true, tint });
    this.boss = boss;

    const barW = W - 160;
    this.bossLabel = this.add
      .text(W / 2, 46, `BOSS Lv.${level}`, { fontFamily: 'monospace', fontSize: '14px', color: '#ff8fa8' })
      .setOrigin(0.5)
      .setDepth(10);
    this.bossBarBg = this.add
      .rectangle(W / 2, 62, barW, 12, 0x1a2233)
      .setStrokeStyle(1, 0x44556a)
      .setDepth(10);
    this.bossBarFill = this.add
      .rectangle(W / 2 - barW / 2 + 1, 62, barW - 2, 8, 0xff4d6d)
      .setOrigin(0, 0.5)
      .setDepth(10);

    this.tweens.add({
      targets: boss,
      y: 120,
      duration: 1200,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (!boss.active || this.state !== 'playing') return;
        // Glide from the entrance spot to one side first, then loop
        // side-to-side — never jump-cut to the strafe start position.
        const glide = this.tweens.add({
          targets: boss,
          x: 90,
          duration: 1200,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            if (!boss.active) return;
            const strafe = this.tweens.add({
              targets: boss,
              x: W - 90,
              duration: 2400,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            });
            boss.setData('drift', strafe);
          },
        });
        boss.setData('drift', glide);
        this.bossMoveLoop(boss);
      },
    });
  }

  // Boss moves never overlap: random move (≠ last) -> wait -> next move.
  private bossMoveLoop(boss: Sprite) {
    if (!boss.active || this.state !== 'playing') return;
    const palette = BOSS_PALETTES[((boss.getData('level') as number) - 1) % BOSS_PALETTES.length];
    const texAim = this.bulletTexture(palette[0]);
    const texA = this.bulletTexture(palette[1]);
    const texB = this.bulletTexture(palette[2]);
    const last = boss.getData('lastMove') as string | undefined;
    const move = Phaser.Math.RND.pick(['radial', 'burst', 'aimed', 'cone'].filter((m) => m !== last));
    boss.setData('lastMove', move);
    const next = () => {
      if (!boss.active || this.state !== 'playing') return;
      this.time.delayedCall(BOSS_SKILL_GAP_MS, () => this.bossMoveLoop(boss));
    };
    if (move === 'radial') {
      this.movingRadial(boss, BOSS_MOVING_VOLLEYS, BOSS_RADIAL_SPEED, texA, texB, next);
    } else if (move === 'burst') {
      this.burstRadial(boss, BOSS_ROTATE_STEPS, BOSS_RADIAL_SPEED * BURST_SPEED_FACTOR, texA, texB, next);
    } else if (move === 'aimed') {
      this.aimedStream(boss, texAim, next);
    } else {
      this.coneAttack(boss, BOSS_CONE_LINES, texAim);
      next();
    }
  }

  // Straight-shot skill: a rapid stream aimed at the player's current position.
  private aimedStream(boss: Sprite, tex: string, done: () => void) {
    for (let i = 0; i < BOSS_AIMED_SHOTS; i++) {
      this.time.delayedCall(i * BOSS_AIMED_GAP_MS, () => {
        if (!boss.active || this.state !== 'playing') return;
        const angle = Phaser.Math.Angle.Between(boss.x, boss.y, this.ship.x, this.ship.y);
        this.spawnEnemyBullet(boss.x, boss.y + 20, angle, BOSS_AIMED_SPEED, tex);
      });
    }
    this.time.delayedCall(BOSS_AIMED_SHOTS * BOSS_AIMED_GAP_MS, done);
  }

  private updateBossBar() {
    if (!this.boss || !this.bossBarFill) return;
    const pct = Phaser.Math.Clamp(
      (this.boss.getData('hp') as number) / (this.boss.getData('maxHp') as number),
      0,
      1,
    );
    this.bossBarFill.setScale(pct, 1);
  }

  private destroyBossBar() {
    this.bossBarBg?.destroy();
    this.bossBarFill?.destroy();
    this.bossLabel?.destroy();
    this.bossBarBg = this.bossBarFill = undefined;
    this.bossLabel = undefined;
  }

  /* ------------------------------ player firing ----------------------------- */

  private firePlayer() {
    if (this.state !== 'playing') return;
    this.sfx('shoot');
    const lines = Math.min(1 + this.type2, PLAYER_MAX_LINES);
    const extra = Math.max(0, this.type2 - PLAYER_MAX_LINES);
    const mults = lineMultipliers(lines, extra);
    const geometry = LINE_GEOMETRY[lines - 1];
    const dmgScale = 1 + this.type1 * DMG_PER_TYPE1;
    for (let i = 0; i < lines; i++) {
      const { dx, rad } = geometry[i];
      const tex = `pb${Math.min(mults[i], PLAYER_TIER_COLORS.length)}`;
      const x = this.ship.x + dx;
      const y = this.ship.y - 22;
      const bullet = this.playerBullets.get(x, y, tex) as Sprite | null;
      if (!bullet) return;
      bullet.setActive(true).setVisible(true).setTexture(tex);
      bullet.body!.reset(x, y);
      bullet.setRotation(rad);
      bullet.setVelocity(Math.sin(rad) * PLAYER_BULLET_SPEED, -Math.cos(rad) * PLAYER_BULLET_SPEED);
      bullet.setData('dmg', dmgScale * mults[i]);
    }
  }

  /* ------------------------------ hits & drops ------------------------------ */

  private onPlayerBulletHit(bullet: Sprite, enemy: Sprite) {
    if (!bullet.active || !enemy.active) return;
    const dmg = (bullet.getData('dmg') as number) ?? 1;
    bullet.destroy();
    const hp = (enemy.getData('hp') as number) - dmg;
    enemy.setData('hp', hp);
    if (enemy.getData('boss')) this.updateBossBar();
    if (hp <= 0) {
      this.killEnemy(enemy);
      return;
    }
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(40, () => {
      if (enemy.active) enemy.setTint(enemy.getData('tint') as number);
    });
  }

  private killEnemy(enemy: Sprite) {
    const isBoss = enemy.getData('boss') as boolean;
    (enemy.getData('fire') as Phaser.Time.TimerEvent | undefined)?.remove();
    this.tweens.killTweensOf(enemy);
    const boom = this.add.circle(enemy.x, enemy.y, isBoss ? 10 : 4, 0xffb347).setDepth(6);
    this.tweens.add({
      targets: boom,
      radius: isBoss ? 70 : 26,
      alpha: 0,
      duration: isBoss ? 500 : 250,
      onComplete: () => boom.destroy(),
    });
    this.addScore(isBoss ? BOSS_KILL_SCORE : KILL_SCORE);
    this.dropItems(enemy);
    if (isBoss) {
      this.sfx('success');
      this.boss = null;
      this.destroyBossBar();
      // Reward: clear the screen of enemy bullets when the boss falls.
      for (const b of this.enemyBullets.getChildren() as Sprite[]) {
        if (b.active) b.destroy();
      }
    }
    enemy.destroy();
    this.checkWaveClear();
  }

  private dropItems(enemy: Sprite) {
    const drops: string[] = [];
    if (enemy.getData('boss')) {
      drops.push('item_line'); // type 2 is guaranteed on bosses
      if (Math.random() < DROP_RATE_TYPE1) drops.push('item_dmg');
      if ((enemy.getData('level') as number) % BOSS_HP_ITEM_EVERY === 0) drops.push('item_hp');
    } else {
      const roll = Math.random();
      if (roll < DROP_RATE_TYPE2) drops.push('item_line');
      else if (roll < DROP_RATE_TYPE2 + DROP_RATE_TYPE1) drops.push('item_dmg');
      else if (roll < DROP_RATE_TYPE2 + DROP_RATE_TYPE1 + DROP_RATE_SCORE) drops.push('item_score');
    }
    drops.forEach((key, i) => {
      const x = Phaser.Math.Clamp(enemy.x + (i - (drops.length - 1) / 2) * 28, 14, W - 14);
      const item = this.items.create(x, enemy.y, key) as Sprite;
      item.setDepth(3);
      item.setVelocityY(ITEM_FALL_SPEED);
      this.tweens.add({ targets: item, scale: 1.2, yoyo: true, repeat: -1, duration: 400 });
    });
  }

  private collectItem(item: Sprite) {
    if (!item.active || this.state !== 'playing') return;
    const key = item.texture.key;
    this.tweens.killTweensOf(item);
    item.destroy();
    this.sfx('item');
    if (key === 'item_dmg') {
      this.type1 += 1;
      this.toast('+1% DMG', '#ff8f3d');
    } else if (key === 'item_line') {
      this.type2 += 1;
      this.toast(this.type2 < PLAYER_MAX_LINES ? '+1 LINE' : 'LINE UP!', '#2dd4bf');
    } else if (key === 'item_score') {
      this.addScore(KILL_SCORE);
      this.toast(`+${KILL_SCORE}`, '#ffd93d');
    } else if (key === 'item_hp') {
      this.lives += 1;
      this.livesText.setText('♥'.repeat(this.lives));
      this.toast('+1 ♥', '#ff5d8f');
    }
    this.updatePowerText();
  }

  private toast(msg: string, color: string) {
    const t = this.add
      .text(this.ship.x, this.ship.y - 34, msg, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color,
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  private updatePowerText() {
    const lines = Math.min(1 + this.type2, PLAYER_MAX_LINES);
    const extra = Math.max(0, this.type2 - PLAYER_MAX_LINES);
    this.powerText.setText(
      `DMG +${this.type1}% · LINES ${lines}${extra > 0 ? ` +${extra}` : ''}`,
    );
  }

  private addScore(points: number) {
    this.score += points;
    this.scoreText.setText(`SCORE ${this.score}`);
  }

  private tickScore() {
    if (this.state !== 'playing') return;
    this.addScore(10);
  }

  private hitPlayer(source: Sprite) {
    if (this.state !== 'playing' || this.time.now < this.invulnUntil) return;
    if (source.texture.key.startsWith('eb')) source.destroy();
    this.sfx('hit');
    this.tweens.killTweensOf(this.borderFlash);
    this.borderFlash.setAlpha(1);
    this.tweens.add({ targets: this.borderFlash, alpha: 0, duration: 500, ease: 'Sine.easeOut' });
    if (navigator.vibrate) navigator.vibrate([70, 40, 70]);
    this.lives -= 1;
    this.livesText.setText('♥'.repeat(Math.max(0, this.lives)));
    if (this.lives <= 0) {
      this.die();
      return;
    }
    this.invulnUntil = this.time.now + 2000;
    this.tweens.add({
      targets: this.ship,
      alpha: 0.25,
      yoyo: true,
      repeat: 7,
      duration: 125,
      onComplete: () => this.ship.setAlpha(1),
    });
  }

  update() {
    if (this.state === 'playing') {
      const dx = this.target.x - this.ship.x;
      const dy = this.target.y - this.ship.y;
      this.ship.setPosition(this.ship.x + dx * 0.18, this.ship.y + dy * 0.18);
      this.ship.x = Phaser.Math.Clamp(this.ship.x, 16, W - 16);
      this.ship.y = Phaser.Math.Clamp(this.ship.y, 16, H - 16);
    }
    // Recycle offscreen bullets and items
    for (const b of this.playerBullets.getChildren() as Sprite[]) {
      if (b.active && (b.y < -20 || b.x < -20 || b.x > W + 20)) b.destroy();
    }
    for (const b of this.enemyBullets.getChildren() as Sprite[]) {
      if (b.active && (b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20)) b.destroy();
    }
    for (const item of this.items.getChildren() as Sprite[]) {
      if (item.active && item.y > H + 30) {
        this.tweens.killTweensOf(item);
        item.destroy();
      }
    }
  }

  private die() {
    this.state = 'dead';
    this.physics.pause();
    this.time.removeAllEvents();
    this.sound.stopByKey('bgm');
    this.sfx('game_over');
    for (const e of this.enemies.getChildren() as Sprite[]) this.tweens.killTweensOf(e);
    this.ship.setTint(0xff4444);
    this.add
      .text(W / 2, H / 2, this.gh.locale === 'vi' ? 'Kết thúc!' : 'Game Over', {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.gh.gameOver({
      score: this.score,
      durationMs: Math.round(this.time.now - this.startedAt),
      meta: { wave: this.wave },
    });
  }
}

initGameHub().then((gh) => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: W,
    height: H,
    backgroundColor: '#05060f',
    physics: { default: 'arcade' },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: new BulletHellScene(gh),
  });
  // Debug handle (also used by the automated verification harness).
  (window as unknown as { game?: Phaser.Game }).game = game;
});
