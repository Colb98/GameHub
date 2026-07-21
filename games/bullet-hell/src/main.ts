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
const WAVES_PER_CYCLE = 5; // last wave of each cycle is a boss wave (sub-boss or boss)
const TIER_WAVES = WAVES_PER_CYCLE * 2; // one sub-boss + one boss per tier
const WAVE_BANNER_MS = 1500;
const WAVE_CLEAR_DELAY_MS = 800;

// Mob difficulty and boss identity (roster/HP/palette) both advance on this
// cadence — wave 5's sub-boss and wave 10's boss share tier 1, etc.
function waveTier(n: number): number {
  return Math.floor((n - 1) / TIER_WAVES) + 1;
}

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
// Every 2nd *tier's* full boss drops a heart — tiers now span 10 waves (vs the
// old 5-wave level), so halving the modulus keeps hearts on the same real
// wave numbers as before (20, 40, ...). Sub-bosses never drop hearts.
const BOSS_HP_ITEM_EVERY = 2;

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
// Cruising speed for every boss horizontal move — entrance glide, strafe, and
// any skill's reposition-to-anchor — so repositioning never looks like a snap
// relative to the normal strafe.
const BOSS_MOVE_SPEED = 175; // px/s
const BOSS_MOVE_MIN_MS = 150; // floor so a very short hop still animates smoothly

/* ---------------------------------- phase ----------------------------------- */
// Placeholder thresholds — real per-phase move pools/behavior TBD.
// Phase is only ever (re)computed between boss moves, never mid-pattern.
const BOSS_PHASE_THRESHOLDS = [0.7, 0.35]; // phase 2 at <=70% HP, phase 3 at <=35%
type BossPhase = 1 | 2 | 3;
function bossPhase(hpRatio: number): BossPhase {
  if (hpRatio <= BOSS_PHASE_THRESHOLDS[1]) return 3;
  if (hpRatio <= BOSS_PHASE_THRESHOLDS[0]) return 2;
  return 1;
}

/* ------------------------------ boss skills (touhou) ------------------------------ */
// Celestial Peony — counter-rotating spiral rings ('curved' motion mode).
const PEONY_RINGS = 12;
const PEONY_RINGS_HARD = 14;
const PEONY_RAYS = 10;
const PEONY_RAYS_HARD = 12;
const PEONY_RING_INTERVAL_MS = 170;
const PEONY_SPEED = 105;
const PEONY_ANGULAR_VELOCITY = 0.42; // rad/s, sign alternates per ring
const PEONY_CURVE_DURATION_MS = 1800;
const PEONY_RING_OFFSET_RAD = Phaser.Math.DegToRad(7.5);

// Scarlet Clock — delayed, snapshot-aimed constellation ('delayed' motion mode).
// Bullet count is derived per ring from its radius (see clockSkill) so every
// ring keeps roughly constant arc-length spacing — outer rings used to reuse the
// inner ring's fixed count and came out visibly sparse/lopsided.
const CLOCK_ARC_SPACING = 26; // target px between adjacent bullets on any ring
const CLOCK_MAX_RING_BULLETS = 72; // per-ring cap (multiple of CLOCK_GROUPS) so huge procedural rings can't explode
const CLOCK_GROUPS = 6; // staggered release parts per ring; bullets are interleaved across parts (not contiguous arcs)
const CLOCK_LOCK_MS = 900;
const CLOCK_GROUP_INTERVAL_MS = 140;
const CLOCK_LAUNCH_SPEED = 190;
const CLOCK_GROUP_ROTATION_RAD = Phaser.Math.DegToRad(5);
const CLOCK_RADIUS = 70; // innermost ring; each ring further out adds CLOCK_LAYER_RADIUS_STEP
const CLOCK_LAYER_RADIUS_STEP = 45;
const CLOCK_LAYERS = 3;
const CLOCK_LAYERS_HARD = 5;
const CLOCK_LAYERS_MAX = 8; // hard cap regardless of how far past tier 10 a procedural boss goes
// Outer ring locks and fires first ("outer arc lights up"), each ring further
// in follows this many ms later — the spec's three-beat countdown, generalized.
const CLOCK_LAYER_STAGGER_MS = 260;
const CLOCK_RESNAPSHOT_GROUPS = 2; // hard: re-aim the innermost ring's last N groups at a later snapshot

// Moonlit Lattice — telegraphed vertical bullet-wall curtains ('delayed' motion
// mode) that sweep horizontally across the field. Walls span (near) full height
// so they cover the player's low zone, and start at alternating edges so their
// sweep direction reads from where they form.
const LATTICE_MARGIN = 40;
const LATTICE_GRID_TOP = 100; // top of each wall; bottom mirrors this as H - LATTICE_GRID_TOP
const LATTICE_LINES_HARD_EXTRA = 1; // hard mode appends one more wall to the sequence
const LATTICE_TELEGRAPH_MS = 750;
const LATTICE_TELEGRAPH_MS_HARD = 450;
const LATTICE_ARM_AT_MS = 600; // armed anchors brighten this long before launch
const LATTICE_LINE_GAP_MS = 260;
const LATTICE_BULLET_SPEED = 150;
const LATTICE_ARMED_ALPHA = 0.9;
// A wall is filled with bullets at ~this spacing (px) along its length so it
// reads as a solid curtain instead of a handful of dodgeable dots; the safe gate
// is a contiguous run of this many bullets, omitted per wall.
const LATTICE_BULLET_SPACING = 26;
const LATTICE_GAP_BULLETS = 3;

// Butterfly Requiem — mirrored fans that decelerate, pause, then reverse ('decelPauseReverse').
const BUTTERFLY_FAN_BULLETS = 11; // per wing, per volley
const BUTTERFLY_VOLLEYS = 4;
const BUTTERFLY_VOLLEYS_HARD = 6;
const BUTTERFLY_VOLLEY_INTERVAL_MS = 260;
const BUTTERFLY_INITIAL_SPEED = 150;
const BUTTERFLY_DECELERATION = -95;
const BUTTERFLY_MIN_SPEED = 12;
const BUTTERFLY_PAUSE_MS = 350;
const BUTTERFLY_REVERSE_SPEED = 115;
const BUTTERFLY_REVERSE_ROTATION_RAD = Phaser.Math.DegToRad(12);
const BUTTERFLY_WING_SPREAD_RAD = Phaser.Math.DegToRad(70);
const BUTTERFLY_WING_INNER_RAD = Phaser.Math.DegToRad(20);
// Second, smaller wing fired after the first one closes, rotated for a fresh silhouette.
const BUTTERFLY_WING2_ROTATION_RAD = Phaser.Math.DegToRad(18);
const BUTTERFLY_WING2_BULLETS = 6;
const BUTTERFLY_PAUSE_SHOT_SPEED = 260; // hard-only sparse straight shots fired during the pause

// Prism Loom — sweeping beams + petal crossfire. Beams have no Arcade Physics
// primitive, so they're tracked/collided by hand — see activeBeams/update().
const PRISM_BEAM_COUNT = 3;
const PRISM_BEAM_COUNT_HARD = 4;
const PRISM_TELEGRAPH_MS = 800;
const PRISM_SWEEP_DURATION_MS = 2200;
const PRISM_SWEEP_ARC_RAD = Phaser.Math.DegToRad(35);
const PRISM_BEAM_WIDTH = 6; // visual thickness
const PRISM_COLLISION_WIDTH = 10; // hit-test thickness (slightly wider than the visual core)
const PRISM_BEAM_REACH = Math.hypot(W, H); // always reaches past any screen edge
const PRISM_PETAL_INTERVAL_MS = 240;
const PRISM_PETAL_SPEED = 92;
const PRISM_PETAL_SPREAD_RAD = Phaser.Math.DegToRad(14);
const PRISM_RECOVERY_MS = 900;

type SkillId = 'cone' | 'radial' | 'burst' | 'aimed' | 'peony' | 'clock' | 'lattice' | 'butterfly' | 'prism';

interface SkillCtx {
  texAim: string;
  texA: string;
  texB: string;
  hardIds: ReadonlySet<SkillId>;
}

interface TierRoster {
  base: SkillId[]; // phase 1-2 pool, and the only pool sub-bosses ever draw from
  signature?: SkillId; // phase-3 unlock, full bosses only
  hardIds?: SkillId[]; // which of base/signature run at hard tuning this tier
  combo?: SkillId[]; // procedural-only: run concurrently in phase 3 instead of signature
}

// One new skill introduced per tier through tier 6, then "remix" tiers 7-9 reuse
// skills at their own hard tuning, then tier 10 is a curated capstone (prism,
// hard, as a single signature — no combo; combo is procedural-only, see below).
const BOSS_TIERS: TierRoster[] = [
  { base: ['cone', 'radial', 'burst'] },
  { base: ['radial', 'burst', 'aimed'], signature: 'peony' },
  { base: ['burst', 'aimed', 'peony'], signature: 'clock' },
  { base: ['aimed', 'peony', 'clock'], signature: 'lattice' },
  { base: ['peony', 'clock', 'lattice'], signature: 'butterfly' },
  { base: ['clock', 'lattice', 'butterfly'], signature: 'prism' },
  { base: ['radial', 'aimed', 'lattice'], signature: 'peony', hardIds: ['peony'] },
  { base: ['burst', 'clock', 'butterfly'], signature: 'lattice', hardIds: ['lattice'] },
  { base: ['peony', 'clock', 'prism'], signature: 'butterfly', hardIds: ['peony', 'clock', 'butterfly'] },
  {
    base: ['lattice', 'butterfly', 'clock'],
    signature: 'prism',
    hardIds: ['lattice', 'butterfly', 'clock', 'prism'],
  },
];

const SUB_BOSS_HP_SCALE = 0.6;
// Sub-boss previews its paired tier's own roster (not a hand-me-down of the
// previous tier), minus its newest/hardest addition, and never a signature.
function subBossRoster(tier: number): SkillId[] {
  return BOSS_TIERS[tier - 1].base.slice(0, 2);
}

const ALL_SKILLS: SkillId[] = [
  'cone',
  'radial',
  'burst',
  'aimed',
  'peony',
  'clock',
  'lattice',
  'butterfly',
  'prism',
];
const PROCEDURAL_COMBO_CHANCE = 0.25;

// Tier 11+: sample from the full pool at hard tuning, with a chance of a
// two-skill combo phase (the only place two skills ever run concurrently).
function proceduralRoster(): TierRoster {
  const shuffled = Phaser.Utils.Array.Shuffle(ALL_SKILLS.slice());
  const [a, b, c, sig, second] = shuffled;
  const combo = Phaser.Math.RND.frac() < PROCEDURAL_COMBO_CHANCE ? [sig, second] : undefined;
  return { base: [a, b, c], signature: combo ? undefined : sig, hardIds: ALL_SKILLS, combo };
}

// Computed once per boss spawn and cached on its data — never re-rolled mid-fight.
function bossRosterForTier(tier: number): TierRoster {
  return tier <= BOSS_TIERS.length ? BOSS_TIERS[tier - 1] : proceduralRoster();
}

// Prism Loom's rotating beam hitbox — Arcade Physics has no beam primitive, so
// this is hand-collided every frame in update() via Geom.Intersects.LineToCircle.
interface BeamState {
  rect: Phaser.GameObjects.Rectangle;
  boss: Sprite;
  collide: boolean;
}

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

/* --------------------------- bullet motion controller ---------------------------
 * Optional per-bullet behavior applied after launch, driven from a per-frame
 * update rather than tweens (so releasing a bullet back to the pool never has
 * to hunt down and kill an attached tween — see releaseBullet/updateBulletMotion).
 * A bullet with no 'motion' data just keeps the velocity it was launched with,
 * i.e. today's behavior, unchanged.
 */
type MotionMode = 'curved' | 'accel' | 'decelPauseReverse' | 'delayed';
// Shared telegraph look for every 'delayed' (ghost) bullet, regardless of which
// skill spawned it — spawnEnemyBullet dims it, updateBulletMotion restores it on launch.
const GHOST_ALPHA = 0.25;

interface MotionState {
  mode: MotionMode;
  stageStartedAt: number; // this.time.now when the current stage began

  // curved: rotates the velocity vector by angularVelocityRad/s for curveDurationMs, then goes linear
  angularVelocityRad?: number;
  curveDurationMs?: number;

  // accel: adjusts speed along the current heading by acceleration px/s^2, clamped
  acceleration?: number;
  minSpeed?: number;
  maxSpeed?: number;

  // decelPauseReverse: decelerate to minSpeed, hold for pauseMs, then launch once
  // along the heading mirrored across the vertical axis (+ rotated) — keeps
  // advancing the same direction it was heading, just crossing over, rather
  // than a full 180° reverse back the way it came. `stage` tracks progress;
  // `headingRad` is internal bookkeeping (the heading is lost once velocity hits zero).
  stage?: 'decel' | 'pause';
  headingRad?: number;
  pauseMs?: number;
  reverseSpeed?: number;
  reverseRotationRad?: number;
  reverseTex?: string; // swap to a brighter texture the moment reversal launches

  // delayed: body spawns disabled (renders if visible, but can't collide — see
  // Body.enable filtering in spawnEnemyBullet/releaseBullet) until launchAtMs,
  // then fires once along launchAngleRad at launchSpeed.
  launchAtMs?: number;
  launchAngleRad?: number;
  launchSpeed?: number;
}

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
  private activeBeams: BeamState[] = [];
  private skillTestOnce: SkillId | null = null; // ?skilltest=<id> dev hook

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

    // Dev helpers: ?wave=5 starts at that wave, ?p1=10&p2=7 pre-loads power-ups,
    // ?motiontest=1 fires one bullet per motion mode above the ship to eyeball them,
    // ?skilltest=<id> forces the boss's very first move to be that skill (e.g.
    // ?wave=10&skilltest=peony previews any of the 9 skill ids against a real boss).
    const params = new URLSearchParams(location.search);
    this.type1 = Math.max(0, Number(params.get('p1')) || 0);
    this.type2 = Math.max(0, Number(params.get('p2')) || 0);
    this.updatePowerText();
    this.startWave(Math.max(1, Number(params.get('wave')) || 1));
    if (params.get('motiontest')) this.time.delayedCall(400, () => this.motionTest());
    const skillTest = params.get('skilltest');
    if (skillTest && (ALL_SKILLS as string[]).includes(skillTest)) {
      this.skillTestOnce = skillTest as SkillId;
    }
  }

  /* --------------------------------- waves --------------------------------- */

  private startWave(n: number) {
    if (this.state !== 'playing') return;
    this.wave = n;
    this.waveTransitionQueued = false;
    this.spawningWave = true;
    this.waveText.setText(`WAVE ${n}`);

    const isBoss = n % WAVES_PER_CYCLE === 0;
    const isSubBoss = isBoss && n % TIER_WAVES !== 0;
    const tier = waveTier(n);

    const bannerText = isSubBoss ? `WAVE ${n}\nSUB-BOSS` : isBoss ? `WAVE ${n}\nBOSS` : `WAVE ${n}`;
    const banner = this.add
      .text(W / 2, H * 0.4, bannerText, {
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
        this.spawnBoss(tier, isSubBoss);
        this.spawningWave = false;
        return;
      }
      const count = ((n - 1) % WAVES_PER_CYCLE) + 1;
      for (let i = 0; i < count; i++) {
        this.time.delayedCall(i * 250, () => this.spawnEnemy(tier, i, count));
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
    // Mobs store their difficulty as 'level'; bosses (sub or full) store 'tier' instead.
    const difficulty = (src.getData('level') ?? src.getData('tier')) as number;
    const waves = burstWaves(difficulty, src.getData('boss') as boolean);
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

  private spawnEnemyBullet(
    x: number,
    y: number,
    angle: number,
    speed: number,
    tex: string,
    motion?: Omit<MotionState, 'stageStartedAt'>,
  ): Sprite | null {
    const bullet = this.enemyBullets.get(x, y, tex) as Sprite | null;
    if (!bullet) return null;
    bullet.setActive(true).setVisible(true).setTexture(tex);
    bullet.body!.reset(x, y);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setCircle(5);
    if (motion?.mode === 'delayed') {
      // Stays disabled (renders if visible, can't collide) until updateBulletMotion launches it.
      body.enable = false;
      bullet.setVelocity(0, 0);
      bullet.setAlpha(GHOST_ALPHA);
    } else {
      body.enable = true;
      bullet.setAlpha(1); // reset in case this pooled bullet was previously dimmed as a ghost
      bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    }
    bullet.setData('motion', motion ? { ...motion, stageStartedAt: this.time.now } : undefined);
    return bullet;
  }

  // Deactivates a bullet and returns it to its group's pool instead of destroying
  // it — Group.get() only reuses members it can still find (see Phaser's Group,
  // which fully evicts anything that calls .destroy()), so recycling must go
  // through this instead of bullet.destroy().
  private releaseBullet(bullet: Sprite) {
    bullet.setActive(false).setVisible(false);
    (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
    bullet.setData('motion', undefined);
  }

  // Advances a bullet's optional per-frame motion behavior. Bullets with no
  // 'motion' data (every existing move) skip out immediately — unchanged behavior.
  private updateBulletMotion(bullet: Sprite, nowMs: number, dtMs: number) {
    const motion = bullet.getData('motion') as MotionState | undefined;
    if (!motion) return;
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    const dt = dtMs / 1000;

    if (motion.mode === 'delayed') {
      if (nowMs < (motion.launchAtMs ?? 0)) return;
      body.enable = true;
      bullet.setAlpha(1); // was dimmed as a ghost telegraph — see spawnEnemyBullet
      const speed = motion.launchSpeed ?? 0;
      const angle = motion.launchAngleRad ?? 0;
      bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      bullet.setData('motion', undefined);
      return;
    }

    if (motion.mode === 'curved') {
      if (nowMs - motion.stageStartedAt >= (motion.curveDurationMs ?? 0)) {
        bullet.setData('motion', undefined);
        return;
      }
      Phaser.Math.Rotate(body.velocity, (motion.angularVelocityRad ?? 0) * dt);
      return;
    }

    if (motion.mode === 'accel') {
      const heading = body.velocity.angle();
      const nextSpeed = Phaser.Math.Clamp(
        body.velocity.length() + (motion.acceleration ?? 0) * dt,
        motion.minSpeed ?? 0,
        motion.maxSpeed ?? Number.POSITIVE_INFINITY,
      );
      bullet.setVelocity(Math.cos(heading) * nextSpeed, Math.sin(heading) * nextSpeed);
      return;
    }

    // decelPauseReverse
    if ((motion.stage ?? 'decel') === 'decel') {
      const heading = body.velocity.angle();
      const nextSpeed = Math.max(0, body.velocity.length() + (motion.acceleration ?? 0) * dt);
      bullet.setVelocity(Math.cos(heading) * nextSpeed, Math.sin(heading) * nextSpeed);
      if (nextSpeed <= (motion.minSpeed ?? 0)) {
        bullet.setVelocity(0, 0);
        motion.stage = 'pause';
        motion.headingRad = heading;
        motion.stageStartedAt = nowMs;
      }
      bullet.setData('motion', motion);
      return;
    }
    // stage === 'pause'
    if (nowMs - motion.stageStartedAt < (motion.pauseMs ?? 0)) return;
    // Mirror across the vertical axis (negate the x-component, keep y) rather
    // than a full 180° reverse: a full reverse sends the bullet back the way
    // it came, i.e. up past the boss and away from the player. Mirroring keeps
    // it advancing in the same downward direction while crossing over toward
    // (and past) center, which is what actually threatens the player.
    const reverseHeading = Math.PI - (motion.headingRad ?? 0) + (motion.reverseRotationRad ?? 0);
    const reverseSpeed = motion.reverseSpeed ?? 0;
    bullet.setVelocity(Math.cos(reverseHeading) * reverseSpeed, Math.sin(reverseHeading) * reverseSpeed);
    if (motion.reverseTex) bullet.setTexture(motion.reverseTex); // brighter color once it folds back in
    // Reversal is a one-shot launch — nothing more to do per-frame after this.
    bullet.setData('motion', undefined);
  }

  // Dev-only smoke test for the motion controller (?motiontest=1): fires one
  // bullet per mode above the ship so each can be eyeballed in isolation before
  // a real skill is built on top of it. Not part of any actual boss move.
  private motionTest() {
    const x = this.ship.x;
    const y = this.ship.y - 200;
    this.spawnEnemyBullet(x - 90, y, -Math.PI / 2, 120, 'ebullet', {
      mode: 'curved',
      angularVelocityRad: 1.2,
      curveDurationMs: 1500,
    });
    this.spawnEnemyBullet(x - 30, y, -Math.PI / 2, 40, 'ebullet', {
      mode: 'accel',
      acceleration: 80,
      maxSpeed: 260,
    });
    this.spawnEnemyBullet(x + 30, y, -Math.PI / 2, 150, 'ebullet', {
      mode: 'decelPauseReverse',
      acceleration: -120,
      minSpeed: 5,
      pauseMs: 500,
      reverseSpeed: 150,
      reverseRotationRad: 0,
    });
    this.spawnEnemyBullet(x + 90, y, 0, 0, 'ebullet', {
      mode: 'delayed',
      launchAtMs: this.time.now + 1200,
      launchAngleRad: Math.PI / 2,
      launchSpeed: 150,
    });
  }

  /* ---------------------------------- boss ---------------------------------- */

  private spawnBoss(tier: number, isSubBoss: boolean) {
    const hp =
      (BOSS_BASE_HP + BOSS_HP_PER_LEVEL * (tier - 1)) * (isSubBoss ? SUB_BOSS_HP_SCALE : 1);
    const boss = this.enemies.create(W / 2, -60, 'boss') as Sprite;
    boss.setCircle(24, 4, 4);
    boss.setDepth(2);
    // Sub-bosses share their paired boss's tint/palette (both key off the
    // same tier) so they read as a preview of what's coming, not a reskin.
    const tint = BOSS_TINTS[(tier - 1) % BOSS_TINTS.length];
    boss.setTint(tint);
    boss.setData({
      hp,
      maxHp: hp,
      tier,
      boss: true,
      isSubBoss,
      tint,
      phase: 1 as BossPhase,
      roster: bossRosterForTier(tier), // computed once, never re-rolled mid-fight
    });
    this.boss = boss;

    const barW = W - 160;
    this.bossLabel = this.add
      .text(W / 2, 46, `${isSubBoss ? 'SUB-BOSS' : 'BOSS'} Lv.${tier}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ff8fa8',
      })
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
          duration: (Math.abs(90 - boss.x) / BOSS_MOVE_SPEED) * 1000,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            if (!boss.active || this.state !== 'playing') return;
            // Start the side-to-side patrol, then begin attacking. Only start
            // attacking once the strafe exists — starting earlier meant the first
            // move's withStationaryBoss could fire while `drift` still held this
            // one-shot entrance glide instead of the repeating patrol.
            this.startStrafe(boss);
            this.bossMoveLoop(boss);
          },
        });
        boss.setData('drift', glide);
      },
    });
  }

  // Boss moves never overlap: pick from the roster (≠ last) -> wait -> next move,
  // except a procedural combo phase, which is the one case >1 id runs at once.
  private bossMoveLoop(boss: Sprite) {
    if (!boss.active || this.state !== 'playing') return;
    const tier = boss.getData('tier') as number;
    const isSubBoss = boss.getData('isSubBoss') as boolean;
    const roster = boss.getData('roster') as TierRoster;

    // Moves are fully sequential (this is the only place a new one is picked),
    // so this is the one safe point to re-check phase — it can never land mid-pattern.
    // Sub-bosses never escalate: they stay phase 1 for the whole fight.
    let phase: BossPhase = 1;
    if (!isSubBoss) {
      const hpRatio = (boss.getData('hp') as number) / (boss.getData('maxHp') as number);
      phase = bossPhase(hpRatio);
      if (phase !== (boss.getData('phase') as BossPhase)) {
        boss.setData('phase', phase);
        this.onBossPhaseChange(boss, phase);
      }
    }

    const palette = BOSS_PALETTES[(tier - 1) % BOSS_PALETTES.length];
    const ctx: SkillCtx = {
      texAim: this.bulletTexture(palette[0]),
      texA: this.bulletTexture(palette[1]),
      texB: this.bulletTexture(palette[2]),
      hardIds: new Set(isSubBoss ? [] : (roster.hardIds ?? [])),
    };

    const next = () => {
      if (!boss.active || this.state !== 'playing') return;
      this.time.delayedCall(BOSS_SKILL_GAP_MS, () => this.bossMoveLoop(boss));
    };

    if (this.skillTestOnce) {
      const id = this.skillTestOnce;
      this.skillTestOnce = null;
      this.runSkills(boss, [id], ctx, next);
      return;
    }

    let ids: SkillId[];
    if (!isSubBoss && phase === 3 && roster.combo) {
      ids = roster.combo;
    } else {
      const pool = isSubBoss
        ? subBossRoster(tier)
        : phase < 3
          ? roster.base
          : [...roster.base, ...(roster.signature ? [roster.signature] : [])];
      const last = boss.getData('lastMove') as string | undefined;
      ids = [Phaser.Math.RND.pick(pool.filter((m) => m !== last))];
    }
    boss.setData('lastMove', ids[ids.length - 1]);
    this.runSkills(boss, ids, ctx, next);
  }

  // Placeholder reaction to a phase change — just enough to see it happen.
  // Real per-phase move pools/speed/visuals are a follow-up design, not this.
  private onBossPhaseChange(boss: Sprite, phase: BossPhase) {
    const tier = boss.getData('tier') as number;
    this.bossLabel?.setText(`BOSS Lv.${tier} · P${phase}`);
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

  /* -------------------------- touhou boss skills -------------------------- */

  // Dispatches one skill id to its implementation. cone/radial/burst/aimed reuse
  // the existing (unchanged) methods above; the five new skills are written
  // directly against the uniform (boss, ctx, done) shape below.
  private runSkill(id: SkillId, boss: Sprite, ctx: SkillCtx, done: () => void) {
    switch (id) {
      case 'cone':
        this.coneAttack(boss, BOSS_CONE_LINES, ctx.texAim);
        done();
        break;
      case 'radial':
        this.movingRadial(boss, BOSS_MOVING_VOLLEYS, BOSS_RADIAL_SPEED, ctx.texA, ctx.texB, done);
        break;
      case 'burst':
        this.burstRadial(boss, BOSS_ROTATE_STEPS, BOSS_RADIAL_SPEED * BURST_SPEED_FACTOR, ctx.texA, ctx.texB, done);
        break;
      case 'aimed':
        this.aimedStream(boss, ctx.texAim, done);
        break;
      case 'peony':
        this.peonySkill(boss, ctx, done);
        break;
      case 'clock':
        this.clockSkill(boss, ctx, done);
        break;
      case 'lattice':
        this.latticeSkill(boss, ctx, done);
        break;
      case 'butterfly':
        this.butterflySkill(boss, ctx, done);
        break;
      case 'prism':
        this.prismSkill(boss, ctx, done);
        break;
    }
  }

  // Runs one or more skill ids; `done` fires once every id in the batch has
  // finished. Concurrent batches (>1 id) only ever happen in a procedural
  // combo phase — every curated tier always passes a single id.
  private runSkills(boss: Sprite, ids: SkillId[], ctx: SkillCtx, done: () => void) {
    let remaining = ids.length;
    for (const id of ids) {
      this.runSkill(id, boss, ctx, () => {
        remaining -= 1;
        if (remaining === 0) done();
      });
    }
  }

  // Side-to-side patrol as a self-scheduling chain of single-leg tweens (rather
  // than one yoyo/repeat tween). Each leg heads for the far edge at cruising
  // speed and, on arrival, schedules the next — so the strafe can always be
  // restarted cleanly from wherever the boss currently is (after a skill
  // repositions it), with no stored tween progress to snap back to.
  private startStrafe(boss: Sprite) {
    boss.setData('statHold', 0);
    boss.setData('statReady', false);
    const step = () => {
      if (!boss.active || this.state !== 'playing') return;
      const target = boss.x < W / 2 ? W - 90 : 90; // always patrol toward the far edge
      const duration = Math.max(BOSS_MOVE_MIN_MS, (Math.abs(target - boss.x) / BOSS_MOVE_SPEED) * 1000);
      const leg = this.tweens.add({ targets: boss, x: target, duration, ease: 'Sine.easeInOut', onComplete: step });
      boss.setData('drift', leg);
    };
    step();
  }

  // Peony/Lattice/Butterfly/Prism all want the boss to stop drifting and settle
  // at a fixed spot before firing — otherwise every ring/line/wing/beam fires
  // from a slightly different position as the strafe keeps moving, smearing an
  // otherwise-symmetric pattern sideways instead of blooming from one point.
  //
  // The strafe is *stopped*, not paused: a paused strafe resumes from its stored
  // progress, so the frame after resume it writes its old x and snaps the boss
  // back from the anchor — the visible "boss suddenly snaps to a spot" glitch.
  // Instead `finish` restarts a fresh patrol from wherever the boss ended up.
  //
  // A holder refcount makes a procedural combo phase (two stationary skills at
  // once) safe: only the first repositions, later ones run from that same anchor
  // once it settles, and the patrol restarts only after the last one finishes —
  // so two skills can never leave two strafes fighting over boss.x.
  private withStationaryBoss(boss: Sprite, anchorX: number, run: (finish: () => void) => void) {
    const holders = ((boss.getData('statHold') as number) ?? 0) + 1;
    boss.setData('statHold', holders);

    const finish = () => {
      const remaining = ((boss.getData('statHold') as number) ?? 1) - 1;
      boss.setData('statHold', Math.max(0, remaining));
      if (remaining <= 0 && boss.active && this.state === 'playing') this.startStrafe(boss);
    };

    if (holders > 1) {
      // Concurrent (combo) skill — the first holder owns the reposition; run as
      // soon as the boss has settled at the shared anchor (or immediately if so).
      if (boss.getData('statReady')) run(finish);
      else {
        const queue = (boss.getData('statQueue') as Array<() => void>) ?? [];
        queue.push(() => run(finish));
        boss.setData('statQueue', queue);
      }
      return;
    }

    boss.setData('statReady', false);
    boss.setData('statQueue', []);
    const drift = boss.getData('drift') as Phaser.Tweens.Tween | undefined;
    drift?.stop();
    // Same cruising speed as the normal strafe, not a fixed duration — otherwise
    // the reposition looks like a snap (too fast when far, sluggish when close).
    const duration = Math.max(BOSS_MOVE_MIN_MS, (Math.abs(anchorX - boss.x) / BOSS_MOVE_SPEED) * 1000);
    this.tweens.add({
      targets: boss,
      x: anchorX,
      duration,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (!boss.active || this.state !== 'playing') return;
        boss.setData('statReady', true);
        run(finish);
        const queue = (boss.getData('statQueue') as Array<() => void>) ?? [];
        boss.setData('statQueue', []);
        for (const queued of queue) queued();
      },
    });
  }

  // Celestial Peony — two interlocking spiral rings, alternating clockwise and
  // counter-clockwise, built on the 'curved' motion mode.
  private peonySkill(boss: Sprite, ctx: SkillCtx, done: () => void) {
    const hard = ctx.hardIds.has('peony');
    const rings = hard ? PEONY_RINGS_HARD : PEONY_RINGS;
    const rays = hard ? PEONY_RAYS_HARD : PEONY_RAYS;
    this.withStationaryBoss(boss, W / 2, (finish) => {
      // Every ring fires from this same fixed (x, y) — that's what makes
      // concentric, alternating-direction rings read as a woven flower instead
      // of a comet smeared sideways by a still-drifting boss.
      const originX = boss.x;
      const originY = boss.y;
      let ring = 0;
      const fireRing = () => {
        if (!boss.active || this.state !== 'playing') return;
        const cw = ring % 2 === 0;
        const tex = cw ? ctx.texA : ctx.texB;
        const baseOffset = ring * PEONY_RING_OFFSET_RAD;
        const gap = (Math.PI * 2) / rays;
        for (let i = 0; i < rays; i++) {
          this.spawnEnemyBullet(originX, originY, baseOffset + i * gap, PEONY_SPEED, tex, {
            mode: 'curved',
            angularVelocityRad: (cw ? 1 : -1) * PEONY_ANGULAR_VELOCITY,
            curveDurationMs: PEONY_CURVE_DURATION_MS,
          });
        }
        ring += 1;
        if (ring < rings) this.time.delayedCall(PEONY_RING_INTERVAL_MS, fireRing);
        else
          this.time.delayedCall(700, () => {
            finish();
            done();
          });
      };
      fireRing();
    });
  }

  // Scarlet Clock — a ring of ghost bullets locks onto a snapshot of the
  // player's position, then releases in staggered, rotating waves. Built on
  // the 'delayed' motion mode: while locked the bullets render but can't
  // collide (body.enable stays false), which is exactly the telegraph this
  // skill needs, for free.
  private clockSkill(boss: Sprite, ctx: SkillCtx, done: () => void) {
    const hard = ctx.hardIds.has('clock');
    const tier = boss.getData('tier') as number;
    // 3 rings by default, 5 on hard, and one more per tier past the curated
    // table (procedural bosses), capped so it never runs away.
    const layers = Math.min(
      CLOCK_LAYERS_MAX,
      (hard ? CLOCK_LAYERS_HARD : CLOCK_LAYERS) + Math.max(0, tier - BOSS_TIERS.length),
    );
    const cycleMs = CLOCK_LOCK_MS + CLOCK_GROUPS * CLOCK_GROUP_INTERVAL_MS;

    this.withStationaryBoss(boss, W / 2, (finish) => {
      // All rings share this fixed center, so time-staggered layers still read
      // as genuinely concentric instead of drifting apart as the boss strafes.
      const centerX = boss.x;
      const centerY = boss.y;

      const spawnLayer = (layer: number) => {
        if (!boss.active || this.state !== 'playing') return;
        // Layer 0 is the outermost ring and locks/fires first; each ring further
        // in follows a beat later — the spec's "outer, then middle, then inner" countdown.
        const radius = CLOCK_RADIUS + (layers - 1 - layer) * CLOCK_LAYER_RADIUS_STEP;
        // Count scales with this ring's radius (rounded to a whole number of
        // groups) so every ring holds roughly constant arc-length spacing.
        const count = Phaser.Math.Clamp(
          Math.round((2 * Math.PI * radius) / CLOCK_ARC_SPACING / CLOCK_GROUPS) * CLOCK_GROUPS,
          CLOCK_GROUPS,
          CLOCK_MAX_RING_BULLETS,
        );
        const gap = (Math.PI * 2) / count;
        const target = new Phaser.Math.Vector2(this.ship.x, this.ship.y);
        const now = this.time.now;
        const resnapshotBullets: Sprite[] = [];
        for (let i = 0; i < count; i++) {
          // Interleave: each of the CLOCK_GROUPS release beats is a rotationally
          // symmetric subset spread around the whole ring, not a contiguous arc,
          // so every beat stays balanced instead of firing one lopsided wedge.
          const group = i % CLOCK_GROUPS;
          const spawnAngle = i * gap;
          const x = centerX + Math.cos(spawnAngle) * radius;
          const y = centerY + Math.sin(spawnAngle) * radius;
          const launchAtMs = now + CLOCK_LOCK_MS + group * CLOCK_GROUP_INTERVAL_MS;
          const launchAngleRad =
            Phaser.Math.Angle.Between(x, y, target.x, target.y) + group * CLOCK_GROUP_ROTATION_RAD;
          const bullet = this.spawnEnemyBullet(x, y, 0, 0, ctx.texAim, {
            mode: 'delayed',
            launchAtMs,
            launchAngleRad,
            launchSpeed: CLOCK_LAUNCH_SPEED,
          });
          if (hard && layer === layers - 1 && bullet && group >= CLOCK_GROUPS - CLOCK_RESNAPSHOT_GROUPS) {
            resnapshotBullets.push(bullet);
          }
        }
        if (resnapshotBullets.length) {
          // Re-aim the innermost ring's last groups at a second, later snapshot shortly before they launch.
          this.time.delayedCall(CLOCK_LOCK_MS - CLOCK_GROUP_INTERVAL_MS, () => {
            if (this.state !== 'playing') return;
            const target2 = new Phaser.Math.Vector2(this.ship.x, this.ship.y);
            for (const b of resnapshotBullets) {
              const motion = b.active && b.getData('motion');
              if (motion) motion.launchAngleRad = Phaser.Math.Angle.Between(b.x, b.y, target2.x, target2.y);
            }
          });
        }
      };

      for (let layer = 0; layer < layers; layer++) {
        this.time.delayedCall(layer * CLOCK_LAYER_STAGGER_MS, () => spawnLayer(layer));
      }
      this.time.delayedCall((layers - 1) * CLOCK_LAYER_STAGGER_MS + cycleMs + 400, () => {
        finish();
        done();
      });
    });
  }

  // Moonlit Lattice — a sequence of vertical bullet-wall curtains that sweep
  // horizontally across the field. Each wall is a (near) full-height column of
  // ghost bullets ('delayed' motion) telegraphed in place, then launched sideways
  // in unison, with a contiguous gap carved out as the safe lane. Walls start at
  // alternating edges so their sweep direction reads from where they form.
  private latticeSkill(boss: Sprite, ctx: SkillCtx, done: () => void) {
    const hard = ctx.hardIds.has('lattice');
    const telegraphMs = hard ? LATTICE_TELEGRAPH_MS_HARD : LATTICE_TELEGRAPH_MS;
    const top = LATTICE_GRID_TOP;
    const bottom = H - LATTICE_GRID_TOP; // full-height curtain, covering the player's low zone
    const mid = (top + bottom) / 2;
    const leftX = LATTICE_MARGIN;
    const rightX = W - LATTICE_MARGIN;
    const colLine = (x: number, y0 = top, y1 = bottom) => [
      { x, y: y0 },
      { x, y: y1 },
    ];

    // Fills a polyline into a solid row of bullets at ~constant spacing along its
    // length (regardless of segment length), so a tall vertical column comes out
    // as dense as any other wall — that's the "row of bullets" wall, not dots.
    const densify = (pts: { x: number; y: number }[]) => {
      const out: { x: number; y: number }[] = [];
      for (let s = 0; s < pts.length - 1; s++) {
        const a = pts[s];
        const b = pts[s + 1];
        const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / LATTICE_BULLET_SPACING));
        const emitTo = s === pts.length - 2 ? steps : steps - 1; // final endpoint exactly once
        for (let k = 0; k <= emitTo; k++) {
          const t = k / steps;
          out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
      return out;
    };

    // Each wall is one or more vertical strokes swept horizontally. `dir` +1
    // sweeps right (wall forms at the left edge), -1 sweeps left (right edge).
    // `safeGap` walls carve one gate; the center-split finale instead uses two
    // half-columns with a real structural gap band across the middle.
    const splitHalf = 70;
    type Line = { strokes: { x: number; y: number }[][]; dir: 1 | -1; safeGap: boolean };
    const lines: Line[] = [
      { strokes: [colLine(leftX)], dir: 1, safeGap: true },
      { strokes: [colLine(rightX)], dir: -1, safeGap: true },
      { strokes: [colLine(leftX)], dir: 1, safeGap: true },
      { strokes: [colLine(rightX)], dir: -1, safeGap: true },
      {
        strokes: [colLine(leftX, top, mid - splitHalf), colLine(leftX, mid + splitHalf, bottom)],
        dir: 1,
        safeGap: false,
      },
    ];
    for (let e = 0; e < (hard ? LATTICE_LINES_HARD_EXTRA : 0); e++) {
      lines.push({ strokes: [colLine(rightX)], dir: -1, safeGap: true });
    }

    this.withStationaryBoss(boss, W / 2, (finish) => {
      let index = 0;
      const fireLine = () => {
        if (!boss.active || this.state !== 'playing') return;
        const line = lines[index];
        const launchAtMs = this.time.now + telegraphMs;
        const launchAngleRad = line.dir > 0 ? 0 : Math.PI; // sweep right (0) or left (π)
        const armed: Sprite[] = [];
        for (const stroke of line.strokes) {
          const pts = densify(stroke);
          // Carve a contiguous safe gate out of the wall (skip a run of bullets)
          // at a random interior position — the deliberate lane to dodge through.
          let gapStart = -1;
          let gapEnd = -1;
          if (line.safeGap && pts.length > LATTICE_GAP_BULLETS + 2) {
            const half = Math.floor(LATTICE_GAP_BULLETS / 2);
            const center = Phaser.Math.Between(half + 1, pts.length - half - 2);
            gapStart = center - half;
            gapEnd = center + half;
          }
          pts.forEach((p, i) => {
            if (i >= gapStart && i <= gapEnd) return;
            const bullet = this.spawnEnemyBullet(p.x, p.y, 0, 0, ctx.texA, {
              mode: 'delayed',
              launchAtMs,
              launchAngleRad,
              launchSpeed: LATTICE_BULLET_SPEED,
            });
            if (bullet) armed.push(bullet);
          });
        }
        // Armed anchors brighten shortly before they launch — the readable
        // "this is about to fire" cue the spec calls for.
        this.time.delayedCall(Math.max(0, telegraphMs - LATTICE_ARM_AT_MS), () => {
          for (const b of armed) if (b.active) b.setAlpha(LATTICE_ARMED_ALPHA);
        });
        index += 1;
        if (index < lines.length) this.time.delayedCall(telegraphMs + LATTICE_LINE_GAP_MS, fireLine);
        else
          this.time.delayedCall(telegraphMs + 500, () => {
            finish();
            done();
          });
      };
      fireLine();
    });
  }

  // Butterfly Requiem — mirrored wing fans that drift outward, decelerate to a
  // hover, pause, then fold back inward at a rotated angle. Built entirely on
  // the 'decelPauseReverse' motion mode; opposite reverseRotationRad per wing
  // gives the two sides opposite handedness on the reversal.
  private butterflySkill(boss: Sprite, ctx: SkillCtx, done: () => void) {
    const hard = ctx.hardIds.has('butterfly');
    const volleys = hard ? BUTTERFLY_VOLLEYS_HARD : BUTTERFLY_VOLLEYS;
    const reverseTex = ctx.texAim; // brighter color once the wings fold back in

    this.withStationaryBoss(boss, W / 2, (finish) => {
      const fireWing = (bullets: number, extraRotationRad: number) => {
        for (const wing of [-1, 1]) {
          for (let i = 0; i < bullets; i++) {
            const spread = bullets > 1 ? (i / (bullets - 1)) * BUTTERFLY_WING_SPREAD_RAD : 0;
            const angle = Math.PI / 2 + wing * (BUTTERFLY_WING_INNER_RAD + spread + extraRotationRad);
            this.spawnEnemyBullet(boss.x, boss.y, angle, BUTTERFLY_INITIAL_SPEED, wing < 0 ? ctx.texA : ctx.texB, {
              mode: 'decelPauseReverse',
              acceleration: BUTTERFLY_DECELERATION,
              minSpeed: BUTTERFLY_MIN_SPEED,
              pauseMs: BUTTERFLY_PAUSE_MS,
              reverseSpeed: BUTTERFLY_REVERSE_SPEED,
              reverseRotationRad: wing * BUTTERFLY_REVERSE_ROTATION_RAD,
              reverseTex,
            });
          }
        }
      };

      // How long one bullet takes to decelerate to a hover — used to time both
      // the hard-mode pause shots and when the first wing has "closed" (reversed).
      const decelMs = (Math.abs(BUTTERFLY_INITIAL_SPEED - BUTTERFLY_MIN_SPEED) / Math.abs(BUTTERFLY_DECELERATION)) * 1000;
      const oneWingDurationMs = decelMs + BUTTERFLY_PAUSE_MS;

      let v = 0;
      const fireVolley = () => {
        if (!boss.active || this.state !== 'playing') return;
        fireWing(BUTTERFLY_FAN_BULLETS, 0);
        v += 1;
        if (v < volleys) {
          this.time.delayedCall(BUTTERFLY_VOLLEY_INTERVAL_MS, fireVolley);
          return;
        }
        const lastVolleyAtMs = (volleys - 1) * BUTTERFLY_VOLLEY_INTERVAL_MS;
        if (hard) {
          // Sparse straight shots snuck in while the wings hover, mid-pause.
          for (let s = 0; s < 3; s++) {
            this.time.delayedCall(lastVolleyAtMs + decelMs + s * 120, () => {
              if (!boss.active || this.state !== 'playing') return;
              const angle = Phaser.Math.Angle.Between(boss.x, boss.y, this.ship.x, this.ship.y);
              this.spawnEnemyBullet(boss.x, boss.y, angle, BUTTERFLY_PAUSE_SHOT_SPEED, ctx.texAim);
            });
          }
        }
        // Second, smaller wing after the first one closes (reverses), rotated
        // for a distinct silhouette rather than a plain repeat.
        this.time.delayedCall(lastVolleyAtMs + oneWingDurationMs, () => {
          if (!boss.active || this.state !== 'playing') return;
          fireWing(BUTTERFLY_WING2_BULLETS, BUTTERFLY_WING2_ROTATION_RAD);
          this.time.delayedCall(oneWingDurationMs + 300, () => {
            finish();
            done();
          });
        });
      };
      fireVolley();
    });
  }

  // Prism Loom — sweeping beams with slow petal crossfire underneath. Beams
  // have no Arcade Physics primitive, so they're plain rotating Rectangles
  // tracked in `activeBeams` and hand-collided every frame in update().
  private prismSkill(boss: Sprite, ctx: SkillCtx, done: () => void) {
    const hard = ctx.hardIds.has('prism');
    const beamCount = hard ? PRISM_BEAM_COUNT_HARD : PRISM_BEAM_COUNT;
    const startAngle = Math.PI / 2 - PRISM_SWEEP_ARC_RAD / 2;
    const beamGap = beamCount > 1 ? (Math.PI * 2) / beamCount : 0;
    // Spec: boss moves to one upper corner — pick whichever side it's already closer to.
    const anchorX = boss.x < W / 2 ? 90 : W - 90;

    this.withStationaryBoss(boss, anchorX, (finish) => {
      for (let i = 0; i < beamCount; i++) {
        const rect = this.add
          .rectangle(boss.x, boss.y, PRISM_BEAM_REACH, PRISM_BEAM_WIDTH, hard ? 0xff8fa8 : 0xff4d6d)
          .setOrigin(0, 0.5)
          .setDepth(4)
          .setAlpha(0.25)
          .setRotation(startAngle + i * beamGap);
        const beam: BeamState = { rect, boss, collide: false };
        this.activeBeams.push(beam);
        this.time.delayedCall(PRISM_TELEGRAPH_MS, () => {
          if (!boss.active) return;
          rect.setAlpha(0.85);
          beam.collide = true;
          // Hard mode: change sweep direction once instead of one continuous
          // pass — same total duration, split into forward then back.
          this.tweens.add({
            targets: rect,
            rotation: rect.rotation + PRISM_SWEEP_ARC_RAD,
            duration: hard ? PRISM_SWEEP_DURATION_MS / 2 : PRISM_SWEEP_DURATION_MS,
            yoyo: hard,
          });
        });
      }

      let petalElapsed = 0;
      const firePetals = () => {
        if (!boss.active || this.state !== 'playing') return;
        const angle = Phaser.Math.Angle.Between(boss.x, boss.y, this.ship.x, this.ship.y);
        this.spawnEnemyBullet(boss.x, boss.y, angle - PRISM_PETAL_SPREAD_RAD, PRISM_PETAL_SPEED, ctx.texA);
        this.spawnEnemyBullet(boss.x, boss.y, angle + PRISM_PETAL_SPREAD_RAD, PRISM_PETAL_SPEED, ctx.texB);
        petalElapsed += PRISM_PETAL_INTERVAL_MS;
        if (petalElapsed < PRISM_TELEGRAPH_MS + PRISM_SWEEP_DURATION_MS) {
          this.time.delayedCall(PRISM_PETAL_INTERVAL_MS, firePetals);
        }
      };
      firePetals();

      this.time.delayedCall(PRISM_TELEGRAPH_MS + PRISM_SWEEP_DURATION_MS, () => {
        for (const beam of this.activeBeams) beam.rect.destroy();
        this.activeBeams.length = 0;
        finish();
        this.time.delayedCall(PRISM_RECOVERY_MS, done);
      });
    });
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
      (bullet.body as Phaser.Physics.Arcade.Body).enable = true;
      bullet.setRotation(rad);
      bullet.setVelocity(Math.sin(rad) * PLAYER_BULLET_SPEED, -Math.cos(rad) * PLAYER_BULLET_SPEED);
      bullet.setData('dmg', dmgScale * mults[i]);
    }
  }

  /* ------------------------------ hits & drops ------------------------------ */

  private onPlayerBulletHit(bullet: Sprite, enemy: Sprite) {
    if (!bullet.active || !enemy.active) return;
    const dmg = (bullet.getData('dmg') as number) ?? 1;
    this.releaseBullet(bullet);
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
      // Reward: clear the screen of enemy bullets (and any live Prism beams) when the boss falls.
      for (const b of this.enemyBullets.getChildren() as Sprite[]) {
        if (b.active) this.releaseBullet(b);
      }
      for (const beam of this.activeBeams) beam.rect.destroy();
      this.activeBeams.length = 0;
    }
    enemy.destroy();
    this.checkWaveClear();
  }

  private dropItems(enemy: Sprite) {
    const drops: string[] = [];
    if (enemy.getData('boss')) {
      drops.push('item_line'); // type 2 is guaranteed on bosses
      if (Math.random() < DROP_RATE_TYPE1) drops.push('item_dmg');
      const isSubBoss = enemy.getData('isSubBoss') as boolean;
      if (!isSubBoss && (enemy.getData('tier') as number) % BOSS_HP_ITEM_EVERY === 0) drops.push('item_hp');
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
    if (source.texture.key.startsWith('eb')) this.releaseBullet(source);
    this.damagePlayer();
  }

  // Shared "player takes a hit" logic — called both from the bullet/enemy
  // overlap path above and directly from Prism Loom's hand-rolled beam check
  // in update(), which has no Sprite to route through physics.add.overlap.
  private damagePlayer() {
    if (this.state !== 'playing' || this.time.now < this.invulnUntil) return;
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

  // Prism Loom beam vs. ship — no Arcade body backs a beam, so this is a plain
  // geometric check each frame instead of a physics overlap callback.
  private updateBeams() {
    if (!this.activeBeams.length) return;
    // Inflate the ship's hurtbox by the beam's half-width instead of giving the
    // (infinitely thin) line any thickness — equivalent distance test, and
    // LineToCircle only accepts a line + circle, no line-thickness parameter.
    const shipCircle = new Phaser.Geom.Circle(this.ship.x, this.ship.y, 8 + PRISM_COLLISION_WIDTH / 2);
    for (const beam of this.activeBeams) {
      if (!beam.collide) continue;
      const { rect } = beam;
      const dx = Math.cos(rect.rotation) * PRISM_BEAM_REACH;
      const dy = Math.sin(rect.rotation) * PRISM_BEAM_REACH;
      const line = new Phaser.Geom.Line(rect.x, rect.y, rect.x + dx, rect.y + dy);
      if (Phaser.Geom.Intersects.LineToCircle(line, shipCircle)) {
        this.damagePlayer();
      }
    }
  }

  update(time: number, delta: number) {
    if (this.state === 'playing') {
      const dx = this.target.x - this.ship.x;
      const dy = this.target.y - this.ship.y;
      this.ship.setPosition(this.ship.x + dx * 0.18, this.ship.y + dy * 0.18);
      this.ship.x = Phaser.Math.Clamp(this.ship.x, 16, W - 16);
      this.ship.y = Phaser.Math.Clamp(this.ship.y, 16, H - 16);
      this.updateBeams();
    }
    // Recycle offscreen bullets (pool release, not destroy) and items; advance
    // any active per-bullet motion controllers on the enemy bullets that have one.
    for (const b of this.playerBullets.getChildren() as Sprite[]) {
      if (b.active && (b.y < -20 || b.x < -20 || b.x > W + 20)) this.releaseBullet(b);
    }
    for (const b of this.enemyBullets.getChildren() as Sprite[]) {
      if (!b.active) continue;
      if (b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20) {
        this.releaseBullet(b);
        continue;
      }
      this.updateBulletMotion(b, time, delta);
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
