import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from './App';
import { DEFAULT_USER_PREFERENCES, PREFERENCES_STORAGE_KEY } from '@/lib/storage';

// =============================================================================
// Chrome API In-Memory Mocks for Popup Unit & Integration Tests
// =============================================================================

const mockStorageStore: Record<string, any> = {};

let mockActiveTabQuery: any[] = [];
let mockWindowTabsQuery: any[] = [];

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
      set: vi.fn((items: Record<string, any>, cb?: () => void) => {
        Object.assign(mockStorageStore, items);
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      }),
      remove: vi.fn((keys: any, cb?: () => void) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockStorageStore[k];
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      }),
      clear: vi.fn((cb?: () => void) => {
        for (const k in mockStorageStore) delete mockStorageStore[k];
        if (typeof cb === 'function') cb();
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
    query: vi.fn((queryInfo: any) => {
      if (queryInfo.active) {
        return Promise.resolve(mockActiveTabQuery);
      }
      return Promise.resolve(mockWindowTabsQuery);
    }),
    create: vi.fn(() => Promise.resolve({ id: 999 })),
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
    getURL: vi.fn((path: string) => `chrome-extension://twotab-test-id/${path}`),
    getManifest: vi.fn(() => ({ version: '1.14.0' })),
    sendMessage: vi.fn((msg: any, cb: (res: any) => void) => {
      if (msg.action === 'saveTabs') {
        cb({ status: 'success', count: 3 });
      } else if (msg.action === 'saveAllWindows') {
        cb({ status: 'success', count: 8 });
      } else {
        cb({ status: 'success' });
      }
      return Promise.resolve();
    }),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
};

(globalThis as any).chrome = mockChrome;

describe('<PopupApp /> Extension Popup Integration Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k in mockStorageStore) delete mockStorageStore[k];

    mockStorageStore[PREFERENCES_STORAGE_KEY] = { ...DEFAULT_USER_PREFERENCES };
    mockStorageStore._backupSnapshots = [];
    mockStorageStore._schemaVersion = 1;

    const now = Date.now();
    mockStorageStore.tabGroups = [
      {
        id: 101,
        date: new Date(now - 60000).toISOString(),
        name: 'Research Paper Tabs',
        color: 'blue',
        tabs: [
          { title: 'arXiv Quantum Computing', url: 'https://arxiv.org/abs/2101.00001' },
          { title: 'Nature Physics Journal', url: 'https://nature.com/articles/physics' },
          { title: 'Science Magazine', url: 'https://science.org/journal' },
        ],
      },
      {
        id: 102,
        date: new Date(now - 120000).toISOString(),
        name: 'Social Media Feed',
        color: 'purple',
        tabs: [
          { title: 'GitHub TwoTab Repo', url: 'https://github.com/nickravesh/TwoTab' },
        ],
      },
    ];

    mockActiveTabQuery = [
      {
        id: 42,
        title: 'Vite Next Gen Tooling',
        url: 'https://vite.dev/guide',
        active: true,
      },
    ];

    mockWindowTabsQuery = [
      { id: 42, title: 'Vite Next Gen Tooling', url: 'https://vite.dev/guide' },
      { id: 43, title: 'Tailwind CSS Documentation', url: 'https://tailwindcss.com' },
    ];
  });

  it('renders header, quick actions, and recent stashes accurately', async () => {
    render(<App />);

    // Header brand branding
    expect(screen.getByText('TwoTab')).toBeDefined();
    expect(screen.getByTitle('Open Full Dashboard in new tab')).toBeDefined();

    // Primary action buttons
    expect(screen.getByRole('button', { name: /Save Tab/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Save Window/i })).toBeDefined();

    // Stashes section title and count badge
    expect(await screen.findByText('Recent Stashes')).toBeDefined();
    expect(screen.getByText(/2 stashes/i)).toBeDefined();

    // Stash item titles
    expect(screen.getByText('Research Paper Tabs')).toBeDefined();
    expect(screen.getByText('Social Media Feed')).toBeDefined();

    // Tab preview truncation text
    expect(screen.getByText('+1 more tab')).toBeDefined();
  });

  it('renders clean empty state illustration when zero stashes exist', async () => {
    mockStorageStore.tabGroups = [];
    render(<App />);

    expect(await screen.findByText('No recent stashes')).toBeDefined();
    expect(screen.getByText(/Save your active tab or window above to clear clutter/i)).toBeDefined();
  });

  it('saves the active tab successfully and closes the tab', async () => {
    render(<App />);

    const saveTabBtn = screen.getByRole('button', { name: /Save Tab/i });
    fireEvent.click(saveTabBtn);

    // Toast appears
    expect(await screen.findByText('Active tab saved!')).toBeDefined();

    // Active tab removed via chrome.tabs.remove
    expect(mockChrome.tabs.remove).toHaveBeenCalledWith(42);

    // Newly saved tab appears in recent stashes
    await waitFor(() => {
      expect(mockStorageStore.tabGroups[0].name).toBe('Vite Next Gen Tooling');
      expect(mockStorageStore.tabGroups[0].tabs[0].url).toBe('https://vite.dev/guide');
    });
  });

  it('opens a new tab before closing active tab if window has only 1 tab', async () => {
    mockWindowTabsQuery = [{ id: 42, title: 'Vite Next Gen Tooling', url: 'https://vite.dev/guide' }];
    render(<App />);

    const saveTabBtn = screen.getByRole('button', { name: /Save Tab/i });
    fireEvent.click(saveTabBtn);

    await waitFor(() => {
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome://newtab' });
      expect(mockChrome.tabs.remove).toHaveBeenCalledWith(42);
    });
  });

  it('rejects saving browser system internal URLs (chrome://) with warning toast', async () => {
    mockActiveTabQuery = [{ id: 50, title: 'Extensions', url: 'chrome://extensions', active: true }];
    render(<App />);

    const saveTabBtn = screen.getByRole('button', { name: /Save Tab/i });
    fireEvent.click(saveTabBtn);

    expect(await screen.findByText('System pages cannot be saved')).toBeDefined();
    expect(mockChrome.tabs.remove).not.toHaveBeenCalled();
  });

  it('handles missing active tab gracefully', async () => {
    mockActiveTabQuery = [];
    render(<App />);

    const saveTabBtn = screen.getByRole('button', { name: /Save Tab/i });
    fireEvent.click(saveTabBtn);

    expect(await screen.findByText('No active tab found')).toBeDefined();
  });

  it('saves current window via background message and reloads collections', async () => {
    render(<App />);

    const saveWindowBtn = screen.getByRole('button', { name: /Save Window/i });
    fireEvent.click(saveWindowBtn);

    await waitFor(() => {
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'saveTabs' },
        expect.any(Function)
      );
    });

    expect(await screen.findByText(/Saved 3 tabs!/i)).toBeDefined();
  });

  it('handles save current window when no eligible tabs exist', async () => {
    mockChrome.runtime.sendMessage.mockImplementationOnce((msg: any, cb: (res: any) => void) => {
      cb({ status: 'no_tabs', reason: 'All tabs in this window are pinned or system pages' });
      return Promise.resolve();
    });

    render(<App />);

    const saveWindowBtn = screen.getByRole('button', { name: /Save Window/i });
    fireEvent.click(saveWindowBtn);

    expect(await screen.findByText(/All tabs in this window are pinned or system pages/i)).toBeDefined();
  });

  it('saves all windows via dropdown action', async () => {
    render(<App />);

    // Open Save Window split dropdown using pointerDown
    const splitDropdownBtn = screen.getByRole('button', { name: /Save Window/i }).nextElementSibling;
    fireEvent.pointerDown(splitDropdownBtn!, { button: 0, ctrlKey: false });

    const saveAllMenuItem = await screen.findByText('Save All Windows');
    fireEvent.click(saveAllMenuItem);

    await waitFor(() => {
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'saveAllWindows' },
        expect.any(Function)
      );
    });

    expect(await screen.findByText(/Saved 8 tabs across windows!/i)).toBeDefined();
  });

  it('restores a stash and keeps or removes collection according to user preferences', async () => {
    render(<App />);

    const stashCard = (await screen.findByText('Social Media Feed')).closest('.card-interactive');
    const restoreBtn = within(stashCard as HTMLElement).getByRole('button', { name: /Restore/i });
    fireEvent.click(restoreBtn);

    await waitFor(() => {
      // Default restore destination is 'new_window', triggering chrome.windows.create
      expect(mockChrome.windows.create).toHaveBeenCalledWith(
        expect.objectContaining({ focused: true })
      );
    });
  });

  it('deletes a stash after confirming in the confirmation dialog', async () => {
    render(<App />);

    const stashHeading = await screen.findByText('Research Paper Tabs');
    const stashCard = stashHeading.closest('.card-interactive');
    const deleteBtn = within(stashCard as HTMLElement).getByRole('button', { name: /Delete/i });
    fireEvent.click(deleteBtn);

    // Confirmation dialog appears
    expect(await screen.findByText('Delete Stash')).toBeDefined();
    expect(screen.getByText(/Are you sure you want to delete/i)).toBeDefined();

    // Confirm deletion
    const dialogConfirmBtn = screen.getByRole('button', { name: /^Delete$/i });
    fireEvent.click(dialogConfirmBtn);

    await waitFor(() => {
      expect(screen.queryByText('Research Paper Tabs')).toBeNull();
      expect(mockStorageStore.tabGroups.some((g: any) => g.id === 101)).toBe(false);
    });
  });

  it('cancels stash deletion when Cancel is clicked in dialog', async () => {
    render(<App />);

    const stashHeading = await screen.findByText('Social Media Feed');
    const stashCard = stashHeading.closest('.card-interactive');
    const deleteBtn = within(stashCard as HTMLElement).getByRole('button', { name: /Delete/i });
    fireEvent.click(deleteBtn);

    expect(await screen.findByText('Delete Stash')).toBeDefined();

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByText('Delete Stash')).toBeNull();
      expect(screen.getByText('Social Media Feed')).toBeDefined();
    });
  });

  it('opens full dashboard when clicking the footer link or header dashboard button', async () => {
    render(<App />);

    const footerDashboardBtn = screen.getByRole('button', { name: /View All Saved Tabs in Dashboard/i });
    fireEvent.click(footerDashboardBtn);

    expect(mockChrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://twotab-test-id/tabs.html',
    });
  });
});
