import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  extractDomainInfo,
  getDomainFaviconUrl,
  getLibraryDomainClusters,
  getDomainOrganizerSummary,
  consolidateDomain,
  autoOrganizeLibraryByDomain,
  deleteDomainTabs,
  deleteSingleTabInstance,
} from './domainOrganizer';
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
  },
  runtime: {
    lastError: null,
  },
};

(globalThis as any).chrome = mockChrome;

describe('Domain Sorter & Host Clustering Engine Unit & Invariant Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k in mockStorageStore) delete mockStorageStore[k];
    mockStorageStore._backupSnapshots = [];
    mockStorageStore._schemaVersion = 1;
  });

  describe('extractDomainInfo & Multi-Part TLD Parsing', () => {
    it('correctly extracts standard root domains and branded display names', () => {
      const info = extractDomainInfo('https://github.com/nickravesh/TwoTab');
      expect(info).toBeDefined();
      expect(info?.rootDomain).toBe('github.com');
      expect(info?.hostname).toBe('github.com');
      expect(info?.displayName).toBe('GitHub');
      expect(info?.suggestedColor).toBe('purple');
    });

    it('correctly handles multi-part TLDs (.co.uk, .com.au, .co.jp)', () => {
      const bbc = extractDomainInfo('https://www.bbc.co.uk/news');
      expect(bbc).toBeDefined();
      expect(bbc?.rootDomain).toBe('bbc.co.uk');
      expect(bbc?.displayName).toBe('BBC');

      const amazonAu = extractDomainInfo('https://amazon.com.au/product/123');
      expect(amazonAu).toBeDefined();
      expect(amazonAu?.rootDomain).toBe('amazon.com.au');

      const japanGov = extractDomainInfo('https://sub.portal.go.jp/page');
      expect(japanGov).toBeDefined();
      expect(japanGov?.rootDomain).toBe('portal.go.jp');
      expect(japanGov?.hostname).toBe('sub.portal.go.jp');
    });

    it('strips www., m., and mobile. prefixes cleanly', () => {
      const yt = extractDomainInfo('https://m.youtube.com/watch?v=123');
      expect(yt?.rootDomain).toBe('youtube.com');
      expect(yt?.hostname).toBe('youtube.com');
      expect(yt?.displayName).toBe('YouTube');

      const wiki = extractDomainInfo('https://www.wikipedia.org/wiki/Main_Page');
      expect(wiki?.rootDomain).toBe('wikipedia.org');
      expect(wiki?.hostname).toBe('wikipedia.org');
    });

    it('handles localhost and IP addresses safely', () => {
      const local = extractDomainInfo('http://localhost:3000/dashboard');
      expect(local?.rootDomain).toBe('localhost');
      expect(local?.displayName).toBe('Localhost');

      const ip = extractDomainInfo('http://192.168.1.1/admin');
      expect(ip?.rootDomain).toBe('192.168.1.1');
      expect(ip?.displayName).toContain('192.168.1.1');
    });

    it('gracefully rejects invalid and non-http protocols', () => {
      expect(extractDomainInfo('chrome-extension://abcdef/popup.html')).toBeNull();
      expect(extractDomainInfo('javascript:alert(1)')).toBeNull();
      expect(extractDomainInfo('about:blank')).toBeNull();
      expect(extractDomainInfo('not a valid url')).toBeNull();
      expect(extractDomainInfo('')).toBeNull();
    });

    it('generates high-res favicon URL', () => {
      const fav = getDomainFaviconUrl('github.com', 32);
      expect(fav).toContain('google.com/s2/favicons');
      expect(fav).toContain('domain=github.com');
      expect(fav).toContain('sz=32');
    });
  });

  describe('Library Domain Aggregator & Clustering', () => {
    const mockGroups: TabGroup[] = [
      {
        id: 1,
        name: 'Work Morning',
        date: '2026-01-01',
        tabs: [
          { title: 'Repo 1', url: 'https://github.com/nickravesh/TwoTab' },
          { title: 'Docs', url: 'https://docs.github.com/en' },
          { title: 'Video', url: 'https://youtube.com/watch?v=abc' },
        ],
      },
      {
        id: 2,
        name: 'Work Afternoon',
        date: '2026-01-02',
        tabs: [
          { title: 'Repo 2', url: 'https://github.com/nickravesh/other' },
          { title: 'Gist', url: 'https://gist.github.com/snippet' },
          { title: 'BBC UK', url: 'https://www.bbc.co.uk/news' },
        ],
      },
      {
        id: 3,
        name: 'Personal Reading',
        date: '2026-01-03',
        tabs: [
          { title: 'News', url: 'https://news.ycombinator.com' },
          { title: 'Reddit Thread', url: 'https://reddit.com/r/react' },
        ],
      },
    ];

    it('clusters tabs by root domain across multiple groups', () => {
      const clusters = getLibraryDomainClusters(mockGroups);
      expect(clusters.length).toBe(5);

      // Top cluster should be GitHub with 4 tabs across 2 groups
      const githubCluster = clusters.find((c) => c.rootDomain === 'github.com')!;
      expect(githubCluster).toBeDefined();
      expect(githubCluster.totalTabs).toBe(4);
      expect(githubCluster.groupsCount).toBe(2);
      expect(githubCluster.displayName).toBe('GitHub');

      // Check subdomain breakdown
      expect(githubCluster.subdomains.length).toBe(3); // github.com (2), docs.github.com (1), gist.github.com (1)
      const docSub = githubCluster.subdomains.find((s) => s.subdomain === 'docs.github.com');
      expect(docSub?.count).toBe(1);
    });

    it('supports groupBySubdomain option', () => {
      const clusters = getLibraryDomainClusters(mockGroups, { groupBySubdomain: true });

      // In subdomain mode, docs.github.com and gist.github.com are separate clusters
      const docsCluster = clusters.find((c) => c.rootDomain === 'docs.github.com');
      const gistCluster = clusters.find((c) => c.rootDomain === 'gist.github.com');
      expect(docsCluster).toBeDefined();
      expect(gistCluster).toBeDefined();
    });

    it('computes accurate library summary stats', () => {
      const clusters = getLibraryDomainClusters(mockGroups);
      const summary = getDomainOrganizerSummary(clusters, 8);

      expect(summary.totalDomains).toBe(5);
      expect(summary.totalTabs).toBe(8);
      expect(summary.scatteredDomainsCount).toBe(1); // Only github.com is in ≥ 2 groups
      expect(summary.topDomain?.domain).toBe('github.com');
      expect(summary.topDomain?.count).toBe(4);
    });
  });

  describe('Batch Consolidation & Rolling Backup Safeguards (consolidateDomain)', () => {
    it('moves domain tabs into a new group, removes from old groups, and prunes empty groups', async () => {
      const groups: TabGroup[] = [
        {
          id: 10,
          name: 'Mix Group A',
          date: '2026-01-01',
          tabs: [
            { title: 'GH 1', url: 'https://github.com/repo1' },
            { title: 'Keep In A', url: 'https://other.com' },
          ],
        },
        {
          id: 20,
          name: 'Solo GitHub Group',
          date: '2026-01-02',
          tabs: [
            { title: 'GH 2', url: 'https://github.com/repo2' },
          ],
        },
      ];
      mockStorageStore.tabGroups = [...groups];

      const clusters = getLibraryDomainClusters(groups);
      const ghCluster = clusters.find((c) => c.rootDomain === 'github.com')!;

      const result = await consolidateDomain('github.com', ghCluster.instances, groups, {
        mode: 'move',
        targetGroupName: 'My GitHub Repos',
        targetGroupColor: 'purple',
      });

      expect(result.consolidatedCount).toBe(2);
      expect(result.affectedGroupsCount).toBe(2);
      expect(result.prunedGroupsCount).toBe(1); // Group 20 had only 1 tab and became empty

      // Storage verification
      const updated = mockStorageStore.tabGroups as TabGroup[];
      expect(updated.length).toBe(2); // New group + Mix Group A

      const newGroup = updated[0];
      expect(newGroup.name).toBe('My GitHub Repos');
      expect(newGroup.color).toBe('purple');
      expect(newGroup.tabs.length).toBe(2);

      const remainingGroupA = updated[1];
      expect(remainingGroupA.id).toBe(10);
      expect(remainingGroupA.tabs.length).toBe(1);
      expect(remainingGroupA.tabs[0].url).toBe('https://other.com');

      // Rolling backup check
      expect(mockStorageStore._backupSnapshots.length).toBeGreaterThan(0);
    });

    it('supports copy mode without removing tabs from source groups', async () => {
      const groups: TabGroup[] = [
        {
          id: 10,
          name: 'Mix Group A',
          date: '2026-01-01',
          tabs: [
            { title: 'GH 1', url: 'https://github.com/repo1' },
            { title: 'Keep In A', url: 'https://other.com' },
          ],
        },
      ];
      mockStorageStore.tabGroups = [...groups];

      const clusters = getLibraryDomainClusters(groups);
      const ghCluster = clusters.find((c) => c.rootDomain === 'github.com')!;

      const result = await consolidateDomain('github.com', ghCluster.instances, groups, {
        mode: 'copy',
        targetGroupName: 'Copied GitHub',
      });

      expect(result.consolidatedCount).toBe(1);

      const updated = mockStorageStore.tabGroups as TabGroup[];
      expect(updated.length).toBe(2);
      expect(updated[0].name).toBe('Copied GitHub');
      expect(updated[1].tabs.length).toBe(2); // Original group untouched
    });
  });

  describe('Auto-Organize Library Wizard (autoOrganizeLibraryByDomain)', () => {
    it('clusters entire library by domain with threshold gating and miscellaneous aggregation', async () => {
      const messyGroups: TabGroup[] = [
        {
          id: 1,
          name: 'Messy Day 1',
          date: '2026-01-01',
          tabs: [
            { title: 'GH 1', url: 'https://github.com/1' },
            { title: 'GH 2', url: 'https://github.com/2' },
            { title: 'YT 1', url: 'https://youtube.com/watch?v=1' },
            { title: 'Solo 1', url: 'https://oneoff.org/doc' },
          ],
        },
        {
          id: 2,
          name: 'Messy Day 2',
          date: '2026-01-02',
          tabs: [
            { title: 'GH 3', url: 'https://github.com/3' },
            { title: 'YT 2', url: 'https://youtube.com/watch?v=2' },
            { title: 'YT 3', url: 'https://youtube.com/watch?v=3' },
            { title: 'Solo 2', url: 'https://random-article.com/story' },
          ],
        },
      ];
      mockStorageStore.tabGroups = [...messyGroups];

      const result = await autoOrganizeLibraryByDomain(messyGroups, {
        minTabsThreshold: 3,
        miscGroupName: 'Other Websites',
      });

      // GitHub has 3 tabs -> dedicated group
      // YouTube has 3 tabs -> dedicated group
      // oneoff.org (1) and random-article.com (1) -> go to 'Other Websites' (2 tabs)
      // Total new groups: 3
      expect(result.createdGroupsCount).toBe(3);
      expect(result.organizedTabsCount).toBe(8);

      const updated = mockStorageStore.tabGroups as TabGroup[];
      expect(updated.length).toBe(3);

      const ghGroup = updated.find((g) => g.name?.includes('GitHub'))!;
      expect(ghGroup.tabs.length).toBe(3);

      const ytGroup = updated.find((g) => g.name?.includes('YouTube'))!;
      expect(ytGroup.tabs.length).toBe(3);

      const miscGroup = updated.find((g) => g.name === 'Other Websites')!;
      expect(miscGroup.tabs.length).toBe(2);

      // Verify rolling backup created
      expect(mockStorageStore._backupSnapshots.length).toBeGreaterThan(0);
    });
  });

  describe('Domain Tab Deletion (deleteDomainTabs)', () => {
    it('deletes all tabs of a domain and prunes empty groups', async () => {
      const groups: TabGroup[] = [
        {
          id: 1,
          name: 'G1',
          date: '2026-01-01',
          tabs: [
            { title: 'Delete Me', url: 'https://spam.com/1' },
            { title: 'Stay', url: 'https://keep.com' },
          ],
        },
        {
          id: 2,
          name: 'G2',
          date: '2026-01-02',
          tabs: [
            { title: 'Delete Me Too', url: 'https://spam.com/2' },
          ],
        },
      ];
      mockStorageStore.tabGroups = [...groups];

      const clusters = getLibraryDomainClusters(groups);
      const spamCluster = clusters.find((c) => c.rootDomain === 'spam.com')!;

      const result = await deleteDomainTabs('spam.com', spamCluster.instances, groups);
      expect(result.deletedCount).toBe(2);
      expect(result.cleanedGroupsCount).toBe(1); // G2 emptied and pruned

      const updated = mockStorageStore.tabGroups as TabGroup[];
      expect(updated.length).toBe(1);
      expect(updated[0].id).toBe(1);
      expect(updated[0].tabs.length).toBe(1);
      expect(updated[0].tabs[0].url).toBe('https://keep.com');
    });
  });

  describe('Existing Group Target Consolidation', () => {
    it('merges domain tabs into an existing group when targetGroupId is provided', async () => {
      const groups: TabGroup[] = [
        {
          id: 101,
          date: '2026-01-01',
          name: 'Existing Dev Hub',
          tabs: [{ title: 'Existing Tab', url: 'https://dev.to/article' }],
        },
        {
          id: 102,
          date: '2026-01-01',
          name: 'Old Group',
          tabs: [
            { title: 'GH Repo', url: 'https://github.com/nickravesh/TwoTab' },
            { title: 'Leave this here', url: 'https://news.ycombinator.com' },
          ],
        },
      ];
      mockStorageStore.tabGroups = [...groups];

      const clusters = getLibraryDomainClusters(groups);
      const ghCluster = clusters.find((c) => c.rootDomain === 'github.com')!;

      const result = await consolidateDomain('github.com', ghCluster.instances, groups, {
        mode: 'move',
        targetGroupId: 101,
      });

      expect(result.consolidatedCount).toBe(1);
      const updated = mockStorageStore.tabGroups as TabGroup[];
      const targetGroup = updated.find((g) => g.id === 101)!;
      expect(targetGroup.tabs.length).toBe(2);
      expect(targetGroup.tabs[1].url).toBe('https://github.com/nickravesh/TwoTab');

      const oldGroup = updated.find((g) => g.id === 102)!;
      expect(oldGroup.tabs.length).toBe(1);
      expect(oldGroup.tabs[0].url).toBe('https://news.ycombinator.com');
    });
  });

  describe('Single Tab Deletion (deleteSingleTabInstance)', () => {
    it('removes a single tab from a group and prunes empty groups', async () => {
      const groups: TabGroup[] = [
        {
          id: 50,
          date: '2026-01-01',
          name: 'Solo Tab Group',
          tabs: [{ title: 'Single Tab', url: 'https://example.com' }],
        },
        {
          id: 51,
          date: '2026-01-01',
          name: 'Multi Tab Group',
          tabs: [
            { title: 'Keep 1', url: 'https://keep1.com' },
            { title: 'Remove 2', url: 'https://remove2.com' },
          ],
        },
      ];
      mockStorageStore.tabGroups = [...groups];

      // Remove from multi tab group
      const res1 = await deleteSingleTabInstance(51, 1, groups);
      expect(res1.success).toBe(true);
      expect(res1.remainingTabsCount).toBe(1);

      let updated = mockStorageStore.tabGroups as TabGroup[];
      expect(updated.find((g) => g.id === 51)?.tabs.length).toBe(1);

      // Remove from solo tab group -> should prune the group
      const res2 = await deleteSingleTabInstance(50, 0, updated);
      expect(res2.success).toBe(true);
      expect(res2.remainingTabsCount).toBe(0);

      updated = mockStorageStore.tabGroups as TabGroup[];
      expect(updated.find((g) => g.id === 50)).toBeUndefined();
    });
  });
});
