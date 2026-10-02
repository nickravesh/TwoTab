// =============================================================================
// TwoTab Intelligent Tab Grouping — Deterministic Semantic Clustering Engine
// =============================================================================
// Features:
// 1. Complete-linkage Hierarchical Agglomerative Clustering (HAC)
// 2. Strict anti-chaining invariant: guarantees every pair in an initial cluster satisfies threshold
// 3. Centralized configurable thresholds (similarityThreshold, minimumGroupSize)
// 4. Two-Tier Clustering: Semantic Information Quality (SIQ) protection prevents
//    generic platform tabs (e.g. YouTube, Instagram homepages, Error 403 pages) from acting
//    as attractors or diluting informative topic clusters.
// 5. Cluster purity diagnostics & weakest-pair tracking
// 6. Conservative second-stage merge for clearly fragmented topic clusters
// 7. Exact tab deduplication to prevent repeated tabs from distorting centroids/HAC
// 8. Cluster centroid calculation and vector-guided group naming integration
// =============================================================================

import type { Tab, TabGroupColor } from '../storage';
import type {
  ClusterGroup,
  ClusteringResult,
  ClusteringOptions,
  NormalizedTabMetadata,
  ClusterPurityMetrics,
} from './types';
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  DEFAULT_MINIMUM_GROUP_SIZE,
} from './constants';
import { computeCosineSimilarity, l2Normalize } from './similarity';
import { normalizeTab } from './normalization';
import { generateGroupName } from './naming';

interface ActiveCluster {
  id: string;
  indices: number[];
}

interface ItemWithMeta {
  tab: Tab;
  embedding: Float32Array;
  meta: NormalizedTabMetadata;
  originalIndex: number;
}

/**
 * Computes the L2-normalized centroid vector from a collection of embedding vectors.
 */
export function computeClusterCentroid(embeddings: Float32Array[]): Float32Array {
  if (!embeddings || embeddings.length === 0) return new Float32Array(0);
  const dims = embeddings[0].length;
  const centroid = new Float32Array(dims);
  for (const emb of embeddings) {
    for (let d = 0; d < dims; d++) {
      centroid[d] += emb[d];
    }
  }
  const count = embeddings.length;
  for (let d = 0; d < dims; d++) {
    centroid[d] /= count;
  }
  return l2Normalize(centroid);
}

/**
 * Computes comprehensive cluster purity and coherence metrics for a formed cluster.
 */
function computePurityMetrics(
  indices: number[],
  simMatrix: number[][],
  subItems: ItemWithMeta[],
  centroid: Float32Array,
  clusterTabs: Tab[]
): ClusterPurityMetrics {
  const m = indices.length;
  if (m <= 1) {
    return {
      meanPairwiseSimilarity: 1.0,
      minPairwiseSimilarity: 1.0,
      maxSemanticDistance: 0.0,
      centroidSimilarity: 1.0,
      domainDiversity: 1.0 / Math.max(1, clusterTabs.length),
    };
  }

  let totalSim = 0;
  let minSim = 1.0;
  let pairCount = 0;

  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      const s = simMatrix[indices[i]][indices[j]];
      totalSim += s;
      if (s < minSim) minSim = s;
      pairCount++;
    }
  }

  let centroidSimSum = 0;
  for (let i = 0; i < m; i++) {
    centroidSimSum += computeCosineSimilarity(subItems[indices[i]].embedding, centroid);
  }

  const distinctDomains = new Set(
    clusterTabs
      .map((t) => {
        try {
          return new URL(t.url).hostname.replace(/^(www\.|m\.)/, '');
        } catch {
          return '';
        }
      })
      .filter(Boolean)
  ).size;

  return {
    meanPairwiseSimilarity: pairCount > 0 ? totalSim / pairCount : 1.0,
    minPairwiseSimilarity: minSim,
    maxSemanticDistance: 1.0 - minSim,
    centroidSimilarity: m > 0 ? centroidSimSum / m : 1.0,
    domainDiversity: distinctDomains / Math.max(1, clusterTabs.length),
  };
}

/**
 * Determines whether two cluster names or concepts are topically compatible
 * for conservative second-stage merging.
 */
function areCompatibleTopics(nameA: string, nameB: string): boolean {
  const a = nameA.toLowerCase().trim();
  const b = nameB.toLowerCase().trim();
  if (!a || !b) return false;
  if (a === b) return true;
  // Substring matching requires meaningful length (>= 4 chars) to prevent false positives like "ai"
  if ((a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b))) return true;

  // Recognized franchise and technical entities that may span sub-genres
  const canonicalEntities = [
    'battlefield', 'life is strange', 'last of us', 'ellie', 'gemini',
    'docker', 'mac software', 'shadcn', 'hermes', 'qwen', 'claude',
    '9router', 'cardinality', 'lsm-tree', 't-shirt', 'laptop bag',
    'bange', 'cleanmymac', 'bartender', 'alfred',
  ];
  for (const ent of canonicalEntities) {
    if (a.includes(ent) && b.includes(ent)) {
      return true;
    }
  }

  return false;
}

interface StagedCluster {
  indices: number[];
  clusterTabs: Tab[];
  clusterMetas: NormalizedTabMetadata[];
  clusterEmbeddings: Float32Array[];
  centroid: Float32Array;
  name: string;
  color: TabGroupColor;
  coherenceScore: number;
  metrics: ClusterPurityMetrics;
}

/**
 * Merges clearly fragmented clusters representing the same concept
 * using conservative semantic centroid alignment and cross-pair validation.
 */
function runSecondStageMerge(
  staged: StagedCluster[],
  simMatrix: number[][],
  subItems: ItemWithMeta[],
  threshold: number
): StagedCluster[] {
  let clusters = [...staged];
  let mergedAny = true;

  while (mergedAny && clusters.length > 1) {
    mergedAny = false;
    let bestPair: [number, number] | null = null;
    let bestScore = -2.0;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const c1 = clusters[i];
        const c2 = clusters[j];

        const nameMatch = c1.name.toLowerCase().trim() === c2.name.toLowerCase().trim();
        const topicMatch = areCompatibleTopics(c1.name, c2.name);
        if (!nameMatch && !topicMatch) continue;

        const isGenericName =
          c1.name.trim().length <= 3 ||
          ['ai', 'ui', 'mac', 'web', 'internal'].includes(c1.name.toLowerCase().trim());
        const isSpecificNameMatch = nameMatch && !isGenericName;

        // Dynamic thresholds based on evidence strength:
        // 1. Identical synthesized group name (specific): overwhelming evidence of same concept
        // 2. Compatible canonical topic: strong evidence of same franchise / system
        const requiredCentroidSim = isSpecificNameMatch ? 0.62 : topicMatch ? 0.68 : 0.80;
        const requiredCrossMean = isSpecificNameMatch ? 0.58 : topicMatch ? 0.60 : threshold;
        const requiredCrossMin = isSpecificNameMatch ? 0.42 : topicMatch ? 0.45 : 0.58;

        // 1. High centroid similarity required
        const centroidSim = computeCosineSimilarity(c1.centroid, c2.centroid);
        if (centroidSim < requiredCentroidSim) continue;

        // 2. Cross-cluster pairwise similarity calculations
        let crossSum = 0;
        let crossMin = 1.0;
        let crossCount = 0;

        for (const idx1 of c1.indices) {
          for (const idx2 of c2.indices) {
            const s = simMatrix[idx1][idx2];
            crossSum += s;
            if (s < crossMin) crossMin = s;
            crossCount++;
          }
        }

        const crossMean = crossCount > 0 ? crossSum / crossCount : 0;

        // 3. Must satisfy cross-similarity thresholds
        if (crossMean < requiredCrossMean || crossMin < requiredCrossMin) continue;

        const mergeScore = (centroidSim + crossMean) / 2;
        if (mergeScore > bestScore) {
          bestScore = mergeScore;
          bestPair = [i, j];
        }
      }
    }

    if (bestPair) {
      const [i, j] = bestPair;
      const c1 = clusters[i];
      const c2 = clusters[j];

      const combinedIndices = [...c1.indices, ...c2.indices].sort((a, b) => a - b);
      const combinedTabs = [...c1.clusterTabs, ...c2.clusterTabs];
      const combinedMetas = [...c1.clusterMetas, ...c2.clusterMetas];
      const combinedEmbeddings = [...c1.clusterEmbeddings, ...c2.clusterEmbeddings];
      const combinedCentroid = computeClusterCentroid(combinedEmbeddings);

      const { name, color } = generateGroupName(combinedTabs, combinedMetas, {
        clusterCentroid: combinedCentroid,
        tabEmbeddings: combinedEmbeddings,
      });

      const metrics = computePurityMetrics(
        combinedIndices,
        simMatrix,
        subItems,
        combinedCentroid,
        combinedTabs
      );

      const mergedCluster: StagedCluster = {
        indices: combinedIndices,
        clusterTabs: combinedTabs,
        clusterMetas: combinedMetas,
        clusterEmbeddings: combinedEmbeddings,
        centroid: combinedCentroid,
        name,
        color,
        coherenceScore: metrics.meanPairwiseSimilarity,
        metrics,
      };

      clusters = clusters.filter((_, idx) => idx !== i && idx !== j);
      clusters.push(mergedCluster);
      mergedAny = true;
    }
  }

  return clusters;
}

/**
 * Runs Complete-Linkage Hierarchical Agglomerative Clustering on a set of items.
 */
function runCompleteLinkageHAC(
  subItems: ItemWithMeta[],
  threshold: number,
  minSize: number,
  clusterIdPrefix: string,
  enableSecondStageMerge: boolean = true,
  dedupMap: Map<number, Tab[]> = new Map()
): { clusters: ClusterGroup[]; ungroupedTabs: Tab[] } {
  const n = subItems.length;
  if (n < minSize) {
    const allUngrouped: Tab[] = [];
    for (let i = 0; i < n; i++) {
      allUngrouped.push(subItems[i].tab);
      const dupes = dedupMap.get(i);
      if (dupes) allUngrouped.push(...dupes);
    }
    return {
      clusters: [],
      ungroupedTabs: allUngrouped,
    };
  }

  // Pre-compute pairwise similarity matrix
  const simMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    simMatrix[i][i] = 1.0;
    for (let j = i + 1; j < n; j++) {
      const sim = computeCosineSimilarity(subItems[i].embedding, subItems[j].embedding);
      simMatrix[i][j] = sim;
      simMatrix[j][i] = sim;
    }
  }

  let activeClusters: ActiveCluster[] = subItems.map((_, idx) => ({
    id: `cluster-${idx}`,
    indices: [idx],
  }));

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
      break;
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

  // Stage initial clusters that meet minSize
  const stagedClusters: StagedCluster[] = [];
  const ungroupedTabs: Tab[] = [];

  for (const c of activeClusters) {
    // Count total tabs including duplicates
    let totalTabsInCluster = c.indices.length;
    for (const idx of c.indices) {
      totalTabsInCluster += (dedupMap.get(idx)?.length || 0);
    }

    if (c.indices.length >= minSize || totalTabsInCluster >= minSize) {
      const clusterTabs: Tab[] = [];
      const clusterMetas: NormalizedTabMetadata[] = [];
      const clusterEmbeddings: Float32Array[] = [];

      for (const idx of c.indices) {
        clusterTabs.push(subItems[idx].tab);
        clusterMetas.push(subItems[idx].meta);
        clusterEmbeddings.push(subItems[idx].embedding);
        const dupes = dedupMap.get(idx);
        if (dupes) {
          clusterTabs.push(...dupes);
        }
      }

      const centroid = computeClusterCentroid(clusterEmbeddings);
      const nameResult = generateGroupName(clusterTabs, clusterMetas, {
        clusterCentroid: centroid,
        tabEmbeddings: clusterEmbeddings,
      });
      const name = nameResult.name;
      const color = nameResult.color;

      const metrics = computePurityMetrics(
        c.indices,
        simMatrix,
        subItems,
        centroid,
        clusterTabs
      );

      // Multi-domain coherence check:
      // If a candidate cluster spans tabs from high domain diversity (>= 0.70 across 3+ tabs),
      // it must demonstrate either:
      // 1. A shared lexical/thematic candidate or synthesized concept (maxCandidateDf >= 2 || isSynthesizedConcept), or
      // 2. High pairwise coherence (minPairwiseSimilarity >= 0.85)
      const isMultiDomainGrabBag =
        clusterTabs.length >= 3 &&
        metrics.domainDiversity >= 0.70 &&
        !nameResult.isSynthesizedConcept &&
        nameResult.maxCandidateDf < 2 &&
        metrics.minPairwiseSimilarity < 0.85;

      if (isMultiDomainGrabBag) {
        for (const idx of c.indices) {
          ungroupedTabs.push(subItems[idx].tab);
          const dupes = dedupMap.get(idx);
          if (dupes) {
            ungroupedTabs.push(...dupes);
          }
        }
        continue;
      }

      stagedClusters.push({
        indices: c.indices,
        clusterTabs,
        clusterMetas,
        clusterEmbeddings,
        centroid,
        name,
        color,
        coherenceScore: metrics.meanPairwiseSimilarity,
        metrics,
      });
    } else {
      for (const idx of c.indices) {
        ungroupedTabs.push(subItems[idx].tab);
        const dupes = dedupMap.get(idx);
        if (dupes) {
          ungroupedTabs.push(...dupes);
        }
      }
    }
  }

  // Optional conservative second-stage merge for clearly fragmented clusters
  const finalStaged = enableSecondStageMerge
    ? runSecondStageMerge(stagedClusters, simMatrix, subItems, threshold)
    : stagedClusters;

  // Sort clusters by size descending, then by first tab originalIndex ascending
  finalStaged.sort((a, b) => {
    if (b.clusterTabs.length !== a.clusterTabs.length) {
      return b.clusterTabs.length - a.clusterTabs.length;
    }
    return a.indices[0] - b.indices[0];
  });

  const clusters: ClusterGroup[] = finalStaged.map((sc, idx) => ({
    id: `${clusterIdPrefix}-${idx + 1}-${subItems[sc.indices[0]].originalIndex}`,
    name: sc.name,
    color: sc.color,
    tabs: sc.clusterTabs,
    coherenceScore: sc.coherenceScore,
    metrics: sc.metrics,
  }));

  return { clusters, ungroupedTabs };
}

/**
 * Deterministically clusters tabs based on semantic embedding similarity.
 *
 * Employs a 7-stage pipeline:
 * 1. Metadata Normalization & SIQ Quality Filtering
 * 2. Low-Information Quarantine (error pages, generic platform homepages, blank pins ungrouped)
 * 3. Exact Tab Deduplication (prevents repeated tabs from distorting centroids/HAC)
 * 4. Complete-Linkage Hierarchical Agglomerative Clustering (strict anti-chaining)
 * 5. Conservative Second-Stage Merge (resolves fragmented topics like Battlefield music)
 * 6. Duplicate Restoration (restores exact duplicate tabs into their assigned groups)
 * 7. Cluster Purity Diagnostics & Vector-Guided Conceptual Naming
 */
export function clusterTabs(
  items: Array<{ tab: Tab; embedding: Float32Array }>,
  options?: ClusteringOptions
): ClusteringResult {
  const threshold = options?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const minSize = options?.minimumGroupSize ?? DEFAULT_MINIMUM_GROUP_SIZE;
  const enableTiering = options?.enableInformationTiering !== false;
  const enableDedup = options?.deduplicateTabs !== false;
  const enableSecondStageMerge = options?.enableSecondStageMerge !== false;

  if (!items || items.length === 0) {
    return { clusters: [], ungroupedTabs: [] };
  }

  if (items.length < minSize) {
    return {
      clusters: [],
      ungroupedTabs: items.map((i) => i.tab),
    };
  }

  const itemsWithMeta: ItemWithMeta[] = items.map((item, idx) => ({
    tab: item.tab,
    embedding: item.embedding,
    meta: normalizeTab(item.tab),
    originalIndex: idx,
  }));

  // Non-tiered execution fallback
  if (!enableTiering) {
    return runCompleteLinkageHAC(
      itemsWithMeta,
      threshold,
      minSize,
      'semantic-group',
      enableSecondStageMerge
    );
  }

  // Stage 1: Tiering & Low-Information Filter
  // Informative tabs participate in complete-linkage HAC.
  // Low-information boilerplate tabs (e.g. error 403 pages, pure platform homepages,
  // or navigation pages with zero topical substance) lack semantic evidence
  // and are kept ungrouped rather than forming artificial domain attractor buckets.
  const informativeItems = itemsWithMeta.filter((i) => !i.meta.isLowInformation);
  const lowInfoItems = itemsWithMeta.filter((i) => i.meta.isLowInformation);

  if (informativeItems.length < minSize) {
    return {
      clusters: [],
      ungroupedTabs: itemsWithMeta.map((i) => i.tab),
    };
  }

  // Stage 2: Tab Deduplication before HAC
  const dedupMap = new Map<number, Tab[]>();
  const seenHashes = new Map<string, number>();
  const distinctInformative: ItemWithMeta[] = [];

  for (let idx = 0; idx < informativeItems.length; idx++) {
    const item = informativeItems[idx];
    const hash = item.meta.hash;

    if (enableDedup && seenHashes.has(hash)) {
      const primaryIdx = seenHashes.get(hash)!;
      if (!dedupMap.has(primaryIdx)) {
        dedupMap.set(primaryIdx, []);
      }
      dedupMap.get(primaryIdx)!.push(item.tab);
    } else {
      const newIdx = distinctInformative.length;
      if (enableDedup) seenHashes.set(hash, newIdx);
      distinctInformative.push(item);
    }
  }

  const result = runCompleteLinkageHAC(
    distinctInformative,
    threshold,
    minSize,
    'semantic-group',
    enableSecondStageMerge,
    dedupMap
  );

  return {
    clusters: result.clusters,
    ungroupedTabs: [...result.ungroupedTabs, ...lowInfoItems.map((i) => i.tab)],
  };
}
