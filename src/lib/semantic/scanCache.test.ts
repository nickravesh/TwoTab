import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeTabsFingerprint,
  getCachedSemanticScan,
  saveSemanticScanCache,
  clearSemanticScanCache,
  SCAN_CACHE_TTL_MS,
  SCAN_CACHE_STORAGE_KEY,
} from './scanCache';
import type { Tab } from '../storage';
import type { ClusterGroup } from './types';

describe('24-Hour Semantic Scan Cache Suite', () => {
  const mockStorage: Record<string, any> = {};

  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }

    // Mock chrome.storage.local
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
          set: vi.fn((data: Record<string, any>, cb?: () => void) => {
            Object.assign(mockStorage, data);
            cb?.();
          }),
          remove: vi.fn(async (key: string) => {
            delete mockStorage[key];
          }),
        },
      },
      runtime: {
        lastError: null,
      },
    };
  });

  const mockTabs: Tab[] = [
    { title: 'React Documentation', url: 'https://react.dev' },
    { title: 'Next.js Framework', url: 'https://nextjs.org' },
    { title: 'TypeScript Handbook', url: 'https://www.typescriptlang.org' },
  ];

  const mockClusters: ClusterGroup[] = [
    {
      id: 'c1',
      name: 'Web Frameworks',
      color: 'blue',
      coherenceScore: 0.92,
      tabs: [mockTabs[0], mockTabs[1]],
    },
  ];

  const mockUngrouped: Tab[] = [mockTabs[2]];

  const mockItems = [
    { tab: mockTabs[0], embedding: new Float32Array([0.1, 0.2, 0.3]) },
    { tab: mockTabs[1], embedding: new Float32Array([0.4, 0.5, 0.6]) },
    { tab: mockTabs[2], embedding: new Float32Array([0.7, 0.8, 0.9]) },
  ];

  it('computes deterministic, order-independent fingerprints for tabs', () => {
    const tabsA = [mockTabs[0], mockTabs[1], mockTabs[2]];
    const tabsB = [mockTabs[2], mockTabs[0], mockTabs[1]]; // Reordered

    const fpA = computeTabsFingerprint(tabsA);
    const fpB = computeTabsFingerprint(tabsB);

    expect(fpA).toBe(fpB);
    expect(fpA).toContain('-3'); // Encodes length
  });

  it('detects tab additions or modifications with a different fingerprint', () => {
    const fpOriginal = computeTabsFingerprint(mockTabs);
    const fpModified = computeTabsFingerprint([
      ...mockTabs,
      { title: 'Tailwind CSS', url: 'https://tailwindcss.com' },
    ]);

    expect(fpOriginal).not.toBe(fpModified);
  });

  it('saves scan result and retrieves it cleanly within 24 hours', async () => {
    await saveSemanticScanCache({
      tabs: mockTabs,
      clusters: mockClusters,
      ungroupedTabs: mockUngrouped,
      items: mockItems,
      targetGroupIds: [101, 102],
    });

    const cached = await getCachedSemanticScan(mockTabs);
    expect(cached).not.toBeNull();
    expect(cached?.clusters).toHaveLength(1);
    expect(cached?.clusters[0].name).toBe('Web Frameworks');
    expect(cached?.ungroupedTabs).toHaveLength(1);
    expect(cached?.serializedItems).toHaveLength(3);
    expect(cached?.serializedItems[0].embedding[0]).toBeCloseTo(0.1, 5);
    expect(cached?.serializedItems[0].embedding[1]).toBeCloseTo(0.2, 5);
    expect(cached?.serializedItems[0].embedding[2]).toBeCloseTo(0.3, 5);
  });

  it('returns null when cached scan is older than 24 hours (TTL expired)', async () => {
    await saveSemanticScanCache({
      tabs: mockTabs,
      clusters: mockClusters,
      ungroupedTabs: mockUngrouped,
      items: mockItems,
    });

    // Artificially age the timestamp to 25 hours ago
    const cachedData = mockStorage[SCAN_CACHE_STORAGE_KEY];
    cachedData.timestamp = Date.now() - (25 * 60 * 60 * 1000);

    const result = await getCachedSemanticScan(mockTabs);
    expect(result).toBeNull();
  });

  it('returns null when the input tabs do not match the cached fingerprint', async () => {
    await saveSemanticScanCache({
      tabs: mockTabs,
      clusters: mockClusters,
      ungroupedTabs: mockUngrouped,
      items: mockItems,
    });

    const differentTabs: Tab[] = [
      { title: 'Google', url: 'https://google.com' },
      { title: 'YouTube', url: 'https://youtube.com' },
    ];

    const result = await getCachedSemanticScan(differentTabs);
    expect(result).toBeNull();
  });

  it('clears the cached scan cleanly upon clearSemanticScanCache', async () => {
    await saveSemanticScanCache({
      tabs: mockTabs,
      clusters: mockClusters,
      ungroupedTabs: mockUngrouped,
      items: mockItems,
    });

    expect(mockStorage[SCAN_CACHE_STORAGE_KEY]).toBeDefined();

    await clearSemanticScanCache();
    expect(mockStorage[SCAN_CACHE_STORAGE_KEY]).toBeUndefined();

    const result = await getCachedSemanticScan(mockTabs);
    expect(result).toBeNull();
  });
});
