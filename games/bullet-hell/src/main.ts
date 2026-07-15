import Phaser from 'phaser';
import { GameHubClient, initGameHub } from '@gamehub/sdk';

const W = 600;
const H = 800;
const START_LIVES = 3;

type State = 'ready' | 'playing' | 'dead';

class BulletHellScene extends Phaser.Scene {
  private state: State = 'ready';
  private ship!: Phaser.Physics.Arcade.Sprite;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private lives = START_LIVES;
  private score = 0;
  private startedAt = 0;
  private invulnUntil = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private target = new Phaser.Math.Vector2(W / 2, H * 0.8);

  constructor(private readonly gh: GameHubClient) {
    super('bullet-hell');
  }

  create() {
    this.makeTextures();
    this.addStarfield();

    this.playerBullets = this.physics.add.group({ maxSize: 80 });
    this.enemyBullets = this.physics.add.group({ maxSize: 400 });
    this.enemies = this.physics.add.group();

    this.ship = this.physics.add.sprite(W / 2, H * 0.8, 'ship');
    this.ship.setCircle(8, 8, 10);
    this.ship.setDepth(5);

    this.scoreText = this.add
      .text(12, 10, 'SCORE 0', { fontFamily: 'monospace', fontSize: '22px', color: '#8ef6ff' })
      .setDepth(10);
    this.livesText = this.add
      .text(W - 12, 10, '♥♥♥', { fontFamily: 'monospace', fontSize: '22px', color: '#ff5d8f' })
      .setOrigin(1, 0)
      .setDepth(10);
    const hello = this.gh.playerName ? `${this.gh.playerName} — ` : '';
    this.hintText = this.add
      .text(
        W / 2,
        H / 2,
        `${hello}${this.gh.locale === 'vi' ? 'chạm / di chuột để bắt đầu' : 'tap / move mouse to start'}`,
        { fontFamily: 'monospace', fontSize: '22px', color: '#ffffff', align: 'center' },
      )
      .setOrigin(0.5)
      .setDepth(10);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));

    this.physics.add.overlap(this.playerBullets, this.enemies, (bullet, enemy) =>
      this.killEnemy(bullet as Phaser.Physics.Arcade.Sprite, enemy as Phaser.Physics.Arcade.Sprite),
    );
    this.physics.add.overlap(this.ship, this.enemyBullets, (_ship, bullet) =>
      this.hitPlayer(bullet as Phaser.Physics.Arcade.Sprite),
    );
    this.physics.add.overlap(this.ship, this.enemies, (_ship, enemy) =>
      this.hitPlayer(enemy as Phaser.Physics.Arcade.Sprite),
    );
  }

  private makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x53f2e6).fillTriangle(16, 0, 0, 30, 32, 30);
    g.fillStyle(0x1a7f8a).fillTriangle(16, 10, 8, 28, 24, 28);
    g.generateTexture('ship', 32, 32);
    g.clear();
    g.fillStyle(0xff5d8f);
    g.fillPoints(
      [new Phaser.Geom.Point(14, 0), new Phaser.Geom.Point(28, 14), new Phaser.Geom.Point(14, 28), new Phaser.Geom.Point(0, 14)],
      true,
    );
    g.fillStyle(0x8a1a44).fillCircle(14, 14, 5);
    g.generateTexture('enemy', 28, 28);
    g.clear();
    g.fillStyle(0xfff275).fillRect(0, 0, 4, 12);
    g.generateTexture('pbullet', 4, 12);
    g.clear();
    g.fillStyle(0xff4d4d).fillCircle(5, 5, 5);
    g.fillStyle(0xffd0d0).fillCircle(5, 5, 2);
    g.generateTexture('ebullet', 10, 10);
    g.clear();
    g.fillStyle(0xffffff).fillCircle(2, 2, 2);
    g.generateTexture('star', 4, 4);
    g.destroy();
  }

  private addStarfield() {
    for (let i = 0; i < 60; i++) {
      const star = this.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 'star');
      star.setAlpha(Phaser.Math.FloatBetween(0.2, 0.8)).setScale(Phaser.Math.FloatBetween(0.5, 1.2));
      this.tweens.add({
        targets: star,
        y: `+=${H}`,
        duration: Phaser.Math.Between(6000, 16000),
        repeat: -1,
        onRepeat: () => star.setY(-4).setX(Phaser.Math.Between(0, W)),
      });
    }
  }

  private onPointer(p: Phaser.Input.Pointer) {
    this.target.set(p.worldX, p.worldY);
    if (this.state === 'ready') this.startRun();
  }

  private startRun() {
    this.state = 'playing';
    this.startedAt = this.time.now;
    this.hintText.setVisible(false);

    this.time.addEvent({ delay: 160, loop: true, callback: () => this.firePlayer() });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickScore() });
    this.spawnWaveLoop();
  }

  private elapsedSec() {
    return (this.time.now - this.startedAt) / 1000;
  }

  private spawnWaveLoop() {
    if (this.state === 'dead') return;
    // Difficulty ramps: spawn faster as the run gets longer
    const delay = Math.max(450, 1300 - this.elapsedSec() * 12);
    this.spawnEnemy();
    this.time.delayedCall(delay, () => this.spawnWaveLoop());
  }

  private spawnEnemy() {
    if (this.state !== 'playing') return;
    const x = Phaser.Math.Between(30, W - 30);
    const enemy = this.enemies.create(x, -20, 'enemy') as Phaser.Physics.Arcade.Sprite;
    enemy.setVelocity(Phaser.Math.Between(-40, 40), Phaser.Math.Between(60, 110 + this.elapsedSec()));
    enemy.setCircle(12, 2, 2);
    const burst = this.time.addEvent({
      delay: Phaser.Math.Between(1400, 2400),
      loop: true,
      callback: () => this.radialBurst(enemy),
    });
    enemy.setData('burst', burst);
  }

  private radialBurst(enemy: Phaser.Physics.Arcade.Sprite) {
    if (!enemy.active || this.state !== 'playing') return;
    const count = Math.min(14, 8 + Math.floor(this.elapsedSec() / 20));
    const speed = 110 + this.elapsedSec() * 1.5;
    const offset = Phaser.Math.FloatBetween(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const angle = offset + (i / count) * Math.PI * 2;
      const bullet = this.enemyBullets.get(enemy.x, enemy.y, 'ebullet') as Phaser.Physics.Arcade.Sprite | null;
      if (!bullet) return;
      bullet.setActive(true).setVisible(true);
      bullet.body!.reset(enemy.x, enemy.y);
      bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      (bullet.body as Phaser.Physics.Arcade.Body).setCircle(5);
    }
  }

  private firePlayer() {
    if (this.state !== 'playing') return;
    const bullet = this.playerBullets.get(this.ship.x, this.ship.y - 22, 'pbullet') as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet) return;
    bullet.setActive(true).setVisible(true);
    bullet.body!.reset(this.ship.x, this.ship.y - 22);
    bullet.setVelocityY(-520);
  }

  private tickScore() {
    if (this.state !== 'playing') return;
    this.score += 10;
    this.scoreText.setText(`SCORE ${this.score}`);
  }

  private killEnemy(bullet: Phaser.Physics.Arcade.Sprite, enemy: Phaser.Physics.Arcade.Sprite) {
    bullet.destroy();
    (enemy.getData('burst') as Phaser.Time.TimerEvent | undefined)?.remove();
    const boom = this.add.circle(enemy.x, enemy.y, 4, 0xffb347).setDepth(6);
    this.tweens.add({ targets: boom, radius: 26, alpha: 0, duration: 250, onComplete: () => boom.destroy() });
    enemy.destroy();
    this.score += 100;
    this.scoreText.setText(`SCORE ${this.score}`);
  }

  private hitPlayer(source: Phaser.Physics.Arcade.Sprite) {
    if (this.state !== 'playing' || this.time.now < this.invulnUntil) return;
    if (source.texture.key === 'ebullet') source.destroy();
    this.lives -= 1;
    this.livesText.setText('♥'.repeat(Math.max(0, this.lives)));
    if (this.lives <= 0) {
      this.die();
      return;
    }
    this.invulnUntil = this.time.now + 2000;
    this.tweens.add({ targets: this.ship, alpha: 0.25, yoyo: true, repeat: 7, duration: 125, onComplete: () => this.ship.setAlpha(1) });
  }

  update() {
    if (this.state === 'playing') {
      const dx = this.target.x - this.ship.x;
      const dy = this.target.y - this.ship.y;
      this.ship.setPosition(this.ship.x + dx * 0.18, this.ship.y + dy * 0.18);
      this.ship.x = Phaser.Math.Clamp(this.ship.x, 16, W - 16);
      this.ship.y = Phaser.Math.Clamp(this.ship.y, 16, H - 16);
    }
    // Recycle offscreen bullets and enemies
    for (const b of this.playerBullets.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (b.active && b.y < -20) b.destroy();
    }
    for (const b of this.enemyBullets.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (b.active && (b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20)) b.destroy();
    }
    for (const e of this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (e.active && e.y > H + 30) {
        (e.getData('burst') as Phaser.Time.TimerEvent | undefined)?.remove();
        e.destroy();
      }
    }
  }

  private die() {
    this.state = 'dead';
    this.physics.pause();
    this.time.removeAllEvents();
    this.ship.setTint(0xff4444);
    this.add
      .text(W / 2, H / 2, this.gh.locale === 'vi' ? 'Kết thúc!' : 'Game Over', {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(10);
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
    backgroundColor: '#05060f',
    physics: { default: 'arcade' },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: new BulletHellScene(gh),
  });
});
