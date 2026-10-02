/**
 * Deterministic Synthetic Embedding Generator and Semantic Reference Oracle
 *
 * Implements:
 * 1. 384-dimensional unit-normalized Float32Array generation via seeded Mulberry32 PRNG.
 * 2. Topic-guided clustering so synthetic embeddings have predictable, realistic dot products.
 * 3. Exact target similarity generation for boundary and threshold testing.
 * 4. Chaining triad generator for anti-chaining (HAC complete-linkage) verification.
 * 5. Deterministic normalization, similarity, clustering, naming, and storage safety oracles.
 */

import type { Tab, TabGroup, TabGroupColor } from '@/lib/storage';
import { unwrapDormantUrl, unwrapDormantTitle } from '@/lib/storage';
import { BRANDED_DOMAINS } from '@/lib/domainOrganizer';

export const EMBEDDING_DIMENSIONS = 384;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.70;
export const DEFAULT_MINIMUM_GROUP_SIZE = 2;

// ---------------------------------------------------------------------------
// 1. Deterministic PRNG & Hashing (Mulberry32 + FNV-1a)
// ---------------------------------------------------------------------------

export function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// 2. Vector Math Utilities
// ---------------------------------------------------------------------------

export function computeL2Norm(vec: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i];
  }
  return Math.sqrt(sum);
}

export function l2Normalize(vec: Float32Array): Float32Array {
  const norm = computeL2Norm(vec);
  const out = new Float32Array(vec.length);
  if (norm < 1e-12 || isNaN(norm)) {
    return out; // Zero vector fallback
  }
  const invNorm = 1.0 / norm;
  for (let i = 0; i < vec.length; i++) {
    out[i] = vec[i] * invNorm;
  }
  return out;
}

export function computeDotProduct(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  // Numerical clamp to [-1.0, 1.0]
  if (isNaN(dot)) return 0.0;
  return Math.max(-1.0, Math.min(1.0, dot));
}

// ---------------------------------------------------------------------------
// 3. Synthetic Embedding Generator
// ---------------------------------------------------------------------------

/**
 * Pre-defined orthogonal base seeds for standard topic clusters.
 */
const TOPIC_SEEDS: Record<string, number> = {
  python: 10001,
  react: 20002,
  machine_learning: 30003,
  recipes: 40004,
  shopping: 50005,
  github: 60006,
  general: 70007,
};

export function getBaseTopicVector(topic: string, dimensions = EMBEDDING_DIMENSIONS): Float32Array {
  const seed = TOPIC_SEEDS[topic.toLowerCase()] ?? fnv1a(topic);
  const prng = mulberry32(seed);
  const raw = new Float32Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    raw[i] = prng() * 2 - 1;
  }
  return l2Normalize(raw);
}

/**
 * Generates a deterministic 384-dimensional unit embedding from text.
 * If topic is specified, blends the topic base vector with text-specific noise
 * to achieve high within-topic similarity (~0.85 - 0.95) and low cross-topic similarity (<0.3).
 */
export function generateDeterministicEmbedding(
  text: string,
  options?: { topic?: string; coherence?: number; dimensions?: number }
): Float32Array {
  const dims = options?.dimensions ?? EMBEDDING_DIMENSIONS;
  const coherence = options?.coherence ?? 0.88;
  const textSeed = fnv1a(text);
  const prng = mulberry32(textSeed);

  const textNoise = new Float32Array(dims);
  for (let i = 0; i < dims; i++) {
    textNoise[i] = prng() * 2 - 1;
  }
  const normNoise = l2Normalize(textNoise);

  if (!options?.topic) {
    return normNoise;
  }

  const baseTopic = getBaseTopicVector(options.topic, dims);
  const blended = new Float32Array(dims);
  for (let i = 0; i < dims; i++) {
    blended[i] = coherence * baseTopic[i] + (1 - coherence) * normNoise[i];
  }
  return l2Normalize(blended);
}

/**
 * Generates a pair of unit vectors with an exact target dot-product cosine similarity.
 */
export function generateControlledVectorPair(
  targetSimilarity: number,
  dimensions = EMBEDDING_DIMENSIONS
): [Float32Array, Float32Array] {
  if (targetSimilarity < -1.0 || targetSimilarity > 1.0) {
    throw new Error(`Target similarity must be in [-1.0, 1.0], got ${targetSimilarity}`);
  }

  const u = new Float32Array(dimensions);
  u[0] = 1.0; // Unit vector along axis 0

  const v = new Float32Array(dimensions);
  v[0] = targetSimilarity;
  const remainder = Math.sqrt(Math.max(0, 1 - targetSimilarity * targetSimilarity));
  v[1] = remainder;

  return [l2Normalize(u), l2Normalize(v)];
}

/**
 * Generates three unit vectors A, B, C to test anti-chaining:
 * sim(A, B) = simAB (e.g. 0.85)
 * sim(B, C) = simBC (e.g. 0.85)
 * sim(A, C) = simAC (e.g. 0.50)
 * Note: simAC must satisfy the spherical triangle inequality:
 * cos(theta_AB + theta_BC) <= simAC <= cos(abs(theta_AB - theta_BC))
 */
export function generateChainingTriad(
  simAB = 0.85,
  simBC = 0.85,
  simAC = 0.50,
  dimensions = EMBEDDING_DIMENSIONS
): [Float32Array, Float32Array, Float32Array] {
  const a = new Float32Array(dimensions);
  a[0] = 1.0;

  const b = new Float32Array(dimensions);
  b[0] = simAB;
  b[1] = Math.sqrt(Math.max(0, 1 - simAB * simAB));

  const c = new Float32Array(dimensions);
  c[0] = simAC;
  const b1 = b[1];
  if (b1 > 1e-6) {
    c[1] = (simBC - simAB * simAC) / b1;
  } else {
    c[1] = 0;
  }
  const used = c[0] * c[0] + c[1] * c[1];
  c[2] = Math.sqrt(Math.max(0, 1 - used));

  return [l2Normalize(a), l2Normalize(b), l2Normalize(c)];
}

// ---------------------------------------------------------------------------
// 4. Reference Normalization Oracle
// ---------------------------------------------------------------------------

export const KNOWN_TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'msclkid',
  'mc_eid',
  'igshid',
  '_hsenc',
  '_hsmi',
  'ref',
  'source',
  'campaign',
  'trk',
  'si',
]);

export interface NormalizedTabMetadata {
  rawTab: Tab;
  cleanUrl: string;
  cleanTitle: string;
  domain: string;
  pathSegments: string[];
  semanticPrompt: string;
  hash: string;
}

export function oracleNormalizeTab(tab: Tab): NormalizedTabMetadata {
  const unwrappedUrl = unwrapDormantUrl(tab.url);
  const unwrappedTitle = unwrapDormantTitle(tab.title, tab.url);

  let cleanUrl = unwrappedUrl;
  let domain = '';
  const pathSegments: string[] = [];

  try {
    const parsed = new URL(unwrappedUrl);
    domain = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // Strip tracking query parameters
    const toDelete: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      const lower = key.toLowerCase();
      if (KNOWN_TRACKING_PARAMS.has(lower) || lower.startsWith('utm_')) {
        toDelete.push(key);
      }
    });
    for (const key of toDelete) {
      parsed.searchParams.delete(key);
    }
    cleanUrl = parsed.toString();

    // Extract path segments
    const rawSegments = parsed.pathname.split('/').filter(Boolean);
    for (const seg of rawSegments) {
      const segWithSpaces = seg.replace(/\+/g, ' ');
      let decoded = segWithSpaces;
      try {
        decoded = decodeURIComponent(segWithSpaces);
      } catch {
        decoded = segWithSpaces;
      }
      decoded = decoded
        .replace(/\.(html|php|asp|jsp|htm)$/i, '')
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (decoded.length > 0) {
        pathSegments.push(decoded);
      }
    }
  } catch {
    // Non-HTTP or unparseable URLs
    cleanUrl = unwrappedUrl;
    domain = (unwrappedUrl.split('/')[0] || '').trim();
  }

  const cleanTitle = (unwrappedTitle || '').trim().replace(/\s+/g, ' ');
  const semanticPrompt = `Title: ${cleanTitle || domain}. Domain: ${domain}. Path: ${pathSegments.join(' ')}.`.trim();
  const hash = fnv1a(`${cleanUrl}::${cleanTitle}`).toString(16);

  return {
    rawTab: tab,
    cleanUrl,
    cleanTitle: cleanTitle || domain,
    domain,
    pathSegments,
    semanticPrompt,
    hash,
  };
}

// ---------------------------------------------------------------------------
// 5. Reference Clustering Oracle (HAC Complete-Linkage)
// ---------------------------------------------------------------------------

export interface ClusterGroup {
  id: string;
  name: string;
  color: TabGroupColor;
  tabs: Tab[];
  coherenceScore: number;
}

export interface ClusteringResult {
  clusters: ClusterGroup[];
  ungroupedTabs: Tab[];
}

export interface ClusteringOptions {
  similarityThreshold?: number;
  minimumGroupSize?: number;
}

export function oracleClusterTabs(
  items: Array<{ tab: Tab; embedding: Float32Array }>,
  options?: ClusteringOptions
): ClusteringResult {
  const threshold = options?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const minSize = options?.minimumGroupSize ?? DEFAULT_MINIMUM_GROUP_SIZE;

  if (items.length < minSize) {
    return {
      clusters: [],
      ungroupedTabs: items.map((i) => i.tab),
    };
  }

  // Initial singleton clusters
  interface ActiveCluster {
    id: string;
    indices: number[];
  }

  let activeClusters: ActiveCluster[] = items.map((item, idx) => ({
    id: `cluster-${idx}`,
    indices: [idx],
  }));

  // Complete-linkage distance: min similarity between any pair (A in c1, B in c2)
  const getCompleteSimilarity = (c1: ActiveCluster, c2: ActiveCluster): number => {
    let minSim = 1.0;
    for (const i of c1.indices) {
      for (const j of c2.indices) {
        const sim = computeDotProduct(items[i].embedding, items[j].embedding);
        if (sim < minSim) minSim = sim;
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
      break; // No further valid merges above threshold
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

  const clusters: ClusterGroup[] = [];
  const ungroupedTabs: Tab[] = [];

  for (const c of activeClusters) {
    if (c.indices.length >= minSize) {
      const clusterTabs = c.indices.map((idx) => items[idx].tab);
      const metadata = clusterTabs.map(oracleNormalizeTab);
      const naming = oracleGenerateGroupName(clusterTabs, metadata);

      // Compute cluster coherence score (average pairwise similarity)
      let pairCount = 0;
      let totalSim = 0;
      for (let i = 0; i < c.indices.length; i++) {
        for (let j = i + 1; j < c.indices.length; j++) {
          totalSim += computeDotProduct(
            items[c.indices[i]].embedding,
            items[c.indices[j]].embedding
          );
          pairCount++;
        }
      }
      const coherenceScore = pairCount > 0 ? totalSim / pairCount : 1.0;

      clusters.push({
        id: c.id,
        name: naming.name,
        color: naming.color,
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

// ---------------------------------------------------------------------------
// 6. Reference Group Naming Oracle
// ---------------------------------------------------------------------------

export const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'could', 'did', 'do', 'does', 'doing', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having',
  'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i',
  'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most',
  'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only',
  'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she',
  'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to',
  'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your',
  'yours', 'yourself', 'yourselves',
  // Web boilerplate
  'home', 'login', 'signin', 'welcome', 'official', 'site', 'index', 'dashboard',
  'portal', 'page', 'search', 'privacy', 'terms', 'overview', 'getting', 'started',
]);

export function toTitleCase(str: string): string {
  return str
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

export function oracleGenerateGroupName(
  tabs: Tab[],
  metadata?: NormalizedTabMetadata[]
): { name: string; color: TabGroupColor } {
  if (tabs.length === 0) {
    return { name: 'Empty Collection', color: 'grey' };
  }

  const metas = metadata ?? tabs.map(oracleNormalizeTab);

  // Check shared branded domain
  const domains = metas.map((m) => m.domain).filter(Boolean);
  const domainCounts = new Map<string, number>();
  for (const d of domains) {
    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }

  let dominantDomain = '';
  let maxDomainCount = 0;
  for (const [d, count] of domainCounts.entries()) {
    if (count > maxDomainCount) {
      maxDomainCount = count;
      dominantDomain = d;
    }
  }

  // Tokenize titles first (requiring at least one letter)
  const titleTokenCounts = new Map<string, number>();
  for (const m of metas) {
    const words = m.cleanTitle
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && /[a-zA-Z]/.test(w));

    for (const w of words) {
      titleTokenCounts.set(w, (titleTokenCounts.get(w) ?? 0) + 1);
    }
  }

  // Find shared path tokens across multiple tabs
  const pathTokenOccurrences = new Map<string, Set<number>>();
  for (let idx = 0; idx < metas.length; idx++) {
    const m = metas[idx];
    const pathWords = m.pathSegments.join(' ')
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && /[a-zA-Z]/.test(w));
    for (const w of pathWords) {
      if (!pathTokenOccurrences.has(w)) pathTokenOccurrences.set(w, new Set());
      pathTokenOccurrences.get(w)!.add(idx);
    }
  }

  const tokenCounts = new Map<string, number>();
  if (titleTokenCounts.size > 0) {
    for (const [w, count] of titleTokenCounts.entries()) {
      tokenCounts.set(w, count);
    }
    // If title has very few distinct words (<= 1), augment with shared path tokens
    if (titleTokenCounts.size <= 1) {
      for (const [w, occ] of pathTokenOccurrences.entries()) {
        if (occ.size >= 2) {
          tokenCounts.set(w, (tokenCounts.get(w) ?? 0) + occ.size);
        }
      }
    }
  } else {
    // Only use path tokens that are shared across multiple tabs
    for (const [w, occ] of pathTokenOccurrences.entries()) {
      if (occ.size >= 2 || (metas.length === 1 && occ.size === 1)) {
        tokenCounts.set(w, occ.size);
      }
    }
  }

  // Find top terms
  const sortedTokens = Array.from(tokenCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  let generatedName = '';
  if (sortedTokens.length >= 2 && sortedTokens[1][1] >= 2) {
    generatedName = toTitleCase(`${sortedTokens[0][0]} ${sortedTokens[1][0]}`);
  } else if (sortedTokens.length >= 1 && sortedTokens[0][1] >= 1) {
    generatedName = toTitleCase(sortedTokens[0][0]);
  }

  // Branded domain enhancement
  const getRootDomain = (d: string) => {
    const parts = d.split('.');
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
    }
    return d;
  };

  const root = getRootDomain(dominantDomain);
  const brandEntry = (dominantDomain && BRANDED_DOMAINS[dominantDomain]) || (root && BRANDED_DOMAINS[root]);

  let assignedColor: TabGroupColor = 'blue';
  if (brandEntry) {
    assignedColor = brandEntry.color;
    if (!generatedName || maxDomainCount === tabs.length) {
      generatedName = generatedName ? `${brandEntry.name} — ${generatedName}` : brandEntry.name;
    }
  } else if (dominantDomain && !generatedName) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(dominantDomain)) {
      generatedName = dominantDomain;
    } else {
      generatedName = toTitleCase(dominantDomain.split('.')[0]);
    }
  }

  if (!generatedName) {
    generatedName = 'Saved Collection';
  }

  return { name: generatedName, color: assignedColor };
}

