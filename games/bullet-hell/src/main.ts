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
// Enemy bullets are only recycled once they're this far *past* the view — a wide
// margin (not a tight few px) so bullets that leave the field can still curve or
// reverse back in (e.g. Butterfly's outward wing bullets returning on the fold).
const BULLET_RECYCLE_MARGIN_X = W * 0.5;
const BULLET_RECYCLE_MARGIN_Y = H * 0.3;

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

// Butterfly Requiem — mirrored fans that decelerate, pause, then fold back in
// ('decelPauseReverse'). On the fold each bullet launches straight down and then
// slowly curls out to its own fan angle, so each wing aims across the whole lower
// screen (symmetric per side) instead of clumping back toward one edge.
const BUTTERFLY_FAN_BULLETS = 11; // per wing, per volley
const BUTTERFLY_VOLLEYS = 4;
const BUTTERFLY_VOLLEYS_HARD = 6;
const BUTTERFLY_VOLLEY_INTERVAL_MS = 260;
const BUTTERFLY_INITIAL_SPEED = 150;
const BUTTERFLY_DECELERATION = -95;
const BUTTERFLY_MIN_SPEED = 12;
const BUTTERFLY_PAUSE_MS = 350;
const BUTTERFLY_REVERSE_SPEED = 115;
const BUTTERFLY_RETURN_BASE_RAD = 0; // innermost bullets fold straight down (wings meet — no center safe lane)
const BUTTERFLY_RETURN_FAN_RAD = Phaser.Math.DegToRad(94); // fan the outermost bullet curls out to, per side
const BUTTERFLY_RETURN_MS = 650; // how long the fold curls out before it flies straight
const BUTTERFLY_WING_SPREAD_RAD = Phaser.Math.DegToRad(112);
const BUTTERFLY_WING_INNER_RAD = Phaser.Math.DegToRad(5);
// Alternate volleys are offset by half a bullet slot so successive fans interlock
// (O_O_O over _O_O_) and close the gaps a plain repeat would leave.
const BUTTERFLY_ALIGN_SHIFT = 0.5;
// Second, smaller wing fired after the first one closes, rotated for a fresh silhouette.
const BUTTERFLY_WING2_ROTATION_RAD = Phaser.Math.DegToRad(18);
const BUTTERFLY_WING2_BULLETS = 6;
const BUTTERFLY_PAUSE_SHOT_SPEED = 260; // hard-only sparse straight shots fired during the pause
// Second reversal: after the fold sinks past the player to near the bottom, the
// bullets brake to a stop, hover, then crawl back UP through the player at a
// fraction of their launch speed — a slow rising wall that keeps the pressure on.
const BUTTERFLY_SINK_STOP_FRAC = 0.8; // stop ~10% of the screen height above the bottom
const BUTTERFLY_SINK_BRAKE_DECEL = 260; // px/s^2 braking once the stop line is reached
const BUTTERFLY_SINK_HOLD_MS = 350; // hover at the stop line before rising
const BUTTERFLY_RISE_SPEED_FRAC = 0.5; // reverse at 50% of BUTTERFLY_INITIAL_SPEED 

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

// Celestial Bloom — a flower of 'formation' bullets that draws on petal-by-petal
// (Form), grows + rotates into a wall around the boss (Bloom), holds, then
// releases either straight out or along the petal tangents as bands. Petals are
// an overlapping-circle rosette (flower-of-life: circle radius = ring radius).
const BLOOM_PETALS = 8; // overlapping circles around the flower center
const BLOOM_PETAL_SAMPLES = 36; // bullets sampled around each circle
const BLOOM_PETAL_SAMPLES_HARD = 48;
const BLOOM_PETAL_RADIUS = 55; // circle radius = ring radius, at full scale
const BLOOM_MIN_RADIUS = 6; // skip samples that land on the flower center (degenerate radius/direction)
const BLOOM_FORM_SCALE = 0.55; // tight around the boss while forming
const BLOOM_FULL_SCALE = 1.2; // bloomed wall
const BLOOM_FORM_STEP_MS = 14; // delay between each petal bullet appearing (the draw-on)
const BLOOM_GROW_MS = 1400; // Form -> Bloom grow/rotate duration
const BLOOM_ROTATE_RAD = Phaser.Math.DegToRad(30); // small rotation during the bloom, for appeal
const BLOOM_HOLD_MS = 1000; // wall around the boss before release
const BLOOM_RELEASE_SPEED = 135;

// Lunar Mandala — 3-4 concentric bullet rings, each a chain with 1-2 gaps, that
// counter-rotate (inner faster) while their shared center drifts down toward the
// player and the whole mandala expands, so the escape gaps sweep and shift. Rings
// are 'formation' bullets (one FlowerFormation per ring: each ring gets its own
// rotation tween for its own speed/direction, all share the same descending
// center + growing scale). The second half adds slow, oversized aimed shots so
// the player can't just park in one gap.
const MANDALA_RINGS = 6;
const MANDALA_RINGS_HARD = 9;
const MANDALA_INNER_RADIUS = 38; // innermost ring, at formation scale 1
const MANDALA_RADIUS_STEP = 24; // each ring further out adds this
const MANDALA_ARC_SPACING = 24; // target px between adjacent bullets on a ring
const MANDALA_MAX_RING_BULLETS = 64;
const MANDALA_GAPS_MIN = 1; // each ring omits 1-2 contiguous arcs as escape gates
const MANDALA_GAPS_MAX = 2;
const MANDALA_GAP_BULLETS = 4; // bullets skipped per gap
const MANDALA_CHARGE_MS = 600; // boss charge (scale pulse) before the rings draw
const MANDALA_DRAW_MS = 600; // ring bullets pop in one-by-one over this sweep (all rings share the window)
const MANDALA_HOLD_MS = 300; // hold so the player can read the gaps before motion
const MANDALA_CONTRACT_MS = 5200; // expand + descend phase
const MANDALA_SCALE_END = 1.75; // rings grow from 1x to this while descending
const MANDALA_ANGULAR_BASE = 0.3; // rad/s of the outermost ring
const MANDALA_ANGULAR_STEP = 0.28; // + per ring inward — inner rings spin faster
const MANDALA_RELEASE_SPEED = 150; // outward scatter when the mandala dissolves
const MANDALA_BIG_SHOTS = 7; // second-half aimed pressure shots
const MANDALA_BIG_SHOTS_HARD = 10;
// Kept small on purpose: at MANDALA_BIG_SPEED, consecutive shots spawn
// ~(SPEED * GAP_MS/1000)px apart, so a gap below the 2*MANDALA_BIG_RADIUS
// diameter (60px → ~570ms) lets them partly overlap into a dense stream
// instead of reading as isolated one-by-one shots. This also keeps the whole
// volley inside the contract's second half so no shot bleeds into the next skill.
const MANDALA_BIG_GAP_MS = 330;
const MANDALA_BIG_SPEED = 105; // ~0.2x the normal aimed speed — slow, forces movement
const MANDALA_BIG_RADIUS = 25; // 2x the normal bullet radius (20px texture + body)
const MANDALA_BIG_AIM_JITTER_DEG = 25; // ± random scatter off the player snapshot per shot

// Starweaver's Loom — glowing bullet "threads" laid along Bezier curves that span
// the screen edge-to-edge. The threads draw on (weave), the curves undulate in
// place as a telegraph, a red flash cues release, then every bullet launches
// perpendicular to its curve (alternating left/right normal) with curves releasing
// staggered — a crosshatch rain. Threads are 'delayed' ghosts parked far out then
// flipped to launch per curve; undulation repositions the ghosts along getPoint(t).
const LOOM_CURVES = 4;
const LOOM_CURVES_HARD = 6;
const LOOM_EDGE_TOP = 130; // vertical band the curve endpoints span
const LOOM_EDGE_BOT = 560;
const LOOM_BULLET_SPACING = 30; // target px between bullets along a curve
const LOOM_MIN_BULLETS = 36;
const LOOM_MAX_BULLETS = 48;
const LOOM_CTRL_BOW = 90; // control-point vertical bow (alternates sign per curve)
const LOOM_WEAVE_STEP_MS = 26; // delay between successive bullets drawing on
const LOOM_UNDULATE_MS = 1500; // curves undulate in place (telegraph)
const LOOM_UNDULATE_AMP = 22; // control-point wobble amplitude
const LOOM_FLASH_MS = 240; // red flash cueing release
const LOOM_CURVE_STAGGER_MS = 150; // 0.15s between successive curves releasing
const LOOM_BULLET_SPEED = 84; // perpendicular rain speed
const LOOM_PREVIEW_ALPHA = 0.16; // faint preview curve alpha

type SkillId =
  | 'cone'
  | 'radial'
  | 'burst'
  | 'aimed'
  | 'peony'
  | 'clock'
  | 'lattice'
  | 'butterfly'
  | 'prism'
  | 'bloom'
  | 'mandala'
  | 'loom';

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

// One new skill introduced per tier through tier 7 (peony, clock, lattice,
// butterfly, bloom, prism), then "remix" tiers 8-10 reuse skills at their own
// hard tuning, tier 11 is a curated capstone (prism, hard, as a single
// signature), and tiers 12-13 introduce the two lunar skills (mandala, loom).
// Combo is procedural-only, tier 14+ (see below).
const BOSS_TIERS: TierRoster[] = [
  { base: ['cone', 'radial', 'burst'] },
  { base: ['radial', 'burst', 'aimed'], signature: 'peony' },
  { base: ['burst', 'aimed', 'peony'], signature: 'clock' },
  { base: ['aimed', 'peony', 'clock'], signature: 'lattice' },
  { base: ['peony', 'clock', 'lattice'], signature: 'butterfly' },
  { base: ['clock', 'lattice', 'butterfly'], signature: 'bloom' },
  { base: ['lattice', 'butterfly', 'bloom'], signature: 'prism' },
  { base: ['radial', 'aimed', 'lattice'], signature: 'peony', hardIds: ['peony'] },
  { base: ['burst', 'clock', 'bloom'], signature: 'butterfly', hardIds: ['bloom', 'butterfly'] },
  { base: ['peony', 'clock', 'prism'], signature: 'bloom', hardIds: ['peony', 'clock', 'bloom'] },
  {
    base: ['lattice', 'butterfly', 'clock'],
    signature: 'prism',
    hardIds: ['lattice', 'butterfly', 'clock', 'prism'],
  },
  {
    base: ['butterfly', 'bloom', 'prism'],
    signature: 'mandala',
    hardIds: ['bloom', 'prism', 'mandala'],
  },
  {
    base: ['prism', 'bloom', 'mandala'],
    signature: 'loom',
    hardIds: ['bloom', 'mandala', 'loom'],
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
  'bloom',
  'mandala',
  'loom',
];
// "Advanced" skills (peony onward) — the elaborate curated/signature patterns.
// The boss briefly turns invincible while casting one so it can't be bursted
// down before the pattern reads; the four basics (cone/radial/burst/aimed) never do.
const ADVANCED_SKILLS = new Set<SkillId>([
  'peony',
  'clock',
  'lattice',
  'butterfly',
  'prism',
  'bloom',
  'mandala',
  'loom',
]);
const BOSS_ADVANCED_INVULN_MIN_MS = 2000; // floor for the invincible window
const BOSS_ADVANCED_INVULN_FRAC = 0.75; // ...else this share of the (measured) skill time

const PROCEDURAL_COMBO_CHANCE = 0.25;

// Past the curated table: sample from the full pool at hard tuning, with a
// chance of a two-skill combo phase (the only place two skills ever run at once).
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
type MotionMode = 'curved' | 'accel' | 'decelPauseReverse' | 'delayed' | 'formation';
// Shared telegraph look for every 'delayed' (ghost) bullet, regardless of which
// skill spawned it — spawnEnemyBullet dims it, updateBulletMotion restores it on launch.
const GHOST_ALPHA = 0.25;

// Shared, tweenable transform for a 'formation' bullet cluster (Bloom's flower):
// every petal bullet holds a reference to one of these and is positioned from it
// each frame, so scaling/rotating the whole flower is one tween on this object.
interface FlowerFormation {
  cx: number;
  cy: number;
  scale: number;
  rotation: number;
  released: boolean; // once true, petals stop being positioned and fly free
}

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

  // decelPauseReverse: decelerate to a hover, hold for pauseMs, then fold back
  // along a fixed reverseAngleRad (down + inward), curling by reverseCurlRad for
  // reverseDurationMs before flying straight. All bullets of one wing share the
  // same reverseAngleRad so the fan keeps its order (no mirror-inverted crossing).
  stage?: 'decel' | 'pause' | 'return' | 'sink' | 'brake' | 'sinkHold';
  pauseMs?: number;
  reverseSpeed?: number;
  reverseAngleRad?: number;
  reverseCurlRad?: number;
  reverseDurationMs?: number;
  reverseTex?: string; // swap to a brighter texture the moment the fold launches
  // Optional tail after the fold: sink to sinkStopY, brake to a stop, hover, then
  // reverse at riseSpeed back along the flipped heading (butterfly's second
  // reversal). Omitted = fly straight. `volley` is shared by all bullets of one
  // fan so the first to reach sinkStopY turns the whole volley at once;
  // sinkHeadingRad remembers the heading to reverse along after the stop.
  sinkStopY?: number;
  riseSpeed?: number;
  volley?: { reversing: boolean };
  sinkHeadingRad?: number;

  // delayed: body spawns disabled (renders if visible, but can't collide — see
  // Body.enable filtering in spawnEnemyBullet/releaseBullet) until launchAtMs,
  // then fires once along launchAngleRad at launchSpeed.
  launchAtMs?: number;
  launchAngleRad?: number;
  launchSpeed?: number;

  // formation: position is driven each frame from the shared FlowerFormation
  // (kinematic, velocity 0) until it's released — see updateBulletMotion / bloomSkill.
  formation?: FlowerFormation;
  baseAngleRad?: number; // slot angle at unit scale, before formation.rotation
  baseRadius?: number; // slot radius at unit scale, before formation.scale
  tangentRad?: number; // petal tangent direction (for the tangent-band release)
  revealAtMs?: number; // stay hidden + non-colliding until this.time.now hits it (mandala draw-in)
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
  private bossAura?: Phaser.GameObjects.Arc; // yellow glow shown while the boss is invincible
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
    // Sized for the heaviest moment: a hard Bloom's second flower forming (~370
    // formation bullets) while the first flower's release is still on screen.
    this.enemyBullets = this.physics.add.group({ maxSize: 800 });
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
      .text(W - 12, 10, '♥ '.repeat(START_LIVES), {
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

  // Double-size enemy-bullet texture (Lunar Mandala's slow aimed shots) — the
  // body is re-circled to radius 10 at spawn so the hitbox matches the visual.
  private bigBulletTexture(color: number): string {
    const key = `ebbig_${color.toString(16)}`;
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(color).fillCircle(MANDALA_BIG_RADIUS, MANDALA_BIG_RADIUS, MANDALA_BIG_RADIUS);
      g.fillStyle(0xffffff, 0.85).fillCircle(MANDALA_BIG_RADIUS, MANDALA_BIG_RADIUS, MANDALA_BIG_RADIUS * 0.4);
      g.generateTexture(key, MANDALA_BIG_RADIUS * 2, MANDALA_BIG_RADIUS * 2);
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

    if (motion.mode === 'formation') {
      const f = motion.formation;
      if (!f || f.released) {
        bullet.setData('motion', undefined);
        return;
      }
      // Kinematic: position is driven entirely from the shared, tweened transform.
      const a = (motion.baseAngleRad ?? 0) + f.rotation;
      const r = (motion.baseRadius ?? 0) * f.scale;
      bullet.setVelocity(0, 0);
      bullet.setPosition(f.cx + Math.cos(a) * r, f.cy + Math.sin(a) * r);
      // Draw-in: a bullet spawned hidden pops in (and starts colliding) once its
      // staggered reveal time arrives — the mandala unfurls instead of snapping in.
      if (motion.revealAtMs !== undefined && !bullet.visible && nowMs >= motion.revealAtMs) {
        bullet.setVisible(true);
        body.enable = true;
      }
      return;
    }

    // decelPauseReverse
    if ((motion.stage ?? 'decel') === 'decel') {
      const heading = body.velocity.angle();
      const nextSpeed = Math.max(0, body.velocity.length() + (motion.acceleration ?? 0) * dt);
      bullet.setVelocity(Math.cos(heading) * nextSpeed, Math.sin(heading) * nextSpeed);
      if (nextSpeed <= (motion.minSpeed ?? 0)) {
        bullet.setVelocity(0, 0); // crisp hover, the telegraph beat before the fold
        motion.stage = 'pause';
        motion.stageStartedAt = nowMs;
        bullet.setData('motion', motion);
      }
      return;
    }
    if (motion.stage === 'pause') {
      if (nowMs - motion.stageStartedAt < (motion.pauseMs ?? 0)) return;
      // Launch the coherent fold: a fixed down-and-inward heading per wing (all a
      // wing's bullets share it, so the fan keeps its order instead of the old
      // velocity-mirror inverting it into a crossing X), brighter tex, then curl.
      const angle = motion.reverseAngleRad ?? Math.PI / 2;
      const speed = motion.reverseSpeed ?? 0;
      bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      if (motion.reverseTex) bullet.setTexture(motion.reverseTex);
      motion.stage = 'return';
      motion.stageStartedAt = nowMs;
      bullet.setData('motion', motion);
      return;
    }
    if (motion.stage === 'return') {
      // Curl the fold for reverseDurationMs, then either fly straight (default)
      // or, if a sink target is set, hand off to the second-reversal tail.
      if (nowMs - motion.stageStartedAt >= (motion.reverseDurationMs ?? 0)) {
        if (motion.sinkStopY === undefined) {
          bullet.setData('motion', undefined);
          return;
        }
        motion.stage = 'sink';
        bullet.setData('motion', motion);
        return;
      }
      Phaser.Math.Rotate(body.velocity, (motion.reverseCurlRad ?? 0) * dt);
      return;
    }
    if (motion.stage === 'sink') {
      // Coast on the folded heading. The first bullet of the volley to cross the
      // stop line low on the screen (past the player) flips the shared trigger,
      // so the whole volley turns around together — not each bullet as it arrives.
      const vol = motion.volley;
      const reached = bullet.y >= (motion.sinkStopY ?? H);
      if (vol && reached) vol.reversing = true;
      if (vol ? vol.reversing : reached) {
        motion.sinkHeadingRad = body.velocity.angle(); // remember it to reverse along
        motion.stage = 'brake';
        bullet.setData('motion', motion);
      }
      return;
    }
    if (motion.stage === 'brake') {
      const heading = motion.sinkHeadingRad ?? body.velocity.angle();
      const nextSpeed = Math.max(0, body.velocity.length() - BUTTERFLY_SINK_BRAKE_DECEL * dt);
      bullet.setVelocity(Math.cos(heading) * nextSpeed, Math.sin(heading) * nextSpeed);
      if (nextSpeed <= 1) {
        bullet.setVelocity(0, 0);
        motion.stage = 'sinkHold';
        motion.stageStartedAt = nowMs;
        bullet.setData('motion', motion);
      }
      return;
    }
    // stage === 'sinkHold': hover briefly, then reverse a second time — back the
    // way it came (its last heading, flipped 180°) at riseSpeed — and hand the
    // bullet off to constant-velocity flight.
    if (nowMs - motion.stageStartedAt < BUTTERFLY_SINK_HOLD_MS) return;
    const rev = (motion.sinkHeadingRad ?? -Math.PI / 2) + Math.PI;
    const riseSpeed = motion.riseSpeed ?? 0;
    bullet.setVelocity(Math.cos(rev) * riseSpeed, Math.sin(rev) * riseSpeed);
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
      reverseAngleRad: Math.PI / 2, // fold straight back down
      reverseCurlRad: 0,
      reverseDurationMs: 0,
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

    // Invincibility aura: a soft yellow halo behind the boss, hidden until a
    // skill turns invincibility on (positioned + toggled each frame in update()).
    this.bossAura?.destroy();
    this.bossAura = this.add
      .circle(boss.x, boss.y, 42, 0xffe066, 0.16)
      .setStrokeStyle(3, 0xffd21a, 0.9)
      .setDepth(1)
      .setVisible(false);
    this.tweens.add({
      targets: this.bossAura,
      scale: 1.16,
      yoyo: true,
      repeat: -1,
      duration: 420,
      ease: 'Sine.easeInOut',
    });

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

    // Advanced skills grant a brief invincible window (yellow aura). We don't
    // know the cast's length up front, so we scale off the *previous* measured
    // duration of the same skill(s): invincible for max(2s, 75% of it), leaving
    // the pattern's tail vulnerable so the player can still punish it. The very
    // first cast (no measurement yet) holds invincibility for the whole cast.
    if (ids.some((id) => ADVANCED_SKILLS.has(id))) {
      const durs = (boss.getData('skillDur') as Record<string, number>) ?? {};
      const key = ids.join('+');
      const prev = durs[key];
      const start = this.time.now;
      boss.setData(
        'invulnUntil',
        prev !== undefined
          ? start + Math.max(BOSS_ADVANCED_INVULN_MIN_MS, prev * BOSS_ADVANCED_INVULN_FRAC)
          : start + 600000,
      );
      this.runSkills(boss, ids, ctx, () => {
        durs[key] = this.time.now - start;
        boss.setData('skillDur', durs);
        // First (unmeasured) cast: clear now, but honor the 2s floor.
        if (prev === undefined) {
          boss.setData('invulnUntil', Math.max(this.time.now, start + BOSS_ADVANCED_INVULN_MIN_MS));
        }
        next();
      });
      return;
    }

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
      case 'bloom':
        this.bloomSkill(boss, ctx, done);
        break;
      case 'mandala':
        this.mandalaSkill(boss, ctx, done);
        break;
      case 'loom':
        this.loomSkill(boss, ctx, done);
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
  // hover, pause, then fold back down-and-inward as a coherent sweep. Built on
  // the 'decelPauseReverse' motion mode; each wing folds along one shared heading
  // (fan keeps its order — no crossing) with opposite curl for the two sides.
  private butterflySkill(boss: Sprite, ctx: SkillCtx, done: () => void) {
    const hard = ctx.hardIds.has('butterfly');
    const volleys = hard ? BUTTERFLY_VOLLEYS_HARD : BUTTERFLY_VOLLEYS;
    const reverseTex = ctx.texAim; // brighter color once the wings fold back in

    this.withStationaryBoss(boss, W / 2, (finish) => {
      const fireWing = (bullets: number, extraRotationRad: number, alignShift = 0) => {
        const returnSec = BUTTERFLY_RETURN_MS / 1000;
        // Shared across both wings of this volley: the first bullet to reach the
        // sink line flips this, turning the whole volley around together.
        const volley = { reversing: false };
        for (const wing of [-1, 1]) {
          for (let i = 0; i < bullets; i++) {
            // alignShift nudges the whole fan by a fraction of a slot so alternate
            // volleys interleave (brick pattern) instead of landing on top of each other.
            const t = bullets > 1 ? (i + alignShift) / (bullets - 1) : 0;
            const spread = t * BUTTERFLY_WING_SPREAD_RAD;
            const angle = Math.PI / 2 + wing * (BUTTERFLY_WING_INNER_RAD + spread + extraRotationRad);
            // The fold launches straight down, then curls out to this bullet's own
            // fan offset over the return — inner bullets barely, outer bullets far —
            // so the wing slowly aims across the lower screen (mirrored per side).
            const fanOffset = BUTTERFLY_RETURN_BASE_RAD + t * BUTTERFLY_RETURN_FAN_RAD;
            this.spawnEnemyBullet(boss.x, boss.y, angle, BUTTERFLY_INITIAL_SPEED, wing < 0 ? ctx.texA : ctx.texB, {
              mode: 'decelPauseReverse',
              acceleration: BUTTERFLY_DECELERATION,
              minSpeed: BUTTERFLY_MIN_SPEED,
              pauseMs: BUTTERFLY_PAUSE_MS,
              reverseSpeed: BUTTERFLY_REVERSE_SPEED,
              reverseAngleRad: Math.PI / 2, // launch straight down, then curl out
              reverseCurlRad: (wing * fanOffset) / returnSec, // total curl over the return = fanOffset
              reverseDurationMs: BUTTERFLY_RETURN_MS,
              reverseTex,
              sinkStopY: H * BUTTERFLY_SINK_STOP_FRAC,
              riseSpeed: BUTTERFLY_INITIAL_SPEED * BUTTERFLY_RISE_SPEED_FRAC,
              volley,
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
        // Every other volley is half-slot offset so the fans interlock into a
        // denser wall (see BUTTERFLY_ALIGN_SHIFT).
        fireWing(BUTTERFLY_FAN_BULLETS, 0, v % 2 === 1 ? BUTTERFLY_ALIGN_SHIFT : 0);
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

  // Celestial Bloom — Form (all petals draw on together, one sample each per step)
  // -> Bloom (grow + rotate the whole flower into a wall) -> Hold -> Release
  // (straight out, or along the petal tangents as swirling bands). Petals are
  // 'formation' bullets: each is positioned every frame from a single shared,
  // tweened transform, so the whole flower scales/rotates with one tween. Hard
  // mode starts a second flower forming the instant the first releases.
  private bloomSkill(boss: Sprite, ctx: SkillCtx, done: () => void) {
    const hard = ctx.hardIds.has('bloom');
    const samples = hard ? BLOOM_PETAL_SAMPLES_HARD : BLOOM_PETAL_SAMPLES;

    // Petal slots grouped per petal (in sample order) so every petal can draw on
    // in parallel — one sample per petal per step, delay between successive
    // samples of the same petal. Skips samples that land on the flower center.
    type Slot = { baseAngleRad: number; baseRadius: number; tangentRad: number; tex: string };
    const buildPetals = (): Slot[][] => {
      const perPetal: Slot[][] = [];
      for (let p = 0; p < BLOOM_PETALS; p++) {
        const petalRadiusMult = p % 2 == 0 ? 1 : 0.8;
        const pa = (p / BLOOM_PETALS) * Math.PI * 2;
        const ox = Math.cos(pa) * BLOOM_PETAL_RADIUS * petalRadiusMult;
        const oy = Math.sin(pa) * BLOOM_PETAL_RADIUS * petalRadiusMult;
        const petalSlots: Slot[] = [];
        for (let s = 0; s < samples; s++) {
          const phi = (s % 2 == 1 ? 1 : -1) * (s / samples) * Math.PI * 2 + pa;
          const lx = ox + Math.cos(phi) * BLOOM_PETAL_RADIUS * petalRadiusMult;
          const ly = oy + Math.sin(phi) * BLOOM_PETAL_RADIUS * petalRadiusMult;
          const baseRadius = Math.hypot(lx, ly);
          if (baseRadius < BLOOM_MIN_RADIUS) continue;
          petalSlots.push({
            baseAngleRad: Math.atan2(ly, lx),
            baseRadius,
            tangentRad: phi + Math.PI / 2, // tangent to this petal circle at phi
            tex: p % 2 === 0 ? ctx.texA : ctx.texB,
          });
        }
        perPetal.push(petalSlots);
      }
      return perPetal;
    };

    this.withStationaryBoss(boss, W / 2, (finish) => {
      // One full Form -> Bloom -> Hold -> Release cycle; onReleased fires the
      // moment the petals launch (so a hard second flower can start forming then).
      const runOneBloom = (onReleased: () => void) => {
        const formation: FlowerFormation = { cx: boss.x, cy: boss.y, scale: BLOOM_FORM_SCALE, rotation: 0, released: false };
        const petals: Sprite[] = [];
        const perPetal = buildPetals();
        const maxLen = perPetal.reduce((m, a) => Math.max(m, a.length), 0);

        const release = () => {
          if (!boss.active || this.state !== 'playing') return; // boss died — bullets already cleared
          const tangent = Phaser.Math.RND.frac() < 0.5; // branch: straight out, or petal-tangent bands
          formation.released = true;
          for (const b of petals) {
            if (!b.active) continue;
            const m = b.getData('motion') as MotionState | undefined;
            const dir = (tangent ? (m?.tangentRad ?? 0) : (m?.baseAngleRad ?? 0)) + formation.rotation;
            b.setVelocity(Math.cos(dir) * BLOOM_RELEASE_SPEED, Math.sin(dir) * BLOOM_RELEASE_SPEED);
            (b.body as Phaser.Physics.Arcade.Body).enable = true;
            b.setData('motion', undefined);
          }
          onReleased();
        };

        const bloom = () => {
          if (!boss.active || this.state !== 'playing') return;
          // Grow + rotate the whole flower into a wall; Back.easeOut overshoots
          // the scale slightly for the appealing "pop" as it blooms.
          this.tweens.add({
            targets: formation,
            scale: BLOOM_FULL_SCALE,
            rotation: BLOOM_ROTATE_RAD,
            duration: BLOOM_GROW_MS,
            ease: 'Back.easeOut',
            onComplete: () => this.time.delayedCall(BLOOM_HOLD_MS, release),
          });
        };

        // Form: every petal adds its sample #step this step (all in parallel).
        let step = 0;
        const spawnStep = () => {
          if (!boss.active || this.state !== 'playing') return;
          for (const petalSlots of perPetal) {
            const slot = petalSlots[step];
            if (!slot) continue;
            const r = slot.baseRadius * BLOOM_FORM_SCALE;
            const b = this.spawnEnemyBullet(
              formation.cx + Math.cos(slot.baseAngleRad) * r,
              formation.cy + Math.sin(slot.baseAngleRad) * r,
              0,
              0,
              slot.tex,
              {
                mode: 'formation',
                formation,
                baseAngleRad: slot.baseAngleRad,
                baseRadius: slot.baseRadius,
                tangentRad: slot.tangentRad,
              },
            );
            if (b) petals.push(b);
          }
          step += 1;
          if (step < maxLen) this.time.delayedCall(BLOOM_FORM_STEP_MS, spawnStep);
          else bloom();
        };
        spawnStep();
      };

      const finishAll = () => this.time.delayedCall(500, () => {
        finish();
        done();
      });
      // Hard: a second flower starts forming the instant the first releases.
      runOneBloom(() => (hard ? runOneBloom(finishAll) : finishAll()));
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

  // Lunar Mandala — concentric rings of 'formation' bullets (one FlowerFormation
  // per ring) with 1-2 carved gaps. After a charge + hold, the rings counter-rotate
  // (inner faster), and every ring's shared center descends toward a snapshot of
  // the player while the whole mandala grows — the gaps sweep across the field so
  // there's no static safe lane. Mid-way through, slow oversized aimed shots pile
  // on so the player can't sit still. The rings dissolve outward at the end.
  private mandalaSkill(boss: Sprite, ctx: SkillCtx, done: () => void) {
    const hard = ctx.hardIds.has('mandala');
    const rings = hard ? MANDALA_RINGS_HARD : MANDALA_RINGS;
    const tier = boss.getData('tier') as number;
    const palette = BOSS_PALETTES[(tier - 1) % BOSS_PALETTES.length];
    const bigTex = this.bigBulletTexture(palette[0]);

    this.withStationaryBoss(boss, W / 2, (finish) => {
      const originX = boss.x;
      const originY = boss.y;

      // Charge — a scale pulse telegraphing the mandala before it draws.
      const charge = this.tweens.add({ targets: boss, scale: 1.14, yoyo: true, repeat: -1, duration: 150 });
      this.time.delayedCall(MANDALA_CHARGE_MS, () => {
        charge.stop();
        if (!boss.active || this.state !== 'playing') {
          finish();
          done();
          return;
        }
        boss.setScale(1);

        // Build the rings around the fixed origin (upper screen, at the boss).
        type Ring = { formation: FlowerFormation; bullets: Sprite[]; angular: number; dir: number };
        const ringData: Ring[] = [];
        for (let r = 0; r < rings; r++) {
          const radius = MANDALA_INNER_RADIUS + r * MANDALA_RADIUS_STEP;
          const formation: FlowerFormation = { cx: originX, cy: originY, scale: 1, rotation: 0, released: false };
          const count = Phaser.Math.Clamp(
            Math.round((2 * Math.PI * radius) / MANDALA_ARC_SPACING),
            12,
            MANDALA_MAX_RING_BULLETS,
          );
          const gap = (Math.PI * 2) / count;
          // Carve 1-2 contiguous gaps at spread-out, per-ring-random positions so
          // no two rings' gaps line up (and drift apart as the rings counter-rotate).
          const skip = new Set<number>();
          const gaps = Phaser.Math.Between(MANDALA_GAPS_MIN, MANDALA_GAPS_MAX);
          const half = Math.floor(MANDALA_GAP_BULLETS / 2);
          for (let g = 0; g < gaps; g++) {
            const slot = Math.floor(count / gaps);
            const base = g * slot + Phaser.Math.Between(0, Math.max(0, slot - MANDALA_GAP_BULLETS));
            for (let k = -half; k <= half; k++) skip.add((((base + k) % count) + count) % count);
          }
          const tex = r % 2 === 0 ? ctx.texA : ctx.texB;
          // Draw-in sweep: reveal this ring's bullets one-by-one instead of all at
          // once. Every ring spans the same MANDALA_DRAW_MS window (they "appear at
          // the same time"), but the sweep runs the opposite way around on alternate
          // rings so the mandala unfurls rather than snapping into existence.
          const sweepForward = r % 2 === 0;
          const bullets: Sprite[] = [];
          for (let i = 0; i < count; i++) {
            if (skip.has(i)) continue;
            const baseAngle = i * gap;
            const progress = sweepForward ? i / count : (count - 1 - i) / count;
            const b = this.spawnEnemyBullet(
              originX + Math.cos(baseAngle) * radius,
              originY + Math.sin(baseAngle) * radius,
              0,
              0,
              tex,
              {
                mode: 'formation',
                formation,
                baseAngleRad: baseAngle,
                baseRadius: radius,
                revealAtMs: this.time.now + progress * MANDALA_DRAW_MS,
              },
            );
            if (b) {
              // Hidden and non-colliding until updateBulletMotion pops it in at its
              // staggered reveal time — cheaper than a timer per bullet.
              b.setVisible(false);
              (b.body as Phaser.Physics.Arcade.Body).enable = false;
              bullets.push(b);
            }
          }
          // Innermost ring (r=0) spins fastest; direction alternates per ring.
          const angular = MANDALA_ANGULAR_BASE + (rings - 1 - r) * MANDALA_ANGULAR_STEP;
          ringData.push({ formation, bullets, angular, dir: r % 2 === 0 ? 1 : -1 });
        }

        // Let the rings finish drawing in, then hold so the gaps are readable,
        // then start the descent + rotation.
        this.time.delayedCall(MANDALA_DRAW_MS + MANDALA_HOLD_MS, () => {
          if (!boss.active || this.state !== 'playing') {
            finish();
            done();
            return;
          }
          const targetX = Phaser.Math.Clamp(this.ship.x, 80, W - 80);
          const targetY = Phaser.Math.Clamp(this.ship.y, H * 0.35, H * 0.85);
          const contractSec = MANDALA_CONTRACT_MS / 1000;
          for (const ring of ringData) {
            // Shared descending center + growing scale (identical across rings so
            // they stay concentric); a separate linear tween spins each ring.
            this.tweens.add({
              targets: ring.formation,
              cx: targetX,
              cy: targetY,
              scale: MANDALA_SCALE_END,
              duration: MANDALA_CONTRACT_MS,
              ease: 'Sine.easeIn',
            });
            this.tweens.add({
              targets: ring.formation,
              rotation: ring.dir * ring.angular * contractSec,
              duration: MANDALA_CONTRACT_MS,
              ease: 'Linear',
            });
          }

          // Second half: slow, oversized aimed shots that force the player to move.
          const bigShots = hard ? MANDALA_BIG_SHOTS_HARD : MANDALA_BIG_SHOTS;
          const jitter = Phaser.Math.DegToRad(MANDALA_BIG_AIM_JITTER_DEG);
          for (let s = 0; s < bigShots; s++) {
            this.time.delayedCall(MANDALA_CONTRACT_MS / 2 + s * MANDALA_BIG_GAP_MS, () => {
              if (!boss.active || this.state !== 'playing') return;
              // Aim at where the player is *right now* (snapshot at shot time), then
              // scatter by a small random angle so a fast volley fans into a partly-
              // overlapping spread instead of stacking on one line — can't be out-run
              // straight, and forces the player to keep repositioning.
              const aim = Phaser.Math.Angle.Between(boss.x, boss.y, this.ship.x, this.ship.y);
              const angle = aim + Phaser.Math.FloatBetween(-jitter, jitter);
              const b = this.spawnEnemyBullet(boss.x, boss.y + 20, angle, MANDALA_BIG_SPEED, bigTex);
              // Explicit offset so re-circling a 20px body stays centered.
              if (b) (b.body as Phaser.Physics.Arcade.Body).setCircle(MANDALA_BIG_RADIUS, 0, 0);
            });
          }

          // Dissolve: release every ring bullet straight outward, then finish.
          this.time.delayedCall(MANDALA_CONTRACT_MS, () => {
            for (const ring of ringData) {
              ring.formation.released = true;
              for (const b of ring.bullets) {
                if (!b.active) continue;
                const m = b.getData('motion') as MotionState | undefined;
                // A ring bullet that swept off-screen during the descent gets
                // recycled to the pool, but its reference lingers in ring.bullets —
                // and a later big shot may have re-spawned that very sprite. Only
                // release bullets still driven by *this* formation so we never
                // hijack a re-used big bullet (whose motion is gone/different) and
                // fling it back outward instead of on toward the player.
                if (!m || m.mode !== 'formation' || m.formation !== ring.formation) continue;
                const dir = (m.baseAngleRad ?? 0) + ring.formation.rotation;
                b.setVelocity(Math.cos(dir) * MANDALA_RELEASE_SPEED, Math.sin(dir) * MANDALA_RELEASE_SPEED);
                b.setData('motion', undefined);
              }
            }
            this.time.delayedCall(400, () => {
              finish();
              done();
            });
          });
        });
      });
    });
  }

  // Starweaver's Loom — bullet "threads" laid along screen-spanning Bezier curves.
  // The threads draw on (weave), the curves undulate in place as the telegraph, a
  // red flash cues release, then each bullet fires perpendicular to its curve
  // (alternating left/right normal) with curves releasing 0.15s apart — a
  // crosshatch rain. Screen-anchored, so the boss keeps strafing ("drawing").
  private loomSkill(boss: Sprite, ctx: SkillCtx, done: () => void) {
    const hard = ctx.hardIds.has('loom');
    const curveCount = hard ? LOOM_CURVES_HARD : LOOM_CURVES;

    // Quadratic Bezier point + tangent angle, computed directly (no arc-length
    // cache) so mutating the control point mid-undulation just works.
    type Pt = { x: number; y: number };
    const quad = (p0: Pt, c: Pt, p2: Pt, t: number): Pt => {
      const mt = 1 - t;
      return {
        x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p2.x,
        y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p2.y,
      };
    };
    const quadTangent = (p0: Pt, c: Pt, p2: Pt, t: number): number => {
      const mt = 1 - t;
      const dx = 2 * mt * (c.x - p0.x) + 2 * t * (p2.x - c.x);
      const dy = 2 * mt * (c.y - p0.y) + 2 * t * (p2.y - c.y);
      return Math.atan2(dy, dx);
    };

    type Thread = { p0: Pt; p2: Pt; c: Pt; cBaseY: number; phase: number; n: number; bullets: Sprite[] };
    const threads: Thread[] = [];
    for (let k = 0; k < curveCount; k++) {
      const f = curveCount > 1 ? k / (curveCount - 1) : 0.5;
      // Left endpoints run top->bottom, right endpoints bottom->top, so adjacent
      // threads cross — the woven look. Control bow alternates up/down.
      const leftY = Phaser.Math.Linear(LOOM_EDGE_TOP, LOOM_EDGE_BOT, f);
      const rightY = Phaser.Math.Linear(LOOM_EDGE_BOT, LOOM_EDGE_TOP, f);
      const cy = (leftY + rightY) / 2 + (k % 2 === 0 ? -1 : 1) * LOOM_CTRL_BOW;
      const p0: Pt = { x: 6, y: leftY };
      const p2: Pt = { x: W - 6, y: rightY };
      const dist = Math.hypot(p2.x - p0.x, p2.y - p0.y);
      const n = Phaser.Math.Clamp(Math.round(dist / LOOM_BULLET_SPACING), LOOM_MIN_BULLETS, LOOM_MAX_BULLETS);
      threads.push({ p0, p2, c: { x: W / 2, y: cy }, cBaseY: cy, phase: k * (Math.PI / 3), n, bullets: [] });
    }

    const gfx = this.add.graphics().setDepth(1);
    const drawPreview = () => {
      gfx.clear();
      gfx.lineStyle(2, 0xffffff, LOOM_PREVIEW_ALPHA);
      for (const th of threads) {
        gfx.beginPath();
        gfx.moveTo(th.p0.x, th.p0.y);
        const steps = 24;
        for (let s = 1; s <= steps; s++) {
          const p = quad(th.p0, th.c, th.p2, s / steps);
          gfx.lineTo(p.x, p.y);
        }
        gfx.strokePath();
      }
    };
    drawPreview();

    const cleanup = () => {
      if (gfx.active) gfx.destroy();
    };

    // Fire the threads: flash, then flip each curve's parked ghosts to launch,
    // staggered per curve. updateBulletMotion launches them along their stored
    // (base-curve) normal the next frame.
    const release = () => {
      if (!boss.active || this.state !== 'playing') {
        cleanup();
        done();
        return;
      }
      const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xff3355).setDepth(8).setAlpha(0.5);
      this.tweens.add({ targets: flash, alpha: 0, duration: LOOM_FLASH_MS, onComplete: () => flash.destroy() });
      threads.forEach((th, k) => {
        this.time.delayedCall(k * LOOM_CURVE_STAGGER_MS, () => {
          for (const b of th.bullets) {
            if (!b.active) continue;
            const m = b.getData('motion') as MotionState | undefined;
            if (m) m.launchAtMs = this.time.now;
          }
        });
      });
      this.time.delayedCall((threads.length - 1) * LOOM_CURVE_STAGGER_MS + 400, () => {
        cleanup();
        done();
      });
    };

    // Undulate the curves in place (visual telegraph). Ghost bodies are disabled,
    // so repositioning them each frame is free; the tween ends snapped back to the
    // base curve so each stored launch normal still matches its bullet's position.
    const undulate = () => {
      if (!boss.active || this.state !== 'playing') {
        cleanup();
        done();
        return;
      }
      const wob = { p: 0 };
      const reposition = () => {
        for (const th of threads) {
          for (const b of th.bullets) {
            const t = (b.getData('loomT') as number) ?? 0;
            const p = quad(th.p0, th.c, th.p2, t);
            if (b.active) b.setPosition(p.x, p.y);
          }
        }
        drawPreview();
      };
      this.tweens.add({
        targets: wob,
        p: Math.PI * 4,
        duration: LOOM_UNDULATE_MS,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          for (const th of threads) th.c.y = th.cBaseY + Math.sin(wob.p + th.phase) * LOOM_UNDULATE_AMP;
          reposition();
        },
        onComplete: () => {
          for (const th of threads) th.c.y = th.cBaseY; // snap back to base curve
          reposition();
          release();
        },
      });
    };

    // Weave: one bullet per thread per step, so all curves draw on in parallel.
    const maxN = threads.reduce((m, th) => Math.max(m, th.n), 0);
    let step = 0;
    const weave = () => {
      if (!boss.active || this.state !== 'playing') {
        cleanup();
        done();
        return;
      }
      for (const th of threads) {
        if (step >= th.n) continue;
        const t = th.n > 1 ? step / (th.n - 1) : 0.5;
        const p = quad(th.p0, th.c, th.p2, t);
        const tangent = quadTangent(th.p0, th.c, th.p2, t);
        // Alternate the perpendicular so a thread splits into a left-normal and a
        // right-normal comb when it releases — the crosshatch.
        const dir = tangent + (step % 2 === 0 ? Math.PI / 2 : -Math.PI / 2);
        const b = this.spawnEnemyBullet(p.x, p.y, 0, 0, step % 2 === 0 ? ctx.texA : ctx.texB, {
          mode: 'delayed',
          launchAtMs: Number.MAX_SAFE_INTEGER, // parked until release flips it to now
          launchAngleRad: dir,
          launchSpeed: LOOM_BULLET_SPEED,
        });
        if (b) {
          b.setData('loomT', t);
          th.bullets.push(b);
        }
      }
      step += 1;
      if (step < maxN) this.time.delayedCall(LOOM_WEAVE_STEP_MS, weave);
      else undulate();
    };
    weave();
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
    if (this.bossAura) this.tweens.killTweensOf(this.bossAura);
    this.bossAura?.destroy();
    this.bossBarBg = this.bossBarFill = undefined;
    this.bossLabel = undefined;
    this.bossAura = undefined;
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
    // Invincible boss (mid advanced-skill): the aura absorbs the shot — the
    // bullet is spent but deals no damage.
    if (enemy.getData('boss') && this.time.now < ((enemy.getData('invulnUntil') as number) ?? 0)) {
      this.releaseBullet(bullet);
      return;
    }
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
      // In-flight skill bullets are left on screen on purpose — the fight's last
      // volley keeps flying and must still be dodged. Only the Prism beams are
      // cleared (a beam with no boss to anchor it would hang in mid-air).
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
      this.livesText.setText('♥ '.repeat(this.lives));
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
    this.livesText.setText('♥ '.repeat(Math.max(0, this.lives)));
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
    // Keep the invincibility aura glued to the boss while its window is open.
    if (this.bossAura) {
      const b = this.boss;
      const invuln = !!b && b.active && time < ((b.getData('invulnUntil') as number) ?? 0);
      this.bossAura.setVisible(invuln);
      if (invuln && b) this.bossAura.setPosition(b.x, b.y);
    }
    // Recycle offscreen bullets (pool release, not destroy) and items; advance
    // any active per-bullet motion controllers on the enemy bullets that have one.
    for (const b of this.playerBullets.getChildren() as Sprite[]) {
      if (b.active && (b.y < -20 || b.x < -20 || b.x > W + 20)) this.releaseBullet(b);
    }
    for (const b of this.enemyBullets.getChildren() as Sprite[]) {
      if (!b.active) continue;
      if (
        b.y < -BULLET_RECYCLE_MARGIN_Y ||
        b.y > H + BULLET_RECYCLE_MARGIN_Y ||
        b.x < -BULLET_RECYCLE_MARGIN_X ||
        b.x > W + BULLET_RECYCLE_MARGIN_X
      ) {
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
