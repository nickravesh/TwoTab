import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  type ThemeMode,
  THEME_STORAGE_KEY,
  DEFAULT_THEME_MODE,
  getStoredThemeMode,
  setStoredThemeMode,
  resolveTheme,
  applyThemeToDOM,
} from './theme';

// Mock DOM elements for Node environment
class MockDOMTokenList {
  private classes = new Set<string>();
  add(c: string) {
    this.classes.add(c);
  }
  remove(c: string) {
    this.classes.delete(c);
  }
  contains(c: string) {
    return this.classes.has(c);
  }
  clear() {
    this.classes.clear();
  }
}

const mockDocumentElement = {
  classList: new MockDOMTokenList(),
  style: { colorScheme: '' },
};

(globalThis as any).document = {
  documentElement: mockDocumentElement,
};

(globalThis as any).window = {
  matchMedia: vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
};

describe('TwoTab Theme Engine Unit Tests', () => {
  let mockStorage: Record<string, any> = {};

  beforeEach(() => {
    mockStorage = {};

    // Mock chrome.storage.local
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: vi.fn((key: string) => {
            return Promise.resolve({ [key]: mockStorage[key] });
          }),
          set: vi.fn((data: Record<string, any>) => {
            Object.assign(mockStorage, data);
            return Promise.resolve();
          }),
        },
      },
    };

    // Clean documentElement classes and styles
    mockDocumentElement.classList.clear();
    mockDocumentElement.style.colorScheme = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Theme Resolution
  // ---------------------------------------------------------------------------
  it('resolveTheme: resolves explicit "dark" mode to "dark"', () => {
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('resolveTheme: resolves explicit "light" mode to "light"', () => {
    expect(resolveTheme('light')).toBe('light');
  });

  it('resolveTheme: resolves "system" mode based on matchMedia prefers-color-scheme', () => {
    // Mock matchMedia returning dark preference
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(resolveTheme('system')).toBe('dark');

    // Mock matchMedia returning light preference
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(resolveTheme('system')).toBe('light');
  });

  // ---------------------------------------------------------------------------
  // 2. DOM Class and Style Application
  // ---------------------------------------------------------------------------
  it('applyThemeToDOM: adds "dark" class and sets color-scheme for dark mode', () => {
    const resolved = applyThemeToDOM('dark');
    expect(resolved).toBe('dark');
    expect(mockDocumentElement.classList.contains('dark')).toBe(true);
    expect(mockDocumentElement.style.colorScheme).toBe('dark');
  });

  it('applyThemeToDOM: removes "dark" class and sets color-scheme for light mode', () => {
    // First set dark
    mockDocumentElement.classList.add('dark');
    mockDocumentElement.style.colorScheme = 'dark';

    const resolved = applyThemeToDOM('light');
    expect(resolved).toBe('light');
    expect(mockDocumentElement.classList.contains('dark')).toBe(false);
    expect(mockDocumentElement.style.colorScheme).toBe('light');
  });

  // ---------------------------------------------------------------------------
  // 3. Storage Persistence
  // ---------------------------------------------------------------------------
  it('getStoredThemeMode: returns default "dark" if nothing stored', async () => {
    const mode = await getStoredThemeMode();
    expect(mode).toBe(DEFAULT_THEME_MODE);
  });

  it('setStoredThemeMode: stores theme mode and getStoredThemeMode retrieves it', async () => {
    await setStoredThemeMode('light');
    expect(mockStorage[THEME_STORAGE_KEY]).toBe('light');

    const retrieved = await getStoredThemeMode();
    expect(retrieved).toBe('light');

    await setStoredThemeMode('system');
    expect(mockStorage[THEME_STORAGE_KEY]).toBe('system');

    const systemMode = await getStoredThemeMode();
    expect(systemMode).toBe('system');
  });
});
