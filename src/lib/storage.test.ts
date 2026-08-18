import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveGroups,
  getGroups,
  deleteGroup,
  deleteTabFromGroup,
  renameGroup,
  archiveGroup,
  unarchiveGroup,
  deleteArchivedGroup,
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
  removeRecentlyClosedItem,
  clearRecentlyClosedItems,
  restoreTabGroup,
  restoreAllTabGroups,
  getSafeDomain,
  formatDisplayUrl,
  getRelativeTime,
  createRollingBackup,
  getRollingBackupSnapshots,
  restoreFromRollingBackup,
  safeStorageSet,
  copyToClipboardSafe,
  reorderTabsInGroup,
  deleteMultipleTabsFromGroup,
  addTabToGroup,
  setGroupColor,
  extractTabsToNewGroup,
  exportSingleGroupAsMarkdown,
  exportSingleGroupAsPlainText,
  restoreTabsAsChromeGroup,
  DEFAULT_USER_PREFERENCES,
  CURRENT_SCHEMA_VERSION,
  type TabGroup,
  type TabGroupColor,
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
    group: vi.fn((props: { tabIds: number[] }) => Promise.resolve(777)),
  },
  tabGroups: {
    update: vi.fn((groupId: number, props: { title?: string; color?: string }) => Promise.resolve({ id: groupId, ...props })),
  },
  windows: {
    create: vi.fn((props: { url?: string | string[]; focused?: boolean }) => Promise.resolve({ id: 200, tabs: [{ id: 101, url: props.url }], ...props })),
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
    expect(prefs.enableFilmGrain).toBe(true);
    expect(prefs.cardDensity).toBe('comfortable');
    expect(prefs.ambientGlow).toBe('subtle');
    expect(prefs.faviconStyle).toBe('color');
    expect(prefs.uiScale).toBe('standard');
    expect(prefs.oledBlack).toBe(false);
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

  // ---------------------------------------------------------------------------
  // 12. Tab Group Operations & Mutations
  // ---------------------------------------------------------------------------
  it('Group Operations: deleteGroup removes matching group from storage', async () => {
    mockStorageStore = {
      tabGroups: [
        { id: 1, date: '2026-08-11', name: 'Group 1', tabs: [{ title: 'A', url: 'https://a.com' }] },
        { id: 2, date: '2026-08-11', name: 'Group 2', tabs: [{ title: 'B', url: 'https://b.com' }] },
      ],
    };

    await deleteGroup(1);
    expect(mockStorageStore.tabGroups.length).toBe(1);
    expect(mockStorageStore.tabGroups[0].id).toBe(2);
  });

  it('Group Operations: deleteTabFromGroup removes specific tab and auto-deletes group when empty', async () => {
    mockStorageStore = {
      tabGroups: [
        {
          id: 1,
          date: '2026-08-11',
          name: 'Group 1',
          tabs: [
            { title: 'A', url: 'https://a.com' },
            { title: 'B', url: 'https://b.com' },
          ],
        },
      ],
    };

    // Remove first tab -> group still has 1 tab
    await deleteTabFromGroup(1, 'https://a.com');
    expect(mockStorageStore.tabGroups.length).toBe(1);
    expect(mockStorageStore.tabGroups[0].tabs.length).toBe(1);
    expect(mockStorageStore.tabGroups[0].tabs[0].url).toBe('https://b.com');

    // Remove last tab -> group itself is removed from storage
    await deleteTabFromGroup(1, 'https://b.com');
    expect(mockStorageStore.tabGroups.length).toBe(0);
  });

  it('Group Operations: renameGroup updates group name with trimmed whitespace', async () => {
    mockStorageStore = {
      tabGroups: [
        { id: 1, date: '2026-08-11', name: 'Original Name', tabs: [{ title: 'A', url: 'https://a.com' }] },
      ],
    };

    await renameGroup(1, '   New Renamed Group   ');
    expect(mockStorageStore.tabGroups[0].name).toBe('New Renamed Group');
  });

  // ---------------------------------------------------------------------------
  // 13. Archiving & Lifecycle Engine
  // ---------------------------------------------------------------------------
  it('Archiving Engine: archiveGroup transfers group from active to archive', async () => {
    mockStorageStore = {
      tabGroups: [
        { id: 501, date: '2026-08-11', name: 'To Archive', tabs: [{ title: 'A', url: 'https://a.com' }] },
      ],
      archivedGroups: [],
    };

    await archiveGroup(501);
    expect(mockStorageStore.tabGroups.length).toBe(0);
    expect(mockStorageStore.archivedGroups.length).toBe(1);
    expect(mockStorageStore.archivedGroups[0].id).toBe(501);
  });

  it('Archiving Engine: unarchiveGroup transfers group from archive back to active', async () => {
    mockStorageStore = {
      tabGroups: [],
      archivedGroups: [
        { id: 502, date: '2026-08-11', name: 'Archived Group', tabs: [{ title: 'A', url: 'https://a.com' }] },
      ],
    };

    await unarchiveGroup(502);
    expect(mockStorageStore.archivedGroups.length).toBe(0);
    expect(mockStorageStore.tabGroups.length).toBe(1);
    expect(mockStorageStore.tabGroups[0].id).toBe(502);
  });

  it('Archiving Engine: deleteArchivedGroup permanently removes group from archive', async () => {
    mockStorageStore = {
      archivedGroups: [
        { id: 503, date: '2026-08-11', name: 'Archive 1', tabs: [{ title: 'A', url: 'https://a.com' }] },
        { id: 504, date: '2026-08-11', name: 'Archive 2', tabs: [{ title: 'B', url: 'https://b.com' }] },
      ],
    };

    await deleteArchivedGroup(503);
    expect(mockStorageStore.archivedGroups.length).toBe(1);
    expect(mockStorageStore.archivedGroups[0].id).toBe(504);
  });

  // ---------------------------------------------------------------------------
  // 14. Batch Restoration Engine (restoreAllTabGroups)
  // ---------------------------------------------------------------------------
  it('Batch Restoration: restores multiple groups in dedicated windows and removes from storage', async () => {
    const groups: TabGroup[] = [
      { id: 601, date: '2026-08-11', name: 'Group 1', tabs: [{ title: '1', url: 'https://1.com' }] },
      { id: 602, date: '2026-08-11', name: 'Group 2', tabs: [{ title: '2', url: 'https://2.com' }] },
    ];
    mockStorageStore = { tabGroups: [...groups] };

    const result = await restoreAllTabGroups(groups, {
      protectPinnedTabs: true,
      restoreDestination: 'new_window',
      restoreBehavior: 'remove',
      recentlyClosedLimit: 50,
    });

    expect(result.groupsCount).toBe(2);
    expect(result.count).toBe(2);
    expect(result.removed).toBe(true);
    expect(mockStorageStore.tabGroups).toEqual([]);
    expect(mockChrome.windows.create).toHaveBeenCalledWith({
      url: ['https://1.com', 'https://2.com'],
      focused: true,
    });
  });

  it('Batch Restoration: restores tabs into current window when configured', async () => {
    const groups: TabGroup[] = [
      { id: 603, date: '2026-08-11', name: 'Group 3', tabs: [{ title: '3', url: 'https://3.com' }] },
    ];
    mockStorageStore = { tabGroups: [...groups] };

    const result = await restoreAllTabGroups(groups, {
      protectPinnedTabs: true,
      restoreDestination: 'current_window',
      restoreBehavior: 'keep',
      recentlyClosedLimit: 50,
    });

    expect(result.groupsCount).toBe(1);
    expect(result.count).toBe(1);
    expect(result.removed).toBe(false);
    expect(mockStorageStore.tabGroups.length).toBe(1);
    expect(mockChrome.tabs.create).toHaveBeenCalledWith({ url: 'https://3.com', active: false });
  });

  // ---------------------------------------------------------------------------
  // 15. URL Sanitization & Domain Formatting Utilities
  // ---------------------------------------------------------------------------
  it('URL Utilities: getSafeDomain extracts clean domains and rejects invalid protocols', () => {
    expect(getSafeDomain('https://github.com/nickravesh/TwoTab')).toBe('github.com');
    expect(getSafeDomain('http://localhost:3000/dashboard')).toBe('localhost');
    expect(getSafeDomain('https://sub.domain.example.co.uk/page?id=1')).toBe('sub.domain.example.co.uk');

    // Should return null for non-http protocols or malformed inputs
    expect(getSafeDomain('javascript:alert(1)')).toBeNull();
    expect(getSafeDomain('data:text/html,<h1>Hello</h1>')).toBeNull();
    expect(getSafeDomain('chrome-extension://xyz/popup.html')).toBeNull();
    expect(getSafeDomain('')).toBeNull();
  });

  it('URL Utilities: formatDisplayUrl handles URI decoding and fallbacks cleanly', () => {
    expect(formatDisplayUrl('https://example.com/search%20query')).toBe('https://example.com/search query');
    expect(formatDisplayUrl('https://github.com/nickravesh')).toBe('https://github.com/nickravesh');
    expect(formatDisplayUrl('')).toBe('');
  });

  it('URL Utilities: getRelativeTime formats elapsed time human-readably', () => {
    const now = Date.now();
    const tenSecAgo = new Date(now - 10 * 1000).toISOString();
    const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
    const threeHoursAgo = new Date(now - 3 * 3600 * 1000).toISOString();
    const yesterday = new Date(now - 25 * 3600 * 1000).toISOString();
    const fiveDaysAgo = new Date(now - 5 * 24 * 3600 * 1000).toISOString();

    expect(getRelativeTime(tenSecAgo)).toBe('just now');
    expect(getRelativeTime(fiveMinAgo)).toBe('5m ago');
    expect(getRelativeTime(threeHoursAgo)).toBe('3h ago');
    expect(getRelativeTime(yesterday)).toBe('yesterday');
    expect(getRelativeTime(fiveDaysAgo)).toBe('5d ago');
    expect(getRelativeTime('')).toBe('N/A');
  });

  // ---------------------------------------------------------------------------
  // 16. Rolling Backups & Snapshots
  // ---------------------------------------------------------------------------
  it('Rolling Backups: creates snapshots, deduplicates unchanged data, trims to latest 5, and restores successfully', async () => {
    mockStorageStore = {
      tabGroups: [{ id: 101, date: '2026-08-11', name: 'Snapshot Tab', tabs: [{ title: 'A', url: 'https://a.com' }] }],
      archivedGroups: [{ id: 201, date: '2026-08-11', name: 'Archived Tab', tabs: [] }],
      _backupSnapshots: [
        { timestamp: 1000, data: { tabGroups: [] } },
        { timestamp: 2000, data: { tabGroups: [] } },
        { timestamp: 3000, data: { tabGroups: [] } },
        { timestamp: 4000, data: { tabGroups: [] } },
        { timestamp: 5000, data: { tabGroups: [] } },
      ],
    };

    // 1. First backup with new data should succeed
    const createdFirst = await createRollingBackup();
    expect(createdFirst).toBe(true);

    const snapshots = await getRollingBackupSnapshots();
    // Must cap at 5 snapshots
    expect(snapshots.length).toBe(5);
    // Most recent snapshot should be first (sorted desc)
    expect(snapshots[0].data.tabGroups?.length).toBe(1);
    expect(snapshots[0].data.tabGroups?.[0].id).toBe(101);

    // 2. Second backup with identical data should be skipped (deduplication)
    const createdSecond = await createRollingBackup();
    expect(createdSecond).toBe(false);
    expect((await getRollingBackupSnapshots()).length).toBe(5);

    // 3. Simulate restoring from the snapshot
    mockStorageStore.tabGroups = [];
    const restored = await restoreFromRollingBackup(snapshots[0].timestamp);
    expect(restored).toBe(true);
    expect(mockStorageStore.tabGroups.length).toBe(1);
    expect(mockStorageStore.tabGroups[0].id).toBe(101);
  });

  // ---------------------------------------------------------------------------
  // 17. Recently Closed History Management
  // ---------------------------------------------------------------------------
  it('Recently Closed: removeRecentlyClosedItem and clearRecentlyClosedItems manage history', async () => {
    mockStorageStore = {
      recentlyClosed: [
        { id: 'close_1', title: 'T1', url: 'https://1.com', timestamp: '2026-08-11' },
        { id: 'close_2', title: 'T2', url: 'https://2.com', timestamp: '2026-08-11' },
      ],
    };

    // Remove single closed item
    await removeRecentlyClosedItem('close_1');
    expect(mockStorageStore.recentlyClosed.length).toBe(1);
    expect(mockStorageStore.recentlyClosed[0].id).toBe('close_2');

    // Clear all closed history
    await clearRecentlyClosedItems();
    const remaining = await getRecentlyClosedItems();
    expect(remaining).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 18. Import Edge Cases (Markdown links & Replace mode)
  // ---------------------------------------------------------------------------
  it('Import Engine: parses markdown links format [Title](URL) in text import', async () => {
    mockStorageStore = { tabGroups: [] };

    const mdText = `
- [GitHub](https://github.com)
- [Google Search](https://google.com)
`;

    const res = await importOneTabOrPlainText(mdText, 'merge');
    expect(res.success).toBe(true);
    expect(res.importedTabsCount).toBe(2);
    expect(mockStorageStore.tabGroups[0].tabs[0].title).toBe('GitHub');
    expect(mockStorageStore.tabGroups[0].tabs[0].url).toBe('https://github.com');
  });

  it('Import Engine: replace mode wipes existing data and installs imported state', async () => {
    mockStorageStore = {
      tabGroups: [{ id: 99, date: '2026-08-11', name: 'Old Group', tabs: [{ title: 'Old', url: 'https://old.com' }] }],
      archivedGroups: [{ id: 98, date: '2026-08-11', name: 'Old Archive', tabs: [] }],
    };

    const payload = JSON.stringify({
      tabGroups: [{ id: 1, date: '2026-08-11', name: 'New Group', tabs: [{ title: 'New', url: 'https://new.com' }] }],
      archivedGroups: [],
    });

    const success = await importData(payload, 'replace');
    expect(success).toBe(true);
    expect(mockStorageStore.tabGroups.length).toBe(1);
    expect(mockStorageStore.tabGroups[0].id).toBe(1);
    expect(mockStorageStore.archivedGroups.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 19. safeStorageSet Serialization
  // ---------------------------------------------------------------------------
  it('safeStorageSet: writes data safely into storage engine', async () => {
    await safeStorageSet({ customKey: 'hello_twotab' });
    expect(mockStorageStore.customKey).toBe('hello_twotab');
  });

  // ---------------------------------------------------------------------------
  // 20. Clipboard Safe Engine
  // ---------------------------------------------------------------------------
  it('copyToClipboardSafe: handles empty text and copies with navigator.clipboard or fallback', async () => {
    const emptyResult = await copyToClipboardSafe('');
    expect(emptyResult).toBe(false);

    // Mock navigator.clipboard
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    });

    const success = await copyToClipboardSafe('https://example.com');
    expect(success).toBe(true);
    expect(mockWriteText).toHaveBeenCalledWith('https://example.com');
  });

  // ---------------------------------------------------------------------------
  // 21. Inspector Tab Group Operations (Reorder, Batch Delete, Add, Color, Extract)
  // ---------------------------------------------------------------------------
  it('reorderTabsInGroup: reorders tabs within a group accurately', async () => {
    mockStorageStore = {
      tabGroups: [
        {
          id: 801,
          date: '2026-08-11',
          name: 'Reorder Test',
          tabs: [
            { title: 'Tab 0', url: 'https://0.com' },
            { title: 'Tab 1', url: 'https://1.com' },
            { title: 'Tab 2', url: 'https://2.com' },
          ],
        },
      ],
    };

    await reorderTabsInGroup(801, 0, 2);
    expect(mockStorageStore.tabGroups[0].tabs.map((t: any) => t.title)).toEqual(['Tab 1', 'Tab 2', 'Tab 0']);
  });

  it('deleteMultipleTabsFromGroup: deletes selected tabs by index and cleans empty groups', async () => {
    mockStorageStore = {
      tabGroups: [
        {
          id: 802,
          date: '2026-08-11',
          name: 'Batch Delete Test',
          tabs: [
            { title: 'Tab A', url: 'https://a.com' },
            { title: 'Tab B', url: 'https://b.com' },
            { title: 'Tab C', url: 'https://c.com' },
          ],
        },
      ],
    };

    await deleteMultipleTabsFromGroup(802, [0, 2]);
    expect(mockStorageStore.tabGroups[0].tabs.length).toBe(1);
    expect(mockStorageStore.tabGroups[0].tabs[0].title).toBe('Tab B');

    // Deleting the last tab removes the group
    await deleteMultipleTabsFromGroup(802, [0]);
    expect(mockStorageStore.tabGroups.length).toBe(0);
  });

  it('addTabToGroup: appends new tab safely', async () => {
    mockStorageStore = {
      tabGroups: [
        {
          id: 803,
          date: '2026-08-11',
          name: 'Add Tab Test',
          tabs: [{ title: 'Existing', url: 'https://existing.com' }],
        },
      ],
    };

    await addTabToGroup(803, { title: 'New Tab', url: 'https://newtab.com' });
    expect(mockStorageStore.tabGroups[0].tabs.length).toBe(2);
    expect(mockStorageStore.tabGroups[0].tabs[1].url).toBe('https://newtab.com');
  });

  it('setGroupColor: updates group color accent', async () => {
    mockStorageStore = {
      tabGroups: [
        {
          id: 804,
          date: '2026-08-11',
          name: 'Color Test',
          tabs: [{ title: 'Tab', url: 'https://tab.com' }],
        },
      ],
    };

    await setGroupColor(804, 'purple');
    expect(mockStorageStore.tabGroups[0].color).toBe('purple');
  });

  it('extractTabsToNewGroup: splits selected tabs into a new group atomically', async () => {
    mockStorageStore = {
      tabGroups: [
        {
          id: 805,
          date: '2026-08-11',
          name: 'Source Group',
          color: 'cyan',
          tabs: [
            { title: 'Tab 1', url: 'https://1.com' },
            { title: 'Tab 2', url: 'https://2.com' },
            { title: 'Tab 3', url: 'https://3.com' },
          ],
        },
      ],
    };

    const newId = await extractTabsToNewGroup(805, [0, 2], 'Extracted Project');
    expect(newId).toBeTruthy();
    expect(mockStorageStore.tabGroups.length).toBe(2);
    expect(mockStorageStore.tabGroups[0].name).toBe('Extracted Project');
    expect(mockStorageStore.tabGroups[0].tabs.length).toBe(2);
    expect(mockStorageStore.tabGroups[0].color).toBe('cyan');
    // Source group has 1 tab left
    expect(mockStorageStore.tabGroups[1].tabs.length).toBe(1);
    expect(mockStorageStore.tabGroups[1].tabs[0].title).toBe('Tab 2');
  });

  it('exportSingleGroup formats markdown and plaintext correctly', () => {
    const group: TabGroup = {
      id: 806,
      date: '2026-08-11T12:00:00Z',
      name: 'Single Export Test',
      tabs: [
        { title: 'Alpha [Special]', url: 'https://alpha.com' },
        { title: 'Beta', url: 'https://beta.com' },
      ],
    };

    const md = exportSingleGroupAsMarkdown(group);
    expect(md).toContain('## Single Export Test (2 tabs)');
    expect(md).toContain('- [Alpha Special](https://alpha.com)');
    expect(md).toContain('- [Beta](https://beta.com)');

    const txt = exportSingleGroupAsPlainText(group);
    expect(txt).toBe('https://alpha.com | Alpha [Special]\nhttps://beta.com | Beta');
  });

  describe('URL Parsing & Formatting Helpers', () => {
    it('getSafeDomain: correctly extracts hostnames and handles edge cases', () => {
      expect(getSafeDomain('https://www.google.com/search?q=test')).toBe('www.google.com');
      expect(getSafeDomain('http://sub.domain.example.co.uk:8080/path')).toBe('sub.domain.example.co.uk');
      expect(getSafeDomain('https://192.168.1.1/dashboard')).toBe('192.168.1.1');
      expect(getSafeDomain('https://localhost:3000')).toBe('localhost');

      // Invalid or non-web protocols return null
      expect(getSafeDomain('about:blank')).toBeNull();
      expect(getSafeDomain('javascript:void(0)')).toBeNull();
      expect(getSafeDomain('')).toBeNull();
      expect(getSafeDomain('invalid-url-string')).toBeNull();
    });

    it('formatDisplayUrl: handles URI decoding and fallbacks cleanly', () => {
      expect(formatDisplayUrl('https://example.com/hello%20world')).toBe('https://example.com/hello world');
      expect(formatDisplayUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
      expect(formatDisplayUrl('')).toBe('');
    });

    it('getRelativeTime: formats relative intervals accurately', () => {
      const now = new Date();
      expect(getRelativeTime(now.toISOString())).toBe('just now');

      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      expect(getRelativeTime(fiveMinutesAgo.toISOString())).toBe('5m ago');

      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      expect(getRelativeTime(twoHoursAgo.toISOString())).toBe('2h ago');

      const yesterday = new Date(now.getTime() - 26 * 60 * 60 * 1000);
      expect(getRelativeTime(yesterday.toISOString())).toBe('yesterday');

      const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
      expect(getRelativeTime(fourDaysAgo.toISOString())).toBe('4d ago');
    });
  });

  describe('Native Chrome Tab Group Restoration', () => {
    it('restoreTabsAsChromeGroup: creates tabs and groups them via chrome.tabs.group and tabGroups.update', async () => {
      const tabs = [
        { title: 'GitHub', url: 'https://github.com' },
        { title: 'Google', url: 'https://google.com' },
      ];

      await restoreTabsAsChromeGroup('Dev Project', tabs, 'cyan', 'current_window');

      expect(mockChrome.tabs.create).toHaveBeenCalledWith({ url: 'https://github.com', active: false });
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({ url: 'https://google.com', active: false });
      expect(mockChrome.tabs.group).toHaveBeenCalled();
      expect(mockChrome.tabGroups.update).toHaveBeenCalledWith(777, {
        title: 'Dev Project',
        color: 'cyan',
      });
    });

    it('restoreTabsAsChromeGroup: handles new_window mode and window creation', async () => {
      const tabs = [{ title: 'Single Tab', url: 'https://single.com' }];
      await restoreTabsAsChromeGroup('New Window Group', tabs, 'purple', 'new_window');

      expect(mockChrome.windows.create).toHaveBeenCalled();
      expect(mockChrome.tabGroups.update).toHaveBeenCalledWith(777, {
        title: 'New Window Group',
        color: 'purple',
      });
    });
  });

  describe('Inspector Storage Operations Edge Cases', () => {
    it('reorderTabsInGroup: ignores invalid or out-of-bound indices safely', async () => {
      mockStorageStore = {
        tabGroups: [
          {
            id: 880,
            date: '2026-08-11',
            tabs: [
              { title: 'T1', url: 'https://1.com' },
              { title: 'T2', url: 'https://2.com' },
            ],
          },
        ],
      };

      await reorderTabsInGroup(880, -1, 5);
      expect(mockStorageStore.tabGroups[0].tabs.map((t: any) => t.title)).toEqual(['T1', 'T2']);
    });

    it('addTabToGroup: rejects empty or whitespace-only URLs without throwing', async () => {
      mockStorageStore = {
        tabGroups: [
          {
            id: 881,
            date: '2026-08-11',
            tabs: [{ title: 'T1', url: 'https://1.com' }],
          },
        ],
      };

      await addTabToGroup(881, { title: 'Empty', url: '   ' });
      expect(mockStorageStore.tabGroups[0].tabs.length).toBe(1);
    });

    it('setGroupColor: clears group color when undefined is passed', async () => {
      mockStorageStore = {
        tabGroups: [
          {
            id: 882,
            date: '2026-08-11',
            color: 'orange',
            tabs: [{ title: 'T1', url: 'https://1.com' }],
          },
        ],
      };

      await setGroupColor(882, undefined);
      expect(mockStorageStore.tabGroups[0].color).toBeUndefined();
    });

    it('extractTabsToNewGroup: returns null when passed empty indices or non-existent group', async () => {
      mockStorageStore = {
        tabGroups: [
          {
            id: 883,
            date: '2026-08-11',
            tabs: [{ title: 'T1', url: 'https://1.com' }],
          },
        ],
      };

      const result1 = await extractTabsToNewGroup(883, []);
      expect(result1).toBeNull();
      expect(mockStorageStore.tabGroups.length).toBe(1);

      const result2 = await extractTabsToNewGroup(99999, [0]);
      expect(result2).toBeNull();
    });
  });
});
