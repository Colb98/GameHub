'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/client-api';
import type { GameCard } from '@/lib/types';
import { useToast } from './Toaster';

interface FavoritesContextValue {
  /** null until the first fetch settles; empty list when logged out. */
  favorites: GameCard[] | null;
  /** false when the visitor has no account session. */
  loggedIn: boolean | null;
  isFavorite(gameId: string): boolean;
  toggle(game: { id: string; name: string }): Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue>({
  favorites: null,
  loggedIn: null,
  isFavorite: () => false,
  toggle: async () => {},
});

export function useFavorites() {
  return useContext(FavoritesContext);
}

/** Fetches the account's favorites once and exposes an optimistic toggle with
 *  prototype-style toasts (added/removed + Undo). */
export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const t = useTranslations('game');
  const showToast = useToast();
  const [favorites, setFavorites] = useState<GameCard[] | null>(null);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    api<GameCard[]>(`/me/favorites?locale=${locale}`)
      .then((list) => {
        if (!active) return;
        setFavorites(list);
        setIds(new Set(list.map((g) => g.id)));
        setLoggedIn(true);
      })
      .catch(() => {
        if (!active) return;
        setFavorites([]);
        setLoggedIn(false);
      });
    return () => {
      active = false;
    };
  }, [locale]);

  const refresh = useCallback(async () => {
    try {
      const list = await api<GameCard[]>(`/me/favorites?locale=${locale}`);
      setFavorites(list);
      setIds(new Set(list.map((g) => g.id)));
    } catch {
      /* keep optimistic state */
    }
  }, [locale]);

  const doToggle = useCallback(
    async (game: { id: string; name: string }, silent = false): Promise<void> => {
      const wasFav = ids.has(game.id);
      // Optimistic flip
      setIds((prev) => {
        const next = new Set(prev);
        if (wasFav) next.delete(game.id);
        else next.add(game.id);
        return next;
      });
      try {
        await api(`/games/${game.id}/favorite`, {
          method: wasFav ? 'DELETE' : 'PUT',
          ...(wasFav ? {} : { body: JSON.stringify({}) }),
        });
        if (!silent) {
          showToast({
            message: wasFav
              ? t('favRemoved', { name: game.name })
              : t('favAdded', { name: game.name }),
            actionLabel: t('undo'),
            onAction: () => void doToggle(game, true),
          });
        }
        void refresh();
      } catch (err) {
        // Revert the optimistic flip
        setIds((prev) => {
          const next = new Set(prev);
          if (wasFav) next.add(game.id);
          else next.delete(game.id);
          return next;
        });
        if (err instanceof ApiError && err.status === 401) {
          showToast(t('loginForFav'));
        }
      }
    },
    [ids, refresh, showToast, t],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favorites,
      loggedIn,
      isFavorite: (gameId) => ids.has(gameId),
      toggle: (game) => doToggle(game),
    }),
    [favorites, loggedIn, ids, doToggle],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}
