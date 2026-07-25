/** Single source of truth for colour (plan §3.2). Nothing else may hardcode a hex. */
export const PALETTE = {
  void: '#02030a',
  voidLift: '#071126',
  grid: '#0b2852',
  wall: '#1b6b91',
  posCyan: '#2cf6ff',
  posGlow: '#00a8d6',
  negMagenta: '#ff3dcc',
  negGlow: '#c01483',
  neutral: '#f7fbff',
  pegDim: '#536188',
  amber: '#ffe066',
  violet: '#a579ff',
  mint: '#4cffc4',
} as const;

export const HEX = {
  void: 0x02030a,
  voidLift: 0x071126,
  grid: 0x0b2852,
  wall: 0x1b6b91,
  posCyan: 0x2cf6ff,
  posGlow: 0x00a8d6,
  negMagenta: 0xff3dcc,
  negGlow: 0xc01483,
  neutral: 0xf7fbff,
  pegDim: 0x536188,
  amber: 0xffe066,
  violet: 0xa579ff,
  mint: 0x4cffc4,
} as const;

/**
 * Charge colour. The rule from §3.1: cyan is +, magenta is -, white is neutral,
 * always, for both the ball and the pegs. Nothing else may use these three hues.
 */
export function chargeHex(charge: number): number {
  if (charge > 0.05) return HEX.posCyan;
  if (charge < -0.05) return HEX.negMagenta;
  return HEX.neutral;
}

export function chargeGlowHex(charge: number): number {
  if (charge > 0.05) return HEX.posGlow;
  if (charge < -0.05) return HEX.negGlow;
  return HEX.pegDim;
}

/** Linear blend between two 24-bit colours. */
export function mixHex(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (
    ((ar + (br - ar) * k) << 16) | (((ag + (bg - ag) * k) | 0) << 8) | ((ab + (bb - ab) * k) | 0)
  );
}
