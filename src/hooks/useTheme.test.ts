import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTheme } from './useTheme';
import {
  THEME_STORAGE_KEY,
  DEFAULT_THEME_MODE,
} from '@/lib/theme';

describe('useTheme Hook & View Transition Ripple Architecture', () => {
  let mockStorageStore: Record<string, any> = {};
  let storageListeners: Array<(changes: Record<string, any>, area: string) => void> = [];
  let mediaQueryListeners: Array<() => void> = [];
  let prefersDark = true;
  let prefersReducedMotion = false;

  beforeEach(() => {
    mockStorageStore = {};
    storageListeners = [];
    mediaQueryListeners = [];
    prefersDark = true;
    prefersReducedMotion = false;
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';

    // Mock chrome with storage and runtime
    (globalThis as any).chrome = {
      runtime: {
        lastError: null,
      },
      storage: {
        local: {
          get: vi.fn((key: string) => Promise.resolve({ [key]: mockStorageStore[key] })),
          set: vi.fn((items: Record<string, any>, cb?: () => void) => {
            Object.assign(mockStorageStore, items);
            if (cb) cb();
            return Promise.resolve();
          }),
        },
        onChanged: {
          addListener: vi.fn((fn) => storageListeners.push(fn)),
          removeListener: vi.fn((fn) => {
            storageListeners = storageListeners.filter((l) => l !== fn);
          }),
        },
      },
    };

    // Mock matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      if (query.includes('prefers-color-scheme: dark')) {
        return {
          matches: prefersDark,
          media: query,
          onchange: null,
          addListener: vi.fn((fn) => mediaQueryListeners.push(fn)),
          removeListener: vi.fn((fn) => {
            mediaQueryListeners = mediaQueryListeners.filter((l) => l !== fn);
          }),
          addEventListener: vi.fn((_, fn) => mediaQueryListeners.push(fn)),
          removeEventListener: vi.fn((_, fn) => {
            mediaQueryListeners = mediaQueryListeners.filter((l) => l !== fn);
          }),
          dispatchEvent: vi.fn(),
        };
      }
      if (query.includes('prefers-reduced-motion')) {
        return {
          matches: prefersReducedMotion,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        };
      }
      return {
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default theme mode when storage is empty', async () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.themeMode).toBe(DEFAULT_THEME_MODE);
    expect(result.current.resolvedTheme).toBeDefined();

    await act(async () => {
      await Promise.resolve();
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('restores stored theme mode from localStorage / chrome storage', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'obsidian');
    mockStorageStore[THEME_STORAGE_KEY] = 'obsidian';

    const { result } = renderHook(() => useTheme());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.themeMode).toBe('obsidian');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('obsidian');
  });

  it('updates theme mode and persists to both storage engines', async () => {
    const { result } = renderHook(() => useTheme());

    // Settle initial mount
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.setThemeMode('paper');
    });

    expect(result.current.themeMode).toBe('paper');
    expect(result.current.resolvedTheme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('paper');
    expect(mockStorageStore[THEME_STORAGE_KEY]).toBe('paper');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('paper');
  });

  it('cycles theme mode sequentially through toggleTheme', async () => {
    const { result } = renderHook(() => useTheme());

    // Settle initial mount
    await act(async () => {
      await Promise.resolve();
    });

    // Starts dark
    await act(async () => {
      await result.current.setThemeMode('dark');
    });
    expect(result.current.themeMode).toBe('dark');

    // dark -> light
    await act(async () => {
      result.current.toggleTheme();
    });
    expect(result.current.themeMode).toBe('light');

    // light -> system
    await act(async () => {
      result.current.toggleTheme();
    });
    expect(result.current.themeMode).toBe('system');

    // system -> dark
    await act(async () => {
      result.current.toggleTheme();
    });
    expect(result.current.themeMode).toBe('dark');
  });

  it('executes circular view transition with duration 1000ms when startViewTransition is supported', async () => {
    let animateOptions: any = null;
    let animOnFinish: (() => void) | null = null;
    let resolveFinished: () => void = () => {};
    const finishedPromise = new Promise<void>((r) => {
      resolveFinished = r;
    });

    (document as any).startViewTransition = vi.fn().mockImplementation((cb: () => void) => {
      cb();
      return {
        ready: Promise.resolve(),
        finished: finishedPromise,
      };
    });

    (document.documentElement as any).animate = vi.fn().mockImplementation((_keyframes: any, options: any) => {
      animateOptions = options;
      return {
        set onfinish(fn: () => void) {
          animOnFinish = fn;
        },
      };
    });

    const { result } = renderHook(() => useTheme());

    // Settle initial mount
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.setThemeMode('nord', { clientX: 200, clientY: 150 });
    });

    // Check transition setup
    expect((document as any).startViewTransition).toHaveBeenCalled();
    expect(animateOptions).toEqual(
      expect.objectContaining({
        duration: 1000,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        pseudoElement: '::view-transition-new(root)',
      })
    );

    // Verify theme-transitioning class added during animation
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(true);

    // When animation completes and transition finishes, theme-transitioning class is removed
    await act(async () => {
      if (animOnFinish) animOnFinish();
      resolveFinished();
      await finishedPromise;
    });
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(false);
  });

  it('bypasses startViewTransition when user prefers-reduced-motion', async () => {
    prefersReducedMotion = true;

    (document as any).startViewTransition = vi.fn();

    const { result } = renderHook(() => useTheme());

    // Settle initial mount
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.setThemeMode('amber');
    });

    expect((document as any).startViewTransition).not.toHaveBeenCalled();
    expect(result.current.themeMode).toBe('amber');
    expect(document.documentElement.getAttribute('data-theme')).toBe('amber');
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(false);
  });

  it('guards against background storage sync events during active theme transition', async () => {
    const { result } = renderHook(() => useTheme());

    // Settle initial mount
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.setThemeMode('midnight');
    });
    expect(result.current.themeMode).toBe('midnight');

    // Simulate active transition by adding the theme-transitioning class
    document.documentElement.classList.add('theme-transitioning');

    // Trigger storage change from another window/tab
    act(() => {
      for (const listener of storageListeners) {
        listener(
          {
            [THEME_STORAGE_KEY]: {
              oldValue: 'midnight',
              newValue: 'paper',
            },
          },
          'local'
        );
      }
    });

    // Storage event MUST be ignored during theme-transitioning to avoid visual disruption
    expect(result.current.themeMode).toBe('midnight');
    expect(document.documentElement.getAttribute('data-theme')).toBe('midnight');

    // Once theme-transitioning class is removed, subsequent storage updates apply cleanly
    document.documentElement.classList.remove('theme-transitioning');

    act(() => {
      for (const listener of storageListeners) {
        listener(
          {
            [THEME_STORAGE_KEY]: {
              oldValue: 'midnight',
              newValue: 'paper',
            },
          },
          'local'
        );
      }
    });

    expect(result.current.themeMode).toBe('paper');
    expect(document.documentElement.getAttribute('data-theme')).toBe('paper');
  });

  it('reacts dynamically to OS color scheme changes when in system mode', async () => {
    mockStorageStore[THEME_STORAGE_KEY] = 'system';
    localStorage.setItem(THEME_STORAGE_KEY, 'system');

    const { result } = renderHook(() => useTheme());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.themeMode).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark');

    // Change OS preference to light
    prefersDark = false;

    await act(async () => {
      for (const listener of mediaQueryListeners) {
        listener();
      }
    });

    await waitFor(() => {
      expect(result.current.resolvedTheme).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe('light');
    });
  });
});
