import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from 'vitest';

// Use vi.hoisted so defineBackground is registered before background.ts is imported
vi.hoisted(() => {
  (globalThis as any).defineBackground = (fn: () => void) => {
    (globalThis as any).__backgroundEntryFn = fn;
    return fn;
  };
});

let backgroundEntryFn: (() => void) | null = null;

// Storage stores
let mockLocalStorage: Record<string, any> = {};
let mockSessionStorage: Record<string, any> = {};

// Listener registries
let contextMenuClickListener: ((info: any, tab: any) => Promise<void>) | null = null;
let installedListener: (() => void) | null = null;
let alarmListener: ((alarm: any) => Promise<void>) | null = null;
let tabUpdatedListener: ((tabId: number, changeInfo: any, tab: any) => Promise<void>) | null = null;
let tabCreatedListener: ((tab: any) => Promise<void>) | null = null;
let tabRemovedListener: ((tabId: number) => Promise<void>) | null = null;
let messageListener: ((request: any, sender: any, sendResponse: (res: any) => void) => boolean | undefined) | null = null;

// Context menus registry
const registeredContextMenus: any[] = [];
let actionBadgeText = '';
let actionBadgeColor = '';

// Setup chrome mock
const mockChrome = {
  runtime: {
    lastError: null,
    getURL: vi.fn((path: string) => `chrome-extension://twotab/${path.replace(/^\//, '')}`),
    onInstalled: {
      addListener: vi.fn((fn: () => void) => {
        installedListener = fn;
      }),
    },
    onMessage: {
      addListener: vi.fn((fn: any) => {
        messageListener = fn;
      }),
    },
    sendMessage: vi.fn((_msg: any, cb?: (res: any) => void) => {
      if (cb) cb({ status: 'ok' });
    }),
  },
  action: {
    setBadgeText: vi.fn((details: { text: string }) => {
      actionBadgeText = details.text;
    }),
    setBadgeBackgroundColor: vi.fn((details: { color: string }) => {
      actionBadgeColor = details.color;
    }),
  },
  contextMenus: {
    removeAll: vi.fn((cb?: () => void) => {
      registeredContextMenus.length = 0;
      if (cb) cb();
    }),
    create: vi.fn((props: any) => {
      registeredContextMenus.push(props);
    }),
    onClicked: {
      addListener: vi.fn((fn: any) => {
        contextMenuClickListener = fn;
      }),
    },
  },
  alarms: {
    create: vi.fn(),
    onAlarm: {
      addListener: vi.fn((fn: any) => {
        alarmListener = fn;
      }),
    },
  },
  tabs: {
    query: vi.fn((_query: any) => Promise.resolve([])),
    create: vi.fn((props: any) => Promise.resolve({ id: 101, ...props })),
    remove: vi.fn((_ids: any) => Promise.resolve()),
    update: vi.fn((_id: number, _props: any) => Promise.resolve()),
    onUpdated: {
      addListener: vi.fn((fn: any) => {
        tabUpdatedListener = fn;
      }),
    },
    onCreated: {
      addListener: vi.fn((fn: any) => {
        tabCreatedListener = fn;
      }),
    },
    onRemoved: {
      addListener: vi.fn((fn: any) => {
        tabRemovedListener = fn;
      }),
    },
    group: vi.fn(() => Promise.resolve(99)),
    TAB_ID_NONE: -1,
  },
  windows: {
    create: vi.fn((props: any) => Promise.resolve({ id: 201, tabs: [{ id: 101 }], ...props })),
    update: vi.fn((_id: number, _props: any) => Promise.resolve()),
  },
  storage: {
    local: {
      get: vi.fn((keys: any) => {
        if (!keys) return Promise.resolve({ ...mockLocalStorage });
        if (typeof keys === 'string') return Promise.resolve({ [keys]: mockLocalStorage[keys] });
        if (Array.isArray(keys)) {
          const res: Record<string, any> = {};
          for (const k of keys) res[k] = mockLocalStorage[k];
          return Promise.resolve(res);
        }
        return Promise.resolve({ ...mockLocalStorage });
      }),
      set: vi.fn((data: Record<string, any>, cb?: () => void) => {
        Object.assign(mockLocalStorage, data);
        if (cb) cb();
        return Promise.resolve();
      }),
      remove: vi.fn((keys: any, cb?: () => void) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockLocalStorage[k];
        if (cb) cb();
        return Promise.resolve();
      }),
      getBytesInUse: vi.fn(() => Promise.resolve(2048)),
    },
    session: {
      get: vi.fn((keys: any) => {
        if (!keys) return Promise.resolve({ ...mockSessionStorage });
        if (typeof keys === 'string') return Promise.resolve({ [keys]: mockSessionStorage[keys] });
        if (Array.isArray(keys)) {
          const res: Record<string, any> = {};
          for (const k of keys) res[k] = mockSessionStorage[k];
          return Promise.resolve(res);
        }
        return Promise.resolve({ ...mockSessionStorage });
      }),
      set: vi.fn((data: Record<string, any>) => {
        Object.assign(mockSessionStorage, data);
        return Promise.resolve();
      }),
      remove: vi.fn((keys: any) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockSessionStorage[k];
        return Promise.resolve();
      }),
    },
  },
};

(globalThis as any).chrome = mockChrome;

describe('Manifest V3 Background Service Worker Comprehensive Test Suite', () => {
  beforeAll(async () => {
    await import('../background');
    backgroundEntryFn = (globalThis as any).__backgroundEntryFn;
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage = {
      tabGroups: [],
      archivedGroups: [],
      recentlyClosed: [],
      twotab_user_preferences: {
        protectPinnedTabs: true,
        restoreDestination: 'new_window',
        restoreBehavior: 'keep',
        recentlyClosedLimit: 50,
      },
    };
    mockSessionStorage = {};
    actionBadgeText = '';
    actionBadgeColor = '';

    // Execute background worker entrypoint to register listeners
    if (backgroundEntryFn) {
      backgroundEntryFn();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 1. Startup & Installation Lifecycle
  // ===========================================================================
  describe('Service Worker Lifecycle & Initialization', () => {
    it('sets up alarms and context menus upon startup', async () => {
      await new Promise((r) => setTimeout(r, 20));
      expect(mockChrome.alarms.create).toHaveBeenCalledWith('autoBackup', { periodInMinutes: 360 });
      expect(mockChrome.contextMenus.removeAll).toHaveBeenCalled();
      expect(registeredContextMenus.length).toBe(6);
      expect(registeredContextMenus[0].id).toBe('twotab_root');
    });

    it('handles chrome.runtime.onInstalled lifecycle event', async () => {
      expect(installedListener).toBeDefined();
      if (installedListener) {
        await installedListener();
        expect(mockChrome.alarms.create).toHaveBeenCalledWith('autoBackup', { periodInMinutes: 360 });
        expect(mockChrome.contextMenus.removeAll).toHaveBeenCalled();
      }
    });

    it('initializes tab cache in chrome.storage.session with unwrapped titles and URLs', async () => {
      mockChrome.tabs.query.mockResolvedValueOnce([
        { id: 10, title: 'Google', url: 'https://google.com' },
        { id: 11, title: 'Dormant Tab', url: 'chrome-extension://twotab/dormant.html?url=https%3A%2F%2Fgithub.com&title=GitHub' },
      ] as any);

      if (backgroundEntryFn) {
        await backgroundEntryFn();
      }
      await new Promise((r) => setTimeout(r, 20));

      expect(mockSessionStorage['tab_10']).toEqual({ title: 'Google', url: 'https://google.com' });
      expect(mockSessionStorage['tab_11']).toEqual({ title: 'GitHub', url: 'https://github.com' });
    });
  });

  // ===========================================================================
  // 2. Context Menu Clicks & Badge Feedback
  // ===========================================================================
  describe('Context Menu Click Operations & Visual Feedback', () => {
    it('saves active tab and displays success checkmark badge', async () => {
      expect(contextMenuClickListener).toBeDefined();
      const mockTab = { id: 1, title: 'Active Page', url: 'https://example.com/page', pinned: false, windowId: 50 };

      // Query window tabs to prevent window closing
      mockChrome.tabs.query.mockResolvedValueOnce([mockTab, { id: 2, url: 'https://other.com', windowId: 50 }] as any);

      await contextMenuClickListener!({ menuItemId: 'twotab_save_active' }, mockTab);

      expect(mockLocalStorage.tabGroups.length).toBe(1);
      expect(mockLocalStorage.tabGroups[0].tabs[0].url).toBe('https://example.com/page');
      expect(mockChrome.tabs.remove).toHaveBeenCalledWith([1]);
      expect(actionBadgeText).toBe('✓');
    });

    it('rejects pinned tab when protectPinnedTabs is true and displays warning badge', async () => {
      const mockPinnedTab = { id: 1, title: 'Pinned Page', url: 'https://pinned.com', pinned: true, windowId: 50 };

      await contextMenuClickListener!({ menuItemId: 'twotab_save_active' }, mockPinnedTab);

      // Group not created because pinned tab is protected
      expect(mockLocalStorage.tabGroups.length).toBe(0);
      expect(actionBadgeText).toBe('!');
    });

    it('saves selected / highlighted tabs and sets badge count', async () => {
      const highlightedTabs = [
        { id: 21, title: 'Tab 1', url: 'https://site1.com', pinned: false, windowId: 1 },
        { id: 22, title: 'Tab 2', url: 'https://site2.com', pinned: false, windowId: 1 },
      ];
      mockChrome.tabs.query.mockResolvedValueOnce(highlightedTabs as any); // currentWindow: true, highlighted: true
      mockChrome.tabs.query.mockResolvedValueOnce([...highlightedTabs, { id: 23, url: 'https://keep.com', windowId: 1 }] as any);

      await contextMenuClickListener!({ menuItemId: 'twotab_save_selected' }, highlightedTabs[0]);

      expect(mockLocalStorage.tabGroups.length).toBe(1);
      expect(mockLocalStorage.tabGroups[0].tabs.length).toBe(2);
      expect(mockChrome.tabs.remove).toHaveBeenCalledWith([21, 22]);
      expect(actionBadgeText).toBe('2');
    });

    it('saves link directly to TwoTab without closing current tab', async () => {
      const info = {
        menuItemId: 'twotab_save_link',
        linkUrl: 'https://news.ycombinator.com/item?id=12345',
        selectionText: 'Hacker News Article',
      };

      await contextMenuClickListener!(info, null);

      expect(mockLocalStorage.tabGroups.length).toBe(1);
      expect(mockLocalStorage.tabGroups[0].tabs[0].url).toBe('https://news.ycombinator.com/item?id=12345');
      expect(mockLocalStorage.tabGroups[0].tabs[0].title).toBe('Hacker News Article');
      expect(mockChrome.tabs.remove).not.toHaveBeenCalled();
      expect(actionBadgeText).toBe('✓');
    });

    it('saves entire window and opens blank chrome://newtab tab', async () => {
      const windowTabs = [
        { id: 31, title: 'Tab A', url: 'https://a.com', pinned: false, windowId: 77 },
        { id: 32, title: 'Tab B', url: 'https://b.com', pinned: false, windowId: 77 },
      ];
      mockChrome.tabs.query.mockResolvedValueOnce(windowTabs as any); // query({ currentWindow: true })

      await contextMenuClickListener!({ menuItemId: 'twotab_save_window' }, null);

      expect(mockLocalStorage.tabGroups.length).toBe(1);
      expect(mockLocalStorage.tabGroups[0].tabs.length).toBe(2);
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome://newtab', windowId: 77 });
      expect(mockChrome.tabs.remove).toHaveBeenCalledWith([31, 32]);
      expect(actionBadgeText).toBe('2');
    });

    it('opens dashboard or focuses existing dashboard tab', async () => {
      const dashboardUrl = 'chrome-extension://twotab/tabs.html';

      // 1. When no dashboard tab exists
      mockChrome.tabs.query.mockResolvedValueOnce([] as any);
      await contextMenuClickListener!({ menuItemId: 'twotab_open_dashboard' }, null);
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({ url: dashboardUrl });

      // 2. When dashboard tab already exists
      mockChrome.tabs.query.mockResolvedValueOnce([{ id: 88, windowId: 99, url: dashboardUrl }] as any);
      await contextMenuClickListener!({ menuItemId: 'twotab_open_dashboard' }, null);
      expect(mockChrome.tabs.update).toHaveBeenCalledWith(88, { active: true });
      expect(mockChrome.windows.update).toHaveBeenCalledWith(99, { focused: true });
    });
  });

  // ===========================================================================
  // 3. Tab Lifecycle Monitoring & Session Storage Cache
  // ===========================================================================
  describe('Tab Lifecycle & Recently Closed Management', () => {
    it('caches created tab in chrome.storage.session', async () => {
      expect(tabCreatedListener).toBeDefined();
      await tabCreatedListener!({ id: 55, title: 'New Tab', url: 'https://github.com' });

      expect(mockSessionStorage['tab_55']).toEqual({ title: 'New Tab', url: 'https://github.com' });
    });

    it('updates tab cache in chrome.storage.session on title or url changes', async () => {
      expect(tabUpdatedListener).toBeDefined();
      await tabUpdatedListener!(55, { title: 'Updated Title' }, { id: 55, title: 'Updated Title', url: 'https://github.com' });

      expect(mockSessionStorage['tab_55']).toEqual({ title: 'Updated Title', url: 'https://github.com' });
    });

    it('records closed tab into recentlyClosed and deletes session cache on tab remove', async () => {
      mockSessionStorage['tab_70'] = { title: 'Closed Webpage', url: 'https://wired.com/story' };

      expect(tabRemovedListener).toBeDefined();
      await tabRemovedListener!(70);

      // Session cache cleared
      expect(mockSessionStorage['tab_70']).toBeUndefined();

      // Recorded in recentlyClosed
      expect(mockLocalStorage.recentlyClosed.length).toBe(1);
      expect(mockLocalStorage.recentlyClosed[0].url).toBe('https://wired.com/story');
      expect(mockLocalStorage.recentlyClosed[0].title).toBe('Closed Webpage');
    });

    it('ignores internal system tabs (chrome://, about:, chrome-extension://) when closed', async () => {
      mockSessionStorage['tab_71'] = { title: 'Settings', url: 'chrome://settings' };

      await tabRemovedListener!(71);

      expect(mockSessionStorage['tab_71']).toBeUndefined();
      expect(mockLocalStorage.recentlyClosed.length).toBe(0);
    });
  });

  // ===========================================================================
  // 4. Runtime Message Dispatch Actions
  // ===========================================================================
  describe('Runtime Message Handler', () => {
    it('handles saveTabs message and responds with status and count', async () => {
      expect(messageListener).toBeDefined();
      const sendResponse = vi.fn();

      mockChrome.tabs.query.mockResolvedValueOnce([
        { id: 81, title: 'Tab 1', url: 'https://one.com', pinned: false, windowId: 10 },
      ] as any);

      const keepOpen = messageListener!({ action: 'saveTabs' }, {}, sendResponse);
      expect(keepOpen).toBe(true);

      // Wait microtasks for async IIFE
      await new Promise((r) => setTimeout(r, 20));

      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', count: 1 }));
      expect(mockLocalStorage.tabGroups.length).toBe(1);
    });

    it('handles saveActiveTab message and responds with status and count', async () => {
      const sendResponse = vi.fn();

      mockChrome.tabs.query.mockResolvedValueOnce([
        { id: 91, title: 'Active', url: 'https://active.com', pinned: false, windowId: 10 },
      ] as any);
      mockChrome.tabs.query.mockResolvedValueOnce([
        { id: 91 },
        { id: 92 },
      ] as any);

      messageListener!({ action: 'saveActiveTab' }, {}, sendResponse);
      await new Promise((r) => setTimeout(r, 20));

      expect(sendResponse).toHaveBeenCalledWith({ status: 'success', count: 1 });
      expect(mockLocalStorage.tabGroups.length).toBe(1);
    });

    it('handles saveAllWindows message clustering tabs across multiple windows', async () => {
      const sendResponse = vi.fn();

      mockChrome.tabs.query.mockResolvedValueOnce([
        { id: 101, title: 'Win 1 Tab', url: 'https://w1.com', pinned: false, windowId: 1 },
        { id: 102, title: 'Win 2 Tab', url: 'https://w2.com', pinned: false, windowId: 2 },
      ] as any);

      messageListener!({ action: 'saveAllWindows' }, {}, sendResponse);
      await new Promise((r) => setTimeout(r, 20));

      expect(sendResponse).toHaveBeenCalledWith({ status: 'success', count: 2 });
      expect(mockLocalStorage.tabGroups.length).toBe(2);
    });

    it('returns no_tabs when all tabs in window are pinned and protected', async () => {
      const sendResponse = vi.fn();

      mockChrome.tabs.query.mockResolvedValueOnce([
        { id: 105, title: 'Pinned 1', url: 'https://pinned.com', pinned: true, windowId: 1 },
      ] as any);

      messageListener!({ action: 'saveTabs' }, {}, sendResponse);
      await new Promise((r) => setTimeout(r, 20));

      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ status: 'no_tabs' }));
    });
  });

  // ===========================================================================
  // 5. Alarms & Rolling Backup Execution
  // ===========================================================================
  describe('Alarms & Periodic Backups', () => {
    it('executes autoBackup alarm and triggers createRollingBackup', async () => {
      expect(alarmListener).toBeDefined();

      mockLocalStorage.tabGroups = [
        { id: 1, date: '2026-08-18', name: 'G1', tabs: [{ title: 'T1', url: 'https://1.com' }] },
      ];

      await alarmListener!({ name: 'autoBackup' });

      // Verifies snapshot was stored in local storage
      expect(mockLocalStorage._backupSnapshots).toBeDefined();
      expect(mockLocalStorage._backupSnapshots.length).toBe(1);
    });
  });
});
