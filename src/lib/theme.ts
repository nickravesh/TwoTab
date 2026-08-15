export type ThemeMode = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'twotab_theme_mode';
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';

/**
 * Reads the stored theme mode from chrome.storage.local (defaults to 'dark').
 */
export async function getStoredThemeMode(): Promise<ThemeMode> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(THEME_STORAGE_KEY);
      if (
        data &&
        (data[THEME_STORAGE_KEY] === 'system' ||
          data[THEME_STORAGE_KEY] === 'dark' ||
          data[THEME_STORAGE_KEY] === 'light')
      ) {
        return data[THEME_STORAGE_KEY] as ThemeMode;
      }
    }
  } catch (e) {
    console.error('[TwoTab Theme] Error reading stored theme mode:', e);
  }
  return DEFAULT_THEME_MODE;
}

/**
 * Persists the selected theme mode into chrome.storage.local.
 */
export async function setStoredThemeMode(mode: ThemeMode): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [THEME_STORAGE_KEY]: mode });
    }
  } catch (e) {
    console.error('[TwoTab Theme] Error writing stored theme mode:', e);
  }
}

/**
 * Resolves 'system' against the user's OS preference, or returns the explicit mode.
 */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  }
  return mode;
}

/**
 * Applies the given theme mode to document.documentElement:
 * - Adds or removes the 'dark' CSS class
 * - Sets color-scheme to 'dark' or 'light'
 * Returns the resolved theme ('dark' | 'light').
 */
export function applyThemeToDOM(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  if (typeof document !== 'undefined' && document.documentElement) {
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  }
  return resolved;
}
