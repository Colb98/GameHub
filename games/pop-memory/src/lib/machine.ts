import { matchesPress } from './sequence';

export type GamePhase =
  | 'idle'
  | 'showing'
  | 'awaiting'
  | 'fail'
  | 'levelUp'
  | 'gameOver';

export type FailureReason = 'wrong' | 'timeout';

export interface Failure {
  reason: FailureReason;
  expected: number;
  pressed?: number;
}

export interface GameState {
  phase: GamePhase;
  level: number;
  sequence: number[];
  inputIndex: number;
  failure: Failure | null;
}

export type GameEvent =
  | { type: 'START'; sequence: number[] }
  | { type: 'PLAYBACK_FINISHED' }
  | { type: 'BUBBLE_PRESSED'; index: number }
  | { type: 'INPUT_TIMEOUT' }
  | { type: 'FAIL_FEEDBACK_FINISHED' }
  | { type: 'NEXT_LEVEL_READY'; sequence: number[] }
  | { type: 'RESTART'; sequence: number[] };

export function initialGameState(): GameState {
  return {
    phase: 'idle',
    level: 1,
    sequence: [],
    inputIndex: 0,
    failure: null,
  };
}

export function gameReducer(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'START':
    case 'RESTART':
      return {
        phase: 'showing',
        level: 1,
        sequence: [...event.sequence],
        inputIndex: 0,
        failure: null,
      };

    case 'PLAYBACK_FINISHED':
      if (state.phase !== 'showing') return state;
      return { ...state, phase: 'awaiting', inputIndex: 0 };

    case 'BUBBLE_PRESSED': {
      if (state.phase !== 'awaiting') return state;
      const expected = state.sequence[state.inputIndex];
      if (!matchesPress(state.sequence, state.inputIndex, event.index)) {
        return {
          ...state,
          phase: 'fail',
          failure: { reason: 'wrong', expected, pressed: event.index },
        };
      }
      if (state.inputIndex === state.sequence.length - 1) {
        return { ...state, phase: 'levelUp', inputIndex: state.inputIndex + 1 };
      }
      return { ...state, inputIndex: state.inputIndex + 1 };
    }

    case 'INPUT_TIMEOUT':
      if (state.phase !== 'awaiting') return state;
      return {
        ...state,
        phase: 'fail',
        failure: {
          reason: 'timeout',
          expected: state.sequence[state.inputIndex],
        },
      };

    case 'FAIL_FEEDBACK_FINISHED':
      if (state.phase !== 'fail') return state;
      return { ...state, phase: 'gameOver' };

    case 'NEXT_LEVEL_READY':
      if (state.phase !== 'levelUp') return state;
      return {
        phase: 'showing',
        level: state.level + 1,
        sequence: [...event.sequence],
        inputIndex: 0,
        failure: null,
      };

    default:
      return state;
  }
}
