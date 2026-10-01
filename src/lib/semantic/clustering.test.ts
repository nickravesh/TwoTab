import { describe, it, expect } from 'vitest';
import { clusterTabs } from './clustering';
import type { Tab } from '../storage';
import { l2Normalize } from './similarity';

describe('Deterministic Clustering Engine (clustering.ts)', () => {
  const makeVector = (angleDeg: number): Float32Array => {
    const rad = (angleDeg * Math.PI) / 180;
    const v = new Float32Array(384);
    v[0] = Math.cos(rad);
    v[1] = Math.sin(rad);
    return l2Normalize(v);
  };

  it('handles empty input array', () => {
    const res = clusterTabs([]);
    expect(res.clusters).toEqual([]);
    expect(res.ungroupedTabs).toEqual([]);
  });

  it('handles single tab: leaves it in ungroupedTabs with default minSize = 2', () => {
    const tab: Tab = { title: 'Solo Tab', url: 'https://solo.com' };
    const res = clusterTabs([{ tab, embedding: makeVector(0) }]);
    expect(res.clusters).toHaveLength(0);
    expect(res.ungroupedTabs).toHaveLength(1);
    expect(res.ungroupedTabs[0]).toEqual(tab);
  });

  it('clusters related tabs with similarity >= 0.70', () => {
    // 0 deg and 30 deg -> cos(30 deg) = 0.866 >= 0.70
    const tab1: Tab = { title: 'Django Auth', url: 'https://django.org/auth' };
    const tab2: Tab = { title: 'Django JWT', url: 'https://django.org/jwt' };

    const items = [
      { tab: tab1, embedding: makeVector(0) },
      { tab: tab2, embedding: makeVector(30) },
    ];

    const res = clusterTabs(items, { similarityThreshold: 0.70 });
    expect(res.clusters).toHaveLength(1);
    expect(res.clusters[0].tabs).toHaveLength(2);
    expect(res.ungroupedTabs).toHaveLength(0);
  });

  it('strictly prevents transitive chaining (A ~ B ~ C where A !~ C)', () => {
    // A at 0 deg, B at 40 deg, C at 80 deg.
    // cos(40 deg) = 0.766 >= 0.70.
    // BUT cos(80 deg) = 0.174 < 0.70.
    const tabA: Tab = { title: 'Topic A', url: 'https://a.com' };
    const tabB: Tab = { title: 'Topic B', url: 'https://b.com' };
    const tabC: Tab = { title: 'Topic C', url: 'https://c.com' };

    const items = [
      { tab: tabA, embedding: makeVector(0) },
      { tab: tabB, embedding: makeVector(40) },
      { tab: tabC, embedding: makeVector(80) },
    ];

    const res = clusterTabs(items, { similarityThreshold: 0.70 });
    // Under complete linkage, all 3 cannot merge into a single cluster
    expect(res.clusters.every((c) => c.tabs.length < 3)).toBe(true);
  });

  it('separates two distinct topics into two separate clusters', () => {
    // Group 1 (Python): 0 deg and 20 deg (sim 0.94)
    // Group 2 (Music): 100 deg and 110 deg (sim 0.98)
    // Cross-similarity: ~0.17 < 0.70
    const items = [
      { tab: { title: 'Python Tutorial', url: 'https://python.org' }, embedding: makeVector(0) },
      { tab: { title: 'Python Docs', url: 'https://docs.python.org' }, embedding: makeVector(20) },
      { tab: { title: 'Radiohead Spotify', url: 'https://spotify.com/radiohead' }, embedding: makeVector(100) },
      { tab: { title: 'Radiohead Discography', url: 'https://discogs.com/radiohead' }, embedding: makeVector(110) },
    ];

    const res = clusterTabs(items, { similarityThreshold: 0.70 });
    expect(res.clusters).toHaveLength(2);
    expect(res.clusters[0].tabs).toHaveLength(2);
    expect(res.clusters[1].tabs).toHaveLength(2);
    expect(res.ungroupedTabs).toHaveLength(0);
  });

  it('respects configurable minimumGroupSize and similarityThreshold', () => {
    const items = [
      { tab: { title: 'Tab 1', url: 'https://t1.com' }, embedding: makeVector(0) },
      { tab: { title: 'Tab 2', url: 'https://t2.com' }, embedding: makeVector(30) },
    ];

    // High threshold 0.95 -> cos(30 deg) = 0.866 < 0.95 -> no cluster
    const resHigh = clusterTabs(items, { similarityThreshold: 0.95 });
    expect(resHigh.clusters).toHaveLength(0);
    expect(resHigh.ungroupedTabs).toHaveLength(2);

    // minSize = 3 -> only 2 items -> no cluster
    const resMinSize = clusterTabs(items, { similarityThreshold: 0.70, minimumGroupSize: 3 });
    expect(resMinSize.clusters).toHaveLength(0);
    expect(resMinSize.ungroupedTabs).toHaveLength(2);
  });
});
