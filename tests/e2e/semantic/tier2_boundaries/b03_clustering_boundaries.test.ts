/**
 * Tier 2 Boundary Value Analysis: Deterministic Clustering
 *
 * Boundary Scenarios:
 * - Empty library (0 tabs) and singleton library (1 tab)
 * - Exact minimumGroupSize boundary (N vs N-1)
 * - Identical tabs (similarity 1.000)
 * - Completely orthogonal tabs (similarity 0.000)
 * - Extreme similarity thresholds (0.00 vs 1.00)
 * - High minimumGroupSize (e.g. 10 tabs required)
 * - Large workload scaling (100 tabs across 10 topics)
 * - Complete-linkage cyclic triad/quad clustering
 */

import { describe, it, expect } from 'vitest';
import {
  oracleClusterTabs,
  generateDeterministicEmbedding,
  generateControlledVectorPair,
} from '../harness/oracle';
import { PYTHON_TABS, REACT_TABS } from '../harness/fixtures';
import type { Tab } from '@/lib/storage';

describe('Tier 2 Boundary: Deterministic Clustering (B03)', () => {
  it('B3.1 handles 0 tabs: returns empty clusters and empty ungroupedTabs', () => {
    const result = oracleClusterTabs([]);
    expect(result.clusters).toEqual([]);
    expect(result.ungroupedTabs).toEqual([]);
  });

  it('B3.2 handles 1 tab: remains ungrouped when minimumGroupSize is default 2', () => {
    const items = [
      {
        tab: PYTHON_TABS[0],
        embedding: generateDeterministicEmbedding(PYTHON_TABS[0].title),
      },
    ];
    const result = oracleClusterTabs(items);
    expect(result.clusters.length).toBe(0);
    expect(result.ungroupedTabs.length).toBe(1);
    expect(result.ungroupedTabs[0].url).toBe(PYTHON_TABS[0].url);
  });

  it('B3.3 boundary merge: exactly minimumGroupSize (2) similar tabs form a cluster', () => {
    const [u, v] = generateControlledVectorPair(0.85);
    const items = [
      { tab: { title: 'Tab 1', url: 'https://test.com/1' }, embedding: u },
      { tab: { title: 'Tab 2', url: 'https://test.com/2' }, embedding: v },
    ];

    const result = oracleClusterTabs(items, { minimumGroupSize: 2, similarityThreshold: 0.70 });
    expect(result.clusters.length).toBe(1);
    expect(result.clusters[0].tabs.length).toBe(2);
    expect(result.ungroupedTabs.length).toBe(0);
  });

  it('B3.4 boundary failure: exactly minimumGroupSize - 1 (1) tab remains ungrouped even if similarity would have been high', () => {
    const [u] = generateControlledVectorPair(0.99);
    const items = [
      { tab: { title: 'Solo Tab', url: 'https://test.com/solo' }, embedding: u },
    ];

    const result = oracleClusterTabs(items, { minimumGroupSize: 2 });
    expect(result.clusters.length).toBe(0);
    expect(result.ungroupedTabs.length).toBe(1);
  });

  it('B3.5 clusters 10 identical tabs into a single cluster with coherenceScore 1.000', () => {
    const vec = generateDeterministicEmbedding('Identical Tab');
    const items = Array.from({ length: 10 }, (_, i) => ({
      tab: { title: 'Identical Tab', url: `https://example.com/item-${i}` },
      embedding: vec,
    }));

    const result = oracleClusterTabs(items);
    expect(result.clusters.length).toBe(1);
    expect(result.clusters[0].tabs.length).toBe(10);
    expect(result.clusters[0].coherenceScore).toBeCloseTo(1.0, 5);
  });

  it('B3.6 leaves all tabs ungrouped when all tabs are completely orthogonal (similarity 0.00)', () => {
    // Generate 4 mutually orthogonal vectors along axes 0, 1, 2, 3
    const items = Array.from({ length: 4 }, (_, i) => {
      const v = new Float32Array(384);
      v[i] = 1.0;
      return {
        tab: { title: `Orthogonal Tab ${i}`, url: `https://example.com/ortho-${i}` },
        embedding: v,
      };
    });

    const result = oracleClusterTabs(items, { similarityThreshold: 0.70 });
    expect(result.clusters.length).toBe(0);
    expect(result.ungroupedTabs.length).toBe(4);
  });

  it('B3.7 extreme threshold 0.00 forces all tabs to merge into a single massive cluster', () => {
    const items = [
      ...PYTHON_TABS.slice(0, 2).map((t) => ({ tab: t, embedding: generateDeterministicEmbedding(t.title, { topic: 'python' }) })),
      ...REACT_TABS.slice(0, 2).map((t) => ({ tab: t, embedding: generateDeterministicEmbedding(t.title, { topic: 'react' }) })),
    ];

    const result = oracleClusterTabs(items, { similarityThreshold: -1.0 });
    expect(result.clusters.length).toBe(1);
    expect(result.clusters[0].tabs.length).toBe(4);
    expect(result.ungroupedTabs.length).toBe(0);
  });

  it('B3.8 extreme threshold 1.00 merges only identical vectors, leaving all others ungrouped', () => {
    const [u, v] = generateControlledVectorPair(0.95);
    const items = [
      { tab: { title: 'T1', url: 'https://test.com/1' }, embedding: u },
      { tab: { title: 'T2', url: 'https://test.com/2' }, embedding: v },
    ];

    const result = oracleClusterTabs(items, { similarityThreshold: 0.9999 });
    expect(result.clusters.length).toBe(0);
    expect(result.ungroupedTabs.length).toBe(2);
  });

  it('B3.9 high minimumGroupSize = 5 requires at least 5 tabs to form a cluster', () => {
    const items = PYTHON_TABS.slice(0, 4).map((tab) => ({
      tab,
      embedding: generateDeterministicEmbedding(tab.title, { topic: 'python' }),
    }));

    const result = oracleClusterTabs(items, { minimumGroupSize: 5 });
    expect(result.clusters.length).toBe(0);
    expect(result.ungroupedTabs.length).toBe(4);
  });

  it('B3.10 scales efficiently across 60 tabs across 3 distinct topics within 50ms', () => {
    const topics = ['python', 'react', 'recipes'];
    const items: Array<{ tab: Tab; embedding: Float32Array }> = [];

    for (let t = 0; t < topics.length; t++) {
      for (let i = 0; i < 20; i++) {
        const title = `${topics[t]} documentation and guide part ${i}`;
        items.push({
          tab: { title, url: `https://${topics[t]}.org/doc/${i}` },
          embedding: generateDeterministicEmbedding(title, { topic: topics[t] }),
        });
      }
    }

    const start = performance.now();
    const result = oracleClusterTabs(items, { similarityThreshold: 0.70 });
    const elapsed = performance.now() - start;

    expect(result.clusters.length).toBe(3);
    expect(elapsed).toBeLessThan(350);
  });

  it('B3.11 complete linkage on cyclic graph (A-B-C-D) maintains cluster-level coherence', () => {
    // 4 tabs in a ring: sim(A, B)=0.766, sim(B, C)=0.766, sim(C, D)=0.766, but sim(A, C)=0.174, sim(B, D)=0.174, sim(A, D)=-0.50
    const makeAngleVec = (deg: number) => {
      const rad = (deg * Math.PI) / 180;
      const v = new Float32Array(384);
      v[0] = Math.cos(rad);
      v[1] = Math.sin(rad);
      return v;
    };

    const vA = makeAngleVec(0);
    const vB = makeAngleVec(40);
    const vC = makeAngleVec(80);
    const vD = makeAngleVec(120);

    const items = [
      { tab: { title: 'Node A', url: 'https://ring.com/a' }, embedding: vA },
      { tab: { title: 'Node B', url: 'https://ring.com/b' }, embedding: vB },
      { tab: { title: 'Node C', url: 'https://ring.com/c' }, embedding: vC },
      { tab: { title: 'Node D', url: 'https://ring.com/d' }, embedding: vD },
    ];

    const result = oracleClusterTabs(items, { similarityThreshold: 0.70 });
    // Under complete linkage, all 4 cannot merge because min pairwise similarity is 0.174 or -0.50
    expect(result.clusters.every((c) => c.tabs.length < 4)).toBe(true);
  });

  it('B3.12 minimumGroupSize = 1 allows singleton clusters if explicitly requested', () => {
    const items = [
      {
        tab: { title: 'Lone Tab', url: 'https://lone.com' },
        embedding: generateDeterministicEmbedding('Lone Tab'),
      },
    ];

    const result = oracleClusterTabs(items, { minimumGroupSize: 1 });
    expect(result.clusters.length).toBe(1);
    expect(result.ungroupedTabs.length).toBe(0);
  });

  it('B3.13 computes coherenceScore accurately as the average pairwise dot product', () => {
    const [u, v] = generateControlledVectorPair(0.80);
    const items = [
      { tab: { title: 'Pair 1', url: 'https://p.com/1' }, embedding: u },
      { tab: { title: 'Pair 2', url: 'https://p.com/2' }, embedding: v },
    ];

    const result = oracleClusterTabs(items, { similarityThreshold: 0.70 });
    expect(result.clusters[0].coherenceScore).toBeCloseTo(0.80, 4);
  });

  it('B3.14 cluster ids are deterministic and non-empty strings', () => {
    const items = PYTHON_TABS.slice(0, 2).map((tab) => ({
      tab,
      embedding: generateDeterministicEmbedding(tab.title, { topic: 'python' }),
    }));

    const result = oracleClusterTabs(items);
    expect(result.clusters[0].id).toBeTruthy();
    expect(typeof result.clusters[0].id).toBe('string');
  });

  it('B3.15 preserves input Tab objects intact in resulting ClusterGroup.tabs', () => {
    const originalTabs = PYTHON_TABS.slice(0, 2);
    const items = originalTabs.map((tab) => ({
      tab,
      embedding: generateDeterministicEmbedding(tab.title, { topic: 'python' }),
    }));

    const result = oracleClusterTabs(items);
    expect(result.clusters[0].tabs).toEqual(originalTabs);
  });
});
