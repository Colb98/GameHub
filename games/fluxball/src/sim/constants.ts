/**
 * Shared geometry and tuning constants. Pure data — imported by both the headless
 * sim and the renderer, so this file must never import Phaser.
 */

export const W = 640;
export const H = 900;

/** Playfield bounds (inside the walls). */
export const FIELD_LEFT = 26;
export const FIELD_RIGHT = W - 26;
export const FIELD_TOP = 150;
/**
 * Below this the ball has left play. Leaves a clear band under the bucket for the
 * flip button, which must never share screen space with the playfield.
 */
export const FIELD_BOTTOM = 782;

/** Launcher pivot. */
export const LAUNCH_X = W / 2;
export const LAUNCH_Y = 108;
export const LAUNCH_SPEED = 300;
/** Aim limits measured from straight down, in radians. */
export const AIM_LIMIT = 1.28;

/** Catcher bucket, in the gap between the field floor and the flip button. */
export const BUCKET_Y = 788;
export const BUCKET_H = 24;

export const BALL_RADIUS = 10;
export const PEG_RADIUS = 8;
export const ANCHOR_RADIUS = 11;

/** Physics (plan §2.2). */
export const GRAVITY = 900;
export const FORCE_K = 2.6e5;
export const FORCE_RADIUS = 120;
export const FORCE_R_MIN = 26;
export const FORCE_ACCEL_MAX = 4 * GRAVITY;
/** Only the strongest N pegs pull on the ball, so dense clusters stay readable. */
export const MAX_INFLUENCERS = 6;
export const DAMPING = 0.9985;
export const RESTITUTION = 0.7;

/** Fixed timestep (plan §4). */
export const SIM_HZ = 240;
export const SIM_DT = 1 / SIM_HZ;
/** Never advance more than this much wall time in one frame. */
export const MAX_FRAME_S = 0.1;

/** Magnetism cuts out after this long, then the ball is dropped (plan §9). */
export const SHOT_MAGNET_TIMEOUT_S = 15;
export const SHOT_HARD_TIMEOUT_S = 25;

export const FLIP_COOLDOWN_MS = 250;

/** Scoring (plan §2.5). */
export const SCORE_PEG = 100;
export const SCORE_TARGET = 500;
export const SCORE_BUCKET = 1000;
export const ORBIT_MULTIPLIER = 2;
