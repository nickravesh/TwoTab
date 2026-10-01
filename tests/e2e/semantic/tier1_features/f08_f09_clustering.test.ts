/**
 * Tier 1 Feature Coverage: Deterministic Clustering & Parameters
 *
 * Feature 8: Anti-Chaining Coherent Clustering (R3)
 * Feature 9: Configurable Clustering Parameters (R3)
 *
 * Verification: 100% offline, deterministic clustering algorithms.
 */

import { describe, it, expect } from 'vitest';
import {
  oracleClusterTabs,
  generateDeterministicEmbedding,
  generateChainingTriad,
  generateControlledVectorPair,
} from '../harness/oracle';
import {
  PYTHON_TABS,
  REACT_TABS,
  MACHINE_LEARNING_TABS,
  RECIPES_TABS,
} from '../harness/fixtures';
import type { Tab } from '@/lib/storage';

describe('Tier 1: Semantic Clustering Engine (Features 8, 9)', () => {
  describe('Feature 8: Anti-Chaining Coherent Clustering (R3)', () => {
    it('8.1 clusters strongly related tabs within the same topic when complete linkage is satisfied', () => {
      const items = [
        ...PYTHON_TABS.slice(0, 3).map((tab) => ({
          tab,
          embedding: generateDeterministicEmbedding(tab.title, { topic: 'python' }),
        })),
        ...REACT_TABS.slice(0, 3).map((tab) => ({
          tab,
          embedding: generateDeterministicEmbedding(tab.title, { topic: 'react' }),
        })),
      ];

      const result = oracleClusterTabs(items, { similarityThreshold: 0.70 });
      expect(result.clusters.length).toBe(2);
      expect(result.ungroupedTabs.length).toBe(0);

      // Verify separation by topic
      const pythonCluster = result.clusters.find((c) =>
        c.tabs.some((t) => t.title.toLowerCase().includes('python'))
      );
      const reactCluster = result.clusters.find((c) =>
        c.tabs.some((t) => t.title.toLowerCase().includes('react'))
      );

      expect(pythonCluster?.tabs.length).toBe(3);
      expect(reactCluster?.tabs.length).toBe(3);
    });

    it('8.2 enforces anti-chaining invariant: rejects merging A, B, C when A~B and B~C but A!~C', () => {
      // Triad: A~B = 0.85, B~C = 0.85, but A~C = 0.50
      const [vA, vB, vC] = generateChainingTriad(0.85, 0.85, 0.50);
      const items = [
        { tab: { title: 'Node A', url: 'https://a.com' }, embedding: vA },
        { tab: { title: 'Bridge B', url: 'https://b.com' }, embedding: vB },
        { tab: { title: 'Node C', url: 'https://c.com' }, embedding: vC },
      ];

      // At similarity threshold 0.70, complete linkage prevents merging all 3 into one cluster
      const result = oracleClusterTabs(items, { similarityThreshold: 0.70 });

      // Either [A, B] forms a cluster and C is ungrouped, or [B, C] forms a cluster and A is ungrouped.
      // But under no circumstance should a 3-tab cluster exist!
      expect(result.clusters.some((c) => c.tabs.length === 3)).toBe(false);
      expect(result.ungroupedTabs.length).toBeGreaterThanOrEqual(1);
    });

    it('8.3 separates unrelated tabs from the same domain into distinct clusters', () => {
      // Same domain (github.com), completely different topics (Python vs React vs Linux)
      const tabs: Tab[] = [
        { title: 'Python Packaging Authority Repository', url: 'https://github.com/pypa/pip' },
        { title: 'Python Asyncio Library Implementation', url: 'https://github.com/python/cpython' },
        { title: 'React Virtual DOM Core Framework', url: 'https://github.com/facebook/react' },
        { title: 'React DOM Server Rendering Engine', url: 'https://github.com/facebook/react-dom' },
      ];

      const items = [
        { tab: tabs[0], embedding: generateDeterministicEmbedding(tabs[0].title, { topic: 'python' }) },
        { tab: tabs[1], embedding: generateDeterministicEmbedding(tabs[1].title, { topic: 'python' }) },
        { tab: tabs[2], embedding: generateDeterministicEmbedding(tabs[2].title, { topic: 'react' }) },
        { tab: tabs[3], embedding: generateDeterministicEmbedding(tabs[3].title, { topic: 'react' }) },
      ];

      const result = oracleClusterTabs(items, { similarityThreshold: 0.70 });
      expect(result.clusters.length).toBe(2);
      expect(result.clusters[0].tabs.length).toBe(2);
      expect(result.clusters[1].tabs.length).toBe(2);
    });

    it('8.4 leaves singleton tabs ungrouped and never creates a generic "Other" group', () => {
      const items = [
        ...PYTHON_TABS.slice(0, 3).map((tab) => ({
          tab,
          embedding: generateDeterministicEmbedding(tab.title, { topic: 'python' }),
        })),
        {
          tab: RECIPES_TABS[0], // One lone pasta recipe tab
          embedding: generateDeterministicEmbedding(RECIPES_TABS[0].title, { topic: 'recipes' }),
        },
      ];

      const result = oracleClusterTabs(items, { similarityThreshold: 0.70, minimumGroupSize: 2 });
      expect(result.clusters.length).toBe(1);
      expect(result.clusters[0].name.toLowerCase()).not.toContain('other');
      expect(result.ungroupedTabs.length).toBe(1);
      expect(result.ungroupedTabs[0].title).toBe(RECIPES_TABS[0].title);
    });

    it('8.5 guarantees 100% deterministic cluster assignments across 50 consecutive runs', () => {
      const items = [
        ...PYTHON_TABS.slice(0, 3).map((tab) => ({
          tab,
          embedding: generateDeterministicEmbedding(tab.title, { topic: 'python' }),
        })),
        ...MACHINE_LEARNING_TABS.slice(0, 3).map((tab) => ({
          tab,
          embedding: generateDeterministicEmbedding(tab.title, { topic: 'machine_learning' }),
        })),
      ];

      const firstRun = oracleClusterTabs(items, { similarityThreshold: 0.70 });

      for (let run = 1; run <= 50; run++) {
        const subsequentRun = oracleClusterTabs(items, { similarityThreshold: 0.70 });
        expect(subsequentRun.clusters.length).toBe(firstRun.clusters.length);
        expect(subsequentRun.ungroupedTabs.length).toBe(firstRun.ungroupedTabs.length);

        for (let c = 0; c < firstRun.clusters.length; c++) {
          expect(subsequentRun.clusters[c].tabs.map((t) => t.url)).toEqual(
            firstRun.clusters[c].tabs.map((t) => t.url)
          );
        }
      }
    });
  });

  describe('Feature 9: Configurable Clustering Parameters (R3)', () => {
    it('9.1 respects custom similarityThreshold: higher threshold produces tighter, smaller clusters', () => {
      // 2 vectors with similarity 0.75
      const [u, v] = generateControlledVectorPair(0.75);
      const items = [
        { tab: { title: 'Tab 1', url: 'https://test.com/1' }, embedding: u },
        { tab: { title: 'Tab 2', url: 'https://test.com/2' }, embedding: v },
      ];

      // At threshold 0.70: merges into a cluster
      const looseResult = oracleClusterTabs(items, { similarityThreshold: 0.70 });
      expect(looseResult.clusters.length).toBe(1);
      expect(looseResult.ungroupedTabs.length).toBe(0);

      // At threshold 0.80: threshold not met, remains ungrouped
      const strictResult = oracleClusterTabs(items, { similarityThreshold: 0.80 });
      expect(strictResult.clusters.length).toBe(0);
      expect(strictResult.ungroupedTabs.length).toBe(2);
    });

    it('9.2 respects custom minimumGroupSize: enforces min 3 tabs instead of default 2', () => {
      const items = PYTHON_TABS.slice(0, 2).map((tab) => ({
        tab,
        embedding: generateDeterministicEmbedding(tab.title, { topic: 'python' }),
      }));

      // With minimumGroupSize = 2 (default): forms a cluster
      const min2Result = oracleClusterTabs(items, { minimumGroupSize: 2 });
      expect(min2Result.clusters.length).toBe(1);

      // With minimumGroupSize = 3: 2 tabs are insufficient, remain ungrouped
      const min3Result = oracleClusterTabs(items, { minimumGroupSize: 3 });
      expect(min3Result.clusters.length).toBe(0);
      expect(min3Result.ungroupedTabs.length).toBe(2);
    });

    it('9.3 falls back to safe default parameters (threshold: 0.70, minSize: 2) when options omitted', () => {
      const items = PYTHON_TABS.slice(0, 2).map((tab) => ({
        tab,
        embedding: generateDeterministicEmbedding(tab.title, { topic: 'python' }),
      }));

      const defaultResult = oracleClusterTabs(items);
      expect(defaultResult.clusters.length).toBe(1);
      expect(defaultResult.clusters[0].tabs.length).toBe(2);
    });

    it('9.4 gracefully handles empty input array without errors', () => {
      const result = oracleClusterTabs([]);
      expect(result.clusters).toEqual([]);
      expect(result.ungroupedTabs).toEqual([]);
    });

    it('9.5 places all tabs into ungroupedTabs when total items is fewer than minimumGroupSize', () => {
      const items = [
        {
          tab: PYTHON_TABS[0],
          embedding: generateDeterministicEmbedding(PYTHON_TABS[0].title, { topic: 'python' }),
        },
      ];

      const result = oracleClusterTabs(items, { minimumGroupSize: 2 });
      expect(result.clusters.length).toBe(0);
      expect(result.ungroupedTabs.length).toBe(1);
      expect(result.ungroupedTabs[0].title).toBe(PYTHON_TABS[0].title);
    });
  });
});
