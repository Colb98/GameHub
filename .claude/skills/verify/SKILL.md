---
name: verify
description: Build, launch, and drive the GameHub portal + API locally to verify changes end-to-end.
---

# Verifying GameHub changes

## Environment gotchas

- `pnpm` is NOT on PATH and corepack is missing — use `npx -y pnpm@9.15.9 <args>` for every pnpm command.
- No Chrome/Chromium installed; **Microsoft Edge is** — Playwright works with
  `chromium.launch({ channel: 'msedge' })` and needs no browser download
  (`npm i playwright` in a scratch dir is enough).

## Boot the stack (all from repo root)

```bash
cp apps/api/.env.example apps/api/.env    # if missing
cp apps/web/.env.example apps/web/.env    # if missing
node scripts/dev-db.mjs &                 # embedded Postgres :5433 (wait for "ready")
npx -y pnpm@9.15.9 --filter @gamehub/api exec prisma migrate deploy
npx -y pnpm@9.15.9 turbo run build --filter='./packages/*' --filter='./games/*'  # game bundles for seed
npx -y pnpm@9.15.9 --filter @gamehub/api seed
npx -y pnpm@9.15.9 --filter @gamehub/api dev &   # API :4000 (ready when /api/v1/games returns 200)
npx -y pnpm@9.15.9 --filter @gamehub/web dev &   # portal :3000
```

Seeded accounts: `admin@gamehub.local`/`admin12345`, `dev@gamehub.local`/`dev12345`,
`player@gamehub.local`/`player12345`. Seed publishes `flappy-bird` and `bullet-hell`
at v1.0.0 (active).

## Driving the UI

- Login form selectors: `input[type=email]`, `input[type=password]`, submit `button.btn`.
- Studio at `/en/studio`, admin queue at `/en/admin`, review page `/en/admin/<gameId>`.
- Game zips for upload tests: zip the contents of `games/<slug>/dist` with
  `index.html` at the zip root (`cd dist && zip -r ../x.zip .`).
- Public state check without a browser: `GET :4000/api/v1/games/<slug>?locale=en`
  → `activeVersion.path` tells which bundle is live.

## Flows worth driving

- Studio upload → success banner + version list on the game card.
- Update review: upload to a published game → admin queue → approve → active version flips.
- Reject keeps a published game live on its old active bundle.
