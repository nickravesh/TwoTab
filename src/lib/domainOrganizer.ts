// =============================================================================
// TwoTab Domain Sorter & Host Clustering Engine
// =============================================================================
// Core capabilities:
// - Multi-part TLD & public suffix recognition (e.g. .co.uk, .com.au, .github.io)
// - Library-wide host & subdomain clustering
// - Safe batch consolidation (move vs. copy) with empty group pruning
// - Auto-organize library wizard with smart thresholding (≥ N tabs)
// - Rolling backup invariant protection
// =============================================================================

import {
  type TabGroup,
  type Tab,
  type TabGroupColor,
  createRollingBackup,
  saveGroups,
} from './storage';

// =============================================================================
// 1. Multi-Part TLD Dictionary & Custom Display Names
// =============================================================================

/**
 * Common multi-part public suffixes / TLDs where the root domain consists of
 * the last 3 dot-separated parts rather than 2.
 */
export const MULTI_PART_TLDS = new Set([
  'co.uk',
  'gov.uk',
  'org.uk',
  'ac.uk',
  'me.uk',
  'net.uk',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  'co.jp',
  'ne.jp',
  'or.jp',
  'go.jp',
  'ac.jp',
  'co.nz',
  'net.nz',
  'org.nz',
  'govt.nz',
  'com.br',
  'net.br',
  'org.br',
  'co.in',
  'net.in',
  'org.in',
  'gen.in',
  'firm.in',
  'ind.in',
  'com.sg',
  'edu.sg',
  'gov.sg',
  'net.sg',
  'org.sg',
  'co.za',
  'org.za',
  'web.za',
  'com.mx',
  'org.mx',
  'edu.mx',
  'gob.mx',
  'com.tr',
  'org.tr',
  'edu.tr',
  'gov.tr',
  'com.tw',
  'org.tw',
  'edu.tw',
  'gov.tw',
]);

/**
 * Recognized prominent platforms with custom branding names and default color hues.
 */
export const BRANDED_DOMAINS: Record<string, { name: string; color: TabGroupColor }> = {
  'github.com': { name: 'GitHub', color: 'purple' },
  'gitlab.com': { name: 'GitLab', color: 'orange' },
  'youtube.com': { name: 'YouTube', color: 'red' },
  'google.com': { name: 'Google', color: 'blue' },
  'reddit.com': { name: 'Reddit', color: 'orange' },
  'stackoverflow.com': { name: 'Stack Overflow', color: 'orange' },
  'wikipedia.org': { name: 'Wikipedia', color: 'grey' },
  'amazon.com': { name: 'Amazon', color: 'yellow' },
  'twitter.com': { name: 'X / Twitter', color: 'cyan' },
  'x.com': { name: 'X / Twitter', color: 'cyan' },
  'medium.com': { name: 'Medium', color: 'green' },
  'linkedin.com': { name: 'LinkedIn', color: 'blue' },
  'notion.so': { name: 'Notion', color: 'grey' },
  'figma.com': { name: 'Figma', color: 'purple' },
  'slack.com': { name: 'Slack', color: 'purple' },
  'discord.com': { name: 'Discord', color: 'purple' },
  'nytimes.com': { name: 'The New York Times', color: 'grey' },
  'bbc.com': { name: 'BBC', color: 'red' },
  'bbc.co.uk': { name: 'BBC', color: 'red' },
  'sub.domain.example.co.uk': { name: 'Example UK', color: 'blue' },
};

// =============================================================================
// 2. Types & Interfaces
// =============================================================================

export interface DomainTabInstance {
  groupId: number;
  groupName: string;
  groupDate: string;
  groupColor?: string;
  tabIndex: number;
  title: string;
  url: string;
}

export interface SubdomainBreakdown {
  subdomain: string;
  count: number;
}

export interface DomainCluster {
  id: string; // Deterministic collision-free alphanumeric ID
  rootDomain: string; // e.g. "github.com"
  displayName: string; // e.g. "GitHub"
  faviconUrl: string;
  totalTabs: number;
  groupsCount: number;
  subdomains: SubdomainBreakdown[];
  instances: DomainTabInstance[];
  suggestedColor: TabGroupColor;
}

export interface DomainOrganizerSummary {
  totalDomains: number;
  totalTabs: number;
  scatteredDomainsCount: number; // Domains saved across ≥ 2 groups
  topDomain: { domain: string; displayName: string; count: number } | null;
}

export interface DomainClusterOptions {
  groupBySubdomain?: boolean;
  minTabsFilter?: number;
}

// =============================================================================
// 3. Fast 64-Bit Deterministic Hash (cyrb53)
// =============================================================================

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

// =============================================================================
// 4. Domain & Host Normalization Utilities
// =============================================================================

/**
 * Extracts normalized root domain, full hostname, and human-friendly display name.
 * Correctly accounts for multi-part TLDs (e.g. .co.uk, .com.au) and strips www./m.
 */
export function extractDomainInfo(url: string): {
  rootDomain: string;
  hostname: string;
  displayName: string;
  suggestedColor: TabGroupColor;
} | null {
  if (!url || typeof url !== 'string') return null;

  let raw = url.trim();
  if (!raw) return null;

  // If no scheme/protocol is present (e.g. "github.com/repo"), prepend https://
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    raw = 'https://' + raw;
  }

  try {
    const parsed = new URL(raw);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    let hostname = parsed.hostname.toLowerCase().trim();
    if (!hostname) return null;

    // Handle localhost and IP addresses
    if (
      hostname === 'localhost' ||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) ||
      hostname.includes(':')
    ) {
      return {
        rootDomain: hostname,
        hostname,
        displayName: hostname === 'localhost' ? 'Localhost' : `Network Host (${hostname})`,
        suggestedColor: 'grey',
      };
    }

    // Strip common mobile and web prefixes
    let cleanHost = hostname;
    if (cleanHost.startsWith('www.')) cleanHost = cleanHost.slice(4);
    else if (cleanHost.startsWith('m.')) cleanHost = cleanHost.slice(2);
    else if (cleanHost.startsWith('mobile.')) cleanHost = cleanHost.slice(7);

    const parts = cleanHost.split('.');
    if (parts.length <= 1) {
      return {
        rootDomain: cleanHost,
        hostname: cleanHost,
        displayName: cleanHost.charAt(0).toUpperCase() + cleanHost.slice(1),
        suggestedColor: 'blue',
      };
    }

    // Check multi-part TLDs (e.g. "example.co.uk")
    let rootDomain = cleanHost;
    if (parts.length >= 3) {
      const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
      if (MULTI_PART_TLDS.has(lastTwo)) {
        rootDomain = `${parts[parts.length - 3]}.${lastTwo}`;
      } else {
        rootDomain = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
      }
    } else {
      rootDomain = cleanHost;
    }

    // Look up branded display name
    let displayName = '';
    let suggestedColor: TabGroupColor = 'blue';

    if (BRANDED_DOMAINS[rootDomain]) {
      displayName = BRANDED_DOMAINS[rootDomain].name;
      suggestedColor = BRANDED_DOMAINS[rootDomain].color;
    } else {
      // Capitalize first part of root domain (e.g. "anthropic.com" -> "Anthropic")
      const mainName = rootDomain.split('.')[0];
      displayName = mainName.charAt(0).toUpperCase() + mainName.slice(1);
    }

    return {
      rootDomain,
      hostname: cleanHost,
      displayName,
      suggestedColor,
    };
  } catch {
    return null;
  }
}

/**
 * Returns a high-res Google S2 favicon URL for a given domain.
 */
export function getDomainFaviconUrl(domain: string, size = 32): string {
  if (
    domain.startsWith('chrome:') ||
    domain.startsWith('edge:') ||
    domain.startsWith('about:') ||
    domain === 'local-files'
  ) {
    return '';
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

// =============================================================================
// 5. Library Clustering & Aggregation
// =============================================================================

/**
 * Aggregates all tabs across groups into domain clusters.
 */
export function getLibraryDomainClusters(
  groups: TabGroup[],
  options: DomainClusterOptions = {}
): DomainCluster[] {
  if (!Array.isArray(groups) || groups.length === 0) return [];

  const { groupBySubdomain = false, minTabsFilter = 1 } = options;

  // Map of clusterKey -> cluster data
  const clusterMap = new Map<
    string,
    {
      rootDomain: string;
      displayName: string;
      suggestedColor: TabGroupColor;
      subdomainCounts: Map<string, number>;
      instances: DomainTabInstance[];
      groupIds: Set<number>;
    }
  >();

  for (const group of groups) {
    if (!group || !Array.isArray(group.tabs)) continue;

    const groupDate = group.date || new Date().toISOString();

    for (let tabIndex = 0; tabIndex < group.tabs.length; tabIndex++) {
      const tab = group.tabs[tabIndex];
      if (!tab || !tab.url) continue;

      const domainInfo = extractDomainInfo(tab.url);
      if (!domainInfo) continue;

      // Group key depends on subdomain toggle
      const clusterKey = groupBySubdomain ? domainInfo.hostname : domainInfo.rootDomain;

      let cluster = clusterMap.get(clusterKey);
      if (!cluster) {
        cluster = {
          rootDomain: domainInfo.rootDomain,
          displayName: groupBySubdomain ? domainInfo.hostname : domainInfo.displayName,
          suggestedColor: domainInfo.suggestedColor,
          subdomainCounts: new Map<string, number>(),
          instances: [],
          groupIds: new Set<number>(),
        };
        clusterMap.set(clusterKey, cluster);
      }

      cluster.instances.push({
        groupId: group.id,
        groupName: group.name || 'Untitled Collection',
        groupDate,
        groupColor: group.color,
        tabIndex,
        title: tab.title?.trim() || domainInfo.hostname,
        url: tab.url.trim(),
      });

      cluster.groupIds.add(group.id);

      // Subdomain breakdown
      const sub = domainInfo.hostname;
      cluster.subdomainCounts.set(sub, (cluster.subdomainCounts.get(sub) || 0) + 1);
    }
  }

  // Convert map to DomainCluster array
  const result: DomainCluster[] = [];

  for (const [key, cluster] of clusterMap.entries()) {
    if (cluster.instances.length < minTabsFilter) continue;

    const subdomains: SubdomainBreakdown[] = Array.from(cluster.subdomainCounts.entries())
      .map(([subdomain, count]) => ({ subdomain, count }))
      .sort((a, b) => b.count - a.count);

    result.push({
      id: `domain_${hashString(key)}`,
      rootDomain: key,
      displayName: cluster.displayName,
      faviconUrl: getDomainFaviconUrl(cluster.rootDomain),
      totalTabs: cluster.instances.length,
      groupsCount: cluster.groupIds.size,
      subdomains,
      instances: cluster.instances,
      suggestedColor: cluster.suggestedColor,
    });
  }

  // Sort by totalTabs descending by default
  return result.sort((a, b) => b.totalTabs - a.totalTabs);
}

/**
 * Computes top-level domain summary statistics.
 */
export function getDomainOrganizerSummary(
  clusters: DomainCluster[],
  totalTabsScanned: number
): DomainOrganizerSummary {
  const scatteredDomainsCount = clusters.filter((c) => c.groupsCount >= 2).length;

  const topDomain =
    clusters.length > 0
      ? {
          domain: clusters[0].rootDomain,
          displayName: clusters[0].displayName,
          count: clusters[0].totalTabs,
        }
      : null;

  return {
    totalDomains: clusters.length,
    totalTabs: totalTabsScanned,
    scatteredDomainsCount,
    topDomain,
  };
}

// =============================================================================
// 6. Safe Batch Actions with Rolling Backup Safeguards
// =============================================================================

export interface ConsolidateOptions {
  mode: 'move' | 'copy';
  targetGroupId?: number;
  targetGroupName?: string;
  targetGroupColor?: TabGroupColor;
}

/**
 * Consolidates all tabs belonging to a specific domain into a dedicated collection (new or existing).
 * - 'move': Removes tabs from original groups and prunes empty source groups.
 * - 'copy': Duplicates tabs into the new collection, leaving original groups untouched.
 * - Automatically deduplicates identical URLs within the consolidated group.
 * - Always creates a rolling backup snapshot first.
 */
export async function consolidateDomain(
  domain: string,
  instances: DomainTabInstance[],
  currentGroups: TabGroup[],
  options: ConsolidateOptions
): Promise<{
  newGroupId: number;
  affectedGroupsCount: number;
  consolidatedCount: number;
  prunedGroupsCount: number;
}> {
  if (!instances || instances.length === 0 || !currentGroups || currentGroups.length === 0) {
    return { newGroupId: 0, affectedGroupsCount: 0, consolidatedCount: 0, prunedGroupsCount: 0 };
  }

  // 1. Capture rolling backup snapshot
  await createRollingBackup(true);

  const { mode, targetGroupId, targetGroupName, targetGroupColor } = options;

  // Deduplicate tabs for the consolidated group
  const seenUrls = new Set<string>();
  const consolidatedTabs: Tab[] = [];

  for (const inst of instances) {
    if (!seenUrls.has(inst.url)) {
      seenUrls.add(inst.url);
      consolidatedTabs.push({
        title: inst.title,
        url: inst.url,
      });
    }
  }

  const domainInfo = extractDomainInfo(instances[0].url);
  const fallbackName = domainInfo?.displayName || domain;

  // Handle merging into an existing collection
  if (targetGroupId) {
    const existingTarget = currentGroups.find((g) => g.id === targetGroupId);
    if (existingTarget) {
      const existingUrls = new Set((existingTarget.tabs || []).map((t) => t.url));
      const tabsToAppend = consolidatedTabs.filter((t) => !existingUrls.has(t.url));

      let updatedGroups: TabGroup[] = [];
      let affectedGroupsCount = 0;
      let prunedGroupsCount = 0;

      if (mode === 'move') {
        const indicesByGroup = new Map<number, Set<number>>();
        for (const inst of instances) {
          if (inst.groupId === targetGroupId) continue; // Don't remove from destination
          if (!indicesByGroup.has(inst.groupId)) {
            indicesByGroup.set(inst.groupId, new Set());
          }
          indicesByGroup.get(inst.groupId)!.add(inst.tabIndex);
        }

        affectedGroupsCount = indicesByGroup.size;

        for (const group of currentGroups) {
          if (group.id === targetGroupId) {
            updatedGroups.push({
              ...group,
              tabs: [...(group.tabs || []), ...tabsToAppend],
            });
            continue;
          }

          const indicesToRemove = indicesByGroup.get(group.id);
          if (!indicesToRemove || indicesToRemove.size === 0) {
            updatedGroups.push(group);
            continue;
          }

          const remaining = (group.tabs || []).filter((_, idx) => !indicesToRemove.has(idx));
          if (remaining.length > 0) {
            updatedGroups.push({ ...group, tabs: remaining });
          } else {
            prunedGroupsCount++;
          }
        }
      } else {
        affectedGroupsCount = new Set(instances.map((i) => i.groupId)).size;
        updatedGroups = currentGroups.map((g) => {
          if (g.id === targetGroupId) {
            return {
              ...g,
              tabs: [...(g.tabs || []), ...tabsToAppend],
            };
          }
          return g;
        });
      }

      await saveGroups(updatedGroups);

      return {
        newGroupId: targetGroupId,
        affectedGroupsCount,
        consolidatedCount: tabsToAppend.length,
        prunedGroupsCount,
      };
    }
  }

  // Creating a new dedicated collection
  const newGroupName = targetGroupName?.trim() || `${fallbackName} Collection`;
  const newGroupColor: TabGroupColor = targetGroupColor || domainInfo?.suggestedColor || 'blue';

  const newGroupId = Date.now();
  const newGroup: TabGroup = {
    id: newGroupId,
    name: newGroupName,
    date: new Date().toISOString(),
    color: newGroupColor,
    tabs: consolidatedTabs,
  };

  let updatedGroups: TabGroup[] = [];
  let affectedGroupsCount = 0;
  let prunedGroupsCount = 0;

  if (mode === 'move') {
    // Map of groupId -> Set of tabIndices to remove
    const indicesByGroup = new Map<number, Set<number>>();
    for (const inst of instances) {
      if (!indicesByGroup.has(inst.groupId)) {
        indicesByGroup.set(inst.groupId, new Set());
      }
      indicesByGroup.get(inst.groupId)!.add(inst.tabIndex);
    }

    affectedGroupsCount = indicesByGroup.size;

    for (const group of currentGroups) {
      const indicesToRemove = indicesByGroup.get(group.id);
      if (!indicesToRemove || indicesToRemove.size === 0) {
        updatedGroups.push(group);
        continue;
      }

      const remainingTabs = (group.tabs || []).filter((_, idx) => !indicesToRemove.has(idx));
      if (remainingTabs.length > 0) {
        updatedGroups.push({
          ...group,
          tabs: remainingTabs,
        });
      } else {
        // Group became empty -> prune it
        prunedGroupsCount++;
      }
    }

    // Prepend the new consolidated collection
    updatedGroups = [newGroup, ...updatedGroups];
  } else {
    // Copy mode: leave existing groups intact
    affectedGroupsCount = new Set(instances.map((i) => i.groupId)).size;
    updatedGroups = [newGroup, ...currentGroups];
  }

  await saveGroups(updatedGroups);

  return {
    newGroupId,
    affectedGroupsCount,
    consolidatedCount: consolidatedTabs.length,
    prunedGroupsCount,
  };
}

/**
 * Deletes a single tab instance from its group with rolling backup protection.
 * Automatically prunes the group if it becomes empty.
 */
export async function deleteSingleTabInstance(
  groupId: number,
  tabIndex: number,
  currentGroups: TabGroup[]
): Promise<{ success: boolean; remainingTabsCount: number }> {
  if (!currentGroups || currentGroups.length === 0) {
    return { success: false, remainingTabsCount: 0 };
  }

  await createRollingBackup(true);

  const updatedGroups: TabGroup[] = [];
  let remainingTabsCount = 0;

  for (const group of currentGroups) {
    if (group.id === groupId) {
      const remaining = (group.tabs || []).filter((_, idx) => idx !== tabIndex);
      remainingTabsCount = remaining.length;
      if (remaining.length > 0) {
        updatedGroups.push({
          ...group,
          tabs: remaining,
        });
      }
    } else {
      updatedGroups.push(group);
    }
  }

  await saveGroups(updatedGroups);
  return { success: true, remainingTabsCount };
}

export interface AutoOrganizeOptions {
  minTabsThreshold?: number; // Minimum tabs to qualify for a dedicated group (default: 3)
  miscGroupName?: string;
  miscGroupColor?: TabGroupColor;
}

/**
 * Re-organizes the entire active library into domain-clustered collections:
 * - Domains with >= threshold tabs receive dedicated collections.
 * - Remaining small/single tabs are gathered into a "Miscellaneous & Single Links" collection.
 * - Automatically deduplicates identical links within each newly created collection.
 * - Always creates a rolling backup snapshot first.
 */
export async function autoOrganizeLibraryByDomain(
  currentGroups: TabGroup[],
  options: AutoOrganizeOptions = {}
): Promise<{
  createdGroupsCount: number;
  organizedTabsCount: number;
}> {
  if (!currentGroups || currentGroups.length === 0) {
    return { createdGroupsCount: 0, organizedTabsCount: 0 };
  }

  // 1. Capture rolling backup snapshot
  await createRollingBackup(true);

  const { minTabsThreshold = 3, miscGroupName = 'Miscellaneous & Single Links', miscGroupColor = 'grey' } = options;

  // Collect all tabs with their domain info
  const domainTabsMap = new Map<
    string,
    {
      rootDomain: string;
      displayName: string;
      suggestedColor: TabGroupColor;
      tabs: Tab[];
      seenUrls: Set<string>;
    }
  >();

  let totalTabsCount = 0;

  for (const group of currentGroups) {
    for (const t of group.tabs || []) {
      if (!t || !t.url) continue;

      totalTabsCount++;
      const domainInfo = extractDomainInfo(t.url);
      const rootDomain = domainInfo?.rootDomain || 'other';

      let entry = domainTabsMap.get(rootDomain);
      if (!entry) {
        entry = {
          rootDomain,
          displayName: domainInfo?.displayName || 'Web Pages',
          suggestedColor: domainInfo?.suggestedColor || 'blue',
          tabs: [],
          seenUrls: new Set<string>(),
        };
        domainTabsMap.set(rootDomain, entry);
      }

      if (!entry.seenUrls.has(t.url)) {
        entry.seenUrls.add(t.url);
        entry.tabs.push({
          title: t.title?.trim() || t.url,
          url: t.url.trim(),
        });
      }
    }
  }

  const newGroups: TabGroup[] = [];
  const miscTabs: Tab[] = [];
  const seenMiscUrls = new Set<string>();

  // Sort domains by tab count descending
  const sortedDomains = Array.from(domainTabsMap.values()).sort((a, b) => b.tabs.length - a.tabs.length);

  let timestampOffset = 0;

  for (const item of sortedDomains) {
    if (item.tabs.length >= minTabsThreshold && item.rootDomain !== 'other') {
      newGroups.push({
        id: Date.now() + timestampOffset++,
        name: `${item.displayName} (${item.rootDomain})`,
        date: new Date().toISOString(),
        color: item.suggestedColor,
        tabs: item.tabs,
      });
    } else {
      // Gather into misc
      for (const t of item.tabs) {
        if (!seenMiscUrls.has(t.url)) {
          seenMiscUrls.add(t.url);
          miscTabs.push(t);
        }
      }
    }
  }

  // Add misc group if any tabs exist
  if (miscTabs.length > 0) {
    newGroups.push({
      id: Date.now() + timestampOffset++,
      name: miscGroupName,
      date: new Date().toISOString(),
      color: miscGroupColor,
      tabs: miscTabs,
    });
  }

  await saveGroups(newGroups);

  return {
    createdGroupsCount: newGroups.length,
    organizedTabsCount: totalTabsCount,
  };
}

/**
 * Permanently deletes all tabs of a specific domain across all groups.
 * Prunes any groups that become empty.
 * Always creates a rolling backup snapshot first.
 */
export async function deleteDomainTabs(
  domain: string,
  instances: DomainTabInstance[],
  currentGroups: TabGroup[]
): Promise<{
  deletedCount: number;
  cleanedGroupsCount: number;
}> {
  if (!instances || instances.length === 0 || !currentGroups || currentGroups.length === 0) {
    return { deletedCount: 0, cleanedGroupsCount: 0 };
  }

  // 1. Capture rolling backup snapshot
  await createRollingBackup(true);

  // Map of groupId -> Set of tabIndices to delete
  const indicesByGroup = new Map<number, Set<number>>();
  for (const inst of instances) {
    if (!indicesByGroup.has(inst.groupId)) {
      indicesByGroup.set(inst.groupId, new Set());
    }
    indicesByGroup.get(inst.groupId)!.add(inst.tabIndex);
  }

  const updatedGroups: TabGroup[] = [];
  let cleanedGroupsCount = 0;

  for (const group of currentGroups) {
    const indicesToDelete = indicesByGroup.get(group.id);
    if (!indicesToDelete || indicesToDelete.size === 0) {
      updatedGroups.push(group);
      continue;
    }

    const remainingTabs = (group.tabs || []).filter((_, idx) => !indicesToDelete.has(idx));
    if (remainingTabs.length > 0) {
      updatedGroups.push({
        ...group,
        tabs: remainingTabs,
      });
    } else {
      cleanedGroupsCount++;
    }
  }

  await saveGroups(updatedGroups);

  return {
    deletedCount: instances.length,
    cleanedGroupsCount,
  };
}
