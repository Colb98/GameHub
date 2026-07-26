import Phaser from 'phaser';
import { initGameHub } from '@gamehub/sdk';
import { PrismDropScene } from './PrismDropScene';
import { GRAVITY, H, PAPER, W } from './config';

initGameHub().then((gh) => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: PAPER.top,
    render: {
      antialias: true,
      roundPixels: false,
      powerPreference: 'high-performance',
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: GRAVITY },
        debug: new URLSearchParams(window.location.search).has('debugPhysics'),
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: new PrismDropScene(gh),
  });
  (window as unknown as { game?: Phaser.Game }).game = game;
});
