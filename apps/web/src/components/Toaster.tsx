'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

interface Toast {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

const ToastContext = createContext<(toast: Toast | string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const TOAST_MS = 3200;

/** Prototype-style toast: dark pill, bottom-center, optional accent action. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((t: Toast | string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(typeof t === 'string' ? { message: t } : t);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[999] flex -translate-x-1/2 items-center gap-3.5 rounded-[10px] bg-ink px-4.5 py-2.5 text-[13px] text-canvas shadow-[0_8px_24px_rgba(0,0,0,.25)] max-lg:bottom-20">
          <span>{toast.message}</span>
          {toast.actionLabel && (
            <button
              className="cursor-pointer text-[13px] font-bold text-accent"
              onClick={() => {
                toast.onAction?.();
                if (timer.current) clearTimeout(timer.current);
                setToast(null);
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}
