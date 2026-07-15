# GameHub — H5 Minigame Portal

A web portal where trusted developers upload H5 minigames and players play them
instantly on PC and mobile — with leaderboards, ratings, comments, favorites,
guest play, and social login. API-first so the same backend can power a native
mobile app later.

## Stack

| Piece | Tech |
|---|---|
| Portal | Next.js 15 (App Router), Tailwind, `next-intl` (EN/VI) |
| API | NestJS 11 + Fastify, REST `/api/v1`, Swagger at `/api/docs` |
| DB | PostgreSQL 16 + Prisma (Redis reserved for scaling/multiplayer) |
| Games | Any engine that speaks `@gamehub/sdk` (samples: Phaser 3 + Vite) |
| Infra | Docker Compose + Caddy (auto-HTTPS) on a VPS, Cloudflare in front |
| CI/CD | GitHub Actions → GHCR images → SSH deploy |

## Monorepo layout

```
apps/api        NestJS API (auth, games, scores, studio, admin)
apps/web        Next.js portal (player pages + /studio + /admin)
packages/game-sdk  postMessage bridge between portal shell and games
games/flappy-bird  sample game (portrait)
games/bullet-hell  sample game (both orientations)
infra/          compose files, Caddyfile, VPS setup + backup scripts
scripts/        dev-db.mjs (embedded Postgres for Docker-less dev)
```

## Quickstart (local dev)

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 1. Database — either one:
pnpm db:dev                                        # embedded Postgres, no Docker needed
docker compose -f infra/docker-compose.dev.yml up  # ...or Docker

# 2. First-time setup (new terminal)
pnpm --filter @gamehub/api exec prisma migrate dev --name init
pnpm build          # builds SDK, games, API, web
pnpm seed           # demo users + sample games + demo scores

# 3. Run everything
pnpm --filter @gamehub/api dev    # API on :4000
pnpm --filter @gamehub/web dev    # portal on :3000
```

Seeded accounts (password after the dash):

- `admin@gamehub.local` — `admin12345` (admin: review queue at `/admin`)
- `dev@gamehub.local` — `dev12345` (developer: studio at `/studio`)
- `player@gamehub.local` — `player12345`

## How games plug in (`@gamehub/sdk`)

Games are static zip bundles running in a **sandboxed iframe on a separate
origin** (`games.<domain>`). The portal shell drives them over postMessage:

1. Game calls `initGameHub()` → SDK announces `ready`, receives
   `{ locale, player, orientation, muted }`.
2. Game plays. **No highscore UI in the game** — on death it calls
   `gameOver({ score, durationMs })`.
3. The shell submits the score to the API using a **server-issued single-use
   session token** (created when the run started), then shows the leaderboard
   overlay with the player's row highlighted.

Anti-cheat (MVP tier): single-use session tokens, minimum-duration and
max-score sanity checks, duration vs. session age comparison, rate limits, and
admin score deletion.

### Adding a new game

1. Build with any engine (Phaser/Cocos/hand-rolled canvas), integrate the SDK
   (`init` → `gameOver`), make the canvas responsive, use relative asset paths.
2. Zip the build output (with `index.html` at the zip root).
3. Log in as a developer → `/studio` → create the game (EN/VI metadata,
   orientation, score order) → upload the zip as version `x.y.z` → submit.
4. An admin reviews at `/admin` (test-play runs the real bundle) → approve →
   the game is published and appears under "New games".

## Deploying to the VPS

1. **DNS/Cloudflare:** point `DOMAIN`, `api.DOMAIN`, `games.DOMAIN` at the VPS,
   proxied through Cloudflare (DDoS/WAF + hides the origin IP).
   Portal browser requests use the same-origin `/api` proxy; `api.DOMAIN`
   remains the public endpoint for native or third-party API clients.
2. **VPS one-time (CentOS Stream 8/9, Rocky/Alma):** run
   `infra/deploy/setup-vps.sh` as root (firewalld, fail2ban, Docker), copy
   `infra/docker-compose.prod.yml`, `infra/Caddyfile` and a filled-in `.env`
   (from `infra/.env.prod.example`) to `~/gamehub/.env`. The deploy workflow
   reads that absolute path and fails before restart if it is unavailable or a
   required value is blank. SELinux stays enforcing;
   the Caddyfile bind mount already carries the `:z` relabel suffix.
3. **GitHub:** set repo secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` and repo
   variable `DOMAIN`. Every push to `main` builds images, syncs the production
   Caddy/Compose configuration, and redeploys (`.github/workflows/deploy.yml`).
4. **OAuth (optional):** register callback URLs on the portal origin, for
   example `https://DOMAIN/api/v1/auth/google/callback` and
   `https://DOMAIN/api/v1/auth/facebook/callback`.
5. **Backups:** schedule `infra/deploy/backup.sh` via cron (nightly `pg_dump`,
   optional rclone offsite copy).

## Security notes

- Cloudflare proxy + firewalld + fail2ban + SSH keys at the edge/host level.
- API: per-route rate limits (stricter on auth/score), Helmet, strict CORS,
  argon2 password hashing, rotating refresh tokens, OAuth `state` checks.
- DB: Prisma parameterized queries only; Postgres never exposed publicly.
- Uploads: zip-slip guard, file-type allowlist, size caps, static-only serving.
- Game isolation: iframe sandbox + separate origin keeps third-party game code
  away from portal cookies/tokens.

## Native mobile app (future)

Everything the portal renders comes from REST `/api/v1` (OpenAPI spec at
`/api/docs-json`), and auth works with Bearer tokens as well as cookies — a
Capacitor/React Native shell can reuse the API client and embed the same game
bundles in a WebView with the identical SDK handshake. Multiplayer is
future-proofed via reserved `channel.*` SDK messages, a nullable
`Score.matchId`, and Redis already in the prod stack.
