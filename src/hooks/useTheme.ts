import { useState, useEffect, useCallback } from 'react';
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
      const resolved = applyThemeToDOM(mode, false);
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
        const resolved = applyThemeToDOM(newMode, true);
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
          const resolved = applyThemeToDOM('system', true);
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

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    const resolved = applyThemeToDOM(mode, true);
    setResolvedTheme(resolved);
    await setStoredThemeMode(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    const nextMode: ThemeMode =
      themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'system' : 'dark';
    setThemeMode(nextMode);
  }, [themeMode, setThemeMode]);

  return {
    themeMode,
    resolvedTheme,
    setThemeMode,
    toggleTheme,
  };
}
