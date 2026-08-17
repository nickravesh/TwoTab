import { useState, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import {
  type ThemeMode,
  type ResolvedTheme,
  THEME_STORAGE_KEY,
  DEFAULT_THEME_MODE,
  getStoredThemeMode,
  setStoredThemeMode,
  VALID_MODES,
  resolveTheme,
  applyThemeToDOM,
} from '@/lib/theme';

export function useTheme() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode;
        if (stored && VALID_MODES.includes(stored)) return stored;
      } catch (e) {}
    }
    return DEFAULT_THEME_MODE;
  });
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode;
        if (stored && VALID_MODES.includes(stored)) return resolveTheme(stored);
      } catch (e) {}
    }
    return resolveTheme(DEFAULT_THEME_MODE);
  });

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
        const newMode = changes[THEME_STORAGE_KEY].newValue as ThemeMode;
        if (newMode && VALID_MODES.includes(newMode)) {
          if (typeof document === 'undefined' || !document.documentElement.classList.contains('theme-transitioning')) {
            setThemeModeState(newMode);
            const resolved = applyThemeToDOM(newMode);
            setResolvedTheme(resolved);
          }
        }
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
        let x = typeof window !== 'undefined' ? window.innerWidth - 60 : 0;
        let y = 40;

        if (event && 'currentTarget' in event && event.currentTarget instanceof HTMLElement) {
          // Precisely pin the origin to the icon / swatch inside the clicked element
          const iconEl =
            (event.currentTarget.querySelector('svg, img, [style*="background-color"]') as HTMLElement) ||
            event.currentTarget;
          const rect = iconEl.getBoundingClientRect();
          x = rect.left + rect.width / 2;
          y = rect.top + rect.height / 2;
        } else if (
          event &&
          typeof (event as any).clientX === 'number' &&
          typeof (event as any).clientY === 'number'
        ) {
          x = (event as any).clientX;
          y = (event as any).clientY;
        } else if (typeof document !== 'undefined') {
          // Fallback: pin to the theme trigger button in the header if available
          const themeBtn = document.querySelector('button[title*="Theme:"]');
          if (themeBtn) {
            const rect = themeBtn.getBoundingClientRect();
            x = rect.left + rect.width / 2;
            y = rect.top + rect.height / 2;
          }
        }

        const endRadius =
          typeof window !== 'undefined'
            ? Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
            : 1000;

        if (typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.classList.add('theme-transitioning');
        }

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
                const anim = document.documentElement.animate(
                  {
                    clipPath: clipPath,
                  },
                  {
                    duration: 1000,
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    pseudoElement: '::view-transition-new(root)',
                  }
                );
                anim.onfinish = () => {
                  if (typeof document !== 'undefined' && document.documentElement) {
                    document.documentElement.classList.remove('theme-transitioning');
                  }
                };
              } else {
                if (typeof document !== 'undefined' && document.documentElement) {
                  document.documentElement.classList.remove('theme-transitioning');
                }
              }
            })
            .catch(() => {
              if (typeof document !== 'undefined' && document.documentElement) {
                document.documentElement.classList.remove('theme-transitioning');
              }
            });

          if (transition.finished) {
            transition.finished.finally(() => {
              if (typeof document !== 'undefined' && document.documentElement) {
                document.documentElement.classList.remove('theme-transitioning');
              }
            });
          }
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
