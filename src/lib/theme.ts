import { safeStorageSet } from './storage';

export type ThemePalette =
  | 'midnight'
  | 'obsidian'
  | 'nord'
  | 'ocean'
  | 'amber'
  | 'light'
  | 'paper'
  | 'frost'
  | 'rose';

export type ThemeMode = 'system' | 'dark' | 'light' | ThemePalette;
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'twotab_theme_mode';
export const DEFAULT_THEME_MODE: ThemeMode = 'midnight';

export interface ThemeOption {
  id: ThemePalette;
  name: string;
  category: 'dark' | 'light';
  bgHex: string;
  accentHex: string;
  description: string;
}

export const THEME_PALETTES: ThemeOption[] = [
  {
    id: 'midnight',
    name: 'macOS Midnight',
    category: 'dark',
    bgHex: '#131316',
    accentHex: '#585bf0',
    description: 'Titanium graphite & Apple system indigo',
  },
  {
    id: 'obsidian',
    name: 'Raycast Obsidian',
    category: 'dark',
    bgHex: '#0a0a0d',
    accentHex: '#7c4deb',
    description: 'Pitch-black OLED & electric violet',
  },
  {
    id: 'nord',
    name: 'Nordic Aurora',
    category: 'dark',
    bgHex: '#0f1513',
    accentHex: '#10b981',
    description: 'Sub-arctic pine & emerald aurora mint',
  },
  {
    id: 'ocean',
    name: 'Cyber Ocean',
    category: 'dark',
    bgHex: '#0f141c',
    accentHex: '#06b6d4',
    description: 'Abyssal deep navy & electric cyan glow',
  },
  {
    id: 'amber',
    name: 'Sunset Charcoal',
    category: 'dark',
    bgHex: '#141210',
    accentHex: '#f59e0b',
    description: 'Basalt charcoal & golden amber glow',
  },
  {
    id: 'light',
    name: 'macOS Studio',
    category: 'light',
    bgHex: '#f3f4f7',
    accentHex: '#4b42e4',
    description: 'Frosted gallery canvas & studio indigo',
  },
  {
    id: 'paper',
    name: 'Warm Linen',
    category: 'light',
    bgHex: '#f5f1ea',
    accentHex: '#bf4908',
    description: 'Cozy linen paper & terracotta accent',
  },
  {
    id: 'frost',
    name: 'Glacial Mist',
    category: 'light',
    bgHex: '#edf4f3',
    accentHex: '#0c7a70',
    description: 'Sub-zero arctic mist & pine teal',
  },
  {
    id: 'rose',
    name: 'Porcelain Rosé',
    category: 'light',
    bgHex: '#f7eff1',
    accentHex: '#db1440',
    description: 'Blushing silk & vibrant raspberry',
  },
];

export const VALID_MODES: ThemeMode[] = [
  'system',
  'dark',
  'light',
  'midnight',
  'obsidian',
  'nord',
  'ocean',
  'amber',
  'light',
  'paper',
  'frost',
  'rose',
];

/**
 * Reads the stored theme mode from chrome.storage.local (defaults to 'midnight').
 */
export async function getStoredThemeMode(): Promise<ThemeMode> {
  try {
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(THEME_STORAGE_KEY);
      if (cached && VALID_MODES.includes(cached as ThemeMode)) {
        return cached as ThemeMode;
      }
    }
  } catch (e) {}

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(THEME_STORAGE_KEY);
      if (data && VALID_MODES.includes(data[THEME_STORAGE_KEY] as ThemeMode)) {
        return data[THEME_STORAGE_KEY] as ThemeMode;
      }
    }
  } catch (e) {
    console.error('[TwoTab Theme] Error reading stored theme mode:', e);
  }
  return DEFAULT_THEME_MODE;
}

/**
 * Persists the selected theme mode into both localStorage (instant sync) and chrome.storage.local.
 */
export async function setStoredThemeMode(mode: ThemeMode): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    }
  } catch (e) {}

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await safeStorageSet({ [THEME_STORAGE_KEY]: mode });
    }
  } catch (e) {
    console.error('[TwoTab Theme] Error writing stored theme mode:', e);
  }
}

/**
 * Resolves 'system' against the user's OS preference, or returns whether the palette is dark or light.
 */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  }
  const found = THEME_PALETTES.find((p) => p.id === mode);
  if (found) {
    return found.category;
  }
  return mode === 'light' ? 'light' : 'dark';
}

/**
 * Resolves the active theme palette identifier from a ThemeMode.
 */
export function resolvePalette(mode: ThemeMode): ThemePalette {
  if (mode === 'system') {
    const isDark =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : true;
    return isDark ? 'midnight' : 'light';
  }
  if (mode === 'dark') return 'midnight';
  return mode;
}

/**
 * Applies the given theme mode to document.documentElement:
 * - Sets the data-theme attribute
 * - Adds or removes the 'dark' CSS class
 * - Sets color-scheme to 'dark' or 'light'
 * - Caches mode synchronously in localStorage for zero-flash page boots
 * Returns the resolved theme ('dark' | 'light').
 */
export function applyThemeToDOM(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  const palette = resolvePalette(mode);

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (e) {}
  }

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-theme', palette);
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
