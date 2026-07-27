import {
  ANCHOR_RADIUS,
  FIELD_BOTTOM,
  FIELD_LEFT,
  FIELD_RIGHT,
  FIELD_TOP,
  LAUNCH_X,
  LAUNCH_Y,
  PEG_RADIUS,
} from '../sim/constants';
import type { FluxZone, Peg, PegKind } from '../sim/types';
import type { Archetype, LevelParams } from './curve';
import type { Rng } from './rng';

/** Peg-bearing region, inset so the launcher and bucket keep clear air. */
const AREA_LEFT = FIELD_LEFT + 34;
const AREA_RIGHT = FIELD_RIGHT - 34;
const AREA_TOP = FIELD_TOP + 96;
const AREA_BOTTOM = FIELD_BOTTOM - 70;
const AREA_W = AREA_RIGHT - AREA_LEFT;
const AREA_H = AREA_BOTTOM - AREA_TOP;

/**
 * Minimum centre distance between pegs. Two peg radii plus a ball diameter, so the
 * ball can always physically pass between any two neighbours.
 */
const MIN_SPACING = 2 * PEG_RADIUS + 2 * 10 + 6;

interface Point {
  x: number;
  y: number;
}

// --- Layout pass -----------------------------------------------------------

function lattice(count: number, rng: Rng): Point[] {
  const cols = Math.max(5, Math.round(Math.sqrt(count * (AREA_W / AREA_H))));
  const rows = Math.max(4, Math.ceil(count / cols));
  const stepX = AREA_W / cols;
  const stepY = AREA_H / rows;
  const points: Point[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const offset = row % 2 === 0 ? 0 : stepX / 2;
      points.push({
        x: AREA_LEFT + stepX / 2 + col * stepX + offset + rng.range(-6, 6),
        y: AREA_TOP + stepY / 2 + row * stepY + rng.range(-6, 6),
      });
    }
  }
  return points;
}

function arcs(count: number, rng: Rng): Point[] {
  const focusX = AREA_LEFT + AREA_W * rng.range(0.35, 0.65);
  const focusY = AREA_TOP - rng.range(20, 90);
  const rings = rng.int(4, 6);
  const points: Point[] = [];
  for (let ring = 1; ring <= rings; ring += 1) {
    const radius = (AREA_H / rings) * ring * rng.range(0.9, 1.05);
    const spread = rng.range(0.9, 1.35);
    // Angular step derived from radius, so arc length between pegs stays passable.
    const step = MIN_SPACING / Math.max(40, radius);
    for (let a = -spread; a <= spread; a += step) {
      points.push({
        x: focusX + Math.cos(a - Math.PI / 2) * radius,
        y: focusY + Math.sin(a - Math.PI / 2) * radius + radius,
      });
    }
  }
  return points;
}

function funnel(count: number, rng: Rng): Point[] {
  const gap = rng.range(70, 110);
  const throatY = AREA_TOP + AREA_H * rng.range(0.5, 0.7);
  const rows = Math.max(6, Math.round(count / 7));
  const points: Point[] = [];
  for (let row = 0; row < rows; row += 1) {
    const t = row / (rows - 1);
    const y = AREA_TOP + t * AREA_H;
    const converge = Math.min(1, Math.abs(y - throatY) / (AREA_H * 0.5));
    const halfWidth = gap / 2 + converge * (AREA_W / 2 - gap / 2);
    const perSide = Math.max(1, Math.round(count / (rows * 2)));
    for (let i = 0; i < perSide; i += 1) {
      const inset = i * MIN_SPACING * 1.1;
      points.push({ x: LAUNCH_X - halfWidth - inset, y: y + rng.range(-5, 5) });
      points.push({ x: LAUNCH_X + halfWidth + inset, y: y + rng.range(-5, 5) });
    }
  }
  return points;
}

/**
 * Archimedean, not logarithmic: an exponential spiral leaves the field after a
 * handful of pegs. Radius grows by one spacing per turn so successive windings stay
 * exactly one ball-width apart, which is what makes sustained orbiting possible.
 */
function spiral(count: number, rng: Rng): Point[] {
  const cx = AREA_LEFT + AREA_W / 2 + rng.range(-30, 30);
  const cy = AREA_TOP + AREA_H / 2;
  const arms = rng.int(2, 3);
  const aspect = AREA_H / AREA_W;
  const growth = (MIN_SPACING * rng.range(1.05, 1.3)) / (Math.PI * 2);
  const points: Point[] = [];
  const perArm = Math.ceil(count / arms);

  for (let arm = 0; arm < arms; arm += 1) {
    let a = (arm / arms) * Math.PI * 2;
    let r = 34;
    for (let i = 0; i < perArm * 3 && points.length < count * 1.4; i += 1) {
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * aspect;
      if (x >= AREA_LEFT && x <= AREA_RIGHT && y >= AREA_TOP && y <= AREA_BOTTOM) {
        points.push({ x, y });
      }
      const dTheta = MIN_SPACING / Math.max(34, r);
      a += dTheta;
      r += growth * dTheta;
      if (r > AREA_W) break;
    }
  }
  return points;
}

function islands(count: number, rng: Rng): Point[] {
  const clusters = rng.int(3, 5);
  const points: Point[] = [];
  const perCluster = Math.ceil(count / clusters);
  // Disc radius sized so golden-angle samples land ~MIN_SPACING apart; a fixed
  // radius packs them far too tightly and the spacing filter eats the cluster.
  const radius = clamp((MIN_SPACING * Math.sqrt(perCluster)) / 1.9, 54, 132);

  for (let c = 0; c < clusters; c += 1) {
    const cx = rng.range(AREA_LEFT + radius * 0.6, AREA_RIGHT - radius * 0.6);
    const cy = AREA_TOP + ((c + 0.5) / clusters) * AREA_H + rng.range(-24, 24);
    for (let i = 0; i < perCluster; i += 1) {
      const a = i * 2.39996;
      const r = radius * Math.sqrt((i + 0.5) / perCluster);
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  }
  return points;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function chambers(count: number, rng: Rng): Point[] {
  const floors = rng.int(3, 4);
  const points: Point[] = [];
  const perFloor = Math.floor(count / (floors + 1));
  for (let floor = 0; floor < floors; floor += 1) {
    const y = AREA_TOP + ((floor + 1) / (floors + 1)) * AREA_H;
    const doorX = rng.range(AREA_LEFT + 70, AREA_RIGHT - 70);
    const doorHalf = rng.range(44, 62);
    for (let x = AREA_LEFT; x <= AREA_RIGHT; x += MIN_SPACING) {
      if (Math.abs(x - doorX) < doorHalf) continue;
      points.push({ x, y });
    }
    // Scatter inside the chamber above this floor.
    const roomTop = AREA_TOP + (floor / (floors + 1)) * AREA_H;
    for (let i = 0; i < perFloor; i += 1) {
      points.push({
        x: rng.range(AREA_LEFT, AREA_RIGHT),
        y: rng.range(roomTop + 24, y - 34),
      });
    }
  }
  return points;
}

const LAYOUTS: Record<Archetype, (count: number, rng: Rng) => Point[]> = {
  lattice,
  arcs,
  funnel,
  spiral,
  islands,
  chambers,
};

function inBounds(point: Point): boolean {
  return (
    point.x >= AREA_LEFT && point.x <= AREA_RIGHT && point.y >= AREA_TOP && point.y <= AREA_BOTTOM
  );
}

function farEnough(point: Point, kept: readonly Point[]): boolean {
  for (const other of kept) {
    const dx = other.x - point.x;
    const dy = other.y - point.y;
    if (dx * dx + dy * dy < MIN_SPACING * MIN_SPACING) return false;
  }
  return true;
}

/**
 * Drops points that are out of bounds or too close to an already-kept point.
 *
 * Note the cap is deliberately generous rather than the level's peg budget: layouts
 * are emitted top-to-bottom, so stopping at the budget fills the top of the field and
 * leaves the bottom bare. Trimming to budget happens afterwards, evenly.
 */
function enforceSpacing(points: Point[], cap: number): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    if (!inBounds(point)) continue;
    if (!farEnough(point, kept)) continue;
    kept.push(point);
    if (kept.length >= cap) break;
  }
  return kept;
}

/** Removes random points until the budget is met, keeping coverage even. */
function trimTo(points: Point[], limit: number, rng: Rng): Point[] {
  while (points.length > limit) {
    points.splice(rng.int(0, points.length - 1), 1);
  }
  return points;
}

/**
 * Dart-throwing fill to reach the level's peg budget. Archetypes that pack tightly
 * lose a lot of points to the spacing filter — without this, `islands` and `spiral`
 * deliver a third of the requested pegs and the difficulty curve does nothing.
 */
function topUp(kept: Point[], limit: number, rng: Rng): Point[] {
  let attempts = 0;
  const maxAttempts = (limit - kept.length) * 60 + 400;
  while (kept.length < limit && attempts < maxAttempts) {
    attempts += 1;
    const point = { x: rng.range(AREA_LEFT, AREA_RIGHT), y: rng.range(AREA_TOP, AREA_BOTTOM) };
    if (farEnough(point, kept)) kept.push(point);
  }
  return kept;
}

// --- Charge pass -----------------------------------------------------------

function nearestNeighbours(pegs: Peg[], index: number, k: number): number[] {
  const self = pegs[index]!;
  return pegs
    .map((peg, i) => ({ i, d: (peg.x - self.x) ** 2 + (peg.y - self.y) ** 2 }))
    .filter((entry) => entry.i !== index)
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((entry) => entry.i);
}

/**
 * Assigns charge independently of layout (plan §5.2). Two rules matter: neutral pegs
 * become dead zones, and no peg may be surrounded entirely by its own sign — uniform
 * blobs collapse into a single push/pull and read as one object.
 */
function assignCharges(pegs: Peg[], params: LevelParams, rng: Rng): void {
  for (const peg of pegs) {
    if (rng.chance(params.neutralRatio)) {
      peg.kind = 'neutral';
      peg.sign = 0;
      continue;
    }
    const sign = rng.chance(0.5) ? 1 : -1;
    peg.sign = sign;
    peg.kind = rng.chance(params.bipolarRatio) ? 'bipolar' : sign === 1 ? 'pos' : 'neg';
  }

  for (let index = 0; index < pegs.length; index += 1) {
    const peg = pegs[index]!;
    if (peg.sign === 0) continue;
    const neighbours = nearestNeighbours(pegs, index, 3);
    const sameSign = neighbours.filter((i) => pegs[i]!.sign === peg.sign).length;
    if (sameSign === neighbours.length && neighbours.length > 0) {
      peg.sign = peg.sign === 1 ? -1 : 1;
      if (peg.kind === 'pos') peg.kind = 'neg';
      else if (peg.kind === 'neg') peg.kind = 'pos';
    }
  }
}

/**
 * Targets go where a straight drop will not reach them — scored by angular distance
 * from the launcher's drop cone, then sampled from the hardest half so placement
 * still varies between runs with the same layout.
 */
function assignTargets(pegs: Peg[], count: number, bias: number, rng: Rng): void {
  const scored = pegs
    .map((peg, index) => ({
      index,
      score: Math.abs(Math.atan2(peg.x - LAUNCH_X, peg.y - LAUNCH_Y)),
    }))
    .sort((a, b) => b.score - a.score);
  // bias 0 -> draw from the whole field; bias 1 -> hardest half only.
  const poolFraction = 1 - 0.5 * clamp(bias, 0, 1);
  const pool = scored.slice(0, Math.max(count, Math.ceil(scored.length * poolFraction)));
  const chosen = new Set<number>();
  let guard = 0;
  while (chosen.size < Math.min(count, pool.length) && guard < 500) {
    guard += 1;
    chosen.add(pool[rng.int(0, pool.length - 1)]!.index);
  }
  for (const index of chosen) pegs[index]!.target = true;
}

function placeAnchors(pegs: Peg[], count: number, rng: Rng): void {
  for (let i = 0; i < count; i += 1) {
    const candidates = pegs.filter((peg) => !peg.target && peg.kind !== 'anchor');
    if (candidates.length === 0) return;
    const peg = candidates[rng.int(0, candidates.length - 1)]!;
    peg.kind = 'anchor';
    peg.permanent = true;
    peg.radius = ANCHOR_RADIUS;
    peg.strength = 2.5;
    if (peg.sign === 0) peg.sign = rng.chance(0.5) ? 1 : -1;
  }
}

function placeFluxZones(count: number, rng: Rng): FluxZone[] {
  const zones: FluxZone[] = [];
  const firstCharge: -1 | 1 = rng.chance(0.5) ? 1 : -1;
  let attempts = 0;

  while (zones.length < count && attempts < count * 80) {
    attempts += 1;
    const width = Math.round(rng.range(112, 164));
    const height = Math.round(rng.range(48, 68));
    const zone: FluxZone = {
      x: Math.round(rng.range(AREA_LEFT + width / 2, AREA_RIGHT - width / 2)),
      y: Math.round(rng.range(AREA_TOP + height / 2, AREA_BOTTOM - height / 2)),
      width,
      height,
      charge: zones.length % 2 === 0 ? firstCharge : firstCharge === 1 ? -1 : 1,
    };

    const overlaps = zones.some(
      (other) =>
        Math.abs(zone.x - other.x) < (zone.width + other.width) / 2 + 36 &&
        Math.abs(zone.y - other.y) < (zone.height + other.height) / 2 + 42,
    );
    if (!overlaps) zones.push(zone);
  }

  return zones;
}

export interface Layout {
  pegs: Peg[];
  fluxZones: FluxZone[];
  archetype: Archetype;
}

/** Builds one candidate layout. Validation happens in `validate.ts`. */
export function buildLayout(params: LevelParams, rng: Rng): Layout {
  const archetype = rng.pick(params.archetypes);
  const raw = LAYOUTS[archetype](Math.round(params.pegs * 1.6), rng);
  const spaced = enforceSpacing(raw, Math.round(params.pegs * 1.6));
  const points = topUp(trimTo(spaced, params.pegs, rng), params.pegs, rng);

  const pegs: Peg[] = points.map((point) => ({
    x: Math.round(point.x),
    y: Math.round(point.y),
    kind: 'pos' as PegKind,
    sign: 1 as -1 | 0 | 1,
    strength: 1,
    target: false,
    cleared: false,
    radius: PEG_RADIUS,
    phase: rng.range(0, Math.PI * 2),
    permanent: false,
  }));

  assignCharges(pegs, params, rng);
  assignTargets(pegs, params.targets, params.targetBias, rng);
  placeAnchors(pegs, params.anchors, rng);
  return { pegs, fluxZones: placeFluxZones(params.fluxZones, rng), archetype };
}
