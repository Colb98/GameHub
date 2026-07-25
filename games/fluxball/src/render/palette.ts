/** Single source of truth for colour (plan §3.2). Nothing else may hardcode a hex. */
export const PALETTE = {
  void: '#05060f',
  voidLift: '#0b1024',
  grid: '#141a3a',
  wall: '#2a3266',
  posCyan: '#4de5ff',
  posGlow: '#0b6f96',
  negMagenta: '#ff5ec4',
  negGlow: '#9c1f6e',
  neutral: '#f2f5ff',
  pegDim: '#39406e',
  amber: '#ffd166',
  violet: '#a98bff',
  mint: '#63f4bd',
} as const;

export const HEX = {
  void: 0x05060f,
  voidLift: 0x0b1024,
  grid: 0x141a3a,
  wall: 0x2a3266,
  posCyan: 0x4de5ff,
  posGlow: 0x0b6f96,
  negMagenta: 0xff5ec4,
  negGlow: 0x9c1f6e,
  neutral: 0xf2f5ff,
  pegDim: 0x39406e,
  amber: 0xffd166,
  violet: 0xa98bff,
  mint: 0x63f4bd,
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
