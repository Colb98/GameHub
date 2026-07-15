import Phaser from 'phaser';
import { GameHubClient, initGameHub } from '@gamehub/sdk';

const W = 360;
const H = 640;
const GROUND_H = 56;
const GAP = 150;
const PIPE_W = 64;
const PIPE_SPEED = -150;

type State = 'ready' | 'playing' | 'dead';

class FlappyScene extends Phaser.Scene {
  private state: State = 'ready';
  private bird!: Phaser.Physics.Arcade.Sprite;
  private pipes!: Phaser.Physics.Arcade.Group;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private startedAt = 0;
  private spawnTimer?: Phaser.Time.TimerEvent;

  constructor(private readonly gh: GameHubClient) {
    super('flappy');
  }

  create() {
    this.cameras.main.setBackgroundColor('#70c5ce');
    this.makeTextures();

    this.add.tileSprite(W / 2, H - GROUND_H / 2, W, GROUND_H, 'ground');

    this.pipes = this.physics.add.group({ allowGravity: false, immovable: true });

    this.bird = this.physics.add.sprite(W * 0.3, H * 0.45, 'bird');
    this.bird.setCircle(13, 3, 3);
    (this.bird.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    this.scoreText = this.add
      .text(W / 2, 60, '0', { fontFamily: 'Arial Black, sans-serif', fontSize: '44px', color: '#fff', stroke: '#00000055', strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(10);
    const hello = this.gh.playerName ? `${this.gh.playerName}, ` : '';
    this.hintText = this.add
      .text(W / 2, H * 0.62, `${hello}${this.gh.locale === 'vi' ? 'chạm để bay!' : 'tap to flap!'}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#00000066',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.physics.add.overlap(this.bird, this.pipes, () => this.die());
    this.input.on('pointerdown', () => this.flap());
    this.input.keyboard?.on('keydown-SPACE', () => this.flap());
  }

  private makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // bird
    g.fillStyle(0xffd93d).fillCircle(16, 16, 13);
    g.fillStyle(0xffffff).fillCircle(21, 12, 4);
    g.fillStyle(0x222222).fillCircle(22, 12, 2);
    g.fillStyle(0xff8c42).fillTriangle(26, 16, 34, 19, 26, 22);
    g.generateTexture('bird', 34, 32);
    g.clear();
    // pipe segment (scaled vertically at spawn time)
    g.fillStyle(0x2e8b57).fillRect(0, 0, PIPE_W, 32);
    g.fillStyle(0x3cb371).fillRect(4, 0, 8, 32);
    g.generateTexture('pipe', PIPE_W, 32);
    g.clear();
    // ground
    g.fillStyle(0xded895).fillRect(0, 0, 32, GROUND_H);
    g.fillStyle(0x9c8b4d).fillRect(0, 0, 32, 6);
    g.generateTexture('ground', 32, GROUND_H);
    g.destroy();
  }

  private flap() {
    if (this.state === 'dead') return;
    if (this.state === 'ready') {
      this.state = 'playing';
      this.startedAt = this.time.now;
      this.hintText.setVisible(false);
      (this.bird.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
      (this.bird.body as Phaser.Physics.Arcade.Body).setGravityY(1100);
      this.spawnTimer = this.time.addEvent({
        delay: 1400,
        loop: true,
        callback: () => this.spawnPipes(),
      });
      this.spawnPipes();
    }
    this.bird.setVelocityY(-340);
  }

  private spawnPipes() {
    const gapCenter = Phaser.Math.Between(140, H - GROUND_H - 140);
    const topHeight = gapCenter - GAP / 2;
    const bottomY = gapCenter + GAP / 2;
    const bottomHeight = H - GROUND_H - bottomY;

    const top = this.pipes.create(W + PIPE_W / 2, topHeight / 2, 'pipe') as Phaser.Physics.Arcade.Sprite;
    top.setDisplaySize(PIPE_W, topHeight);
    const bottom = this.pipes.create(W + PIPE_W / 2, bottomY + bottomHeight / 2, 'pipe') as Phaser.Physics.Arcade.Sprite;
    bottom.setDisplaySize(PIPE_W, bottomHeight);
    bottom.setData('scoring', true);

    for (const pipe of [top, bottom]) {
      pipe.setVelocityX(PIPE_SPEED);
      (pipe.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    }
  }

  update() {
    if (this.state !== 'playing') return;

    const body = this.bird.body as Phaser.Physics.Arcade.Body;
    this.bird.setAngle(Phaser.Math.Clamp(body.velocity.y / 8, -30, 80));

    if (this.bird.y > H - GROUND_H - 12 || this.bird.y < -20) {
      this.die();
      return;
    }

    for (const child of this.pipes.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (child.getData('scoring') && child.x + PIPE_W / 2 < this.bird.x) {
        child.setData('scoring', false);
        this.score += 1;
        this.scoreText.setText(String(this.score));
      }
      if (child.x < -PIPE_W) child.destroy();
    }
  }

  private die() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.spawnTimer?.remove();
    this.physics.pause();
    this.bird.setTint(0xff6666);
    this.add
      .text(W / 2, H * 0.4, this.gh.locale === 'vi' ? 'Kết thúc!' : 'Game Over', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '36px',
        color: '#ffffff',
        stroke: '#00000088',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(10);
    // The portal shell owns the highscore UI — the game only reports the result.
    this.gh.gameOver({
      score: this.score,
      durationMs: Math.round(this.time.now - this.startedAt),
    });
  }
}

initGameHub().then((gh) => {
  new Phaser.Game({
    type: Phaser.AUTO,
    width: W,
    height: H,
    backgroundColor: '#70c5ce',
    physics: { default: 'arcade' },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: new FlappyScene(gh),
  });
});
