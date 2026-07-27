export const BUBBLE_COUNT = 10;

export type RandomSource = () => number;

function randomIndex(random: RandomSource): number {
  const value = random();
  const normalized = Number.isFinite(value) ? value : 0;
  return Math.min(BUBBLE_COUNT - 1, Math.max(0, Math.floor(normalized * BUBBLE_COUNT)));
}

export function appendRandom(
  sequence: readonly number[],
  random: RandomSource = Math.random,
): number[] {
  let next = randomIndex(random);
  const last = sequence[sequence.length - 1];
  const beforeLast = sequence[sequence.length - 2];

  if (last !== undefined && last === beforeLast && next === last) {
    // A second draw varies normal play; the +1 guarantees progress even with a
    // pathological deterministic source that returns the same value forever.
    next = (next + 1 + Math.floor(random() * (BUBBLE_COUNT - 1))) % BUBBLE_COUNT;
  }

  return [...sequence, next];
}

export function extendSequence(
  sequence: readonly number[],
  targetLength: number,
  random: RandomSource = Math.random,
): number[] {
  let result = sequence.slice(0, Math.max(0, Math.floor(targetLength)));
  while (result.length < targetLength) {
    result = appendRandom(result, random);
  }
  return result;
}

export function createSequence(
  length: number,
  random: RandomSource = Math.random,
): number[] {
  return extendSequence([], length, random);
}

export function matchesPress(
  sequence: readonly number[],
  inputIndex: number,
  bubbleIndex: number,
): boolean {
  return sequence[inputIndex] === bubbleIndex;
}
