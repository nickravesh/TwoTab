import { useState, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import {
  type ThemeMode,
  type ResolvedTheme,
  THEME_STORAGE_KEY,
  DEFAULT_THEME_MODE,
  getStoredThemeMode,
  setStoredThemeMode,
  resolveTheme,
  applyThemeToDOM,
} from '@/lib/theme';

export function useTheme() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(DEFAULT_THEME_MODE));

  // Initialize and apply theme on mount
  useEffect(() => {
    let mounted = true;

    getStoredThemeMode().then((mode) => {
      if (!mounted) return;
      setThemeModeState(mode);
      const resolved = applyThemeToDOM(mode);
      setResolvedTheme(resolved);
    });

    // 1. Cross-window and cross-context sync via chrome.storage.onChanged
    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName === 'local' && changes[THEME_STORAGE_KEY]) {
        const newMode = (changes[THEME_STORAGE_KEY].newValue as ThemeMode) || DEFAULT_THEME_MODE;
        setThemeModeState(newMode);
        const resolved = applyThemeToDOM(newMode);
        setResolvedTheme(resolved);
      }
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(storageListener);
    }

    // 2. OS color scheme change listener for 'system' mode
    const mediaQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    const handleMediaChange = () => {
      getStoredThemeMode().then((mode) => {
        if (!mounted) return;
        if (mode === 'system') {
          const resolved = applyThemeToDOM('system');
          setResolvedTheme(resolved);
        }
      });
    };

    if (mediaQuery) {
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleMediaChange);
      } else if ((mediaQuery as any).addListener) {
        (mediaQuery as any).addListener(handleMediaChange);
      }
    }

    return () => {
      mounted = false;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.removeListener(storageListener);
      }
      if (mediaQuery) {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', handleMediaChange);
        } else if ((mediaQuery as any).removeListener) {
          (mediaQuery as any).removeListener(handleMediaChange);
        }
      }
    };
  }, []);

  const setThemeMode = useCallback(
    async (mode: ThemeMode, event?: React.MouseEvent | { clientX: number; clientY: number }) => {
      const prefersReducedMotion =
        typeof window !== 'undefined' && window.matchMedia
          ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
          : false;

      const docWithTransitions =
        typeof document !== 'undefined'
          ? (document as Document & {
              startViewTransition?: (callback: () => void) => {
                ready: Promise<void>;
                finished: Promise<void>;
              };
            })
          : null;

      const applyUpdates = () => {
        setThemeModeState(mode);
        const resolved = applyThemeToDOM(mode);
        setResolvedTheme(resolved);
      };

      if (
        docWithTransitions &&
        typeof docWithTransitions.startViewTransition === 'function' &&
        !prefersReducedMotion
      ) {
        const x = event?.clientX ?? (typeof window !== 'undefined' ? window.innerWidth - 60 : 0);
        const y = event?.clientY ?? 40;
        const endRadius =
          typeof window !== 'undefined'
            ? Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
            : 1000;

        const transition = docWithTransitions.startViewTransition(() => {
          flushSync(() => {
            applyUpdates();
          });
        });

        if (transition && transition.ready) {
          transition.ready
            .then(() => {
              const clipPath = [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${endRadius}px at ${x}px ${y}px)`,
              ];

              if (typeof document.documentElement.animate === 'function') {
                document.documentElement.animate(
                  {
                    clipPath: clipPath,
                  },
                  {
                    duration: 500,
                    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                    pseudoElement: '::view-transition-new(root)',
                  }
                );
              }
            })
            .catch(() => {
              // Ignore if cancelled
            });
        }
      } else {
        applyUpdates();
      }

      await setStoredThemeMode(mode);
    },
    []
  );

  const toggleTheme = useCallback(
    (event?: React.MouseEvent | { clientX: number; clientY: number }) => {
      const nextMode: ThemeMode =
        themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'system' : 'dark';
      setThemeMode(nextMode, event);
    },
    [themeMode, setThemeMode]
  );

  return {
    themeMode,
    resolvedTheme,
    setThemeMode,
    toggleTheme,
  };
}
