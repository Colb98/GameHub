import assert from 'node:assert/strict';
import test from 'node:test';
import { gameReducer, initialGameState } from '../src/lib/machine';

const sequence = [2, 5, 1];

test('starts in playback and enters awaiting after playback', () => {
  const showing = gameReducer(initialGameState(), { type: 'START', sequence });
  assert.equal(showing.phase, 'showing');
  assert.deepEqual(showing.sequence, sequence);

  const awaiting = gameReducer(showing, { type: 'PLAYBACK_FINISHED' });
  assert.equal(awaiting.phase, 'awaiting');
  assert.equal(awaiting.inputIndex, 0);
});

test('correct presses advance and completing the pattern enters level up', () => {
  let state = gameReducer(initialGameState(), { type: 'START', sequence });
  state = gameReducer(state, { type: 'PLAYBACK_FINISHED' });
  state = gameReducer(state, { type: 'BUBBLE_PRESSED', index: 2 });
  assert.equal(state.phase, 'awaiting');
  assert.equal(state.inputIndex, 1);
  state = gameReducer(state, { type: 'BUBBLE_PRESSED', index: 5 });
  state = gameReducer(state, { type: 'BUBBLE_PRESSED', index: 1 });
  assert.equal(state.phase, 'levelUp');
});

test('wrong input records the expected and pressed positions', () => {
  let state = gameReducer(initialGameState(), { type: 'START', sequence });
  state = gameReducer(state, { type: 'PLAYBACK_FINISHED' });
  state = gameReducer(state, { type: 'BUBBLE_PRESSED', index: 8 });
  assert.equal(state.phase, 'fail');
  assert.deepEqual(state.failure, { reason: 'wrong', expected: 2, pressed: 8 });
});

test('timeout fails at the current expected position and reaches game over', () => {
  let state = gameReducer(initialGameState(), { type: 'START', sequence });
  state = gameReducer(state, { type: 'PLAYBACK_FINISHED' });
  state = gameReducer(state, { type: 'BUBBLE_PRESSED', index: 2 });
  state = gameReducer(state, { type: 'INPUT_TIMEOUT' });
  assert.equal(state.phase, 'fail');
  assert.deepEqual(state.failure, { reason: 'timeout', expected: 5 });
  state = gameReducer(state, { type: 'FAIL_FEEDBACK_FINISHED' });
  assert.equal(state.phase, 'gameOver');
});

test('level-up completion adopts the extended sequence and increments level', () => {
  let state = gameReducer(initialGameState(), { type: 'START', sequence: [4] });
  state = gameReducer(state, { type: 'PLAYBACK_FINISHED' });
  state = gameReducer(state, { type: 'BUBBLE_PRESSED', index: 4 });
  state = gameReducer(state, { type: 'NEXT_LEVEL_READY', sequence: [4, 7] });
  assert.equal(state.phase, 'showing');
  assert.equal(state.level, 2);
  assert.deepEqual(state.sequence, [4, 7]);
});
