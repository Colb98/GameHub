/**
 * GameHub SDK — protocol v1.
 *
 * The portal embeds games in a sandboxed iframe on a separate origin and talks
 * to them exclusively through postMessage. Games never hold API credentials:
 * they receive an opaque session context and report results; the portal shell
 * performs the actual API calls.
 *
 * Handshake:  game -> `ready`  ->  shell -> `init`  ->  game plays
 * Game over:  game -> `gameOver { score, durationMs }` -> shell submits score
 */

export const PROTOCOL_VERSION = 1;

export type Orientation = 'LANDSCAPE' | 'PORTRAIT' | 'BOTH';

export interface InitPayload {
  locale: string;
  player: { name: string } | null;
  orientation: Orientation;
  muted: boolean;
}

export interface GameOverPayload {
  score: number;
  durationMs: number;
  meta?: Record<string, unknown>;
}

interface Envelope {
  gh: number;
  type: string;
  payload?: unknown;
}

function isEnvelope(data: unknown): data is Envelope {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Envelope).gh === PROTOCOL_VERSION &&
    typeof (data as Envelope).type === 'string'
  );
}

// ---------------------------------------------------------------------------
// Game side — call this from inside the game bundle
// ---------------------------------------------------------------------------

export interface GameHubClient {
  /** True when the game is running outside the portal (local dev). */
  standalone: boolean;
  locale: string;
  playerName: string | null;
  orientation: Orientation;
  muted: boolean;
  /** Report the final result. Call exactly once per run. */
  gameOver(result: GameOverPayload): void;
}

const INIT_TIMEOUT_MS = 3000;

/**
 * Announces readiness to the portal shell and resolves with the play context.
 * Falls back to standalone mode when not embedded (or the shell never answers),
 * so game bundles stay runnable on their own during development.
 */
export function initGameHub(): Promise<GameHubClient> {
  return new Promise((resolve) => {
    const standaloneClient = (): GameHubClient => ({
      standalone: true,
      locale: 'en',
      playerName: null,
      orientation: 'BOTH',
      muted: false,
      gameOver: (result) =>
        console.info('[GameHub SDK] standalone gameOver:', result),
    });

    if (window.parent === window) {
      resolve(standaloneClient());
      return;
    }

    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        window.removeEventListener('message', onMessage);
        resolve(standaloneClient());
      }
    }, INIT_TIMEOUT_MS);

    function onMessage(event: MessageEvent) {
      if (!isEnvelope(event.data) || event.data.type !== 'init') return;
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      const init = event.data.payload as InitPayload;
      let reported = false;
      resolve({
        standalone: false,
        locale: init.locale,
        playerName: init.player?.name ?? null,
        orientation: init.orientation,
        muted: init.muted,
        gameOver(result: GameOverPayload) {
          if (reported) return;
          reported = true;
          window.parent.postMessage(
            { gh: PROTOCOL_VERSION, type: 'gameOver', payload: result },
            '*',
          );
        },
      });
    }

    window.addEventListener('message', onMessage);
    window.parent.postMessage({ gh: PROTOCOL_VERSION, type: 'ready' }, '*');
  });
}

// ---------------------------------------------------------------------------
// Host side — used by the portal's player shell around the iframe
// ---------------------------------------------------------------------------

export interface GameHostOptions {
  /** Origin the game bundle is served from; '*' only acceptable in local dev. */
  gameOrigin: string;
  init: InitPayload;
  onReady?: () => void;
  onGameOver: (result: GameOverPayload) => void;
}

export interface GameHost {
  dispose(): void;
}

export function createGameHost(
  iframe: HTMLIFrameElement,
  options: GameHostOptions,
): GameHost {
  function onMessage(event: MessageEvent) {
    if (options.gameOrigin !== '*' && event.origin !== options.gameOrigin) return;
    if (event.source !== iframe.contentWindow) return;
    if (!isEnvelope(event.data)) return;

    if (event.data.type === 'ready') {
      iframe.contentWindow?.postMessage(
        { gh: PROTOCOL_VERSION, type: 'init', payload: options.init },
        options.gameOrigin,
      );
      options.onReady?.();
    } else if (event.data.type === 'gameOver') {
      const p = event.data.payload as GameOverPayload;
      if (typeof p?.score === 'number' && typeof p?.durationMs === 'number') {
        options.onGameOver(p);
      }
    }
  }

  window.addEventListener('message', onMessage);
  return {
    dispose() {
      window.removeEventListener('message', onMessage);
    },
  };
}
