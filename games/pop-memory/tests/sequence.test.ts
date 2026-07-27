import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendRandom,
  createSequence,
  extendSequence,
  matchesPress,
} from '../src/lib/sequence';

function source(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

test('creates a sequence of the requested length', () => {
  assert.deepEqual(createSequence(3, source([0.05, 0.45, 0.95])), [0, 4, 9]);
});

test('extends without replacing learned positions', () => {
  const original = [2, 7, 1];
  assert.deepEqual(extendSequence(original, 5, source([0.3, 0.8])), [2, 7, 1, 3, 8]);
  assert.deepEqual(original, [2, 7, 1]);
});

test('does not extend when the target length stays the same', () => {
  const sequence = [1, 4, 7, 2];
  assert.deepEqual(extendSequence(sequence, 4, () => 0.9), sequence);
});

test('guards against a third identical position', () => {
  const result = appendRandom([6, 6], () => 0.65);
  assert.deepEqual(result.slice(0, 2), [6, 6]);
  assert.notEqual(result[2], 6);
});

test('compares a press at the current input position', () => {
  const sequence = [3, 1, 8];
  assert.equal(matchesPress(sequence, 1, 1), true);
  assert.equal(matchesPress(sequence, 1, 8), false);
});
