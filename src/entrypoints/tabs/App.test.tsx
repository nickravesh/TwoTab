import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import PopupApp from '../popup/App';
import { ToolsView } from '@/components/tools/ToolsView';
import { LinkHealthTool } from '@/components/tools/LinkHealthTool';
import { DEFAULT_USER_PREFERENCES } from '@/lib/storage';

// =============================================================================
// Chrome API In-Memory Mocks for React Component Tests
// =============================================================================

const mockStorageStore: Record<string, any> = {};

const mockChrome = {
  storage: {
    local: {
      get: vi.fn((keys: any) => {
        if (!keys) return Promise.resolve({ ...mockStorageStore });
        if (typeof keys === 'string') return Promise.resolve({ [keys]: mockStorageStore[keys] });
        if (Array.isArray(keys)) {
          const res: Record<string, any> = {};
          for (const k of keys) res[k] = mockStorageStore[k];
          return Promise.resolve(res);
        }
        if (typeof keys === 'object' && keys !== null) {
          const res: Record<string, any> = { ...keys };
          for (const k in keys) {
            if (mockStorageStore[k] !== undefined) {
              res[k] = mockStorageStore[k];
            }
          }
          return Promise.resolve(res);
        }
        return Promise.resolve({ ...mockStorageStore });
      }),
      set: vi.fn((items: Record<string, any>) => {
        Object.assign(mockStorageStore, items);
        return Promise.resolve();
      }),
      remove: vi.fn((keys: any) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockStorageStore[k];
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        for (const k in mockStorageStore) delete mockStorageStore[k];
        return Promise.resolve();
      }),
      getBytesInUse: vi.fn(() => Promise.resolve(1024)),
    },
    session: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => Promise.resolve()),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(() => Promise.resolve([])),
    create: vi.fn(() => Promise.resolve({ id: 1 })),
    remove: vi.fn(() => Promise.resolve()),
    group: vi.fn(() => Promise.resolve(100)),
  },
  windows: {
    create: vi.fn(() => Promise.resolve({ id: 1, tabs: [{ id: 1 }] })),
  },
  tabGroups: {
    update: vi.fn(() => Promise.resolve()),
  },
  runtime: {
    lastError: null,
    sendMessage: vi.fn((_msg, cb) => {
      if (cb) cb({ status: 'success', count: 1 });
      return Promise.resolve({ status: 'success' });
    }),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
};

(globalThis as any).chrome = mockChrome;

describe('React Component Rendering & Regression Smoke Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k in mockStorageStore) delete mockStorageStore[k];

    mockStorageStore.userPreferences = { ...DEFAULT_USER_PREFERENCES };
    mockStorageStore._backupSnapshots = [];
    mockStorageStore._schemaVersion = 1;

    mockStorageStore.tabGroups = [
      {
        id: 1,
        date: new Date().toISOString(),
        name: 'Alpha Research Group',
        color: 'blue',
        tabs: [
          { title: 'Google Search', url: 'https://www.google.com' },
          { title: 'GitHub Repository', url: 'https://github.com/nickravesh/TwoTab' },
        ],
      },
    ];

    mockStorageStore.archivedGroups = [
      {
        id: 2,
        date: new Date().toISOString(),
        name: 'Old Archived Project',
        color: 'grey',
        tabs: [{ title: 'Archive Reference', url: 'https://archive.org' }],
      },
    ];

    mockStorageStore.recentlyClosed = [
      {
        id: 'closed_1',
        title: 'Recently Closed Page',
        url: 'https://news.ycombinator.com',
        timestamp: new Date().toISOString(),
      },
    ];
  });

  it('mounts <App /> successfully without throwing errors on Dashboard and renders navigation', () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
    expect(screen.getAllByText(/TwoTab/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Recently Closed/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tools/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Settings/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Help/i).length).toBeGreaterThan(0);
  });

  it('mounts <ToolsView /> sub-tool switcher and renders LinkHealthTool', () => {
    const { container } = render(<ToolsView tabGroups={mockStorageStore.tabGroups} />);
    expect(container).toBeTruthy();
    expect(screen.getAllByText(/Link Health/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Duplicates')).toBeDefined();
    expect(screen.getByText('Domain Sorter')).toBeDefined();
    expect(screen.getByText('Stale Tabs')).toBeDefined();
    expect(screen.getByText('Power Tools Hub')).toBeDefined();
  });

  it('mounts <LinkHealthTool /> full-canvas engine and controls without throwing errors', () => {
    const { container } = render(<LinkHealthTool tabGroups={mockStorageStore.tabGroups} />);
    expect(container).toBeTruthy();
    expect(screen.getByText('Link Health & Dead Link Inspector')).toBeDefined();
    expect(screen.getByText(/Scan Library/i)).toBeDefined();
    expect(screen.getByText(/Re-scan All/i)).toBeDefined();
  });

  it('mounts <PopupApp /> extension popup cleanly', () => {
    const { container } = render(<PopupApp />);
    expect(container).toBeTruthy();
    expect(screen.getByText(/Save Window/i)).toBeDefined();
  });
});
