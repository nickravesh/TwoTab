import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeUrl,
  normalizeTitle,
  findDuplicateClusters,
  findDuplicateGroups,
  getDeduplicationSummary,
  cleanAllDuplicates,
  removeSpecificInstances,
  mergeGroups,
} from './deduplication';
import { type TabGroup } from './storage';

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
      set: vi.fn((_items, cb) => {
        if (cb) cb();
        return Promise.resolve();
      }),
      remove: vi.fn((_keys, cb) => {
        if (cb) cb();
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    lastError: null,
  },
};

(globalThis as any).chrome = mockChrome;

describe('Deduplication Engine Unit & Invariant Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k in mockStorageStore) delete mockStorageStore[k];
    mockStorageStore._backupSnapshots = [];
    mockStorageStore._schemaVersion = 1;
  });

  describe('URL Normalization Engine (normalizeUrl)', () => {
    it('strips all marketing and analytics tracking parameters (utm_*, fbclid, gclid, etc.)', () => {
      const dirtyUrl = 'https://github.com/nickravesh/TwoTab?utm_source=twitter&utm_medium=social&utm_campaign=launch&fbclid=IwAR0xyz&ref=producthunt';
      const clean = normalizeUrl(dirtyUrl);
      expect(clean).toBe('https://github.com/nickravesh/TwoTab');
      expect(clean).not.toContain('utm_source');
      expect(clean).not.toContain('fbclid');
      expect(clean).not.toContain('ref');
    });

    it('strictly preserves functional query parameters (search query, pagination, IDs)', () => {
      const searchUrl = 'https://www.google.com/search?q=react+state&p=2&utm_source=chrome';
      const clean = normalizeUrl(searchUrl);
      expect(clean).toContain('p=2');
      expect(clean).toContain('q=react+state');
      expect(clean).not.toContain('utm_source');
      expect(clean.startsWith('https://google.com/search')).toBe(true);
    });

    it('canonicalizes YouTube URLs and shorteners', () => {
      const shortUrl = 'https://youtu.be/dQw4w9WgXcQ?si=abcdef123&t=45s';
      const clean = normalizeUrl(shortUrl);
      expect(clean).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ');

      const fullUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share&t=10s';
      const cleanFull = normalizeUrl(fullUrl);
      expect(cleanFull).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('canonicalizes Wikipedia mobile subdomains and Twitter/X handles', () => {
      const wikiMobile = 'https://en.m.wikipedia.org/wiki/React_(software)?utm_source=mobile';
      const cleanWiki = normalizeUrl(wikiMobile);
      expect(cleanWiki).toBe('https://en.wikipedia.org/wiki/React_(software)');

      const twitterMobile = 'https://mobile.twitter.com/shadcn/status/12345';
      const cleanTwitter = normalizeUrl(twitterMobile);
      expect(cleanTwitter).toBe('https://x.com/shadcn/status/12345');
    });

    it('strips fragments/hashes and normalizes trailing slashes and default ports', () => {
      const raw = 'http://example.com:80/docs/#section-1';
      const clean = normalizeUrl(raw);
      expect(clean).toBe('https://example.com/docs');
    });
  });

  describe('Title Normalization (normalizeTitle)', () => {
    it('strips common platform branding suffixes and lowercases', () => {
      expect(normalizeTitle('Building React Apps - YouTube')).toBe('building react apps');
      expect(normalizeTitle('TwoTab Extension | GitHub')).toBe('twotab extension');
      expect(normalizeTitle('Quantum Computing - Wikipedia')).toBe('quantum computing');
    });
  });

  describe('Duplicate Cluster Detection (findDuplicateClusters)', () => {
    const mockGroups: TabGroup[] = [
      {
        id: 101,
        name: 'Project Alpha (Oldest)',
        date: '2026-01-01T10:00:00Z',
        color: 'blue',
        tabs: [
          { title: 'TwoTab Repo - GitHub', url: 'https://github.com/nickravesh/TwoTab' },
          { title: 'Google Docs', url: 'https://docs.google.com/document/d/123' },
          { title: 'Unique Tab 1', url: 'https://site-a.com' },
        ],
      },
      {
        id: 102,
        name: 'Project Beta (Newest)',
        date: '2026-06-01T10:00:00Z',
        color: 'purple',
        tabs: [
          { title: 'TwoTab Extension', url: 'https://github.com/nickravesh/TwoTab?utm_source=newsletter' },
          { title: 'Google Docs Reference', url: 'https://docs.google.com/document/d/123#heading-1' },
          { title: 'YouTube Tutorial', url: 'https://youtu.be/dQw4w9WgXcQ' },
        ],
      },
      {
        id: 103,
        name: 'Project Gamma (Largest)',
        date: '2026-03-01T10:00:00Z',
        color: 'green',
        tabs: [
          { title: 'TwoTab on GitHub', url: 'https://www.github.com/nickravesh/TwoTab/' },
          { title: 'YouTube Video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share' },
          { title: 'Extra 1', url: 'https://extra1.com' },
          { title: 'Extra 2', url: 'https://extra2.com' },
          { title: 'Extra 3', url: 'https://extra3.com' },
        ],
      },
    ];

    it('correctly identifies duplicate clusters with mixed tracking and shortener variants', () => {
      const clusters = findDuplicateClusters(mockGroups);

      // We expect 3 duplicate clusters:
      // 1. GitHub repo (3 copies)
      // 2. Google Docs (2 copies)
      // 3. YouTube video (2 copies)
      expect(clusters.length).toBe(3);

      const githubCluster = clusters.find((c) => c.canonicalUrl.includes('github.com/nickravesh/TwoTab'));
      expect(githubCluster).toBeDefined();
      expect(githubCluster!.totalCopies).toBe(3);
      expect(githubCluster!.instances[0].groupId).toBe(101); // Oldest
      expect(githubCluster!.instances[0].isOldest).toBe(true);
      expect(githubCluster!.instances[2].groupId).toBe(102); // Newest
      expect(githubCluster!.instances[2].isNewest).toBe(true);

      const ytCluster = clusters.find((c) => c.canonicalUrl.includes('youtube.com/watch?v=dQw4w9WgXcQ'));
      expect(ytCluster).toBeDefined();
      expect(ytCluster!.totalCopies).toBe(2);
    });

    it('returns empty array when no duplicates exist', () => {
      const uniqueGroups: TabGroup[] = [
        {
          id: 1,
          name: 'G1',
          date: '2026-01-01',
          tabs: [{ title: 'Site 1', url: 'https://site1.com' }],
        },
        {
          id: 2,
          name: 'G2',
          date: '2026-01-02',
          tabs: [{ title: 'Site 2', url: 'https://site2.com' }],
        },
      ];
      expect(findDuplicateClusters(uniqueGroups)).toEqual([]);
    });
  });

  describe('Group-Level Similarity Matrix (findDuplicateGroups)', () => {
    it('calculates Jaccard similarity index across tab groups', () => {
      const groupA: TabGroup = {
        id: 1,
        name: 'React Research A',
        date: '2026-01-01',
        tabs: [
          { title: 'Doc 1', url: 'https://react.dev/learn' },
          { title: 'Doc 2', url: 'https://react.dev/reference' },
          { title: 'Doc 3', url: 'https://react.dev/community' },
        ],
      };

      const groupB: TabGroup = {
        id: 2,
        name: 'React Research B',
        date: '2026-02-01',
        tabs: [
          { title: 'Doc 1', url: 'https://react.dev/learn?utm_source=twitter' },
          { title: 'Doc 2', url: 'https://react.dev/reference' },
          { title: 'Doc 3', url: 'https://react.dev/community' },
        ],
      };

      const pairs = findDuplicateGroups([groupA, groupB], 0.7);
      expect(pairs.length).toBe(1);
      expect(pairs[0].similarityScore).toBe(1.0); // 100% overlap
      expect(pairs[0].sharedTabsCount).toBe(3);
    });
  });

  describe('Batch Deduplication & Safety Actions (cleanAllDuplicates)', () => {
    const initialGroups: TabGroup[] = [
      {
        id: 101,
        name: 'Group 1 (Oldest, 2 tabs)',
        date: '2026-01-01T10:00:00Z',
        tabs: [
          { title: 'GitHub', url: 'https://github.com/nickravesh/TwoTab' },
          { title: 'Keep In G1', url: 'https://keep-in-g1.com' },
        ],
      },
      {
        id: 102,
        name: 'Group 2 (Newest, 1 duplicate tab only)',
        date: '2026-06-01T10:00:00Z',
        tabs: [
          { title: 'GitHub Copy', url: 'https://github.com/nickravesh/TwoTab?utm_source=test' },
        ],
      },
    ];

    it('keeps oldest instance and automatically garbage-collects empty groups', async () => {
      mockStorageStore.tabGroups = [...initialGroups];

      const clusters = findDuplicateClusters(initialGroups);
      expect(clusters.length).toBe(1);

      const result = await cleanAllDuplicates('keep_oldest', clusters, initialGroups);
      expect(result.removedCount).toBe(1);
      expect(result.cleanedGroupsCount).toBe(1); // Group 102 had only 1 tab and was removed

      // Verify storage state
      const updated = mockStorageStore.tabGroups as TabGroup[];
      expect(updated.length).toBe(1);
      expect(updated[0].id).toBe(101);
      expect(updated[0].tabs.length).toBe(2);

      // Verify rolling backup snapshot was recorded
      expect(mockStorageStore._backupSnapshots.length).toBeGreaterThan(0);
    });

    it('supports keep_newest strategy', async () => {
      mockStorageStore.tabGroups = [
        {
          id: 101,
          name: 'Old',
          date: '2026-01-01',
          tabs: [
            { title: 'Shared', url: 'https://shared.com' },
            { title: 'Old Extra', url: 'https://extra-old.com' },
          ],
        },
        {
          id: 102,
          name: 'New',
          date: '2026-06-01',
          tabs: [
            { title: 'Shared', url: 'https://shared.com' },
            { title: 'New Extra', url: 'https://extra-new.com' },
          ],
        },
      ];

      const clusters = findDuplicateClusters(mockStorageStore.tabGroups);
      await cleanAllDuplicates('keep_newest', clusters, mockStorageStore.tabGroups);

      const updated = mockStorageStore.tabGroups as TabGroup[];
      const oldGroup = updated.find((g) => g.id === 101)!;
      const newGroup = updated.find((g) => g.id === 102)!;

      expect(oldGroup.tabs.length).toBe(1);
      expect(oldGroup.tabs[0].url).toBe('https://extra-old.com');
      expect(newGroup.tabs.length).toBe(2);
      expect(newGroup.tabs.some((t) => t.url === 'https://shared.com')).toBe(true);
    });

    it('supports keep_largest strategy by preserving tab in the group with most tabs', async () => {
      mockStorageStore.tabGroups = [
        {
          id: 101,
          name: 'Small Group',
          date: '2026-01-01',
          tabs: [
            { title: 'Duplicate Tab', url: 'https://example.com/page' },
          ],
        },
        {
          id: 102,
          name: 'Large Group',
          date: '2026-02-01',
          tabs: [
            { title: 'Duplicate Tab Copy', url: 'https://example.com/page?utm_source=twitter' },
            { title: 'Extra 1', url: 'https://extra1.com' },
            { title: 'Extra 2', url: 'https://extra2.com' },
          ],
        },
      ];

      const clusters = findDuplicateClusters(mockStorageStore.tabGroups);
      const result = await cleanAllDuplicates('keep_largest', clusters, mockStorageStore.tabGroups);

      expect(result.removedCount).toBe(1);
      expect(result.cleanedGroupsCount).toBe(1); // Small group had only 1 tab and was cleanly pruned

      const updated = mockStorageStore.tabGroups as TabGroup[];
      expect(updated.length).toBe(1);
      expect(updated[0].id).toBe(102);
      expect(updated[0].tabs.some((t) => t.url.includes('example.com/page'))).toBe(true);
    });
  });

  describe('Selective Instance Removal & Group Merging', () => {
    it('removeSpecificInstances removes targeted tabs cleanly', async () => {
      const groups: TabGroup[] = [
        {
          id: 1,
          name: 'G1',
          date: '2026-01-01',
          tabs: [
            { title: 'T1', url: 'https://site1.com' },
            { title: 'T2', url: 'https://site2.com' },
          ],
        },
      ];
      mockStorageStore.tabGroups = [...groups];

      await removeSpecificInstances([{ groupId: 1, url: 'https://site1.com' }], groups);

      const updated = mockStorageStore.tabGroups as TabGroup[];
      expect(updated[0].tabs.length).toBe(1);
      expect(updated[0].tabs[0].url).toBe('https://site2.com');
    });

    it('mergeGroups combines tabs without duplicates and deletes source group container', async () => {
      const groups: TabGroup[] = [
        {
          id: 1,
          name: 'Source Group',
          date: '2026-01-01',
          tabs: [
            { title: 'Shared', url: 'https://shared.com' },
            { title: 'Source Exclusive', url: 'https://source.com' },
          ],
        },
        {
          id: 2,
          name: 'Target Group',
          date: '2026-02-01',
          tabs: [
            { title: 'Shared', url: 'https://shared.com' },
            { title: 'Target Exclusive', url: 'https://target.com' },
          ],
        },
      ];
      mockStorageStore.tabGroups = [...groups];

      await mergeGroups(1, 2, groups);

      const updated = mockStorageStore.tabGroups as TabGroup[];
      expect(updated.length).toBe(1);
      expect(updated[0].id).toBe(2);
      expect(updated[0].tabs.length).toBe(3); // Shared, Target Exclusive, Source Exclusive
    });
  });

  describe('Amazon Mirror Normalization & Tier 4 Fuzzy Title Matching', () => {
    it('canonicalizes Amazon product URLs by stripping descriptive slug before /dp/ASIN', () => {
      const verboseUrl = 'https://www.amazon.com/Apple-MacBook-Air-13-inch-M3-Chip/dp/B0CX23V25D/ref=sr_1_1?crid=123&keywords=macbook&qid=1700000000';
      const clean = normalizeUrl(verboseUrl);
      expect(clean).toBe('https://amazon.com/dp/B0CX23V25D');
    });

    it('clusters tabs with identical normalized title and same domain under Tier 4 fuzzy_title', () => {
      const groups: TabGroup[] = [
        {
          id: 1,
          name: 'Research Session A',
          date: '2026-01-01',
          tabs: [
            { title: 'Next.js 15 Deep Dive Tutorial - YouTube', url: 'https://youtube.com/watch?v=aaa111' },
          ],
        },
        {
          id: 2,
          name: 'Research Session B',
          date: '2026-02-01',
          tabs: [
            { title: 'Next.js 15 Deep Dive Tutorial', url: 'https://youtube.com/watch?v=bbb222' },
          ],
        },
      ];

      const clusters = findDuplicateClusters(groups);
      expect(clusters.length).toBe(1);
      expect(clusters[0].matchType).toBe('fuzzy_title');
      expect(clusters[0].representativeTitle).toContain('Next.js 15 Deep Dive Tutorial');
    });

    it('cleans multiple duplicate copies inside the exact same group correctly', async () => {
      const singleGroupWithDuplicates: TabGroup[] = [
        {
          id: 99,
          name: 'Group with repeated tabs',
          date: '2026-01-01',
          tabs: [
            { title: 'Doc 1', url: 'https://example.com/doc' },
            { title: 'Doc 1 Copy', url: 'https://example.com/doc?utm_source=twitter' },
            { title: 'Doc 1 Another Copy', url: 'https://example.com/doc#section' },
            { title: 'Unique Tab', url: 'https://example.com/unique' },
          ],
        },
      ];
      mockStorageStore.tabGroups = [...singleGroupWithDuplicates];

      const clusters = findDuplicateClusters(singleGroupWithDuplicates);
      expect(clusters.length).toBe(1);
      expect(clusters[0].totalCopies).toBe(3);

      const result = await cleanAllDuplicates('keep_oldest', clusters, singleGroupWithDuplicates);
      expect(result.removedCount).toBe(2);

      const updated = mockStorageStore.tabGroups as TabGroup[];
      expect(updated[0].tabs.length).toBe(2); // Kept 1 copy of doc + 1 unique
      expect(updated[0].tabs[0].url).toBe('https://example.com/doc');
      expect(updated[0].tabs[1].url).toBe('https://example.com/unique');
    });

    it('generates strictly unique cluster IDs without collision across different URLs', () => {
      const groups: TabGroup[] = [
        {
          id: 1,
          name: 'Group 1',
          date: '2026-01-01',
          tabs: [
            { title: 'Google', url: 'https://google.com' },
            { title: 'GitHub', url: 'https://github.com' },
            { title: 'YouTube', url: 'https://youtube.com' },
          ],
        },
        {
          id: 2,
          name: 'Group 2',
          date: '2026-01-02',
          tabs: [
            { title: 'Google Duplicate', url: 'https://google.com/?utm_source=safari' },
            { title: 'GitHub Duplicate', url: 'https://github.com/?ref=homepage' },
            { title: 'YouTube Duplicate', url: 'https://youtube.com/?feature=share' },
          ],
        },
      ];

      const clusters = findDuplicateClusters(groups);
      expect(clusters.length).toBe(3);

      const clusterIds = clusters.map((c) => c.id);
      const uniqueIds = new Set(clusterIds);
      expect(uniqueIds.size).toBe(3); // Zero ID collision!
    });
  });
});
