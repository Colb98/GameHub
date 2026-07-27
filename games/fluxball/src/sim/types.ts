export type PegKind = 'pos' | 'neg' | 'neutral' | 'bipolar' | 'anchor';

/** -1, 0 or +1 for the ball; pegs may hold fractional charge while crossfading. */
export type Charge = -1 | 0 | 1;

export interface FluxZone {
  /** Rectangle centre in world coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  charge: -1 | 1;
}

export interface Peg {
  x: number;
  y: number;
  kind: PegKind;
  /** Charge sign at rest. Bipolar pegs oscillate around this. */
  sign: -1 | 0 | 1;
  /** Charge magnitude — anchors are stronger. */
  strength: number;
  /** Required to complete the level. */
  target: boolean;
  cleared: boolean;
  radius: number;
  /** Desynchronizes bipolar cycling and glow breathing (seeded, so deterministic). */
  phase: number;
  /** Anchors are never cleared. */
  permanent: boolean;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  charge: Charge;
  radius: number;
  active: boolean;
}

export type SimEventType =
  | 'peg'
  | 'target'
  | 'wall'
  | 'orbit'
  | 'autoFlux'
  | 'fluxZone'
  | 'bucket'
  | 'exit'
  | 'timeout';

export interface SimEvent {
  type: SimEventType;
  x: number;
  y: number;
  /** Index into `world.pegs` for peg/target events. */
  pegIndex?: number;
  /** Index into `world.fluxZones` for fluxZone events. */
  zoneIndex?: number;
  /** Resulting polarity for automatic and zone-driven changes. */
  charge?: Charge;
}

/** One influencing peg for a single sub-step; consumed by the field-line renderer. */
export interface Influence {
  pegIndex: number;
  /** Signed acceleration magnitude — negative attracts, positive repels. */
  accel: number;
}

export interface World {
  pegs: Peg[];
  fluxZones: FluxZone[];
  ball: Ball;
  /** Seconds of simulated time since the shot launched. */
  t: number;
  /** Bipolar cycle length in seconds. */
  bipolarCycle: number;
  /** Magnet strength for this level (see LevelParams.forceK). */
  forceK: number;
  bucketX: number;
  bucketVx: number;
  bucketW: number;
  events: SimEvent[];
  influences: Influence[];
  /** Null on manual-control stages; seconds between automatic polarity changes otherwise. */
  autoFluxInterval: number | null;
  autoFluxStart: -1 | 1;
  nextAutoFluxAt: number;
  /** Zone currently overriding polarity, or -1 while outside all zones. */
  activeFluxZone: number;
  /** True once magnetism has timed out for this shot. */
  magnetDead: boolean;
  targetsLeft: number;
  /** Accumulated turn around `orbitPeg`, in radians. */
  orbitAngle: number;
  orbitPeg: number;
  orbitLastAngle: number;
  /** Set for one peg hit after a full orbit is completed. */
  orbitArmed: boolean;
}
