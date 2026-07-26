import Phaser from 'phaser';
import {
  COLORS,
  COLOR_ORDER,
  DISPLAY_FONT,
  PAPER,
  PrismColor,
  colorNumber,
} from './config';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function textSeed(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function roughPlatformPath(ctx: CanvasRenderingContext2D, random: () => number) {
  ctx.beginPath();
  ctx.moveTo(8, 13 + random() * 1.5);
  ctx.lineTo(24, 11.5 + random() * 2);
  ctx.lineTo(48, 12.5 + random() * 1.5);
  ctx.lineTo(72, 11 + random() * 2);
  ctx.lineTo(96, 12.5 + random() * 1.5);
  ctx.lineTo(120, 12 + random() * 1.5);
  ctx.lineTo(119, 35 + random());
  ctx.lineTo(96, 36.5 + random());
  ctx.lineTo(72, 35 + random() * 1.5);
  ctx.lineTo(48, 37 + random());
  ctx.lineTo(24, 35 + random() * 1.5);
  ctx.lineTo(9, 36 + random());
  ctx.closePath();
}

function addGrain(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  color: string,
  count: number,
  yMin: number,
  yMax: number,
) {
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const size = random() > 0.84 ? 1.4 : 0.8;
    ctx.fillRect(10 + random() * 108, yMin + random() * (yMax - yMin), size, size);
  }
  ctx.restore();
}

export function platformTextureKey(
  color: PrismColor,
  used = false,
  direction: -1 | 1 = 1,
  safe = false,
): string {
  if (color === 'blue') return `platform-${color}-${used ? 'used' : 'fresh'}-${direction}`;
  if (color === 'red' && safe && !used) return 'platform-red-safe';
  return `platform-${color}-${used ? 'used' : 'fresh'}`;
}

function makePlatformTexture(
  scene: Phaser.Scene,
  color: PrismColor,
  used: boolean,
  direction: -1 | 1,
  safe: boolean,
) {
  const key = platformTextureKey(color, used, direction, safe);
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, 128, 48);
  if (!texture) return;
  const ctx = texture.getContext();
  const random = seeded(textSeed(key));
  const spec = COLORS[color];
  const fill = used ? spec.used : spec.fill;
  const shade = used ? spec.usedShade : spec.shade;

  ctx.fillStyle = PAPER.shadow;
  roughPlatformPath(ctx, random);
  ctx.translate(3, 3);
  ctx.fill();
  ctx.translate(-3, -3);

  roughPlatformPath(ctx, random);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.strokeStyle = PAPER.ink;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(9, 13);
  ctx.lineTo(120, 13);
  ctx.lineTo(119, 30);
  ctx.lineTo(96, 31);
  ctx.lineTo(72, 30);
  ctx.lineTo(48, 31);
  ctx.lineTo(24, 30);
  ctx.lineTo(9, 31);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = used ? spec.usedShade : spec.shade;
  ctx.fillStyle = used ? spec.usedShade : spec.shade;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (color === 'red') {
    if (safe || used) {
      for (let x = 20; x <= 108; x += 22) {
        ctx.beginPath();
        ctx.moveTo(x - 6, 17);
        ctx.lineTo(x, 22);
        ctx.lineTo(x + 6, 17);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = fill;
      ctx.strokeStyle = PAPER.ink;
      ctx.lineWidth = 1.7;
      for (let x = 19; x <= 111; x += 23) {
        ctx.beginPath();
        ctx.moveTo(x - 7, 13);
        ctx.lineTo(x, 3);
        ctx.lineTo(x + 7, 13);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  } else if (color === 'yellow') {
    ctx.beginPath();
    ctx.moveTo(21, 25);
    for (let x = 21; x <= 109; x += 11) {
      ctx.lineTo(x + 5.5, x % 22 === 10 ? 17 : 25);
      ctx.lineTo(x + 11, x % 22 === 10 ? 25 : 17);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(18, 27);
    ctx.lineTo(110, 27);
    ctx.stroke();
  } else if (color === 'green') {
    for (const x of [39, 64, 89]) {
      ctx.beginPath();
      ctx.moveTo(x, 26);
      ctx.quadraticCurveTo(x - 13, 17, x - 2, 16);
      ctx.quadraticCurveTo(x + 3, 17, x, 26);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, 26);
      ctx.quadraticCurveTo(x + 13, 17, x + 2, 16);
      ctx.quadraticCurveTo(x - 3, 17, x, 26);
      ctx.fill();
    }
  } else if (color === 'blue') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(10, 14, 108, 15);
    ctx.clip();
    ctx.strokeStyle = used ? spec.usedShade : spec.shade;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let x = 20; x <= 108; x += 22) {
      const wobble = () => (random() - 0.5) * 1.8;
      ctx.beginPath();
      if (direction > 0) {
        ctx.moveTo(x - 6 + wobble(), 17 + wobble());
        ctx.lineTo(x + 3 + wobble(), 21.5 + wobble());
        ctx.lineTo(x - 6 + wobble(), 27 + wobble());
      } else {
        ctx.moveTo(x + 6 + wobble(), 17 + wobble());
        ctx.lineTo(x - 3 + wobble(), 21.5 + wobble());
        ctx.lineTo(x + 6 + wobble(), 27 + wobble());
      }
      ctx.stroke();
    }
    ctx.globalAlpha = used ? 0.2 : 0.4;
    ctx.strokeStyle = PAPER.highlight;
    ctx.lineWidth = 1;
    for (let x = 20; x <= 108; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x - direction * 4, 18);
      ctx.lineTo(x + direction * 2, 21.5);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.moveTo(28, 15);
    ctx.lineTo(37, 23);
    ctx.lineTo(31, 29);
    ctx.moveTo(62, 14);
    ctx.lineTo(57, 21);
    ctx.lineTo(68, 28);
    ctx.moveTo(95, 14);
    ctx.lineTo(88, 20);
    ctx.lineTo(98, 28);
    ctx.stroke();
  }

  addGrain(ctx, random, PAPER.highlight, 48, 14, 30);
  addGrain(ctx, random, PAPER.ink, 28, 14, 34);
  texture.refresh();
}

function makePlayerTexture(scene: Phaser.Scene, color: PrismColor) {
  const key = `player-${color}`;
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, 58, 68);
  if (!texture) return;
  const ctx = texture.getContext();
  const random = seeded(textSeed(key));
  const spec = COLORS[color];

  ctx.fillStyle = PAPER.shadow;
  ctx.beginPath();
  ctx.moveTo(18, 11);
  ctx.quadraticCurveTo(29, 4, 42, 12);
  ctx.quadraticCurveTo(50, 22, 48, 43);
  ctx.quadraticCurveTo(47, 58, 35, 62);
  ctx.quadraticCurveTo(18, 65, 10, 50);
  ctx.quadraticCurveTo(4, 31, 12, 17);
  ctx.closePath();
  ctx.translate(3, 3);
  ctx.fill();
  ctx.translate(-3, -3);

  ctx.fillStyle = spec.fill;
  ctx.strokeStyle = PAPER.ink;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(17, 9);
  ctx.quadraticCurveTo(29, 3, 42, 11);
  ctx.quadraticCurveTo(49, 22, 47, 42);
  ctx.quadraticCurveTo(46, 56, 34, 60);
  ctx.quadraticCurveTo(18, 63, 10, 48);
  ctx.quadraticCurveTo(5, 30, 12, 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  addGrain(ctx, random, PAPER.highlight, 62, 10, 56);
  addGrain(ctx, random, spec.shade, 38, 12, 56);

  ctx.fillStyle = PAPER.ink;
  ctx.beginPath();
  ctx.arc(22, 30, 2.5, 0, Math.PI * 2);
  ctx.arc(36, 30, 2.5, 0, Math.PI * 2);
  ctx.fill();
  texture.refresh();
}

function makeSimpleTextures(scene: Phaser.Scene) {
  const pickup = scene.textures.createCanvas('score-pickup', 42, 42);
  if (pickup) {
    const ctx = pickup.getContext();
    ctx.fillStyle = PAPER.shadow;
    ctx.beginPath();
    ctx.moveTo(23, 5);
    ctx.lineTo(38, 22);
    ctx.lineTo(23, 39);
    ctx.lineTo(7, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PAPER.pickup;
    ctx.strokeStyle = PAPER.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(21, 3);
    ctx.lineTo(36, 20);
    ctx.lineTo(21, 37);
    ctx.lineTo(5, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PAPER.ink;
    ctx.font = `bold 15px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', 21, 21);
    pickup.refresh();
  }

  const tick = scene.textures.createCanvas('wall-ticks', 30, 64);
  if (tick) {
    const ctx = tick.getContext();
    ctx.strokeStyle = PAPER.ink;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(11, 2);
    ctx.lineTo(25, 2);
    ctx.moveTo(17, 18);
    ctx.lineTo(25, 18);
    ctx.moveTo(17, 34);
    ctx.lineTo(25, 34);
    ctx.moveTo(17, 50);
    ctx.lineTo(25, 50);
    ctx.stroke();
    tick.refresh();
  }

  for (const color of COLOR_ORDER) {
    const texture = scene.textures.createCanvas(`shard-${color}`, 12, 8);
    if (!texture) continue;
    const ctx = texture.getContext();
    ctx.fillStyle = COLORS[color].fill;
    ctx.strokeStyle = PAPER.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(1, 1);
    ctx.lineTo(11, 3);
    ctx.lineTo(7, 7);
    ctx.lineTo(2, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    texture.refresh();
  }
}

export function createGameTextures(scene: Phaser.Scene) {
  for (const color of COLOR_ORDER) {
    makePlayerTexture(scene, color);
    makePlatformTexture(scene, color, false, 1, false);
    makePlatformTexture(scene, color, true, 1, false);
    if (color === 'blue') {
      makePlatformTexture(scene, color, false, -1, false);
      makePlatformTexture(scene, color, true, -1, false);
    }
    if (color === 'red') makePlatformTexture(scene, color, false, 1, true);
  }
  makeSimpleTextures(scene);
}

export function tintFor(color: PrismColor): number {
  return colorNumber(COLORS[color].fill);
}
