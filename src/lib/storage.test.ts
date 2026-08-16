import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveGroups,
  getGroups,
  deleteGroup,
  archiveGroup,
  getArchivedGroups,
  migrateIfNeeded,
  importData,
  importOneTabOrPlainText,
  exportAsJson,
  exportAsMarkdown,
  exportAsPlainText,
  exportAsHtmlBookmarks,
  exportAsCsv,
  clearAllData,
  runHealthCheck,
  getUserPreferences,
  setUserPreferences,
  saveRecentlyClosedItems,
  getRecentlyClosedItems,
  restoreTabGroup,
  restoreAllTabGroups,
  DEFAULT_USER_PREFERENCES,
  CURRENT_SCHEMA_VERSION,
  type TabGroup,
} from './storage';

// In-memory store to simulate chrome.storage.local
let mockStorageStore: Record<string, any> = {};
let mockLastError: { message: string } | null = null;

// Mock global chrome object before tests run
const mockChrome = {
  runtime: {
    get lastError() {
      return mockLastError;
    },
  },
  tabs: {
    create: vi.fn((props: { url: string; active?: boolean }) => Promise.resolve({ id: 100, ...props })),
  },
  windows: {
    create: vi.fn((props: { url?: string | string[]; focused?: boolean }) => Promise.resolve({ id: 200, ...props })),
  },
  storage: {
    local: {
      get: vi.fn((keys: string | string[] | null, callback?: (result: Record<string, any>) => void) => {
        let result: Record<string, any> = {};
        if (keys === null) {
          result = JSON.parse(JSON.stringify(mockStorageStore));
        } else if (typeof keys === 'string') {
          if (mockStorageStore[keys] !== undefined) {
            result[keys] = JSON.parse(JSON.stringify(mockStorageStore[keys]));
          }
        } else if (Array.isArray(keys)) {
          keys.forEach((k) => {
            if (mockStorageStore[k] !== undefined) {
              result[k] = JSON.parse(JSON.stringify(mockStorageStore[k]));
            }
          });
        }
        if (callback) callback(result);
        return Promise.resolve(result);
      }),
      set: vi.fn((data: Record<string, any>, callback?: () => void) => {
        if (!mockLastError) {
          Object.assign(mockStorageStore, JSON.parse(JSON.stringify(data)));
        }
        if (callback) callback();
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[], callback?: () => void) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach((k) => delete mockStorageStore[k]);
        if (callback) callback();
        return Promise.resolve();
      }),
      clear: vi.fn((callback?: () => void) => {
        mockStorageStore = {};
        if (callback) callback();
        return Promise.resolve();
      }),
      getBytesInUse: vi.fn(() => Promise.resolve(1024)),
    },
  },
};

(globalThis as any).chrome = mockChrome;

describe('TwoTab Storage Engine Reliability Unit Tests', () => {
  beforeEach(() => {
    mockStorageStore = {};
    mockLastError = null;
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. StorageQueue Mutex & Concurrent Write Safety
  // ---------------------------------------------------------------------------
  it('StorageQueue Mutex: executes concurrent writes sequentially without state loss', async () => {
    const group1: TabGroup = { id: 101, date: '2026-08-11T00:00:00Z', name: 'Group 1', tabs: [{ title: 'Tab 1', url: 'https://example.com/1' }] };
    const group2: TabGroup = { id: 102, date: '2026-08-11T00:00:00Z', name: 'Group 2', tabs: [{ title: 'Tab 2', url: 'https://example.com/2' }] };
    const group3: TabGroup = { id: 103, date: '2026-08-11T00:00:00Z', name: 'Group 3', tabs: [{ title: 'Tab 3', url: 'https://example.com/3' }] };

    // Fire 3 save operations concurrently without awaiting individually
    const p1 = saveGroups([group1]);
    const p2 = saveGroups([group1, group2]);
    const p3 = saveGroups([group1, group2, group3]);

    await Promise.all([p1, p2, p3]);

    const finalGroups = await getGroups();
    expect(finalGroups).toHaveLength(3);
    expect(finalGroups.map(g => g.id)).toEqual([101, 102, 103]);
  });

  // ---------------------------------------------------------------------------
  // 2. safeStorageSet Error Detection
  // ---------------------------------------------------------------------------
  it('safeStorageSet Error Handling: throws error when chrome.runtime.lastError occurs', async () => {
    mockLastError = { message: 'QuotaExceededError: Storage quota exceeded' };

    const group: TabGroup = { id: 201, date: '2026-08-11T00:00:00Z', name: 'Test', tabs: [] };

    await expect(saveGroups([group])).rejects.toThrow('Storage write failed: QuotaExceededError: Storage quota exceeded');
  });

  // ---------------------------------------------------------------------------
  // 3. Schema Migration (migrateIfNeeded)
  // ---------------------------------------------------------------------------
  it('Schema Migration: migrates v0 storage state to CURRENT_SCHEMA_VERSION preserving tab data', async () => {
    const legacyGroup: TabGroup = { id: 301, date: '2026-08-10T00:00:00Z', name: 'Legacy Group', tabs: [{ title: 'Tab', url: 'https://legacy.com' }] };
    mockStorageStore = {
      tabGroups: [legacyGroup],
      // missing _schemaVersion
    };

    await migrateIfNeeded();

    expect(mockStorageStore._schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(mockStorageStore.tabGroups).toHaveLength(1);
    expect(mockStorageStore.tabGroups[0].name).toBe('Legacy Group');
  });

  // ---------------------------------------------------------------------------
  // 4. Import Hardening: File Size Limit & Duplicate ID Rejection
  // ---------------------------------------------------------------------------
  it('Import Hardening: rejects payloads larger than 50 MB', async () => {
    // Generate string larger than 50 MB
    const hugePayload = 'a'.repeat(50 * 1024 * 1024 + 1);

    const result = await importData(hugePayload);
    expect(result).toBe(false);
  });

  it('Import Hardening: rejects files containing duplicate group IDs', async () => {
    const duplicateIdImport = JSON.stringify({
      tabGroups: [
        { id: 401, date: '2026-08-11T00:00:00Z', name: 'Group A', tabs: [{ title: 'T1', url: 'https://a.com' }] },
        { id: 401, date: '2026-08-11T00:00:00Z', name: 'Group B (Duplicate ID)', tabs: [{ title: 'T2', url: 'https://b.com' }] }
      ]
    });

    const result = await importData(duplicateIdImport);
    expect(result).toBe(false);
  });

  it('Import Hardening: imports valid payload correctly', async () => {
    const validImport = JSON.stringify({
      tabGroups: [
        { id: 501, date: '2026-08-11T00:00:00Z', name: 'Group 501', tabs: [{ title: 'T1', url: 'https://a.com' }] }
      ],
      archivedGroups: [
        { id: 502, date: '2026-08-11T00:00:00Z', name: 'Group 502', tabs: [{ title: 'T2', url: 'https://b.com' }] }
      ]
    });

    const result = await importData(validImport);
    expect(result).toBe(true);
    expect(mockStorageStore.tabGroups).toHaveLength(1);
    expect(mockStorageStore.archivedGroups).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 5. Emergency Backups (clearAllData)
  // ---------------------------------------------------------------------------
  it('Emergency Backups: clearAllData writes _emergencyBackup snapshot before clearing tabGroups', async () => {
    const activeGroup: TabGroup = { id: 601, date: '2026-08-11T00:00:00Z', name: 'Active', tabs: [{ title: 'T1', url: 'https://active.com' }] };
    mockStorageStore = {
      tabGroups: [activeGroup],
      recentlyClosed: [{ id: 'c1', title: 'Closed', url: 'https://closed.com', timestamp: '2026-08-11' }]
    };

    await clearAllData();

    // Data keys should be removed
    expect(mockStorageStore.tabGroups).toBeUndefined();
    expect(mockStorageStore.recentlyClosed).toBeUndefined();

    // Emergency backup snapshot must exist containing previous data
    expect(mockStorageStore._emergencyBackup).toBeDefined();
    expect(mockStorageStore._emergencyBackup.data.tabGroups).toHaveLength(1);
    expect(mockStorageStore._emergencyBackup.data.tabGroups[0].id).toBe(601);
  });

  // ---------------------------------------------------------------------------
  // 6. Startup Health Check
  // ---------------------------------------------------------------------------
  it('Startup Health Check: verifies intact storage structure', async () => {
    mockStorageStore = {
      tabGroups: [{ id: 701, date: '2026-08-11', tabs: [{ title: 'A', url: 'https://a.com' }] }]
    };

    const health = await runHealthCheck();
    expect(health.valid).toBe(true);
    expect(health.errors).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 7. User Workflow Preferences
  // ---------------------------------------------------------------------------
  it('User Preferences: returns defaults when unconfigured', async () => {
    const prefs = await getUserPreferences();
    expect(prefs).toEqual(DEFAULT_USER_PREFERENCES);
    expect(prefs.protectPinnedTabs).toBe(true);
    expect(prefs.restoreDestination).toBe('new_window');
    expect(prefs.restoreBehavior).toBe('keep');
  });

  it('User Preferences: updates and persists partial preferences', async () => {
    await setUserPreferences({ restoreDestination: 'current_window', restoreBehavior: 'remove' });
    const prefs = await getUserPreferences();
    expect(prefs.restoreDestination).toBe('current_window');
    expect(prefs.restoreBehavior).toBe('remove');
    expect(prefs.protectPinnedTabs).toBe(true); // Retains default for untouched fields
  });

  // ---------------------------------------------------------------------------
  // 8. Tab Group Restoration Engine
  // ---------------------------------------------------------------------------
  it('Restoration Engine: opens in new window when configured for new_window', async () => {
    const group: TabGroup = {
      id: 801,
      date: '2026-08-11',
      name: 'Work',
      tabs: [
        { title: 'A', url: 'https://a.com' },
        { title: 'B', url: 'https://b.com' },
      ],
    };

    const result = await restoreTabGroup(group, {
      protectPinnedTabs: true,
      restoreDestination: 'new_window',
      restoreBehavior: 'keep',
      recentlyClosedLimit: 50,
    });

    expect(result.count).toBe(2);
    expect(result.removed).toBe(false);
    expect(mockChrome.windows.create).toHaveBeenCalledWith({
      url: ['https://a.com', 'https://b.com'],
      focused: true,
    });
  });

  it('Restoration Engine: opens individual tabs when configured for current_window', async () => {
    const group: TabGroup = {
      id: 802,
      date: '2026-08-11',
      name: 'Docs',
      tabs: [{ title: 'Docs', url: 'https://docs.com' }],
    };

    const result = await restoreTabGroup(group, {
      protectPinnedTabs: true,
      restoreDestination: 'current_window',
      restoreBehavior: 'keep',
      recentlyClosedLimit: 50,
    });

    expect(result.count).toBe(1);
    expect(result.removed).toBe(false);
    expect(mockChrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://docs.com',
      active: false,
    });
  });

  it('Restoration Engine: removes group from storage when restoreBehavior is "remove"', async () => {
    const group: TabGroup = {
      id: 803,
      date: '2026-08-11',
      name: 'Temporary',
      tabs: [{ title: 'Temp', url: 'https://temp.com' }],
    };
    mockStorageStore = {
      tabGroups: [group],
    };

    const result = await restoreTabGroup(group, {
      protectPinnedTabs: true,
      restoreDestination: 'new_window',
      restoreBehavior: 'remove',
      recentlyClosedLimit: 50,
    });

    expect(result.count).toBe(1);
    expect(result.removed).toBe(true);
    expect(mockStorageStore.tabGroups).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 9. Configurable Recently Closed Retention Limits
  // ---------------------------------------------------------------------------
  it('Retention Limit: trims recently closed items dynamically based on user preferences', async () => {
    // Set custom limit to 3
    await setUserPreferences({ recentlyClosedLimit: 3 });

    const items = [
      { id: 'c1', title: 'T1', url: 'https://1.com', timestamp: '2026-08-11' },
      { id: 'c2', title: 'T2', url: 'https://2.com', timestamp: '2026-08-11' },
      { id: 'c3', title: 'T3', url: 'https://3.com', timestamp: '2026-08-11' },
      { id: 'c4', title: 'T4', url: 'https://4.com', timestamp: '2026-08-11' },
      { id: 'c5', title: 'T5', url: 'https://5.com', timestamp: '2026-08-11' },
    ];

    await saveRecentlyClosedItems(items);
    const stored = await getRecentlyClosedItems();

    expect(stored.length).toBe(3);
    expect(stored.map(i => i.id)).toEqual(['c1', 'c2', 'c3']);
  });

  // ---------------------------------------------------------------------------
  // 10. Multi-Format Exporters
  // ---------------------------------------------------------------------------
  it('Multi-Format Export: generates valid Markdown outline with links', async () => {
    mockStorageStore = {
      tabGroups: [
        {
          id: 1,
          date: '2026-08-11T12:00:00Z',
          name: 'Research',
          tabs: [
            { title: 'Google', url: 'https://google.com' },
            { title: 'GitHub', url: 'https://github.com' },
          ],
        },
      ],
      archivedGroups: [],
    };

    const md = await exportAsMarkdown();
    expect(md).toContain('# TwoTab Saved Collections');
    expect(md).toContain('### Research');
    expect(md).toContain('- [Google](https://google.com)');
    expect(md).toContain('- [GitHub](https://github.com)');
  });

  it('Multi-Format Export: generates OneTab-compatible plain text list', async () => {
    mockStorageStore = {
      tabGroups: [
        {
          id: 1,
          date: '2026-08-11T12:00:00Z',
          name: 'Group 1',
          tabs: [
            { title: 'A', url: 'https://a.com' },
            { title: 'B', url: 'https://b.com' },
          ],
        },
        {
          id: 2,
          date: '2026-08-11T12:00:00Z',
          name: 'Group 2',
          tabs: [
            { title: 'C', url: 'https://c.com' },
          ],
        },
      ],
    };

    const txt = await exportAsPlainText();
    expect(txt).toContain('https://a.com | A');
    expect(txt).toContain('https://b.com | B');
    expect(txt).toContain('https://c.com | C');
  });

  it('Multi-Format Export: generates valid Netscape HTML Bookmarks and CSV', async () => {
    mockStorageStore = {
      tabGroups: [
        {
          id: 1,
          date: '2026-08-11T12:00:00Z',
          name: 'Dev & Design',
          tabs: [{ title: 'Figma', url: 'https://figma.com' }],
        },
      ],
    };

    const html = await exportAsHtmlBookmarks();
    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(html).toContain('Dev &amp; Design</H3>');
    expect(html).toContain('<A HREF="https://figma.com"');

    const csv = await exportAsCsv();
    expect(csv).toContain('"Section","Group Name","Tab Title","URL","Saved Date"');
    expect(csv).toContain('"Active","Dev & Design","Figma","https://figma.com"');
  });

  // ---------------------------------------------------------------------------
  // 11. Multi-Source Importers (Merge vs Replace)
  // ---------------------------------------------------------------------------
  it('Import Engine: merges JSON backup without duplicate ID collisions', async () => {
    mockStorageStore = {
      tabGroups: [
        { id: 100, date: '2026-08-11', name: 'Existing Group', tabs: [{ title: 'E', url: 'https://e.com' }] },
      ],
      archivedGroups: [],
    };

    const importPayload = JSON.stringify({
      tabGroups: [
        { id: 100, date: '2026-08-11', name: 'Imported Group (Colliding ID)', tabs: [{ title: 'I', url: 'https://i.com' }] },
      ],
    });

    const success = await importData(importPayload, 'merge');
    expect(success).toBe(true);
    expect(mockStorageStore.tabGroups.length).toBe(2);
    // IDs should be unique
    const ids = mockStorageStore.tabGroups.map((g: TabGroup) => g.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('Import Engine: parses OneTab plain text and multi-group blocks', async () => {
    mockStorageStore = { tabGroups: [] };

    const oneTabText = `
https://site1.com | Site One
https://site2.com | Site Two

https://site3.com | Site Three
`;

    const res = await importOneTabOrPlainText(oneTabText, 'replace');
    expect(res.success).toBe(true);
    expect(res.importedGroupsCount).toBe(2);
    expect(res.importedTabsCount).toBe(3);
    expect(mockStorageStore.tabGroups.length).toBe(2);
    expect(mockStorageStore.tabGroups[0].tabs.length).toBe(2);
    expect(mockStorageStore.tabGroups[1].tabs.length).toBe(1);
  });
});
