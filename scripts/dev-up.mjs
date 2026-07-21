#!/usr/bin/env node
/**
 * One-command local dev stack for manual testing before pushing to CI.
 *
 * Boots embedded Postgres (:5433), applies migrations, seeds demo data, then
 * runs the API (:4000) and web portal (:3000) in watch mode — all on localhost.
 *
 *   pnpm dev:up            # full boot (seeds + builds game bundles on first run)
 *   pnpm dev:up --no-seed  # skip seeding for a faster reboot
 *
 * Press Ctrl+C to stop everything cleanly.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doSeed = !process.argv.includes('--no-seed');
const children = [];
let shuttingDown = false;

function ensureEnv(rel) {
  const env = path.join(root, rel, '.env');
  const example = path.join(root, rel, '.env.example');
  if (!fs.existsSync(env) && fs.existsSync(example)) {
    fs.copyFileSync(example, env);
    console.log(`• created ${rel}/.env from .env.example`);
  }
}

function waitForPort(port, { timeout = 60_000, label } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.connect(port, '127.0.0.1');
      sock.once('connect', () => {
        sock.destroy();
        resolve();
      });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error(`timed out waiting for ${label ?? `:${port}`}`));
        } else {
          setTimeout(attempt, 500);
        }
      });
    };
    attempt();
  });
}

const shellOpt = process.platform === 'win32';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: shellOpt });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`\`${cmd} ${args.join(' ')}\` exited with ${code}`)),
    );
    child.on('error', reject);
  });
}

function spawnPersistent(cmd, args) {
  const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: shellOpt });
  children.push(child);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`\n\`${cmd}\` exited (${code}) — shutting the stack down.`);
      shutdown();
    }
  });
  return child;
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill('SIGINT');
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(0), 800);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
  ensureEnv('apps/api');
  ensureEnv('apps/web');

  console.log('▶ starting embedded Postgres (:5433) …');
  spawnPersistent('node', ['scripts/dev-db.mjs']);
  await waitForPort(5433, { label: 'Postgres :5433' });
  console.log('✓ Postgres ready');

  console.log('▶ applying migrations …');
  await run('pnpm', ['--filter', '@gamehub/api', 'exec', 'prisma', 'migrate', 'deploy']);

  if (doSeed) {
    const sampleBundle = path.join(root, 'games/flappy-bird/dist/index.html');
    if (!fs.existsSync(sampleBundle)) {
      console.log('▶ building game bundles (first run only) …');
      await run('pnpm', ['turbo', 'run', 'build', '--filter=./packages/*', '--filter=./games/*']);
    }
    console.log('▶ seeding demo data …');
    await run('pnpm', ['--filter', '@gamehub/api', 'seed']);
  }

  console.log('▶ starting API (:4000) + web portal (:3000) in watch mode …');
  spawnPersistent('pnpm', ['dev']);
  await waitForPort(4000, { label: 'API :4000', timeout: 120_000 });
  await waitForPort(3000, { label: 'Web :3000', timeout: 120_000 });

  console.log('\n✅ Local dev is up:');
  console.log('   Portal  → http://localhost:3000/en');
  console.log('   API     → http://localhost:4000/api/v1');
  console.log('   Sign in → admin@gamehub.local · dev@gamehub.local · player@gamehub.local');
  console.log('             (password is the role name + 12345, e.g. player12345)');
  console.log('   Ctrl+C to stop everything.\n');
}

main().catch((err) => {
  console.error(`\ndev:up failed: ${err.message}`);
  shutdown();
});
