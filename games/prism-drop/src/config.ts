export const W = 640;
export const H = 900;

export const FIELD_LEFT = 38;
export const FIELD_RIGHT = W - 38;
export const HUD_BOTTOM = 122;
export const PRESS_BOTTOM = 164;
export const PLATFORM_W = 112;
export const PLATFORM_H = 22;
export const ROW_GAP = 150;
export const FIRST_ROW_Y = 430;
export const PLAYER_W = 42;
export const PLAYER_H = 50;

export const GRAVITY = 1500;
export const TERMINAL_SPEED = 900;
export const MOVE_SPEED = 280;
export const START_HP = 10;
export const MAX_HP = 10;
export const METERS_PER_PIXEL = 0.1;
export const PICKUP_CHANCE = 0.035;
export const FORCED_MISMATCH_CHANCE = 0.15;

export const DISPLAY_FONT = '"Arial Black", "Trebuchet MS", sans-serif';
export const UI_FONT = '"Trebuchet MS", Arial, sans-serif';

export type PrismColor = 'red' | 'yellow' | 'green' | 'blue' | 'purple';
export type PlatformDirection = -1 | 1;

export interface ColorSpec {
  key: PrismColor;
  fill: string;
  shade: string;
  used: string;
  usedShade: string;
  label: string;
  glyph: string;
}

export const COLOR_ORDER: PrismColor[] = ['red', 'yellow', 'green', 'blue', 'purple'];

export const COLORS: Record<PrismColor, ColorSpec> = {
  red: {
    key: 'red',
    fill: '#e04b3a',
    shade: '#a8321f',
    used: '#a97870',
    usedShade: '#77554f',
    label: 'SPIKE',
    glyph: '▲',
  },
  yellow: {
    key: 'yellow',
    fill: '#f2b32c',
    shade: '#c1841a',
    used: '#b9a36c',
    usedShade: '#82714a',
    label: 'SPRING',
    glyph: '↟',
  },
  green: {
    key: 'green',
    fill: '#4fa85b',
    shade: '#2f7a3d',
    used: '#78967c',
    usedShade: '#526b56',
    label: 'BLOOM',
    glyph: '+',
  },
  blue: {
    key: 'blue',
    fill: '#3f7fd4',
    shade: '#24559a',
    used: '#738ba8',
    usedShade: '#4e6077',
    label: 'SLIDE',
    glyph: '»',
  },
  purple: {
    key: 'purple',
    fill: '#8b5fc4',
    shade: '#5e3b91',
    used: '#887b99',
    usedShade: '#62596e',
    label: 'CRUMBLE',
    glyph: '◇',
  },
};

export const PAPER = {
  top: '#fdf6e8',
  deep: '#e5d9c8',
  wall: '#e0cdb0',
  wallDeep: '#bca98c',
  ink: '#2f2a3d',
  inkSoft: '#615b67',
  shadow: 'rgba(0, 0, 0, 0.095)',
  highlight: '#fffaf0',
  pickup: '#fff4ce',
} as const;

export const DEPTH_BANDS = [
  '#fdf6e8',
  '#f2dfca',
  '#ddd8c9',
  '#cfd5d1',
  '#d0c5bf',
  '#bbb7ad',
] as const;

export function colorNumber(value: string): number {
  return Number.parseInt(value.slice(1), 16);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function mixColor(a: string, b: string, amount: number): string {
  const t = clamp(amount, 0, 1);
  const av = colorNumber(a);
  const bv = colorNumber(b);
  const ar = (av >> 16) & 0xff;
  const ag = (av >> 8) & 0xff;
  const ab = av & 0xff;
  const br = (bv >> 16) & 0xff;
  const bg = (bv >> 8) & 0xff;
  const bb = bv & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}
