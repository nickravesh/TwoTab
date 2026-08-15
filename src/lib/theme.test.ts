import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  type ThemeMode,
  THEME_STORAGE_KEY,
  DEFAULT_THEME_MODE,
  THEME_PALETTES,
  getStoredThemeMode,
  setStoredThemeMode,
  resolveTheme,
  resolvePalette,
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
  attributes: new Map<string, string>(),
  setAttribute(key: string, val: string) {
    this.attributes.set(key, val);
  },
  getAttribute(key: string) {
    return this.attributes.get(key);
  },
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

    // Clean documentElement classes, attributes, and styles
    mockDocumentElement.classList.clear();
    mockDocumentElement.attributes.clear();
    mockDocumentElement.style.colorScheme = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Theme Resolution & Palettes
  // ---------------------------------------------------------------------------
  it('resolveTheme: resolves dark palette modes to "dark"', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('midnight')).toBe('dark');
    expect(resolveTheme('obsidian')).toBe('dark');
    expect(resolveTheme('nord')).toBe('dark');
    expect(resolveTheme('ocean')).toBe('dark');
    expect(resolveTheme('amber')).toBe('dark');
  });

  it('resolveTheme: resolves light palette modes to "light"', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('paper')).toBe('light');
  });

  it('resolvePalette: maps legacy and specific theme modes to valid palettes', () => {
    expect(resolvePalette('dark')).toBe('midnight');
    expect(resolvePalette('midnight')).toBe('midnight');
    expect(resolvePalette('obsidian')).toBe('obsidian');
    expect(resolvePalette('nord')).toBe('nord');
    expect(resolvePalette('ocean')).toBe('ocean');
    expect(resolvePalette('amber')).toBe('amber');
    expect(resolvePalette('light')).toBe('light');
    expect(resolvePalette('paper')).toBe('paper');
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
    expect(resolvePalette('system')).toBe('midnight');

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
    expect(resolvePalette('system')).toBe('light');
  });

  it('THEME_PALETTES: defines 7 curated palettes with complete metadata', () => {
    expect(THEME_PALETTES.length).toBe(7);
    const ids = THEME_PALETTES.map((p) => p.id);
    expect(ids).toContain('midnight');
    expect(ids).toContain('obsidian');
    expect(ids).toContain('nord');
    expect(ids).toContain('ocean');
    expect(ids).toContain('amber');
    expect(ids).toContain('light');
    expect(ids).toContain('paper');
  });

  // ---------------------------------------------------------------------------
  // 2. DOM Class, Attribute, and Style Application
  // ---------------------------------------------------------------------------
  it('applyThemeToDOM: adds "dark" class, sets data-theme, and sets color-scheme for dark mode', () => {
    const resolved = applyThemeToDOM('obsidian');
    expect(resolved).toBe('dark');
    expect(mockDocumentElement.classList.contains('dark')).toBe(true);
    expect(mockDocumentElement.style.colorScheme).toBe('dark');
    expect(mockDocumentElement.getAttribute('data-theme')).toBe('obsidian');
  });

  it('applyThemeToDOM: removes "dark" class and sets data-theme for light mode', () => {
    mockDocumentElement.classList.add('dark');
    mockDocumentElement.style.colorScheme = 'dark';

    const resolved = applyThemeToDOM('paper');
    expect(resolved).toBe('light');
    expect(mockDocumentElement.classList.contains('dark')).toBe(false);
    expect(mockDocumentElement.style.colorScheme).toBe('light');
    expect(mockDocumentElement.getAttribute('data-theme')).toBe('paper');
  });

  // ---------------------------------------------------------------------------
  // 3. Storage Persistence
  // ---------------------------------------------------------------------------
  it('getStoredThemeMode: returns default "midnight" if nothing stored', async () => {
    const mode = await getStoredThemeMode();
    expect(mode).toBe(DEFAULT_THEME_MODE);
  });

  it('setStoredThemeMode: stores theme mode and getStoredThemeMode retrieves it', async () => {
    await setStoredThemeMode('ocean');
    expect(mockStorage[THEME_STORAGE_KEY]).toBe('ocean');

    const retrieved = await getStoredThemeMode();
    expect(retrieved).toBe('ocean');

    await setStoredThemeMode('system');
    expect(mockStorage[THEME_STORAGE_KEY]).toBe('system');

    const systemMode = await getStoredThemeMode();
    expect(systemMode).toBe('system');
  });
});
