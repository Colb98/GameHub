# Bullet Hell — Mob & Boss Behavior Reference

Snapshot of current enemy/boss AI in [src/main.ts](src/main.ts), for planning new moves.
All values are the current tuning constants (top of file, lines 37–71).

## Wave/level model

- `WAVES_PER_CYCLE = 5` — waves 1–4 spawn mobs, wave 5 (and every 5th) spawns a boss.
- `level = floor((wave-1)/5) + 1` — mobs and the boss share the same level, incrementing once per cycle.
- Mob count per non-boss wave = position in cycle (wave 1→1 mob, wave 2→2 mobs, … wave 4→4 mobs).

## Mob behavior (`spawnEnemy`, [main.ts:452](src/main.ts#L452))

- **Entrance**: drop from top to a random y in [80, 250], then start a slow left/right sway drift (`drift` tween, 1.2–2s, yoyo, infinite).
- **HP**: `enemyHp(level)` — base 2 at level 1, +1/level up to level 9, then +10% of the level-9 value per level beyond 9 ([main.ts:126](src/main.ts#L126)).
- **Two AI tiers, split at `ENEMY_FAN_MAX_LEVEL = 8`:**
  - **Levels 1–8**: only a **cone attack** on a fixed timer. Fires straight down in a fan of `min(level, 6)` lines, `FAN_STEP_RAD = 10°` apart. Fire interval shrinks from 2600ms (lvl 1) by 150ms/level, floored once lines cap at 6.
  - **Levels 9+**: switches to `enemyMoveLoop` — picks a random move each cycle from `{radial, burst, cone}`, never repeating the last one, with a fixed `ENEMY_MOVE_GAP_MS = 1100ms` pause between moves.
- Mobs never use the "aimed at player" move — that's boss-only.

## Boss behavior (`spawnBoss`, [main.ts:616](src/main.ts#L616))

- **HP**: `100 + 150 × (level-1)`.
- **Entrance**: drops in, glides to `x=90`, then loops a side-to-side strafe (2.4s each way) across the play field for the rest of the fight — this is the boss's only movement; it never approaches or retreats vertically.
- **Move loop** (`bossMoveLoop`, [main.ts:674](src/main.ts#L674)): random pick from `{radial, burst, aimed, cone}`, never repeating the last move, `BOSS_SKILL_GAP_MS = 900ms` between moves. Moves are strictly sequential — never two patterns active at once, no HP-based phase escalation (boss doesn't speed up or get harder as it takes damage).
- **Visuals**: bullet palette cycles through 3 sets by `level % 3` (`BOSS_PALETTES`), body tint cycles through 4 by `level % 4` (`BOSS_TINTS`) — purely cosmetic, doesn't affect behavior.
- **Death**: clears every enemy bullet on screen (bonus reward), always drops a line-power item, 40% chance of a damage item, and every 4th boss (level 4, 8, 12…) drops a heart.

## Shared attack primitives (used by both mobs lvl 9+ and boss)

| Move | Function | Pattern |
|---|---|---|
| **Cone** | `coneAttack` [main.ts:498](src/main.ts#L498) | N bullets fanned straight down, 10° apart. Mob lines = level (max 6); boss = 8 lines (`BOSS_CONE_LINES`). |
| **Radial (moving)** | `movingRadial` [main.ts:549](src/main.ts#L549) | Fires `RADIAL_RAYS = 8` bullets in a full 360° ring, repeated for N volleys (mob 3, boss 4) at the *same* rotation offset, 500ms apart, while the source keeps drifting/strafing. Net effect: a trail of static rings left behind a moving source. |
| **Burst (rotating flower)** | `burstRadial` [main.ts:570](src/main.ts#L570) | Source **stops drifting**, does a 500–1000ms charge-up (visual pulse), then fires several 8-bullet rings where each ring's rotation offset advances by `360°/8/steps` (mob: 3 steps; boss: 4 steps), 300ms apart. Wave count scales with level: `4 + floor((level-1)/2)`, capped at 6 for mobs / 20 for bosses. Drift resumes after. |
| **Aimed stream** (boss only) | `aimedStream` [main.ts:700](src/main.ts#L700) | 6 fast single shots, 110ms apart, each **re-aimed at the player's live position** at the moment it's fired. The only tracking/homing-style attack in the game; also the fastest bullet (270 vs ~85–175 for everything else). |

## Notable gaps (useful angles for new moves)

- **No mob-side aimed/tracking attack** — only the boss ever targets the player directly; mobs are purely pattern-based.
- **No curving, accelerating, or delayed-trigger bullets** — every bullet travels in a straight line at constant speed from spawn to despawn.
- **No simultaneous/combo patterns** — one move at a time, fully sequential, so there's no "cone + radial together" or interleaved patterns.
- **No phase transitions** — boss move selection and speed are independent of remaining HP; nothing changes at 50%/25% HP.
- **Cone direction is always straight down**, even for the boss, which strafes side to side — the fan never leads/aims toward the player or the boss's movement direction.
- **Radial rings are always centered on the source**, never offset toward the player or screen center.
- **No area-denial or delayed bullets** (e.g., telegraphed lines, mines, walls) — everything is an instantaneous spawned projectile.
- Move variety is capped at 3 (mobs) / 4 (boss) named moves total; picking is uniform random minus immediate-repeat, so no weighting toward "harder" moves at higher levels beyond wave count/HP scaling.
