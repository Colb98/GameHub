/**
 * Headless generator audit — the M4 exit criterion from the plan: N consecutive
 * generated levels must all pass validation with every target reachable.
 *
 * There is no TS runner in this repo, so bundle it with the esbuild that ships inside
 * vite, then run the output:
 *
 *   node node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/bin/esbuild \
 *     games/fluxball/tools/gen-check.ts --bundle --platform=node --format=esm \
 *     --outfile=games/fluxball/tools/.gen-check.mjs
 *   node games/fluxball/tools/.gen-check.mjs 50 12345
 *
 * Arguments: <levels> <run seed>.
 */
import { levelParams } from '../src/gen/curve';
import { levelSeed, mulberry32 } from '../src/gen/rng';
import { generateLevel } from '../src/gen/validate';

const COUNT = Number(process.argv[2] ?? 50);
const RUN_SEED = Number(process.argv[3] ?? 12345);

let failures = 0;
let unreachable = 0;
let totalMs = 0;
let totalAttempts = 0;

console.log(`level  arch        pegs  tgt  pass  succ%   median  attempts  ms`);
for (let level = 1; level <= COUNT; level += 1) {
  const params = levelParams(level);
  const rng = mulberry32(levelSeed(RUN_SEED, level));
  const started = Date.now();
  const generated = generateLevel(params, rng);
  const ms = Date.now() - started;
  totalMs += ms;
  totalAttempts += generated.attempts;

  const targets = generated.pegs.filter((peg) => peg.target).length;
  if (!generated.report.passed) failures += 1;
  if (generated.report.unreachable > 0) unreachable += 1;

  console.log(
    [
      String(level).padStart(5),
      generated.archetype.padEnd(10),
      String(generated.pegs.length).padStart(6),
      String(targets).padStart(4),
      (generated.report.passed ? 'yes' : 'NO').padStart(6),
      (generated.report.successRate * 100).toFixed(0).padStart(6),
      generated.report.medianDuration.toFixed(2).padStart(8),
      String(generated.attempts).padStart(9),
      String(ms).padStart(5),
    ].join(' '),
  );
}

console.log(
  `\n${COUNT - failures}/${COUNT} passed validation | ${unreachable} with unreachable targets | ` +
    `avg ${(totalMs / COUNT).toFixed(0)}ms, ${(totalAttempts / COUNT).toFixed(1)} attempts per level`,
);

if (unreachable > 0) {
  console.error('FAIL: a level shipped with an unreachable target peg.');
  process.exit(1);
}
