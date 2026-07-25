import Phaser from 'phaser';
import { initGameHub } from '@gamehub/sdk';
import { PlayScene } from './scenes/PlayScene';
import { HEX, PALETTE } from './render/palette';
import { H, W } from './sim/constants';

void PALETTE;

initGameHub().then((gh) => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: HEX.void,
    render: {
      antialias: true,
      roundPixels: false,
      powerPreference: 'high-performance',
    },
    // No Arcade Physics: the ball runs on the deterministic sim in src/sim.
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: new PlayScene(gh),
  });
  (window as unknown as { game?: Phaser.Game }).game = game;
});
