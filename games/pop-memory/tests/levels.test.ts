import assert from 'node:assert/strict';
import test from 'node:test';
import { levelConfig, levelTheme, PALETTES } from '../src/lib/levels';

test('level curve follows the authoritative formulas', () => {
  assert.deepEqual(levelConfig(1), {
    level: 1,
    sequenceLength: 3,
    flashMs: 660,
    gapMs: 280,
    timeoutMs: 2250,
    warningMs: 1463,
  });
  assert.deepEqual(levelConfig(10), {
    level: 10,
    sequenceLength: 8,
    flashMs: 300,
    gapMs: 100,
    timeoutMs: 900,
    warningMs: 585,
  });
});

test('curve floors and sequence cap hold at high levels', () => {
  assert.deepEqual(levelConfig(30), {
    level: 30,
    sequenceLength: 12,
    flashMs: 220,
    gapMs: 90,
    timeoutMs: 650,
    warningMs: 500,
  });
});

test('reduced motion adds thirty percent to timing', () => {
  assert.deepEqual(levelConfig(10, true), {
    level: 10,
    sequenceLength: 8,
    flashMs: 390,
    gapMs: 130,
    timeoutMs: 1170,
    warningMs: 761,
  });
});

test('palette cycles after level ten and exposes derived material colors', () => {
  const first = levelTheme(1);
  const eleventh = levelTheme(11);
  assert.equal(PALETTES.length, 10);
  assert.equal(first.name, 'Mint');
  assert.equal(eleventh.name, 'Mint');
  assert.equal(eleventh.fill, first.fill);
  assert.match(first.glowRgb, /^\d+, \d+, \d+$/);
  assert.notEqual(first.fillLit, first.fill);
  assert.notEqual(first.tray, first.fill);
});
