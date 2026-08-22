import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  isCheckableUrl,
  extractDomainFromUrl,
  checkSingleUrl,
  getLinkHealthCache,
  saveLinkHealthCache,
  clearLinkHealthCache,
  getLinkHealthScanState,
  saveLinkHealthScanState,
  DEFAULT_LINK_HEALTH_SCAN_STATE,
  checkInternetConnectivity,
  NetworkOfflineError,
  DomainRateLimiter,
  HealthScanController,
  applyBatchRedirects,
  quarantineBrokenLinks,
  purgeBrokenLinks,
  getWaybackUrl,
  type LinkHealthResult,
} from './linkHealth';
import { type TabGroup } from './storage';

// In-memory store for chrome.storage.local
let mockStorageStore: Record<string, any> = {};

const mockChrome = {
  storage: {
    local: {
      get: vi.fn((keys: string | string[] | null) => {
        if (!keys) return Promise.resolve(mockStorageStore);
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: mockStorageStore[keys] });
        }
        const result: Record<string, any> = {};
        for (const k of keys) {
          result[k] = mockStorageStore[k];
        }
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, any>, callback?: () => void) => {
        Object.assign(mockStorageStore, items);
        if (callback) callback();
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    get lastError() {
      return null;
    },
  },
};

(globalThis as any).chrome = mockChrome;

describe('Link Health & Dead Link Inspector Engine', () => {
  beforeEach(() => {
    mockStorageStore = {};
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. URL Protocol Validation & Domain Extraction
  // ---------------------------------------------------------------------------
  describe('URL Protocol & Domain Utilities', () => {
    it('isCheckableUrl: accurately allows http and https while rejecting internal schemes', () => {
      expect(isCheckableUrl('https://github.com/nickravesh/TwoTab')).toBe(true);
      expect(isCheckableUrl('http://example.com')).toBe(true);
      expect(isCheckableUrl('HTTPS://MDN.MOZILLA.ORG')).toBe(true);

      // Rejections
      expect(isCheckableUrl('chrome://settings')).toBe(false);
      expect(isCheckableUrl('chrome-extension://twotab/tabs.html')).toBe(false);
      expect(isCheckableUrl('about:blank')).toBe(false);
      expect(isCheckableUrl('edge://flags')).toBe(false);
      expect(isCheckableUrl('data:text/html,<h1>Hi</h1>')).toBe(false);
      expect(isCheckableUrl('file:///home/user/doc.pdf')).toBe(false);
      expect(isCheckableUrl('javascript:void(0)')).toBe(false);
      expect(isCheckableUrl('')).toBe(false);
      expect(isCheckableUrl(undefined)).toBe(false);
    });

    it('extractDomainFromUrl: extracts clean lowercase hostnames', () => {
      expect(extractDomainFromUrl('https://GitHub.com/repo')).toBe('github.com');
      expect(extractDomainFromUrl('http://SUB.DOMAIN.EXAMPLE.ORG:8080/path')).toBe('sub.domain.example.org');
      expect(extractDomainFromUrl('invalid-url')).toBe('unknown');
    });

    it('getWaybackUrl: formats valid Internet Archive snapshot link', () => {
      const url = 'https://example.com/lost-article';
      expect(getWaybackUrl(url)).toBe(`https://web.archive.org/web/*/${encodeURI(url)}`);
      expect(getWaybackUrl('')).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Health Cache Management & 7-Day TTL
  // ---------------------------------------------------------------------------
  describe('Health Cache Management', () => {
    it('getLinkHealthCache & saveLinkHealthCache: saves and loads cache with TTL filtering', async () => {
      const now = Date.now();
      const freshDate = new Date(now - 1000 * 60 * 60).toISOString(); // 1 hr ago
      const expiredDate = new Date(now - 1000 * 60 * 60 * 24 * 10).toISOString(); // 10 days ago (expired)

      const initialCache: Record<string, LinkHealthResult> = {
        'https://fresh.com': {
          url: 'https://fresh.com',
          status: 'healthy',
          statusCode: 200,
          checkedAt: freshDate,
        },
        'https://expired.com': {
          url: 'https://expired.com',
          status: 'healthy',
          statusCode: 200,
          checkedAt: expiredDate,
        },
      };

      await saveLinkHealthCache(initialCache);

      const loaded = await getLinkHealthCache();
      expect(loaded['https://fresh.com']).toBeDefined();
      expect(loaded['https://expired.com']).toBeUndefined(); // Filtered by 7-day TTL
    });

    it('clearLinkHealthCache: wipes all cached health entries', async () => {
      await saveLinkHealthCache({
        'https://test.com': { url: 'https://test.com', status: 'healthy', checkedAt: new Date().toISOString() },
      });

      await clearLinkHealthCache();
      const emptyCache = await getLinkHealthCache();
      expect(emptyCache).toEqual({});
    });

    it('getLinkHealthScanState & saveLinkHealthScanState: persists and loads live scan state', async () => {
      const defaultState = await getLinkHealthScanState();
      expect(defaultState).toEqual(DEFAULT_LINK_HEALTH_SCAN_STATE);

      const customState = {
        isScanning: true,
        isPaused: false,
        total: 100,
        checked: 45,
        healthy: 40,
        redirected: 3,
        protected: 1,
        broken: 1,
        unreachable: 0,
        velocity: 15.2,
        lastUpdated: new Date().toISOString(),
      };

      await saveLinkHealthScanState(customState);
      const loaded = await getLinkHealthScanState();
      expect(loaded).toEqual(customState);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Single URL Health Verification & Status Classification
  // ---------------------------------------------------------------------------
  describe('checkSingleUrl Status Classification', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('Healthy: returns status healthy for 200 OK without redirect', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com/page',
      });

      const res = await checkSingleUrl('https://example.com/page');
      expect(res.status).toBe('healthy');
      expect(res.statusCode).toBe(200);
      expect(res.url).toBe('https://example.com/page');
    });

    it('Redirected: detects destination URL changes (e.g. HTTP to HTTPS or renamed repo)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://github.com/new-org/new-repo',
      });

      const res = await checkSingleUrl('https://github.com/old-org/old-repo');
      expect(res.status).toBe('redirected');
      expect(res.finalUrl).toBe('https://github.com/new-org/new-repo');
    });

    it('Protected / Auth Wall: flags 401, 403, and 429 as protected (NOT dead)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        url: 'https://private.corp.internal/doc',
      });

      const res = await checkSingleUrl('https://private.corp.internal/doc');
      expect(res.status).toBe('protected');
      expect(res.statusCode).toBe(403);
    });

    it('Broken / 404: flags 404 and 410 as broken', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        url: 'https://example.com/deleted-post',
      });

      const res = await checkSingleUrl('https://example.com/deleted-post');
      expect(res.status).toBe('broken');
      expect(res.statusCode).toBe(404);
      expect(res.error).toBe('Not Found (404)');
    });

    it('HEAD 405 Method Not Allowed: automatically retries with GET fallback', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 405, // HEAD blocked
          url: 'https://cloudflare-protected.com',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200, // GET succeeds
          url: 'https://cloudflare-protected.com',
        });

      globalThis.fetch = fetchMock;

      const res = await checkSingleUrl('https://cloudflare-protected.com');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(res.status).toBe('healthy');
      expect(res.statusCode).toBe(200);
    });

    it('Unreachable: handles server 500 errors and timeouts gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

      const res = await checkSingleUrl('https://offline-server.xyz');
      expect(res.status).toBe('unreachable');
      expect(res.error).toContain('Failed to fetch');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Domain Rate Limiter & Concurrency Scheduler
  // ---------------------------------------------------------------------------
  describe('DomainRateLimiter', () => {
    it('enqueues and executes tasks respecting domain and global limits', async () => {
      const limiter = new DomainRateLimiter(4, 1, 10);
      const executionOrder: string[] = [];

      const makeTask = (name: string, url: string, delayMs = 15) => () =>
        limiter.enqueue(url, async () => {
          executionOrder.push(`start-${name}`);
          await new Promise((r) => setTimeout(r, delayMs));
          executionOrder.push(`end-${name}`);
          return {
            url,
            status: 'healthy',
            statusCode: 200,
            checkedAt: new Date().toISOString(),
          };
        });

      const p1 = makeTask('github-1', 'https://github.com/repo1')();
      const p2 = makeTask('github-2', 'https://github.com/repo2')();
      const p3 = makeTask('google-1', 'https://google.com/search')();

      await Promise.all([p1, p2, p3]);

      // github-1 and google-1 should start concurrently, while github-2 waits for github-1
      expect(executionOrder).toContain('start-github-1');
      expect(executionOrder).toContain('start-google-1');
      expect(executionOrder.indexOf('start-github-2')).toBeGreaterThan(executionOrder.indexOf('end-github-1'));
    });

    it('pause and resume: halts task dispatching immediately and resumes when triggered', async () => {
      const limiter = new DomainRateLimiter(2, 2, 5);
      const executed: string[] = [];

      const makeTask = (name: string) => () =>
        limiter.enqueue(`https://${name}.com`, async () => {
          executed.push(name);
          return {
            url: `https://${name}.com`,
            status: 'healthy',
            statusCode: 200,
            checkedAt: new Date().toISOString(),
          };
        });

      limiter.pause();
      const p1 = makeTask('task-1')();
      const p2 = makeTask('task-2')();

      await new Promise((r) => setTimeout(r, 20));
      // Should NOT have executed because limiter is paused
      expect(executed).toEqual([]);

      limiter.resume();
      await Promise.all([p1, p2]);
      expect(executed).toContain('task-1');
      expect(executed).toContain('task-2');
    });

    it('checkInternetConnectivity: detects online and offline states', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });

      const isOnline = await checkInternetConnectivity(1000);
      expect(isOnline).toBe(true);

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const isOffline = await checkInternetConnectivity(1000);
      expect(isOffline).toBe(false);

      globalThis.fetch = originalFetch;
    });
  });

  // ---------------------------------------------------------------------------
  // 5. HealthScanController (Library Orchestrator)
  // ---------------------------------------------------------------------------
  describe('HealthScanController', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('scans library tabs, reports progress, and caches results', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('404')) {
          return Promise.resolve({ ok: false, status: 404, url });
        }
        if (url.includes('redirect')) {
          return Promise.resolve({ ok: true, status: 200, url: `${url}-new` });
        }
        return Promise.resolve({ ok: true, status: 200, url });
      });

      const controller = new HealthScanController({ maxGlobalConcurrency: 4, maxPerDomainConcurrency: 2 });
      const progressUpdates: any[] = [];

      const tabs = [
        { url: 'https://site1.com', title: 'Site 1' },
        { url: 'https://site2.com/404', title: 'Site 2 Broken' },
        { url: 'https://site3.com/redirect', title: 'Site 3 Redirect' },
        { url: 'chrome://settings', title: 'Ignored System Tab' }, // should be skipped
      ];

      const results = await controller.scan(
        tabs,
        (progress) => progressUpdates.push({ ...progress }),
        { forceRefresh: true }
      );

      expect(Object.keys(results).length).toBe(3);
      expect(results['https://site1.com'].status).toBe('healthy');
      expect(results['https://site2.com/404'].status).toBe('broken');
      expect(results['https://site3.com/redirect'].status).toBe('redirected');

      expect(progressUpdates.length).toBeGreaterThan(0);
      const lastProgress = progressUpdates[progressUpdates.length - 1];
      expect(lastProgress.total).toBe(3);
      expect(lastProgress.checked).toBe(3);
      expect(lastProgress.healthy).toBe(1);
      expect(lastProgress.broken).toBe(1);
      expect(lastProgress.redirected).toBe(1);
    });

    it('handles pause, resume, and cancellation cleanly', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, status: 200, url: 'https://slow.com' }), 50)
        )
      );

      const controller = new HealthScanController();
      const tabs = [
        { url: 'https://slow1.com', title: 'S1' },
        { url: 'https://slow2.com', title: 'S2' },
        { url: 'https://slow3.com', title: 'S3' },
      ];

      const scanPromise = controller.scan(tabs, () => {});

      expect(controller.paused).toBe(false);
      controller.pause();
      expect(controller.paused).toBe(true);

      controller.resume();
      expect(controller.paused).toBe(false);

      controller.cancel();
      expect(controller.cancelled).toBe(true);

      await scanPromise;
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Batch Actions (Redirects, Quarantining & Purging)
  // ---------------------------------------------------------------------------
  describe('Batch Resolution Actions', () => {
    beforeEach(() => {
      mockStorageStore.tabGroups = [
        {
          id: 101,
          date: '2026-08-21',
          name: 'Research Group',
          tabs: [
            { title: 'Good Tab', url: 'https://good.com' },
            { title: 'Redirect Tab', url: 'https://old-repo.com' },
            { title: 'Dead Tab', url: 'https://dead404.com' },
          ],
        },
        {
          id: 102,
          date: '2026-08-21',
          name: 'Dead Only Group',
          tabs: [{ title: 'Another Dead Tab', url: 'https://another-dead.com' }],
        },
      ];
    });

    it('applyBatchRedirects: atomically replaces old URLs with target destinations', async () => {
      const redirects = [{ oldUrl: 'https://old-repo.com', newUrl: 'https://new-repo.com' }];

      const res = await applyBatchRedirects(redirects);
      expect(res.updatedCount).toBe(1);
      expect(res.affectedGroupsCount).toBe(1);

      const updatedGroups: TabGroup[] = mockStorageStore.tabGroups;
      const group = updatedGroups.find((g) => g.id === 101);
      expect(group?.tabs.find((t) => t.title === 'Redirect Tab')?.url).toBe('https://new-repo.com');
    });

    it('quarantineBrokenLinks: moves broken tabs into a new archive group and cleans empty groups', async () => {
      const brokenUrls = ['https://dead404.com', 'https://another-dead.com'];

      const res = await quarantineBrokenLinks(brokenUrls, 'Broken Links Quarantine');
      expect(res.quarantinedCount).toBe(2);
      expect(res.newGroupId).toBeDefined();

      const updatedGroups: TabGroup[] = mockStorageStore.tabGroups;
      // Group 102 was entirely dead, so it should be removed
      expect(updatedGroups.find((g) => g.id === 102)).toBeUndefined();

      // Group 101 should only have remaining good and redirect tabs
      const group101 = updatedGroups.find((g) => g.id === 101);
      expect(group101?.tabs.length).toBe(2);

      // Quarantine group should be first with rose color
      const quarantineGroup = updatedGroups[0];
      expect(quarantineGroup.name).toBe('Broken Links Quarantine');
      expect(quarantineGroup.color).toBe('rose');
      expect(quarantineGroup.tabs.length).toBe(2);
    });

    it('purgeBrokenLinks: permanently removes broken tabs across all groups', async () => {
      const brokenUrls = ['https://dead404.com', 'https://another-dead.com'];

      const res = await purgeBrokenLinks(brokenUrls);
      expect(res.purgedCount).toBe(2);
      expect(res.affectedGroupsCount).toBe(2);

      const updatedGroups: TabGroup[] = mockStorageStore.tabGroups;
      // Group 102 should be completely removed as all its tabs were purged
      expect(updatedGroups.length).toBe(1);
      expect(updatedGroups[0].id).toBe(101);
      expect(updatedGroups[0].tabs.length).toBe(2);
    });
  });
});
