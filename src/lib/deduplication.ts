/**
 * TwoTab Smart Duplicate & Mirror Cleaner Engine
 * 
 * Provides 4-tier URL normalization, duplicate cluster detection,
 * group-level Jaccard similarity matrices, and safe batch deduplication
 * with automatic rolling backup protection.
 */

import { type TabGroup, type Tab, createRollingBackup, saveGroups } from './storage';

// =============================================================================
// 1. Tracking Parameters & Mirror Normalization Constants
// =============================================================================

/**
 * Universal marketing and analytics query parameter blocklist.
 * Strips tracking noise while strictly preserving functional parameters
 * (e.g. search query `q`, pagination `page`, video IDs `v`, issue `id`).
 */
export const TRACKING_PARAM_PATTERNS = new Set([
  // Google / Marketing Analytics
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_name',
  'utm_reader',
  'utm_place',
  'utm_pubreferrer',
  'utm_swu',
  'gclid',
  'gclsrc',
  'gbraid',
  'wbraid',
  '_ga',
  '_gl',

  // Social Networks
  'fbclid',
  'igshid',
  'twclid',
  'si', // YouTube / Spotify share identifier
  'feature', // YouTube share feature parameter
  'ref',
  'ref_src',
  'ref_url',
  'source',
  'sharing',
  'recipient',

  // Email / CRM Tracking
  'mc_cid',
  'mc_eid',
  'vero_id',
  'vero_conv',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'wickedid',
  'yclid',

  // Generic Session / Click IDs & Ads
  'session_id',
  'tracking_code',
  'tracking_id',
  'click_id',
  'msclkid',

  // Amazon & E-commerce Noise
  'qid',
  'sprefix',
  'crid',
  'sr',
  'dib',
  'dib_tag',
  'th',
  'psc',
]);

/**
 * Generic page titles that must not trigger Tier 4 fuzzy title clustering
 * across different URLs.
 */
export const GENERIC_TITLES = new Set([
  'home',
  'homepage',
  'login',
  'log in',
  'sign in',
  'signin',
  'signup',
  'sign up',
  'dashboard',
  'welcome',
  'index',
  '404 not found',
  '404',
  'page not found',
  'error',
  'untitled',
  'untitled page',
  'search',
  'search results',
  'loading',
  'about',
  'contact',
  'terms of service',
  'privacy policy',
]);

// =============================================================================
// 2. Types & Interfaces
// =============================================================================

export type DeduplicationStrategy = 'keep_oldest' | 'keep_newest' | 'keep_largest';

export type DuplicateMatchType = 'exact' | 'canonical' | 'fuzzy_title';

export interface NormalizationOptions {
  stripTracking?: boolean;
  stripHash?: boolean;
  normalizeMirrors?: boolean;
  stripTrailingSlash?: boolean;
  clusterFuzzyTitles?: boolean;
}

export interface DuplicateInstance {
  groupId: number;
  groupName: string;
  groupDate: string;
  groupColor?: string;
  tabIndex: number;
  originalUrl: string;
  originalTitle: string;
  isOldest: boolean;
  isNewest: boolean;
}

export interface DuplicateCluster {
  id: string;
  canonicalUrl: string;
  representativeTitle: string;
  matchType: DuplicateMatchType;
  instances: DuplicateInstance[];
  totalCopies: number;
  estimatedMemoryBytes: number;
}

export interface DuplicateGroupPair {
  groupA: { id: number; name: string; date: string; tabCount: number; color?: string };
  groupB: { id: number; name: string; date: string; tabCount: number; color?: string };
  similarityScore: number; // Jaccard Index (0.0 to 1.0)
  sharedTabsCount: number;
  totalUniqueTabsCount: number;
  sharedTabs: { title: string; url: string }[];
}

export interface DeduplicationSummary {
  totalTabsScanned: number;
  totalDuplicateTabs: number;
  uniqueClustersCount: number;
  exactMatchesCount: number;
  canonicalMatchesCount: number;
  fuzzyTitleMatchesCount: number;
  duplicateGroupsCount: number;
  estimatedMemorySavedBytes: number;
}

// =============================================================================
// 3. Normalization Engine
// =============================================================================

/**
 * Normalizes a URL across 4 tiers:
 * 1. Protocol & default port normalization (http -> https, :80/:443 stripped)
 * 2. Hostname canonicalization (lowercase, strip `www.`, resolve mobile subdomains `m.`/`mobile.`)
 * 3. Domain mirror resolution (YouTube youtu.be -> youtube.com/watch?v=ID)
 * 4. Tracking parameter sanitization (strips 25+ analytics params while preserving functional ones)
 * 5. Trailing slash and fragment/hash normalization
 */
export function normalizeUrl(rawUrl: string, options: NormalizationOptions = {}): string {
  const {
    stripTracking = true,
    stripHash = true,
    normalizeMirrors = true,
    stripTrailingSlash = true,
  } = options;

  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);

    // Only process standard web protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return trimmed;
    }

    // Protocol normalization
    parsed.protocol = 'https:';

    // Hostname canonicalization
    let host = parsed.hostname.toLowerCase();

    // Strip default www prefix
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }

    // Tier 3: Mirror & Mobile Subdomain Resolution
    if (normalizeMirrors) {
      // Mobile Wikipedia (e.g. en.m.wikipedia.org -> en.wikipedia.org)
      if (host.endsWith('.m.wikipedia.org')) {
        host = host.replace('.m.wikipedia.org', '.wikipedia.org');
      } else if (host === 'm.wikipedia.org') {
        host = 'wikipedia.org';
      }

      // Mobile Twitter / X
      if (host === 'mobile.twitter.com' || host === 'mobile.x.com' || host === 'twitter.com') {
        host = 'x.com';
      }

      // YouTube Shortener (youtu.be/VIDEO_ID -> youtube.com/watch?v=VIDEO_ID)
      if (host === 'youtu.be') {
        const videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0];
        if (videoId) {
          host = 'youtube.com';
          parsed.pathname = '/watch';
          parsed.searchParams.set('v', videoId);
        }
      }

      // Amazon Canonicalization: strip slug before /dp/ASIN and clean product query parameters
      if (host.includes('amazon.')) {
        const dpMatch = parsed.pathname.match(/\/dp\/([A-Za-z0-9]{10})/i);
        if (dpMatch) {
          parsed.pathname = `/dp/${dpMatch[1].toUpperCase()}`;
          parsed.searchParams.delete('keywords');
        }
      }
    }

    parsed.hostname = host;

    // Strip default ports
    if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = '';
    }

    // Tier 2: Tracking Query Parameter Sanitization
    if (stripTracking) {
      const keysToDelete: string[] = [];
      parsed.searchParams.forEach((_val, key) => {
        const lowerKey = key.toLowerCase();
        if (TRACKING_PARAM_PATTERNS.has(lowerKey) || lowerKey.startsWith('utm_')) {
          keysToDelete.push(key);
        }
      });
      for (const k of keysToDelete) {
        parsed.searchParams.delete(k);
      }

      // Special YouTube cleanup: remove video playback time timestamp 't' if standalone
      if (host === 'youtube.com' && parsed.pathname === '/watch') {
        parsed.searchParams.delete('t');
        parsed.searchParams.delete('feature');
        parsed.searchParams.delete('si');
      }
    }

    // Sort remaining query params for deterministic string comparison
    parsed.searchParams.sort();

    // Strip fragment / hash anchor
    if (stripHash) {
      parsed.hash = '';
    }

    let result = parsed.toString();

    // Strip trailing slash if present (except root domain 'https://example.com/')
    if (stripTrailingSlash && parsed.pathname.length > 1 && result.endsWith('/')) {
      result = result.slice(0, -1);
    }

    return result;
  } catch {
    // If URL parsing fails, return clean trimmed fallback
    return trimmed;
  }
}

/**
 * Normalizes a page title by trimming whitespace, lowercasing, and removing
 * common suffix branding (e.g. " - YouTube", " | GitHub", " - Wikipedia").
 */
export function normalizeTitle(title: string): string {
  if (!title) return '';
  return title
    .trim()
    .toLowerCase()
    .replace(/\s*[-–—|•]\s*(youtube|github|wikipedia|reddit|medium|twitter|x|amazon|stackoverflow)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// =============================================================================
// 4. Duplicate Detection Engine
// =============================================================================

/**
 * Fast 64-bit deterministic hash (cyrb53) producing collision-free alphanumeric IDs
 */
export function hashString(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Scans all tab groups and clusters identical or canonical duplicate tabs.
 */
export function findDuplicateClusters(
  groups: TabGroup[],
  options: NormalizationOptions = {}
): DuplicateCluster[] {
  if (!Array.isArray(groups) || groups.length === 0) return [];

  // Map of canonicalKey -> Array of raw instances
  const clusterMap = new Map<string, {
    canonicalUrl: string;
    representativeTitle: string;
    matchType: DuplicateMatchType;
    instances: DuplicateInstance[];
  }>();

  // Helper map to detect exact matches vs canonical matches
  const exactUrlMap = new Map<string, number>();

  for (const group of groups) {
    if (!group || !Array.isArray(group.tabs)) continue;

    const groupDate = group.date || new Date().toISOString();

    for (let tabIndex = 0; tabIndex < group.tabs.length; tabIndex++) {
      const tab = group.tabs[tabIndex];
      if (!tab || !tab.url) continue;

      const rawUrl = tab.url.trim();
      const rawTitle = tab.title?.trim() || rawUrl;

      // Track exact occurrences
      exactUrlMap.set(rawUrl, (exactUrlMap.get(rawUrl) || 0) + 1);

      // Compute normalized canonical key
      const canonicalKey = normalizeUrl(rawUrl, options);
      if (!canonicalKey) continue;

      const existing = clusterMap.get(canonicalKey);

      const instance: DuplicateInstance = {
        groupId: group.id,
        groupName: group.name || 'Untitled Collection',
        groupDate,
        groupColor: group.color,
        tabIndex,
        originalUrl: rawUrl,
        originalTitle: rawTitle,
        isOldest: false,
        isNewest: false,
      };

      if (!existing) {
        clusterMap.set(canonicalKey, {
          canonicalUrl: canonicalKey,
          representativeTitle: rawTitle,
          matchType: 'canonical', // Will refine below
          instances: [instance],
        });
      } else {
        existing.instances.push(instance);
        // Prefer longer/more descriptive titles as the representative title
        if (rawTitle.length > existing.representativeTitle.length && !rawTitle.startsWith('http')) {
          existing.representativeTitle = rawTitle;
        }
      }
    }
  }

  // Filter down to clusters with 2 or more copies
  const duplicateClusters: DuplicateCluster[] = [];

  for (const [canonicalKey, cluster] of clusterMap.entries()) {
    if (cluster.instances.length < 2) continue;

    // Sort instances chronologically by groupDate (oldest first)
    cluster.instances.sort((a, b) => {
      const dateA = new Date(a.groupDate).getTime() || 0;
      const dateB = new Date(b.groupDate).getTime() || 0;
      return dateA - dateB;
    });

    // Mark oldest and newest flags
    cluster.instances[0].isOldest = true;
    cluster.instances[cluster.instances.length - 1].isNewest = true;

    // Determine match type:
    // If every instance has the exact same raw URL string -> 'exact'
    const firstUrl = cluster.instances[0].originalUrl;
    const isExact = cluster.instances.every((inst) => inst.originalUrl === firstUrl);

    const matchType: DuplicateMatchType = isExact ? 'exact' : 'canonical';

    // Average estimated RAM per tab in Chrome is ~35MB
    const estimatedMemoryBytes = (cluster.instances.length - 1) * 35 * 1024 * 1024;

    duplicateClusters.push({
      id: `cluster_${hashString(canonicalKey)}`,
      canonicalUrl: cluster.canonicalUrl,
      representativeTitle: cluster.representativeTitle,
      matchType,
      instances: cluster.instances,
      totalCopies: cluster.instances.length,
      estimatedMemoryBytes,
    });
  }

  // Tier 4: Fuzzy Title & Domain Clustering for remaining single tabs
  const { clusterFuzzyTitles = true } = options;

  if (clusterFuzzyTitles) {
    const unclusteredInstances: DuplicateInstance[] = [];
    for (const cluster of clusterMap.values()) {
      if (cluster.instances.length === 1) {
        unclusteredInstances.push(cluster.instances[0]);
      }
    }

    const titleClusterMap = new Map<string, DuplicateInstance[]>();

    for (const inst of unclusteredInstances) {
      const normTitle = normalizeTitle(inst.originalTitle);
      if (!normTitle || normTitle.length < 5 || GENERIC_TITLES.has(normTitle)) {
        continue;
      }

      try {
        const parsed = new URL(inst.originalUrl);
        let host = parsed.hostname.toLowerCase();
        if (host.startsWith('www.')) host = host.slice(4);

        const key = `${host}:::${normTitle}`;
        const existing = titleClusterMap.get(key);
        if (!existing) {
          titleClusterMap.set(key, [inst]);
        } else {
          existing.push(inst);
        }
      } catch {
        // Skip unparseable URLs
      }
    }

    for (const [key, instances] of titleClusterMap.entries()) {
      if (instances.length < 2) continue;

      instances.sort((a, b) => {
        const dateA = new Date(a.groupDate).getTime() || 0;
        const dateB = new Date(b.groupDate).getTime() || 0;
        return dateA - dateB;
      });

      instances[0].isOldest = true;
      instances[instances.length - 1].isNewest = true;

      const representativeTitle = instances.reduce(
        (longest, curr) => (curr.originalTitle.length > longest.length ? curr.originalTitle : longest),
        instances[0].originalTitle
      );

      const [host] = key.split(':::');
      const estimatedMemoryBytes = (instances.length - 1) * 35 * 1024 * 1024;

      duplicateClusters.push({
        id: `title_cluster_${hashString(key)}`,
        canonicalUrl: `https://${host}/* [Title Mirror]`,
        representativeTitle,
        matchType: 'fuzzy_title',
        instances,
        totalCopies: instances.length,
        estimatedMemoryBytes,
      });
    }
  }

  // Sort clusters by number of duplicate copies descending (highest impact first)
  return duplicateClusters.sort((a, b) => b.totalCopies - a.totalCopies);
}

/**
 * Calculates Jaccard Similarity Index across all pairs of tab groups to find
 * duplicate or near-duplicate groups (> threshold overlap).
 * 
 * Jaccard Index = |GroupA ∩ GroupB| / |GroupA ∪ GroupB|
 */
export function findDuplicateGroups(
  groups: TabGroup[],
  similarityThreshold = 0.7
): DuplicateGroupPair[] {
  if (!Array.isArray(groups) || groups.length < 2) return [];

  const groupPairs: DuplicateGroupPair[] = [];

  // Precompute normalized URL sets for each group
  const groupUrlSets = groups.map((g) => {
    const urls = (g.tabs || []).map((t) => normalizeUrl(t.url)).filter(Boolean);
    return {
      group: g,
      urlSet: new Set(urls),
      rawTabs: g.tabs || [],
    };
  });

  for (let i = 0; i < groupUrlSets.length; i++) {
    for (let j = i + 1; j < groupUrlSets.length; j++) {
      const setA = groupUrlSets[i].urlSet;
      const setB = groupUrlSets[j].urlSet;

      if (setA.size === 0 || setB.size === 0) continue;

      // Calculate intersection
      let sharedCount = 0;
      const sharedTabs: { title: string; url: string }[] = [];

      for (const url of setA) {
        if (setB.has(url)) {
          sharedCount++;
          const matchingTab = groupUrlSets[i].rawTabs.find((t) => normalizeUrl(t.url) === url);
          if (matchingTab) {
            sharedTabs.push({ title: matchingTab.title || url, url: matchingTab.url });
          }
        }
      }

      // Calculate union: |A| + |B| - |A ∩ B|
      const unionCount = setA.size + setB.size - sharedCount;
      if (unionCount === 0) continue;

      const jaccardScore = sharedCount / unionCount;

      if (jaccardScore >= similarityThreshold && sharedCount > 0) {
        groupPairs.push({
          groupA: {
            id: groupUrlSets[i].group.id,
            name: groupUrlSets[i].group.name || 'Untitled Group',
            date: groupUrlSets[i].group.date || new Date().toISOString(),
            tabCount: groupUrlSets[i].rawTabs.length,
            color: groupUrlSets[i].group.color,
          },
          groupB: {
            id: groupUrlSets[j].group.id,
            name: groupUrlSets[j].group.name || 'Untitled Group',
            date: groupUrlSets[j].group.date || new Date().toISOString(),
            tabCount: groupUrlSets[j].rawTabs.length,
            color: groupUrlSets[j].group.color,
          },
          similarityScore: Number(jaccardScore.toFixed(2)),
          sharedTabsCount: sharedCount,
          totalUniqueTabsCount: unionCount,
          sharedTabs,
        });
      }
    }
  }

  // Sort by highest similarity score first
  return groupPairs.sort((a, b) => b.similarityScore - a.similarityScore);
}

/**
 * Calculates a summary of duplicates across the entire library.
 */
export function getDeduplicationSummary(
  groups: TabGroup[],
  clusters: DuplicateCluster[],
  groupPairs: DuplicateGroupPair[]
): DeduplicationSummary {
  const totalTabsScanned = groups.reduce((acc, g) => acc + (g.tabs?.length || 0), 0);
  const totalDuplicateTabs = clusters.reduce((acc, c) => acc + (c.totalCopies - 1), 0);
  const exactMatchesCount = clusters.filter((c) => c.matchType === 'exact').length;
  const canonicalMatchesCount = clusters.filter((c) => c.matchType === 'canonical').length;
  const fuzzyTitleMatchesCount = clusters.filter((c) => c.matchType === 'fuzzy_title').length;

  const estimatedMemorySavedBytes = totalDuplicateTabs * 35 * 1024 * 1024;

  return {
    totalTabsScanned,
    totalDuplicateTabs,
    uniqueClustersCount: clusters.length,
    exactMatchesCount,
    canonicalMatchesCount,
    fuzzyTitleMatchesCount,
    duplicateGroupsCount: groupPairs.length,
    estimatedMemorySavedBytes,
  };
}

// =============================================================================
// 5. Safe Batch Mutation Actions with Rolling Backup Protection
// =============================================================================

/**
 * Cleans all duplicate clusters according to the selected strategy:
 * - 'keep_oldest': Keeps the tab in the group created first, removes from newer groups.
 * - 'keep_newest': Keeps the tab in the most recently created group.
 * - 'keep_largest': Keeps the tab in the group with the most total tabs.
 * 
 * Invariants:
 * 1. Always captures a rolling backup snapshot first.
 * 2. Prunes any group that becomes completely empty.
 */
export async function cleanAllDuplicates(
  strategy: DeduplicationStrategy,
  clusters: DuplicateCluster[],
  currentGroups: TabGroup[]
): Promise<{ removedCount: number; cleanedGroupsCount: number }> {
  if (!clusters || clusters.length === 0 || !currentGroups || currentGroups.length === 0) {
    return { removedCount: 0, cleanedGroupsCount: 0 };
  }

  // 1. Capture rolling backup snapshot before mutation
  await createRollingBackup(true);

  // Group size lookup for 'keep_largest' strategy
  const groupSizeMap = new Map<number, number>();
  for (const g of currentGroups) {
    groupSizeMap.set(g.id, g.tabs?.length || 0);
  }

  // Map of groupId -> Set of tabIndices to delete
  const tabIndicesToDeleteByGroup = new Map<number, Set<number>>();

  let totalRemoved = 0;

  for (const cluster of clusters) {
    if (cluster.instances.length < 2) continue;

    // Pick the single instance to KEEP based on strategy
    let instanceToKeep = cluster.instances[0]; // Default: oldest

    if (strategy === 'keep_newest') {
      instanceToKeep = cluster.instances[cluster.instances.length - 1];
    } else if (strategy === 'keep_largest') {
      instanceToKeep = [...cluster.instances].sort((a, b) => {
        const sizeA = groupSizeMap.get(a.groupId) || 0;
        const sizeB = groupSizeMap.get(b.groupId) || 0;
        return sizeB - sizeA;
      })[0];
    }

    // Mark all other instances for deletion
    for (const inst of cluster.instances) {
      if (inst === instanceToKeep) continue;

      if (!tabIndicesToDeleteByGroup.has(inst.groupId)) {
        tabIndicesToDeleteByGroup.set(inst.groupId, new Set());
      }
      tabIndicesToDeleteByGroup.get(inst.groupId)!.add(inst.tabIndex);
      totalRemoved++;
    }
  }

  // Apply deletions to groups
  const updatedGroups: TabGroup[] = [];

  for (const group of currentGroups) {
    const indicesToDelete = tabIndicesToDeleteByGroup.get(group.id);
    if (!indicesToDelete || indicesToDelete.size === 0) {
      updatedGroups.push(group);
      continue;
    }

    const remainingTabs = (group.tabs || []).filter((_, idx) => !indicesToDelete.has(idx));

    // Only keep group if it still has tabs (Garbage collection of empty groups)
    if (remainingTabs.length > 0) {
      updatedGroups.push({
        ...group,
        tabs: remainingTabs,
      });
    }
  }

  // Save updated groups to storage
  await saveGroups(updatedGroups);

  const cleanedGroupsCount = currentGroups.length - updatedGroups.length;

  return {
    removedCount: totalRemoved,
    cleanedGroupsCount,
  };
}

/**
 * Removes specific duplicate instances selected by the user.
 * Supports exact tabIndex deletion with safe fallback to normalized URL matching.
 */
export async function removeSpecificInstances(
  instancesToRemove: { groupId: number; tabIndex?: number; url: string }[],
  currentGroups: TabGroup[]
): Promise<void> {
  if (!instancesToRemove || instancesToRemove.length === 0) return;

  // 1. Capture rolling backup snapshot
  await createRollingBackup(true);

  const indicesByGroup = new Map<number, Set<number>>();
  const urlsByGroup = new Map<number, Set<string>>();

  for (const item of instancesToRemove) {
    if (item.tabIndex !== undefined) {
      if (!indicesByGroup.has(item.groupId)) {
        indicesByGroup.set(item.groupId, new Set());
      }
      indicesByGroup.get(item.groupId)!.add(item.tabIndex);
    } else {
      if (!urlsByGroup.has(item.groupId)) {
        urlsByGroup.set(item.groupId, new Set());
      }
      urlsByGroup.get(item.groupId)!.add(normalizeUrl(item.url));
    }
  }

  const updatedGroups: TabGroup[] = [];

  for (const group of currentGroups) {
    const indices = indicesByGroup.get(group.id);
    const urls = urlsByGroup.get(group.id);

    if ((!indices || indices.size === 0) && (!urls || urls.size === 0)) {
      updatedGroups.push(group);
      continue;
    }

    const remainingTabs: Tab[] = [];
    for (let i = 0; i < (group.tabs || []).length; i++) {
      const tab = group.tabs[i];
      if (indices && indices.has(i)) {
        continue;
      }
      const norm = normalizeUrl(tab.url);
      if (urls && urls.has(norm)) {
        urls.delete(norm);
        continue;
      }
      remainingTabs.push(tab);
    }

    if (remainingTabs.length > 0) {
      updatedGroups.push({
        ...group,
        tabs: remainingTabs,
      });
    }
  }

  await saveGroups(updatedGroups);
}

/**
 * Merges source group into target group, discarding duplicate tabs in the process,
 * and deleting the source group container.
 */
export async function mergeGroups(
  sourceGroupId: number,
  targetGroupId: number,
  currentGroups: TabGroup[]
): Promise<void> {
  const sourceGroup = currentGroups.find((g) => g.id === sourceGroupId);
  const targetGroup = currentGroups.find((g) => g.id === targetGroupId);

  if (!sourceGroup || !targetGroup) return;

  // 1. Capture rolling backup snapshot
  await createRollingBackup(true);

  // Combine tabs with deduplication against target
  const targetUrlSet = new Set((targetGroup.tabs || []).map((t) => normalizeUrl(t.url)));
  const mergedTabs = [...(targetGroup.tabs || [])];

  for (const tab of sourceGroup.tabs || []) {
    const normUrl = normalizeUrl(tab.url);
    if (!targetUrlSet.has(normUrl)) {
      targetUrlSet.add(normUrl);
      mergedTabs.push(tab);
    }
  }

  const updatedGroups = currentGroups
    .filter((g) => g.id !== sourceGroupId)
    .map((g) => (g.id === targetGroupId ? { ...g, tabs: mergedTabs } : g));

  await saveGroups(updatedGroups);
}
