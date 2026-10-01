// =============================================================================
// TwoTab Intelligent Tab Grouping — Deterministic Semantic Clustering Engine
// =============================================================================
// Features:
// 1. Complete-linkage Hierarchical Agglomerative Clustering (HAC)
// 2. Strict anti-chaining invariant: guarantees every pair in a cluster satisfies threshold
// 3. Centralized configurable thresholds (similarityThreshold, minimumGroupSize)
// 4. Singletons and weak clusters routed to ungrouped bucket (zero 'Other' group clutter)
// 5. Cluster coherence scoring and deterministic group naming integration
// =============================================================================

import type { Tab } from '../storage';
import type {
  ClusterGroup,
  ClusteringResult,
  ClusteringOptions,
} from './types';
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  DEFAULT_MINIMUM_GROUP_SIZE,
} from './constants';
import { computeCosineSimilarity } from './similarity';
import { normalizeTab } from './normalization';
import { generateGroupName } from './naming';

interface ActiveCluster {
  id: string;
  indices: number[];
}

/**
 * Deterministically clusters tabs based on semantic embedding similarity.
 *
 * Algorithm:
 * - Employs complete-linkage agglomerative clustering.
 * - Computes similarity between two clusters as the minimum pairwise similarity.
 * - Only merges if min pairwise similarity is >= similarityThreshold.
 * - This strictly prevents transitive chaining (A ~ B and B ~ C collapsing when A !~ C).
 * - Leaves singletons and clusters smaller than minimumGroupSize in ungroupedTabs.
 */
export function clusterTabs(
  items: Array<{ tab: Tab; embedding: Float32Array }>,
  options?: ClusteringOptions
): ClusteringResult {
  const threshold = options?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const minSize = options?.minimumGroupSize ?? DEFAULT_MINIMUM_GROUP_SIZE;

  if (!items || items.length === 0) {
    return { clusters: [], ungroupedTabs: [] };
  }

  if (items.length < minSize) {
    return {
      clusters: [],
      ungroupedTabs: items.map((i) => i.tab),
    };
  }

  // Pre-compute pairwise similarity matrix for O(1) lookups during merges
  const n = items.length;
  const simMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    simMatrix[i][i] = 1.0;
    for (let j = i + 1; j < n; j++) {
      const sim = computeCosineSimilarity(items[i].embedding, items[j].embedding);
      simMatrix[i][j] = sim;
      simMatrix[j][i] = sim;
    }
  }

  // Start with each item in its own singleton cluster
  let activeClusters: ActiveCluster[] = items.map((_, idx) => ({
    id: `cluster-${idx}`,
    indices: [idx],
  }));

  // Complete-linkage distance: minimum pairwise similarity between any two clusters
  const getCompleteSimilarity = (c1: ActiveCluster, c2: ActiveCluster): number => {
    let minSim = 1.0;
    for (const i of c1.indices) {
      for (const j of c2.indices) {
        const sim = simMatrix[i][j];
        if (sim < minSim) {
          minSim = sim;
        }
      }
    }
    return minSim;
  };

  // Agglomerative merging loop
  while (activeClusters.length > 1) {
    let bestSim = -2.0;
    let bestPair: [number, number] | null = null;

    for (let i = 0; i < activeClusters.length; i++) {
      for (let j = i + 1; j < activeClusters.length; j++) {
        const sim = getCompleteSimilarity(activeClusters[i], activeClusters[j]);
        if (sim > bestSim) {
          bestSim = sim;
          bestPair = [i, j];
        }
      }
    }

    if (bestPair === null || bestSim < threshold) {
      break; // No pair satisfies the similarity threshold
    }

    const [ci, cj] = bestPair;
    const merged: ActiveCluster = {
      id: `${activeClusters[ci].id}_${activeClusters[cj].id}`,
      indices: [...activeClusters[ci].indices, ...activeClusters[cj].indices].sort((a, b) => a - b),
    };

    activeClusters = activeClusters
      .filter((_, idx) => idx !== ci && idx !== cj)
      .concat(merged);
  }

  // Sort clusters deterministically by size descending, then by first tab index ascending
  activeClusters.sort((a, b) => {
    if (b.indices.length !== a.indices.length) {
      return b.indices.length - a.indices.length;
    }
    return a.indices[0] - b.indices[0];
  });

  const clusters: ClusterGroup[] = [];
  const ungroupedTabs: Tab[] = [];

  for (let cIdx = 0; cIdx < activeClusters.length; cIdx++) {
    const c = activeClusters[cIdx];
    if (c.indices.length >= minSize) {
      const clusterTabs = c.indices.map((idx) => items[idx].tab);
      const metadata = clusterTabs.map((t) => normalizeTab(t));
      const { name, color } = generateGroupName(clusterTabs, metadata);

      // Compute cluster coherence score (average pairwise similarity)
      let pairCount = 0;
      let totalSim = 0;
      for (let i = 0; i < c.indices.length; i++) {
        for (let j = i + 1; j < c.indices.length; j++) {
          totalSim += simMatrix[c.indices[i]][c.indices[j]];
          pairCount++;
        }
      }
      const coherenceScore = pairCount > 0 ? totalSim / pairCount : 1.0;

      clusters.push({
        id: `semantic-group-${cIdx + 1}-${c.indices[0]}`,
        name,
        color,
        tabs: clusterTabs,
        coherenceScore,
      });
    } else {
      for (const idx of c.indices) {
        ungroupedTabs.push(items[idx].tab);
      }
    }
  }

  return {
    clusters,
    ungroupedTabs,
  };
}
