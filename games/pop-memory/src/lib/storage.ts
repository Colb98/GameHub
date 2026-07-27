export interface PlayerStats {
  version: 2;
  bestLevel: number;
  totalGames: number;
  soundEnabled: boolean;
}

const STORAGE_KEY = 'pop-memory:player';
const defaults: PlayerStats = {
  version: 2,
  bestLevel: 0,
  totalGames: 0,
  soundEnabled: true,
};

let memoryFallback: PlayerStats = { ...defaults };

function sanitize(value: unknown): PlayerStats {
  if (!value || typeof value !== 'object') return { ...defaults };
  const candidate = value as {
    version?: unknown;
    bestLevel?: unknown;
    totalGames?: unknown;
    soundEnabled?: unknown;
  };
  return {
    version: 2,
    bestLevel:
      typeof candidate.bestLevel === 'number' && candidate.bestLevel >= 0
        ? Math.floor(candidate.bestLevel)
        : 0,
    totalGames:
      typeof candidate.totalGames === 'number' && candidate.totalGames >= 0
        ? Math.floor(candidate.totalGames)
        : 0,
    // Version 1 shipped muted by default, which made first-time phone testing
    // appear broken. Migrate it to audible; version 2 then preserves explicit
    // user changes normally.
    soundEnabled: candidate.version === 1 ? true : candidate.soundEnabled !== false,
  };
}

export function loadStats(): PlayerStats {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...memoryFallback };
    memoryFallback = sanitize(JSON.parse(raw));
  } catch {
    // Storage can throw in privacy modes; the session still works in memory.
  }
  return { ...memoryFallback };
}

export function saveStats(stats: PlayerStats): void {
  memoryFallback = sanitize(stats);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryFallback));
  } catch {
    // Keep the in-memory value when persistent storage is unavailable.
  }
}
