import { BadRequestException, NotFoundException } from '@nestjs/common';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { BannerMediaService } from './banner-media.service';

let storageDirectory: string;
let gameMediaDirectory: string;

before(async () => {
  storageDirectory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'gamehub-banner-test-'),
  );
  process.env.GAMES_STORAGE_DIR = storageDirectory;
  gameMediaDirectory = path.join(storageDirectory, 'game-media', 'game-1');
  await fs.promises.mkdir(gameMediaDirectory, { recursive: true });
});

after(async () => {
  await fs.promises.rm(storageDirectory, { recursive: true, force: true });
});

test('creates and reuses a width-specific WebP for a large banner', async () => {
  const source = path.join(gameMediaDirectory, 'banner-abcdef12.png');
  await sharp({
    create: {
      width: 1200,
      height: 600,
      channels: 3,
      background: '#5433ff',
    },
  })
    .png()
    .toFile(source);

  const service = new BannerMediaService();
  const first = await service.getBanner(
    'game-media/game-1/banner-abcdef12.png',
    '256',
  );
  assert.equal(first.resized, true);
  assert.equal(first.contentType, 'image/webp');
  assert.equal((await sharp(first.absolutePath).metadata()).width, 256);

  const firstInode = (await fs.promises.stat(first.absolutePath)).ino;
  const second = await service.getBanner(
    'game-media/game-1/banner-abcdef12.png',
    '256',
  );
  assert.equal(second.absolutePath, first.absolutePath);
  assert.equal((await fs.promises.stat(second.absolutePath)).ino, firstInode);
});

test('serves a smaller original without enlarging or duplicating it', async () => {
  const source = path.join(gameMediaDirectory, 'banner-12345678.webp');
  await sharp({
    create: {
      width: 120,
      height: 60,
      channels: 3,
      background: '#ffcc00',
    },
  })
    .webp()
    .toFile(source);

  const service = new BannerMediaService();
  const banner = await service.getBanner(
    'game-media/game-1/banner-12345678.webp',
    '256',
  );
  assert.equal(banner.resized, false);
  assert.equal(banner.absolutePath, source);
  assert.equal((await sharp(banner.absolutePath).metadata()).width, 120);
});

test('rejects arbitrary widths and paths outside banner storage', async () => {
  const service = new BannerMediaService();
  await assert.rejects(
    service.getBanner('game-media/game-1/banner-abcdef12.png', '333'),
    BadRequestException,
  );
  await assert.rejects(
    service.getBanner('../../etc/passwd', '256'),
    NotFoundException,
  );
});
