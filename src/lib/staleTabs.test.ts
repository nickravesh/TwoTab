import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateAgeInDays,
  categorizeAge,
  formatAgeLabel,
  extractTopDomainsFromTabs,
  analyzeStaleLibrary,
  archiveStaleGroups,
  consolidateStaleFragments,
  deleteStaleGroups,
  deleteSingleStaleTab,
  exportStaleTabsToMarkdown,
  getInactiveImpactSummary,
} from './staleTabs';
import { type TabGroup, getGroups, getArchivedGroups } from './storage';

// =============================================================================
// Chrome Storage Mock
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
            if (mockStorageStore[k] !== undefined) res[k] = mockStorageStore[k];
          }
          return Promise.resolve(res);
        }
        return Promise.resolve({ ...mockStorageStore });
      }),
      set: vi.fn((items: Record<string, any>, cb?: () => void) => {
        Object.assign(mockStorageStore, items);
        if (cb) cb();
        return Promise.resolve();
      }),
      remove: vi.fn((keys: any, cb?: () => void) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockStorageStore[k];
        if (cb) cb();
        return Promise.resolve();
      }),
      clear: vi.fn((cb?: () => void) => {
        for (const k in mockStorageStore) delete mockStorageStore[k];
        if (cb) cb();
        return Promise.resolve();
      }),
      getBytesInUse: vi.fn((_keys, cb) => {
        if (cb) cb(1024);
        return Promise.resolve(1024);
      }),
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
  runtime: {
    lastError: null,
  },
};

(globalThis as any).chrome = mockChrome;

describe('Stale Tabs & Aging Purifier Engine', () => {
  const FIXED_NOW = new Date('2026-10-01T12:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
    for (const k in mockStorageStore) delete mockStorageStore[k];
    mockStorageStore._backupSnapshots = [];
    mockStorageStore._schemaVersion = 1;
    mockStorageStore.tabGroups = [];
    mockStorageStore.archivedGroups = [];
  });

  describe('1. calculateAgeInDays', () => {
    it('calculates 0 days for current or near-current timestamps', () => {
      expect(calculateAgeInDays(FIXED_NOW.toISOString(), FIXED_NOW)).toBe(0);
      const fewHoursAgo = new Date(FIXED_NOW.getTime() - 4 * 3600 * 1000).toISOString();
      expect(calculateAgeInDays(fewHoursAgo, FIXED_NOW)).toBe(0);
    });

    it('calculates exact elapsed days accurately', () => {
      const tenDaysAgo = new Date(FIXED_NOW.getTime() - 10 * 24 * 3600 * 1000).toISOString();
      expect(calculateAgeInDays(tenDaysAgo, FIXED_NOW)).toBe(10);

      const hundredDaysAgo = new Date(FIXED_NOW.getTime() - 100 * 24 * 3600 * 1000).toISOString();
      expect(calculateAgeInDays(hundredDaysAgo, FIXED_NOW)).toBe(100);

      const yearAgo = new Date(FIXED_NOW.getTime() - 365 * 24 * 3600 * 1000).toISOString();
      expect(calculateAgeInDays(yearAgo, FIXED_NOW)).toBe(365);
    });

    it('gracefully handles missing, empty, or invalid date strings without crashing or returning NaN', () => {
      expect(calculateAgeInDays(undefined, FIXED_NOW)).toBe(0);
      expect(calculateAgeInDays('', FIXED_NOW)).toBe(0);
      expect(calculateAgeInDays('   ', FIXED_NOW)).toBe(0);
      expect(calculateAgeInDays('invalid-date-format', FIXED_NOW)).toBe(0);
    });

    it('returns 0 for timestamps in the future', () => {
      const tomorrow = new Date(FIXED_NOW.getTime() + 24 * 3600 * 1000).toISOString();
      expect(calculateAgeInDays(tomorrow, FIXED_NOW)).toBe(0);
    });
  });

  describe('2. categorizeAge & formatAgeLabel', () => {
    it('categorizes age across all four horizons correctly', () => {
      expect(categorizeAge(0)).toBe('fresh');
      expect(categorizeAge(29)).toBe('fresh');
      expect(categorizeAge(30)).toBe('aging');
      expect(categorizeAge(89)).toBe('aging');
      expect(categorizeAge(90)).toBe('stale');
      expect(categorizeAge(179)).toBe('stale');
      expect(categorizeAge(180)).toBe('ancient');
      expect(categorizeAge(500)).toBe('ancient');
    });

    it('formats human-friendly age labels', () => {
      expect(formatAgeLabel(0)).toBe('Today');
      expect(formatAgeLabel(1)).toBe('1 day ago');
      expect(formatAgeLabel(14)).toBe('14 days ago');
      expect(formatAgeLabel(35)).toBe('1 month ago');
      expect(formatAgeLabel(95)).toBe('3 months ago');
      expect(formatAgeLabel(365)).toBe('1 year ago');
      expect(formatAgeLabel(800)).toBe('2.2 years ago');
    });
  });

  describe('3. extractTopDomainsFromTabs', () => {
    it('extracts and ranks unique domains correctly', () => {
      const tabs = [
        { title: 'Repo 1', url: 'https://github.com/repo1' },
        { title: 'Repo 2', url: 'https://github.com/repo2' },
        { title: 'Video', url: 'https://youtube.com/watch?v=123' },
        { title: 'Docs', url: 'https://docs.github.com/en' },
        { title: 'Internal', url: 'chrome://settings' },
      ];

      const top = extractTopDomainsFromTabs(tabs);
      expect(top.length).toBeGreaterThan(0);
      expect(top[0].domain).toBe('github.com');
      expect(top[0].count).toBe(2);
    });

    it('handles empty or malformed tabs gracefully', () => {
      expect(extractTopDomainsFromTabs([])).toEqual([]);
      expect(extractTopDomainsFromTabs([{ title: 'Bad', url: '' }])).toEqual([]);
    });
  });

  describe('4. analyzeStaleLibrary', () => {
    const mockGroups: TabGroup[] = [
      {
        id: 1,
        name: 'Fresh Project',
        color: 'blue',
        date: new Date(FIXED_NOW.getTime() - 5 * 24 * 3600 * 1000).toISOString(), // 5 days (Fresh)
        tabs: [
          { title: 'Google', url: 'https://google.com' },
          { title: 'GitHub', url: 'https://github.com' },
        ],
      },
      {
        id: 2,
        name: 'Summer Research',
        color: 'yellow',
        date: new Date(FIXED_NOW.getTime() - 45 * 24 * 3600 * 1000).toISOString(), // 45 days (Aging)
        tabs: [
          { title: 'MDN', url: 'https://developer.mozilla.org' },
          { title: 'W3C', url: 'https://w3c.org' },
        ],
      },
      {
        id: 3,
        name: 'Forgotten Notes',
        color: 'orange',
        date: new Date(FIXED_NOW.getTime() - 120 * 24 * 3600 * 1000).toISOString(), // 120 days (Stale Fragment)
        tabs: [{ title: 'Wikipedia', url: 'https://wikipedia.org' }],
      },
      {
        id: 4,
        name: 'Ancient Dev Setup',
        color: 'red',
        date: new Date(FIXED_NOW.getTime() - 250 * 24 * 3600 * 1000).toISOString(), // 250 days (Ancient)
        tabs: [
          { title: 'Archived Site 1', url: 'https://example.com/1' },
          { title: 'Archived Site 2', url: 'https://example.com/2' },
          { title: 'Archived Site 3', url: 'https://example.com/3' },
          { title: 'Archived Site 4', url: 'https://example.com/4' },
        ],
      },
    ];

    it('computes correct group categories and age intelligence', () => {
      const { groups, summary } = analyzeStaleLibrary(mockGroups, { now: FIXED_NOW });

      expect(groups.length).toBe(4);
      expect(summary.totalGroups).toBe(4);
      expect(summary.totalTabs).toBe(9);

      expect(summary.freshGroupsCount).toBe(1);
      expect(summary.freshTabsCount).toBe(2);

      expect(summary.agingGroupsCount).toBe(1);
      expect(summary.agingTabsCount).toBe(2);

      expect(summary.staleGroupsCount).toBe(1);
      expect(summary.staleTabsCount).toBe(1);

      expect(summary.ancientGroupsCount).toBe(1);
      expect(summary.ancientTabsCount).toBe(4);

      // Fragment detection: group 3 has 1 tab and is 120 days old (>= 90d, <= 3 tabs)
      expect(summary.fragmentsCount).toBe(1);
      expect(summary.fragmentTabsCount).toBe(1);

      const fragmentGroup = groups.find((g) => g.id === 3);
      expect(fragmentGroup?.isFragment).toBe(true);

      // Oldest group record
      expect(summary.oldestGroupAgeDays).toBe(250);
      expect(summary.oldestGroupDate).toBe(mockGroups[3].date);
    });

    it('sorts groups oldest-first by default', () => {
      const { groups } = analyzeStaleLibrary(mockGroups, { now: FIXED_NOW });
      expect(groups[0].id).toBe(4); // 250 days
      expect(groups[1].id).toBe(3); // 120 days
      expect(groups[2].id).toBe(2); // 45 days
      expect(groups[3].id).toBe(1); // 5 days
    });
  });

  describe('4b. getInactiveImpactSummary', () => {
    const mockGroups: TabGroup[] = [
      {
        id: 1,
        name: 'Fresh Active',
        color: 'blue',
        date: new Date(FIXED_NOW.getTime() - 5 * 24 * 3600 * 1000).toISOString(),
        tabs: [{ title: 'Tab 1', url: 'https://tab1.com' }],
      },
      {
        id: 2,
        name: 'Aging Group',
        color: 'yellow',
        date: new Date(FIXED_NOW.getTime() - 40 * 24 * 3600 * 1000).toISOString(),
        tabs: [
          { title: 'Tab 2', url: 'https://tab2.com' },
          { title: 'Tab 3', url: 'https://tab3.com' },
        ],
      },
      {
        id: 3,
        name: 'Old Small Group',
        color: 'orange',
        date: new Date(FIXED_NOW.getTime() - 100 * 24 * 3600 * 1000).toISOString(),
        tabs: [{ title: 'Tab 4', url: 'https://tab4.com' }],
      },
      {
        id: 4,
        name: 'Ancient Large Group',
        color: 'red',
        date: new Date(FIXED_NOW.getTime() - 200 * 24 * 3600 * 1000).toISOString(),
        tabs: [
          { title: 'Tab 5', url: 'https://tab5.com' },
          { title: 'Tab 6', url: 'https://tab6.com' },
          { title: 'Tab 7', url: 'https://tab7.com' },
        ],
      },
    ];

    it('calculates impact for 90 days threshold', () => {
      const summary = getInactiveImpactSummary(mockGroups, 90, FIXED_NOW);
      expect(summary.totalActiveGroups).toBe(4);
      expect(summary.totalActiveTabs).toBe(7);
      expect(summary.matchingInactiveGroups).toBe(2); // groups 3 & 4
      expect(summary.matchingInactiveTabs).toBe(4); // 1 + 3
      expect(summary.remainingActiveGroups).toBe(2); // groups 1 & 2
      expect(summary.remainingActiveTabs).toBe(3); // 1 + 2
      expect(summary.scatteredSmallGroupsCount).toBe(1); // group 3 (<= 2 tabs)
      expect(summary.scatteredSmallTabsCount).toBe(1);
    });

    it('calculates impact for 30 days threshold', () => {
      const summary = getInactiveImpactSummary(mockGroups, 30, FIXED_NOW);
      expect(summary.matchingInactiveGroups).toBe(3); // groups 2, 3, 4
      expect(summary.remainingActiveGroups).toBe(1); // group 1
    });
  });

  describe('5. Batch Mutations & Storage Safeguards', () => {
    const testGroups: TabGroup[] = [
      {
        id: 101,
        name: 'Stale 1',
        color: 'orange',
        date: new Date(FIXED_NOW.getTime() - 100 * 24 * 3600 * 1000).toISOString(),
        tabs: [{ title: 'Tab 1', url: 'https://tab1.com' }],
      },
      {
        id: 102,
        name: 'Stale 2',
        color: 'orange',
        date: new Date(FIXED_NOW.getTime() - 110 * 24 * 3600 * 1000).toISOString(),
        tabs: [{ title: 'Tab 2', url: 'https://tab2.com' }],
      },
      {
        id: 103,
        name: 'Fresh Active',
        color: 'blue',
        date: FIXED_NOW.toISOString(),
        tabs: [{ title: 'Tab 3', url: 'https://tab3.com' }],
      },
    ];

    beforeEach(() => {
      mockStorageStore.tabGroups = JSON.parse(JSON.stringify(testGroups));
      mockStorageStore.archivedGroups = [];
    });

    it('archiveStaleGroups moves targeted groups to archivedGroups and creates a backup snapshot', () => {
      return archiveStaleGroups([101, 102]).then(async (res) => {
        expect(res.count).toBe(2);
        expect(res.tabsArchived).toBe(2);

        const active = await getGroups();
        const archived = await getArchivedGroups();

        expect(active.length).toBe(1);
        expect(active[0].id).toBe(103);

        expect(archived.length).toBe(2);
        expect(archived.map((g) => g.id)).toContain(101);
        expect(archived.map((g) => g.id)).toContain(102);

        // Verification of backup snapshot creation
        expect(mockStorageStore._backupSnapshots.length).toBeGreaterThan(0);
      });
    });

    it('consolidateStaleFragments merges small groups into one and removes source groups', async () => {
      const res = await consolidateStaleFragments([101, 102], {
        groupName: 'Consolidated Test Archive',
        groupColor: 'purple',
      });

      expect(res.prunedGroupsCount).toBe(2);
      expect(res.consolidatedTabsCount).toBe(2);

      const active = await getGroups();
      expect(active.length).toBe(2); // 1 new consolidated + 1 fresh active

      const consolidated = active.find((g) => g.id === res.newGroupId);
      expect(consolidated).toBeDefined();
      expect(consolidated?.name).toBe('Consolidated Test Archive');
      expect(consolidated?.color).toBe('purple');
      expect(consolidated?.tabs.length).toBe(2);

      // Verify source groups were removed
      expect(active.find((g) => g.id === 101)).toBeUndefined();
      expect(active.find((g) => g.id === 102)).toBeUndefined();
    });

    it('deleteStaleGroups prunes target groups and records a backup snapshot', async () => {
      const res = await deleteStaleGroups([101]);
      expect(res.count).toBe(1);
      expect(res.tabsDeleted).toBe(1);

      const active = await getGroups();
      expect(active.length).toBe(2);
      expect(active.find((g) => g.id === 101)).toBeUndefined();
      expect(mockStorageStore._backupSnapshots.length).toBeGreaterThan(0);
    });

    it('deleteSingleStaleTab removes a single tab and prunes parent group when it becomes empty', async () => {
      // 101 has 1 tab. Deleting index 0 should prune group 101
      const res = await deleteSingleStaleTab(101, 0);
      expect(res.groupPruned).toBe(true);

      const active = await getGroups();
      expect(active.find((g) => g.id === 101)).toBeUndefined();
    });
  });

  describe('6. Markdown Export', () => {
    it('formats a clean, structured Markdown document', () => {
      const mockGroups: TabGroup[] = [
        {
          id: 501,
          name: 'Old Reading List',
          color: 'blue',
          date: '2025-01-15T00:00:00Z',
          tabs: [
            { title: 'Article 1', url: 'https://example.com/art1' },
            { title: 'Article 2', url: 'https://example.com/art2' },
          ],
        },
      ];

      const { groups } = analyzeStaleLibrary(mockGroups, { now: FIXED_NOW });
      const md = exportStaleTabsToMarkdown(groups);

      expect(md).toContain('# TwoTab Dormant Collections Archive');
      expect(md).toContain('## Old Reading List (2 tabs)');
      expect(md).toContain('- [Article 1](https://example.com/art1)');
      expect(md).toContain('- [Article 2](https://example.com/art2)');
    });
  });
});
