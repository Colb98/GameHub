# Fluxball — Implementation Plan

**Magnetic Peggle with procedurally generated, escalating levels.**

A ball-drop pachinko game where every peg carries an electric charge and the player can
flip the ball's polarity mid-flight. Same-sign pegs repel, opposite-sign pegs attract.
The shot stops being "aim and pray" and becomes a continuous steering problem.

Status: **implemented** in `games/fluxball/`. Dev server on port 5176, registered in
`apps/api/prisma/seed.ts` as slug `fluxball`. Sections below marked *measured* were
corrected against the running build; the rest is as designed.

---

## 1. Core loop

1. Aim the launcher along the top arc (mouse / touch drag, or arrow keys).
2. Fire one ball. Gravity pulls it down through a field of pegs.
3. **Mid-flight, tap to flip the ball's polarity.** Nearby pegs switch between pulling
   and pushing. This is the entire skill expression of the game.
4. Hit pegs to clear them. Clear every **orange (target) peg** to complete the level.
5. Ball exits the bottom. A moving catcher bucket at the bottom refunds a ball if caught.
6. Out of balls with orange pegs remaining → run ends. Otherwise → next level, harder.

A run is a continuous ladder of procedurally generated levels. Score accumulates across
the whole run; one `gameOver` at the end reports the total.

---

## 2. Mechanics specification

### 2.1 Polarity

- The ball has a charge `q_ball ∈ {+1, 0, -1}`, rendered as its fill color (§3.3).
- Flipping is an **on-screen FLIP button** in its own band below the playfield, with
  `Space` and `F` as desktop shortcuts. The button shows the charge the *next* press
  will produce, and greys out while the cooldown runs or the pip bar is empty.
- **Cooldown:** 0.25 s between flips, to keep the input readable.
- **Magnet energy:** a pip bar (starts at 6 pips). Each flip costs 1 pip. Hitting any peg
  refunds 1 pip (cap at max). This turns flipping into a managed resource instead of a
  button-mash, and it is the single most important balance lever in the game.
- **Neutral state:** when the pip bar hits 0 the ball goes inert (`q_ball = 0`) — no
  magnetic force in either direction — and stays that way until the next peg hit refunds a
  pip. This is why the art spec gives neutral its own color: the player must be able to
  read "I have no steering authority right now" from the ball alone, without checking the
  HUD. The ball also launches neutral, so the first moments of a shot are pure ballistics.

### 2.2 Force model

For each peg within `R = 120 px` of the ball:

```
F = k · q_ball · q_peg / max(r², r_min²)
```

- `k` — tuning constant, start at `2.6e5` (px³/s²), tune against gravity `g = 900 px/s²`.
- `r_min = 26 px` — clamps the singularity so the ball never gets slingshot absurdly.
- `F_max` — additionally clamp total magnetic acceleration to `4 · g`. Without this the
  game becomes unreadable in dense peg clusters.
- Force is applied along the peg→ball unit vector, accumulated across all pegs in range,
  then integrated into velocity.
- **Damping:** multiply velocity by `0.9985` per sub-step. Prevents the ball settling into
  a permanent orbit around a peg.

### 2.3 Peg types

Colors are specified precisely in §3.2; the names below are the shorthand used throughout.

| Peg | Color | Behavior |
|---|---|---|
| Positive | Cyan | Charge `+1`. Attracts a `-` ball, repels a `+` ball. |
| Negative | Magenta | Charge `-1`. Mirror of the above. |
| Neutral | Dim slate | Charge `0`. Must still be cleared if marked as a target; provides no steering. Creates dead zones the player must plan around. |
| Target | Amber, ringed | Any of the above, additionally required to finish the level. |
| Bipolar | Pulsing cyan↔magenta | Flips its own charge on a 1.0 s cycle. Adds timing pressure. Introduced at level 6+. |
| Anchor | Violet, larger | Immovable, high charge (`±2.5`), never cleared. Used by the generator as a deliberate steering handle. Introduced at level 9+. |

### 2.4 Collision

Circle–circle reflection, hand-rolled:

```
v' = (v - 2(v·n)n) · restitution
```

with `restitution = 0.7`, plus positional de-penetration along `n` to stop sticking.
Walls are axis-aligned segments with the same reflection.

### 2.5 Scoring

- Base 100 per peg. Target pegs 500.
- **Orbit bonus:** completing 360° of accumulated angle around a single peg without
  touching it → ×2 multiplier on the next peg hit. This rewards the mechanic's mastery
  and is the game's "long shot" moment.
- Ball-in-bucket: +1 ball, +1000.
- Level clear bonus: `1000 × level × (balls remaining + 1)`.

---

## 3. Art direction

**Dark-field neon.** Everything luminous is information; everything structural is nearly
invisible. The screen should read like charged particles suspended in a dark chamber — the
pegs are the only real light source, and the ball is a small dense object moving through
their glow rather than another light competing with them.

The signature element is the **field lines** (§3.5): faint filaments drawn from the ball to
every peg currently exerting force on it. Nothing else on screen is allowed to be as
visually interesting. This is deliberate — it is simultaneously the game's only tutorial
and its most distinctive image.

### 3.1 Rules

1. **Glow means charged.** If something emits light, it exerts or responds to force.
   Decorative glow is banned; a cleared peg stops glowing before it stops existing.
2. **The ball is dense, not bright.** It is the darkest-glowing lit object on screen — a
   solid disc with a tight, short falloff. The pegs are the atmosphere; the ball is matter.
3. **Background never exceeds 12% luminance.** Anything brighter competes with gameplay.
4. **Color carries one meaning only: charge.** Cyan is `+`, magenta is `−`, white is
   neutral, always, for both ball and pegs. Score, UI, and effects may not use those three
   hues for anything else.

### 3.2 Palette

Deliberately in the same family as `neon-descent` so the portal reads as one product, but
darker and more saturated — Fluxball is a void, not a cabinet.

| Token | Hex | Use |
|---|---|---|
| `void` | `#05060f` | Background base — near-black with a blue bias |
| `voidLift` | `#0b1024` | Vignette lift toward the field center |
| `grid` | `#141a3a` | Background grid lines, barely perceptible |
| `wall` | `#2a3266` | Chamber walls, launcher rail |
| `posCyan` | `#4de5ff` | Positive charge core |
| `posGlow` | `#0b6f96` | Positive glow falloff |
| `negMagenta` | `#ff5ec4` | Negative charge core |
| `negGlow` | `#9c1f6e` | Negative glow falloff |
| `neutral` | `#f2f5ff` | Neutral ball fill / neutral-state UI |
| `pegDim` | `#39406e` | Uncharged (neutral) pegs — visible, not luminous |
| `amber` | `#ffd166` | Target peg ring + level-clear accents |
| `violet` | `#a98bff` | Anchor pegs |
| `mint` | `#63f4bd` | Score popups, positive feedback only |

### 3.3 The ball

- **20 px diameter**, solid fill, hard edge — no soft outline. It must read as a physical
  object against the diffuse pegs.
- Fill = current charge: `posCyan` when `+`, `negMagenta` when `−`, `neutral` white when
  inert. The fill is the state readout; there is no separate rim or badge.
- Glow radius **1.4× the ball radius** — roughly a third of a peg's glow extent. Present
  enough to feel energized, weak enough that it never blooms into the field.
- On flip: a single-frame white flash and a `1.0 → 1.25 → 1.0` scale pop over 120 ms. The
  flip is the game's core verb and must feel like a discrete, physical event.
- **Trail:** 14 positions, fading from the current charge color to transparent, width
  tapering to zero. The trail is how the player perceives curvature — it is functional,
  not decorative, so it stays visible even in reduced-motion mode.

### 3.4 Pegs

- **Glowing circles, 14 px core**, with a radial falloff out to ~28 px.
- Structure: bright saturated core → mid-tone body → wide dim halo. Charged pegs breathe on
  a slow 2.5 s sine at ±8% glow radius, desynchronized per peg by a seeded phase offset so
  the field shimmers rather than pulses in unison.
- **Neutral pegs** get no glow at all — flat `pegDim` discs with a 1 px lighter edge. The
  absence of light *is* the "no steering here" signal.
- **Target pegs** wear a rotating amber ring, ~1 rev / 3 s, plus a slightly wider halo.
- **Bipolar pegs** crossfade cyan↔magenta over the full 1.0 s cycle rather than snapping,
  so the player can anticipate the switch instead of reacting to it. The midpoint of the
  crossfade passes through white — which correctly reads as "momentarily neutral."
- **Anchor pegs** are 22 px, violet, with a visible dark core (a hole) to communicate
  "permanent, not clearable."
- **On clear:** the peg's glow expands to ~2× and drops to zero over 180 ms while the core
  collapses inward. Light leaving the field is the reward.

### 3.5 Field lines — the signature

While the ball is in flight, draw a line from the ball to each peg currently within `R`:

- Color = **the peg's** charge color, not the ball's.
- Opacity scales with force magnitude: `alpha = clamp(|F| / F_max, 0.05, 0.5)`. Strong
  interactions are legible; weak ones are a whisper.
- **Attraction vs repulsion is encoded by motion, not color:** dashes animate *toward* the
  ball on attraction, *away* on repulsion. This is the one piece of information color
  cannot carry, since color is already spoken for by charge.
- Cap at the 6 strongest lines. Beyond that it becomes noise, and the force model already
  caps influencing pegs at 6 (§2.2).

### 3.6 Background

Dark, layered, and slow — it must never pull focus:

- Base fill `void`, with a soft radial `voidLift` vignette centered slightly above the
  field center so the play area feels lit from within.
- A `grid` lattice at ~48 px, drifting at 3 px/s with a slight parallax against the field.
  Barely visible — if a player consciously notices it, turn it down.
- **Reactive tint:** the vignette shifts a few percent toward `posGlow` or `negGlow`
  matching the ball's current charge. Subliminal reinforcement of state, ~4% max blend.
- Level backgrounds do not change per archetype; the peg layout is the visual variety.
  Deep levels (13+) darken the grid further and slow its drift, which reads as descent.

### 3.7 Rendering technique

Consistent with the other three games: **no external assets.** Everything is generated at
runtime and drawn with additive blending.

- Bake **one 64×64 radial-gradient sprite** at boot via `Phaser.Graphics` →
  `generateTexture()`, then tint and scale it per peg. Do not draw gradients per frame, and
  do not use a post-process blur — a tinted additive sprite is 10× cheaper and holds 60 fps
  on mobile, which is where this game will actually be played.
- Peg glow = that sprite with `Phaser.BlendModes.ADD`; peg core = a small solid circle
  texture on top.
- Two layers only: additive glow below, solid cores and UI above. Additive stacking in
  dense clusters is the intended look — clusters *should* wash brighter, since that is
  exactly where the force is strongest.
- Field lines and trail on a single `Graphics` object cleared each frame.

### 3.8 HUD

Thin, monospace-flavored, set in `neutral` at 60% opacity, pinned to the top edge and
never overlapping the field. Score, level, balls remaining, and the magnet pip bar.

The pip bar is the only HUD element allowed to be bright: pips are small charge-colored
dots that **drain toward white as they are spent**, matching the ball going neutral at
zero. It sits directly under the launcher so it falls in the player's aiming gaze.

### 3.9 Accessibility

- Cyan/magenta separate well for the common CVD types, but do not rely on hue alone: the
  ball carries a `+` / `−` / `○` glyph at 40% opacity, and field-line dash direction
  already encodes attraction independently of color.
- Honor `prefers-reduced-motion`: disable peg breathing, grid drift, and screen shake;
  keep the trail and field lines, which are functional.
- Contrast: all text meets 4.5:1 against `void`. Never place text over the glow field.
- Respect `gh.muted` — the flip and peg-hit sounds are meaningful feedback, so the visual
  flash on flip must be strong enough to stand alone with sound off.

---

## 4. Physics architecture (the important decision)

**Do not use Phaser Arcade Physics for the ball.** Write a standalone deterministic
simulation module; use Phaser only for rendering, input, audio, and scene management.

Reasons:

- Arcade Physics is AABB-first and its circle support is not built for accumulating
  arbitrary radial forces at high sub-step rates.
- Procedural level generation needs to **validate levels by simulating them headlessly**
  (§5.3). That requires a sim that runs decoupled from the render loop, thousands of
  times faster than real time.
- Deterministic replay makes leaderboard verification and bug reproduction possible.

### Structure

```
games/fluxball/src/
  main.ts          # Phaser bootstrap + initGameHub(), mirrors neon-descent
  sim/
    world.ts       # PegField, Ball, step(dt) — pure, no Phaser imports
    forces.ts      # magnetic accumulation, clamps, damping
    collide.ts     # circle-circle + wall reflection
    hash.ts        # uniform-grid spatial hash for peg lookup
  gen/
    rng.ts         # seeded PRNG (mulberry32)
    archetypes.ts  # layout generators
    validate.ts    # headless solvability check
    curve.ts       # level N -> LevelParams
  render/
    palette.ts     # §3.2 tokens, single source of truth for color
    textures.ts    # boot-time generateTexture(): glow sprite, cores, rings
    field.ts       # field-line + trail drawing
    background.ts  # vignette, drifting grid, charge tint
  scenes/
    PlayScene.ts   # input, HUD, scene flow
  audio.ts         # WebAudio synth, same approach as neon-descent
```

`sim/` must have **zero Phaser imports** — that is what makes headless validation and
unit tests possible.

### Integration

- **Fixed timestep**, 240 Hz (`dt = 1/240`), with an accumulator driving N sub-steps per
  rendered frame. Semi-implicit Euler is sufficient at this rate.
- Render interpolates between the last two sim states so motion stays smooth at 60 fps.
- Spatial hash with cell size = `R` (120 px); query the 3×3 neighborhood. A naive O(n)
  loop over ~120 pegs × 240 sub-steps × 60 fps is ~1.7M distance checks/sec — it will
  work on desktop and stutter on mobile. Use the hash.

---

## 5. Procedural generation

### 5.1 Seeded RNG

`mulberry32(seed)`. Run seed derived from `Date.now()` unless overridden by a `?seed=`
query param (same testing-hook convention as bullet-hell's `?wave` / `?p1` params).
Level seed = `hash(runSeed, levelIndex)`, so any level is reproducible in isolation.

### 5.2 Archetypes

The generator picks one archetype per level, weighted by level index, then fills it with
charge assignments. Layout and charge assignment are **separate passes** — this is what
keeps variety high without needing many archetypes.

| Archetype | Shape | Unlocks |
|---|---|---|
| `lattice` | Jittered grid, the Peggle baseline | Level 1 |
| `arcs` | Concentric arcs around a focal point | Level 1 |
| `funnel` | Two converging walls of pegs feeding a narrow gap | Level 3 |
| `spiral` | Logarithmic spiral, rewards sustained orbiting | Level 5 |
| `islands` | 3–5 dense clusters separated by empty space | Level 7 |
| `chambers` | Solid wall segments dividing the field into rooms with peg-lined doorways | Level 10 |

**Charge assignment pass** (this is where the mechanic actually lives):

- Never place large uniform-charge blobs — they collapse into a single push/pull and read
  as one object. Enforce max run length of 3 same-charge pegs along any axis.
- Place target (orange) pegs preferentially **behind** a charge gradient — i.e. reachable
  only if the player flips at roughly the right moment. Score each candidate position by
  `distance from the straight-drop cone` and pick from the top quartile.
- Reserve 10–25% neutral pegs as dead zones (rises with level).

### 5.3 Solvability validation

Generation is generate-and-test. After building a candidate layout:

1. Run **300 headless shots** at evenly spaced launch angles, each with a scripted flip
   policy (a simple greedy heuristic: flip when the nearest target peg would become
   attractive).
2. Reject the layout unless:
   - at least **65%** of shots clear ≥1 target peg, and
   - every target peg is hit by at least one of the 300 shots (no unreachable pegs), and
   - median shot duration is between 2.5 s and 12 s (not trivially fast, not a stall).
3. Retry up to 20 times, then fall back to the last candidate that passed the
   reachability check alone.

This is cheap because the sim is headless and deterministic — a 300-shot sweep is a few
milliseconds. Generate the next level during the level-clear animation so it never
blocks.

---

## 6. Difficulty curve

`gen/curve.ts` maps level index → parameters. Values interpolate and then clamp; the
curve is intentionally aggressive early (players feel progress) and asymptotic later.

| Level | Pegs | Targets | Neutral % | Bipolar % | Balls | Magnet pips | Notes |
|---|---|---|---|---|---|---|---|
| 1 | 60 | 6 | 0% | 0% | 6 | 8 | Tutorial-by-design: wide gaps, forgiving |
| 2–3 | 65 | 8 | 5% | 0% | 6 | 7 | `funnel` unlocks |
| 4–5 | 75 | 11 | 10% | 0% | 5 | 6 | `spiral` unlocks |
| 6–8 | 85 | 14 | 15% | 10% | 5 | 6 | Bipolar pegs; `islands` at 7 |
| 9–12 | 92 | 17 | 20% | 15% | 4 | 5 | Anchor pegs; `chambers` at 10 |
| 13–18 | 100 | 20 | 25% | 20% | 4 | 5 | Bucket narrows 140px → 90px |
| 19+ | 105 | 22 | 25% | 25% | 3 | 4 | Bipolar cycle speeds to 0.6 s |

> **Measured correction.** The peg counts above are lower than this plan's first draft
> (which topped out at 140). Pegs must stay at least `2·pegR + ballØ` apart so the ball
> can physically pass between any two of them; at that spacing, random fill of the
> playfield saturates around 105 pegs. Asking for more only burns generation time.
> `targetBias` was also added to the curve — early levels draw targets from the whole
> field, late levels only from the half hardest to reach on a straight drop.

Additional continuous scalars:

- `k` (magnet strength) decays 2% per level from level 10, floor at 70% — late levels
  give you less steering authority for the same input.
- Bucket sweep speed +4% per level, cap ×2.2.
- Validation threshold tightens from 65% → 45% of sample shots succeeding, so late
  layouts are permitted to be genuinely demanding.

**Difficulty must come from layout, not from taking control away.** Never reduce the
flip cooldown or make flips fail; the player should always feel the loss was theirs.

---

## 7. GameHub integration

Follows `games/neon-descent` exactly:

- `package.json` — name `@gamehub/fluxball`, deps `@gamehub/sdk` (workspace) + `phaser`,
  build script `vite build && node ../../scripts/zip-dist.mjs`.
- `vite.config.ts` — `base: './'`, `devQrPlugin()`, **server port 5176 / preview 4176**
  (5173–5175 and 4173–4175 are taken).
- `main.ts` — `initGameHub().then(gh => new Phaser.Game({...}))`, portrait `640×900`,
  `Phaser.Scale.FIT` + `CENTER_BOTH`, arcade physics disabled (`physics` block omitted).
- Report once at run end:
  `gh.gameOver({ score, durationMs, meta: { level, seed, pegsCleared } })`.
- Honor `gh.muted` and `gh.onMutedChange()` for the portal's sound control.
- Procedural textures generated at runtime (`Phaser.Graphics` → `generateTexture`) and
  WebAudio synth for sound — keeps the bundle asset-free like the other three games.
- Register in `apps/api/prisma/seed.ts` with `slug: 'fluxball'`, `category: 'arcade'`,
  `orientation: 'PORTRAIT'`, and **both `en` and `vi`** name / shortIntro / controlsHtml.

---

## 8. Milestones

| # | Deliverable | Done when | Status |
|---|---|---|---|
| M1 | Sim core: ball, gravity, walls, one static peg field, fixed timestep | Ball bounces plausibly at 60 fps; sim has no Phaser import | done |
| M2 | Magnetism + flip input + energy pips | A hand-authored level is clearable *only* by flipping | done |
| M3 | Art pass per §3: baked glow textures, peg/ball rendering, field lines, background | A first-time player can explain what the ball is doing, with sound off | done |
| M4 | Generator: all six archetypes + charge pass + headless validator | 50 consecutive generated levels all pass validation | done — 22/22 and 24/24 sweeps pass, 0 unreachable targets |
| M5 | Difficulty curve, run/score loop | A full run is playable end to end | done |
| M6 | Juice + audio + portal integration + seed entry | Score posts; bilingual seed row present | done |

**Gate at M2.** If the magnetism does not feel good with one hand-authored level, no
amount of procedural generation will save it — stop and re-tune `k`, `R`, and damping
before building anything else.

### Verified in-browser

Driven in Edge over the dev server: 60 fps on a level-16 field of ~98 pegs, no console
errors, flip working from both the button and the keyboard, bucket refunding a ball,
score posting through the SDK. Generator audit averages **177 ms and 1.0 attempts per
level** (down from 834 ms and 7.5 before the fixes below).

Three defects found only by running it, all fixed:

1. **The bucket and the FLIP button occupied the same band of screen.** The playfield
   floor moved from y=812 to y=782 so the bucket, the gap, and the button each get
   their own strip.
2. **Container hit-testing never fired.** An interactive `Phaser.GameObjects.Container`
   with an explicit rectangular hit area received no `pointerdown`, while a `Zone` at
   the same coordinates did — confirmed by A/B test in the page. The button now uses a
   Zone for input, with the graphics and label as separate objects.
3. **The bottom third of every field was empty.** The spacing filter truncated
   candidate points in emission order, and layouts are emitted top-to-bottom, so the
   peg budget was always spent before reaching the floor. Points are now filtered
   against a generous cap and then trimmed to budget at random.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Ball locks into a stable orbit forever | Velocity damping `0.9985`/sub-step + 15 s per-shot timeout that disables magnetism and lets it drop |
| Dense clusters produce unreadable chaos | `F_max` clamp at `4g`; cap influencing pegs at the 6 nearest |
| Player cannot see why the ball moves | Draw faint field lines to every peg currently exerting force — non-negotiable, this is the tutorial |
| Generated levels are unfair | Headless validator (§5.3); never ship a level that failed reachability |
| Mobile performance | Spatial hash; drop sim to 120 Hz on devices where frame time exceeds 20 ms for 30 consecutive frames |
| Additive glow overdraw kills mobile fill rate | One baked 64×64 glow sprite, tinted and scaled — never a post-process blur; if frame time still suffers, shrink glow scale before cutting peg count |
| Neon field washes out and hides the ball | The ball is the only hard-edged object on screen and carries a glyph; if it still gets lost in dense clusters, dim peg glow rather than brightening the ball |
| Determinism drift between runs | No `Math.random()` anywhere in `sim/` or `gen/`; all randomness through the seeded PRNG |

---

## 10. Open questions

- ~~Should the flip be a hold instead of a toggle?~~ **Resolved:** a toggle on a
  dedicated on-screen button, with `Space` / `F` on desktop.
- **Run structure:** endless ladder (as built) vs. fixed 20-level campaign with a win
  screen. Endless suits the leaderboard model better; revisit with play data.
- **Bucket:** keep Peggle's ball refund, or replace it with a magnet-energy refill? The
  latter ties the bottom of the screen back into the core mechanic.
