/**
 * Seeds dev/demo data: an admin, a developer, a player, the sample games
 * (bundles copied from games/x/dist into the storage dir), and some
 * scores/comments/ratings so lists and leaderboards aren't empty.
 *
 * Run with: pnpm --filter @gamehub/api seed
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const STORAGE = path.resolve(
  process.cwd(),
  process.env.GAMES_STORAGE_DIR ?? '../../storage/games',
);
const GAMES_SRC = path.resolve(process.cwd(), '../../games');

async function upsertUser(
  email: string,
  displayName: string,
  role: 'PLAYER' | 'DEVELOPER' | 'MODERATOR' | 'ADMIN',
  password: string,
) {
  return prisma.user.upsert({
    where: { email },
    update: { role },
    create: {
      email,
      displayName,
      role,
      passwordHash: await argon2.hash(password),
    },
  });
}

function copyBundle(slug: string, semver: string) {
  const src = path.join(GAMES_SRC, slug, 'dist');
  const dest = path.join(STORAGE, slug, semver);
  if (!fs.existsSync(path.join(src, 'index.html'))) {
    console.warn(`! ${slug}: no built bundle at ${src} — run \`pnpm build\` first; seeding DB rows anyway`);
    return;
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`✓ copied ${slug} bundle -> ${dest}`);
}

interface SeedGame {
  slug: string;
  category: string;
  orientation: 'LANDSCAPE' | 'PORTRAIT' | 'BOTH';
  en: { name: string; shortIntro: string; controlsHtml: string };
  vi: { name: string; shortIntro: string; controlsHtml: string };
}

const GAMES: SeedGame[] = [
  {
    slug: 'flappy-bird',
    category: 'arcade',
    orientation: 'PORTRAIT',
    en: {
      name: 'Flappy Bird',
      shortIntro:
        'Guide the bird through the pipes. One tap, endless frustration — how far can you go?',
      controlsHtml:
        '<p><b>Tap</b> / <b>click</b> / <b>Space</b> to flap. Avoid the pipes and the ground. Each pipe you pass is one point.</p>',
    },
    vi: {
      name: 'Chim Vỗ Cánh',
      shortIntro:
        'Đưa chú chim bay qua các ống nước. Một chạm, thử thách vô tận — bạn bay được bao xa?',
      controlsHtml:
        '<p><b>Chạm</b> / <b>click</b> / phím <b>Space</b> để vỗ cánh. Tránh ống nước và mặt đất. Mỗi ống vượt qua được 1 điểm.</p>',
    },
  },
  {
    slug: 'bullet-hell',
    category: 'shooter',
    orientation: 'BOTH',
    en: {
      name: 'Bullet Hell',
      shortIntro:
        'Dodge waves of bullets and shoot down enemy ships. Survive as long as you can!',
      controlsHtml:
        '<p><b>Drag</b> (touch) or <b>move the mouse</b> to steer your ship — it fires automatically. Destroy enemies for points; getting hit costs a life.</p>',
    },
    vi: {
      name: 'Mưa Đạn',
      shortIntro:
        'Né những làn mưa đạn và bắn hạ tàu địch. Sống sót càng lâu càng tốt!',
      controlsHtml:
        '<p><b>Kéo</b> (cảm ứng) hoặc <b>di chuột</b> để điều khiển phi thuyền — tự động bắn. Diệt địch để ghi điểm; trúng đạn mất một mạng.</p>',
    },
  },
  {
    slug: 'neon-descent',
    category: 'arcade',
    orientation: 'PORTRAIT',
    en: {
      name: 'Neon Descent',
      shortIntro:
        'Shatter a falling spectrum of neon bricks before it breaches the line. Catch strange signals and multiply the chaos.',
      controlsHtml:
        '<p><b>Drag</b>, <b>move the mouse</b>, or use <b>A / D</b> and the arrow keys to steer. Tap or press <b>Space</b> to launch. Brick colors take 1–4 hits; the formation descends every 14 seconds.</p>',
    },
    vi: {
      name: 'Neon Giáng Xuống',
      shortIntro:
        'Phá vỡ quang phổ gạch neon đang hạ xuống trước khi nó vượt qua phòng tuyến. Hứng tín hiệu lạ và nhân lên sự hỗn loạn.',
      controlsHtml:
        '<p><b>Kéo</b>, <b>di chuột</b>, hoặc dùng <b>A / D</b> và phím mũi tên để điều khiển. Chạm hoặc nhấn <b>Space</b> để phóng bóng. Mỗi màu gạch cần 1–4 lần đánh; đội hình hạ xuống sau mỗi 14 giây.</p>',
    },
  },
  {
    slug: 'fluxball',
    category: 'arcade',
    orientation: 'PORTRAIT',
    en: {
      name: 'Fluxball',
      shortIntro:
        'Every peg carries a charge. Drop the ball, then flip its polarity mid-flight to pull and push your way through a field that rebuilds itself harder each level.',
      controlsHtml:
        '<p><b>Move the mouse</b> or <b>drag</b> to aim, then <b>tap the field</b> to drop the ball. Hit <b>FLIP</b> (or <b>Space</b> / <b>F</b>) in mid-flight to reverse the ball\'s charge — same colours push apart, opposite colours pull together. Each flip costs a pip; hitting a peg refunds one. At zero pips the ball turns white and stops responding to the field. Clear every ringed peg to descend.</p>',
    },
    vi: {
      name: 'Bóng Từ Trường',
      shortIntro:
        'Mỗi chốt mang một điện tích. Thả bóng rồi đảo cực giữa đường bay để hút và đẩy nó xuyên qua mê cung tự sinh, mỗi màn một khó hơn.',
      controlsHtml:
        '<p><b>Di chuột</b> hoặc <b>kéo</b> để ngắm, rồi <b>chạm vào sân</b> để thả bóng. Nhấn <b>FLIP</b> (hoặc <b>Space</b> / <b>F</b>) khi bóng đang bay để đảo cực — cùng màu thì đẩy nhau, khác màu thì hút nhau. Mỗi lần đảo tốn một chấm năng lượng; chạm vào chốt sẽ hoàn lại một chấm. Hết năng lượng, bóng chuyển trắng và không còn chịu tác động của từ trường. Phá hết các chốt có vòng để xuống màn tiếp theo.</p>',
    },
  },
];

async function main() {
  const admin = await upsertUser('admin@gamehub.local', 'Admin', 'ADMIN', 'admin12345');
  const dev = await upsertUser('dev@gamehub.local', 'Sample Studio', 'DEVELOPER', 'dev12345');
  const player = await upsertUser('player@gamehub.local', 'ProGamer', 'PLAYER', 'player12345');
  console.log(`✓ users: admin=${admin.email} dev=${dev.email} player=${player.email}`);

  for (const g of GAMES) {
    copyBundle(g.slug, '1.0.0');
    const game = await prisma.game.upsert({
      where: { slug: g.slug },
      update: { status: 'PUBLISHED' },
      create: {
        slug: g.slug,
        developerId: dev.id,
        status: 'PUBLISHED',
        category: g.category,
        orientation: g.orientation,
        scoreOrder: 'DESC',
        releaseDate: new Date(),
        translations: {
          create: [
            { locale: 'en', ...g.en },
            { locale: 'vi', ...g.vi },
          ],
        },
      },
    });
    await prisma.gameVersion.upsert({
      where: { gameId_semver: { gameId: game.id, semver: '1.0.0' } },
      update: { isActive: true },
      create: {
        gameId: game.id,
        semver: '1.0.0',
        bundlePath: `${g.slug}/1.0.0`,
        isActive: true,
      },
    });

    // Demo leaderboard entries via real sessions (guests + the seeded player)
    const existingScores = await prisma.score.count({ where: { gameId: game.id } });
    if (existingScores === 0) {
      const demoRows = [
        { name: 'Skyler', score: 42 },
        { name: 'Mai', score: 37 },
        { name: 'Tùng', score: 29 },
        { name: 'Noor', score: 18 },
      ];
      for (const row of demoRows) {
        const guest = await prisma.guest.create({ data: { displayName: row.name } });
        const session = await prisma.playSession.create({
          data: {
            gameId: game.id,
            guestId: guest.id,
            tokenHash: `seed-${game.id}-${row.name}`,
            endedAt: new Date(),
          },
        });
        await prisma.score.create({
          data: {
            gameId: game.id,
            guestId: guest.id,
            nameSnapshot: row.name,
            score: row.score,
            durationMs: 30_000 + row.score * 1000,
            sessionId: session.id,
          },
        });
      }
      const session = await prisma.playSession.create({
        data: {
          gameId: game.id,
          userId: player.id,
          tokenHash: `seed-${game.id}-player`,
          endedAt: new Date(),
        },
      });
      await prisma.score.create({
        data: {
          gameId: game.id,
          userId: player.id,
          nameSnapshot: player.displayName,
          score: 33,
          durationMs: 55_000,
          sessionId: session.id,
        },
      });
      await prisma.game.update({
        where: { id: game.id },
        data: { playCount: { increment: demoRows.length + 1 } },
      });
    }

    const existingComments = await prisma.comment.count({ where: { gameId: game.id } });
    if (existingComments === 0) {
      await prisma.comment.create({
        data: {
          gameId: game.id,
          userId: player.id,
          body: 'Simple but addictive. One more run...',
        },
      });
      await prisma.rating.upsert({
        where: { gameId_userId: { gameId: game.id, userId: player.id } },
        update: { stars: 5 },
        create: { gameId: game.id, userId: player.id, stars: 5 },
      });
      const agg = await prisma.rating.aggregate({
        where: { gameId: game.id },
        _avg: { stars: true },
        _count: { _all: true },
      });
      await prisma.game.update({
        where: { id: game.id },
        data: { ratingAvg: agg._avg.stars ?? 0, ratingCount: agg._count._all },
      });
    }
    console.log(`✓ game seeded: ${g.slug}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
