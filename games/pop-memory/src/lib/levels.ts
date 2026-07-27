export interface Palette {
  name: string;
  fill: string;
  glow: string;
}

export interface LevelTheme extends Palette {
  fillLit: string;
  fillMuted: string;
  tray: string;
  shell: string;
  glowRgb: string;
}

export interface LevelConfig {
  level: number;
  sequenceLength: number;
  flashMs: number;
  gapMs: number;
  timeoutMs: number;
  warningMs: number;
}

export const PALETTES: readonly Palette[] = [
  { name: 'Mint', fill: '#B8E6D2', glow: '#7FD6B0' },
  { name: 'Sky', fill: '#BBDDF5', glow: '#7FBEEA' },
  { name: 'Lavender', fill: '#D5CCF0', glow: '#A996E4' },
  { name: 'Butter', fill: '#F5E6AE', glow: '#EBCF6E' },
  { name: 'Peach', fill: '#F8D3B8', glow: '#F0AE7E' },
  { name: 'Rose', fill: '#F5C2CE', glow: '#E88CA3' },
  { name: 'Sage', fill: '#CFE0B8', glow: '#A6C97E' },
  { name: 'Periwinkle', fill: '#C3CBF2', glow: '#8E9CE6' },
  { name: 'Coral', fill: '#F7BFB4', glow: '#EE9080' },
  { name: 'Orchid', fill: '#E6C2E8', glow: '#CE8FD3' },
] as const;

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexChannels(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  if (!/^[\da-f]{6}$/i.test(value)) {
    throw new Error(`Expected a six-digit hex color, received "${hex}"`);
  }
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function mixHex(from: string, to: string, amount: number): string {
  const a = hexChannels(from);
  const b = hexChannels(to);
  const mixed = a.map((channel, index) =>
    clampByte(channel + (b[index] - channel) * amount),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function levelTheme(level: number): LevelTheme {
  const safeLevel = Math.max(1, Math.floor(level));
  const palette = PALETTES[(safeLevel - 1) % PALETTES.length];
  return {
    ...palette,
    fillLit: mixHex(palette.fill, '#FFFFFF', 0.24),
    fillMuted: mixHex(palette.fill, '#AAA39C', 0.18),
    tray: mixHex(palette.fill, '#80756F', 0.24),
    shell: mixHex('#FFF9ED', palette.fill, 0.14),
    glowRgb: hexChannels(palette.glow).join(', '),
  };
}

export function levelConfig(level: number, reducedMotion = false): LevelConfig {
  const safeLevel = Math.max(1, Math.floor(level));
  const timingScale = reducedMotion ? 1.3 : 1;
  const scaled = (value: number) => Math.round(value * timingScale);
  const timeoutMs = scaled(Math.max(650, 2400 - 150 * safeLevel));

  return {
    level: safeLevel,
    sequenceLength: Math.min(3 + Math.floor(safeLevel / 2), 12),
    flashMs: scaled(Math.max(220, 700 - 40 * safeLevel)),
    gapMs: scaled(Math.max(90, 300 - 20 * safeLevel)),
    timeoutMs,
    warningMs: Math.min(2000, Math.max(500, Math.round(timeoutMs * 0.65))),
  };
}
