/**
 * Local development database without Docker: boots an embedded PostgreSQL
 * on port 5433 with data stored in ./.pgdata. Keep it running in a terminal;
 * Ctrl+C stops it cleanly.
 *
 * With Docker available you can use `docker compose -f infra/docker-compose.dev.yml up`
 * instead — both expose the same postgresql://gamehub:gamehub@localhost:5433/gamehub.
 */
import fs from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

const pg = new EmbeddedPostgres({
  databaseDir: './.pgdata',
  user: 'gamehub',
  password: 'gamehub',
  port: 5433,
  persistent: true,
  // Windows initdb defaults to the system locale (e.g. WIN1252), which breaks
  // Vietnamese text — force a UTF-8 cluster
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

const freshInit = !fs.existsSync('./.pgdata/PG_VERSION');
if (freshInit) {
  console.log('Initializing embedded Postgres cluster in ./.pgdata ...');
  await pg.initialise();
}
await pg.start();
if (freshInit) {
  await pg.createDatabase('gamehub');
}
console.log('Embedded Postgres ready: postgresql://gamehub:gamehub@localhost:5433/gamehub');
console.log('Press Ctrl+C to stop.');

async function shutdown() {
  console.log('\nStopping embedded Postgres ...');
  await pg.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
