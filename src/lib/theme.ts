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
    bgHex: '#0e0e10',
    accentHex: '#5e5ce6',
    description: 'Apple HIG slate & system indigo',
  },
  {
    id: 'obsidian',
    name: 'Raycast Obsidian',
    category: 'dark',
    bgHex: '#050506',
    accentHex: '#8b5cf6',
    description: 'Deep pitch black & electric violet',
  },
  {
    id: 'nord',
    name: 'Nordic Forest',
    category: 'dark',
    bgHex: '#0b1311',
    accentHex: '#10b981',
    description: 'Deep spruce & mint emerald',
  },
  {
    id: 'ocean',
    name: 'Cyber Ocean',
    category: 'dark',
    bgHex: '#080d1a',
    accentHex: '#06b6d4',
    description: 'Abyssal navy & electric cyan glow',
  },
  {
    id: 'amber',
    name: 'Sunset Amber',
    category: 'dark',
    bgHex: '#12100e',
    accentHex: '#f59e0b',
    description: 'Charcoal slate & warm sunset amber',
  },
  {
    id: 'light',
    name: 'Studio Clean',
    category: 'light',
    bgHex: '#ffffff',
    accentHex: '#4f46e5',
    description: 'Crisp studio white & indigo',
  },
  {
    id: 'paper',
    name: 'Warm Paper',
    category: 'light',
    bgHex: '#fbf8f3',
    accentHex: '#ea580c',
    description: 'Cozy linen cream & terracotta',
  },
  {
    id: 'frost',
    name: 'Nordic Frost',
    category: 'light',
    bgHex: '#f0f7f6',
    accentHex: '#0d9488',
    description: 'Glacial mist & teal emerald',
  },
  {
    id: 'rose',
    name: 'Rose Quartz',
    category: 'light',
    bgHex: '#fdf2f4',
    accentHex: '#e11d48',
    description: 'Porcelain rosé & vibrant berry',
  },
];

const VALID_MODES: ThemeMode[] = [
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
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(THEME_STORAGE_KEY);
      if (data && VALID_MODES.includes(data[THEME_STORAGE_KEY])) {
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

let transitionTimeout: ReturnType<typeof setTimeout> | null = null;

export interface ThemeTransitionOrigin {
  x: number;
  y: number;
}

/**
 * Spawns a radial shockwave ripple originating from (x, y) that expands across the entire viewport.
 */
function spawnThemeRipple(palette: ThemePalette, origin?: ThemeTransitionOrigin) {
  if (typeof document === 'undefined' || typeof window === 'undefined' || !document.body) return;

  const themeInfo = THEME_PALETTES.find((p) => p.id === palette);
  if (!themeInfo) return;

  const x = origin?.x ?? (typeof window !== 'undefined' ? window.innerWidth - 60 : 0);
  const y = origin?.y ?? 40;

  const maxRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );
  const diameter = Math.ceil(maxRadius * 2.4);

  const ripple = document.createElement('div');
  ripple.className = 'twotab-theme-ripple';
  ripple.style.cssText = `
    position: fixed;
    top: ${y}px;
    left: ${x}px;
    width: ${diameter}px;
    height: ${diameter}px;
    margin-top: -${diameter / 2}px;
    margin-left: -${diameter / 2}px;
    border-radius: 50%;
    background: ${themeInfo.bgHex};
    border: 2px solid ${themeInfo.accentHex}99;
    box-shadow: 0 0 60px ${themeInfo.accentHex}60, inset 0 0 80px ${themeInfo.accentHex}40;
    pointer-events: none;
    z-index: 999999;
    transform: scale(0.01);
    opacity: 0.95;
    will-change: transform, opacity;
    transition: transform 450ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease-out 300ms;
  `;

  document.body.appendChild(ripple);

  // Trigger expansion on next animation frame
  requestAnimationFrame(() => {
    ripple.style.transform = 'scale(1)';
    ripple.style.opacity = '0';
  });

  // Remove element once animation completes
  setTimeout(() => {
    if (ripple.parentNode) {
      ripple.parentNode.removeChild(ripple);
    }
  }, 600);
}

/**
 * Applies the given theme mode to document.documentElement:
 * - Sets the data-theme attribute
 * - Adds or removes the 'dark' CSS class
 * - Sets color-scheme to 'dark' or 'light'
 * - Triggers an eye-catching radial circular ripple wave animation from click origin
 * Returns the resolved theme ('dark' | 'light').
 */
export function applyThemeToDOM(
  mode: ThemeMode,
  animated = false,
  origin?: ThemeTransitionOrigin
): ResolvedTheme {
  const resolved = resolveTheme(mode);
  const palette = resolvePalette(mode);

  if (typeof document !== 'undefined' && document.documentElement) {
    const prefersReducedMotion =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

    const performDomUpdate = () => {
      document.documentElement.setAttribute('data-theme', palette);
      if (resolved === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = 'dark';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.style.colorScheme = 'light';
      }
    };

    if (animated && !prefersReducedMotion) {
      // 1. Trigger the visual radial ripple shockwave
      spawnThemeRipple(palette, origin);

      // 2. Add smooth CSS transitions to all surfaces and borders
      document.documentElement.classList.add('theme-transitioning');
      performDomUpdate();

      if (transitionTimeout) clearTimeout(transitionTimeout);
      transitionTimeout = setTimeout(() => {
        if (typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.classList.remove('theme-transitioning');
        }
      }, 500);
    } else {
      performDomUpdate();
    }
  }
  return resolved;
}
