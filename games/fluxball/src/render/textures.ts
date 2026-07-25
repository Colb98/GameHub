import Phaser from 'phaser';
import { PALETTE } from './palette';

export const TEX = {
  glow: 'fx-glow',
  core: 'fx-core',
  ring: 'fx-ring',
  ball: 'fx-ball',
  anchor: 'fx-anchor',
  spark: 'fx-spark',
} as const;

/**
 * All art is generated at boot — the bundle ships no image assets, matching the other
 * games in the hub. One 64x64 radial sprite is baked once and then tinted and scaled
 * for every glow in the game; per-frame gradients or a post-process blur would cost
 * roughly 10x for the same look (plan §3.7).
 */
export function createTextures(scene: Phaser.Scene): void {
  bakeGlow(scene);
  bakeCircle(scene, TEX.core, 32, 14, PALETTE.neutral);
  bakeCircle(scene, TEX.ball, 32, 10, PALETTE.neutral);
  bakeCircle(scene, TEX.spark, 12, 3, PALETTE.neutral);
  bakeRing(scene);
  bakeAnchor(scene);
}

function bakeGlow(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.glow)) return;
  const size = 64;
  const texture = scene.textures.createCanvas(TEX.glow, size, size);
  if (!texture) return;
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // Tight bright centre, long soft tail — reads as light rather than a disc.
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.72)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  texture.refresh();
}

function bakeCircle(
  scene: Phaser.Scene,
  key: string,
  size: number,
  radius: number,
  color: string,
): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, size, size);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
  ctx.fill();
  texture.refresh();
}

function bakeRing(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.ring)) return;
  const size = 48;
  const texture = scene.textures.createCanvas(TEX.ring, size, size);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.strokeStyle = PALETTE.amber;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 16, 0, Math.PI * 2);
  ctx.stroke();
  texture.refresh();
}

function bakeAnchor(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.anchor)) return;
  const size = 40;
  const texture = scene.textures.createCanvas(TEX.anchor, size, size);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.fillStyle = PALETTE.violet;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 15, 0, Math.PI * 2);
  ctx.fill();
  // Dark core: reads as "permanent, not clearable".
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  texture.refresh();
}
