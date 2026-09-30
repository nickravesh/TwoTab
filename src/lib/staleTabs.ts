// =============================================================================
// TwoTab Stale Tabs & Aging Purifier Engine
// =============================================================================
// Features:
// - Multi-tier age categorization: Fresh (<30d), Aging (30-90d), Stale (90-180d), Ancient (>180d)
// - Abandoned fragment detection (<= 3 tabs dormant for >= 90 days)
// - Non-destructive Cold Storage archiving (moves to archivedGroups with 1-click restore)
// - Fragment consolidation into unified quarterly collections
// - Pruning with rolling backup safeguards (createRollingBackup)
// - Clean Markdown export for external preservation
// =============================================================================

import {
  type TabGroup,
  type Tab,
  type TabGroupColor,
  createRollingBackup,
  getGroups,
  saveGroups,
  archiveMultipleGroups,
  deleteMultipleGroups,
  getSafeDomain,
} from './storage';

export type AgeCategory = 'fresh' | 'aging' | 'stale' | 'ancient';

export interface StaleGroupInfo {
  id: number;
  name: string;
  color: TabGroupColor;
  date: string;
  ageDays: number;
  ageLabel: string;
  category: AgeCategory;
  tabCount: number;
  tabs: Tab[];
  isFragment: boolean;
  topDomains: { domain: string; count: number }[];
}

export interface StaleLibrarySummary {
  totalGroups: number;
  totalTabs: number;
  freshGroupsCount: number;
  freshTabsCount: number;
  agingGroupsCount: number;
  agingTabsCount: number;
  staleGroupsCount: number;
  staleTabsCount: number;
  ancientGroupsCount: number;
  ancientTabsCount: number;
  fragmentsCount: number;
  fragmentTabsCount: number;
  oldestGroupDate: string | null;
  oldestGroupAgeDays: number;
}

export type InactiveTimeHorizon = 30 | 90 | 180 | 365;

export interface InactiveImpactSummary {
  totalActiveGroups: number;
  totalActiveTabs: number;
  matchingInactiveGroups: number;
  matchingInactiveTabs: number;
  remainingActiveGroups: number;
  remainingActiveTabs: number;
  cutoffDate: Date;
  cutoffFormatted: string;
  scatteredSmallGroupsCount: number;
  scatteredSmallTabsCount: number;
}

/**
 * Computes plain-English before & after impact metrics for decluttering.
 */
export function getInactiveImpactSummary(
  tabGroups: TabGroup[],
  thresholdDays: number,
  now: Date = new Date()
): InactiveImpactSummary {
  const cutoffTime = now.getTime() - thresholdDays * 24 * 3600 * 1000;
  const cutoffDate = new Date(cutoffTime);
  const cutoffFormatted = cutoffDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  let totalActiveTabs = 0;
  let matchingInactiveGroups = 0;
  let matchingInactiveTabs = 0;
  let scatteredSmallGroupsCount = 0;
  let scatteredSmallTabsCount = 0;

  for (const group of tabGroups) {
    const tabs = Array.isArray(group.tabs) ? group.tabs : [];
    const count = tabs.length;
    totalActiveTabs += count;

    const age = calculateAgeInDays(group.date, now);
    if (age >= thresholdDays) {
      matchingInactiveGroups++;
      matchingInactiveTabs += count;

      if (count <= 2) {
        scatteredSmallGroupsCount++;
        scatteredSmallTabsCount += count;
      }
    }
  }

  return {
    totalActiveGroups: tabGroups.length,
    totalActiveTabs,
    matchingInactiveGroups,
    matchingInactiveTabs,
    remainingActiveGroups: Math.max(0, tabGroups.length - matchingInactiveGroups),
    remainingActiveTabs: Math.max(0, totalActiveTabs - matchingInactiveTabs),
    cutoffDate,
    cutoffFormatted,
    scatteredSmallGroupsCount,
    scatteredSmallTabsCount,
  };
}

/**
 * Calculates the age of a group in days from its ISO date string.
 * Gracefully handles invalid, empty, or future timestamps without throwing.
 */
export function calculateAgeInDays(dateStr?: string, now?: Date): number {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === '') {
    return 0;
  }

  const parsed = new Date(dateStr).getTime();
  if (Number.isNaN(parsed)) {
    return 0;
  }

  const current = (now ? new Date(now) : new Date()).getTime();
  const delta = current - parsed;
  if (delta < 0) {
    return 0;
  }

  return Math.floor(delta / (1000 * 60 * 60 * 24));
}

/**
 * Categorizes elapsed days into 4 standard age horizons:
 * - Fresh: < 30 days
 * - Aging: 30 - 89 days
 * - Stale: 90 - 179 days
 * - Ancient: >= 180 days
 */
export function categorizeAge(ageDays: number): AgeCategory {
  if (ageDays < 30) return 'fresh';
  if (ageDays < 90) return 'aging';
  if (ageDays < 180) return 'stale';
  return 'ancient';
}

/**
 * Formats elapsed days into human-friendly relative time text.
 */
export function formatAgeLabel(ageDays: number): string {
  if (ageDays <= 0) return 'Today';
  if (ageDays === 1) return '1 day ago';
  if (ageDays < 30) return `${ageDays} days ago`;
  if (ageDays < 60) return '1 month ago';
  if (ageDays < 365) {
    const months = Math.floor(ageDays / 30);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  }
  if (ageDays < 730) return '1 year ago';
  const years = (ageDays / 365).toFixed(1).replace(/\.0$/, '');
  return `${years} years ago`;
}

/**
 * Extracts top domains for a tab group to give users instant visual context.
 */
export function extractTopDomainsFromTabs(
  tabs: Tab[],
  max: number = 3
): { domain: string; count: number }[] {
  if (!tabs || tabs.length === 0) return [];

  const counts = new Map<string, number>();

  for (const tab of tabs) {
    if (!tab || !tab.url) continue;
    const domain = getSafeDomain(tab.url);
    if (domain) {
      counts.set(domain, (counts.get(domain) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

/**
 * Analyzes the entire active library and generates comprehensive age & staleness intelligence.
 */
export function analyzeStaleLibrary(
  tabGroups: TabGroup[],
  options?: { now?: Date }
): { groups: StaleGroupInfo[]; summary: StaleLibrarySummary } {
  const groups: StaleGroupInfo[] = [];

  let totalTabs = 0;
  let freshGroupsCount = 0;
  let freshTabsCount = 0;
  let agingGroupsCount = 0;
  let agingTabsCount = 0;
  let staleGroupsCount = 0;
  let staleTabsCount = 0;
  let ancientGroupsCount = 0;
  let ancientTabsCount = 0;
  let fragmentsCount = 0;
  let fragmentTabsCount = 0;

  let oldestGroupDate: string | null = null;
  let oldestGroupAgeDays = 0;

  const now = options?.now || new Date();

  for (const group of tabGroups) {
    const tabs = Array.isArray(group.tabs) ? group.tabs : [];
    const tabCount = tabs.length;
    totalTabs += tabCount;

    const ageDays = calculateAgeInDays(group.date, now);
    const category = categorizeAge(ageDays);
    const ageLabel = formatAgeLabel(ageDays);
    const isFragment = tabCount <= 3 && ageDays >= 90;
    const topDomains = extractTopDomainsFromTabs(tabs);

    if (ageDays > oldestGroupAgeDays) {
      oldestGroupAgeDays = ageDays;
      oldestGroupDate = group.date;
    }

    switch (category) {
      case 'fresh':
        freshGroupsCount++;
        freshTabsCount += tabCount;
        break;
      case 'aging':
        agingGroupsCount++;
        agingTabsCount += tabCount;
        break;
      case 'stale':
        staleGroupsCount++;
        staleTabsCount += tabCount;
        break;
      case 'ancient':
        ancientGroupsCount++;
        ancientTabsCount += tabCount;
        break;
    }

    if (isFragment) {
      fragmentsCount++;
      fragmentTabsCount += tabCount;
    }

    groups.push({
      id: group.id,
      name: group.name || 'Saved Group',
      color: group.color || 'blue',
      date: group.date || '',
      ageDays,
      ageLabel,
      category,
      tabCount,
      tabs,
      isFragment,
      topDomains,
    });
  }

  // Sort groups: oldest first (highest ageDays) by default
  groups.sort((a, b) => b.ageDays - a.ageDays);

  const summary: StaleLibrarySummary = {
    totalGroups: tabGroups.length,
    totalTabs,
    freshGroupsCount,
    freshTabsCount,
    agingGroupsCount,
    agingTabsCount,
    staleGroupsCount,
    staleTabsCount,
    ancientGroupsCount,
    ancientTabsCount,
    fragmentsCount,
    fragmentTabsCount,
    oldestGroupDate,
    oldestGroupAgeDays,
  };

  return { groups, summary };
}

// =============================================================================
// Batch Actions & Storage Mutations
// =============================================================================

/**
 * Batch moves target groups to TwoTab's Cold Storage (archivedGroups).
 * Guaranteed atomic write protected by a rolling backup.
 */
export async function archiveStaleGroups(
  groupIds: number[]
): Promise<{ count: number; tabsArchived: number }> {
  if (!groupIds || groupIds.length === 0) {
    return { count: 0, tabsArchived: 0 };
  }

  await createRollingBackup(true);
  return archiveMultipleGroups(groupIds);
}

/**
 * Consolidates small stale fragments into a single organized archive collection.
 * Removes empty source groups and deduplicates identical URLs.
 */
export async function consolidateStaleFragments(
  groupIds: number[],
  options?: { groupName?: string; groupColor?: TabGroupColor }
): Promise<{ newGroupId: number; consolidatedTabsCount: number; prunedGroupsCount: number }> {
  if (!groupIds || groupIds.length === 0) {
    return { newGroupId: 0, consolidatedTabsCount: 0, prunedGroupsCount: 0 };
  }

  await createRollingBackup(true);

  const idSet = new Set(groupIds);
  const currentGroups = await getGroups();

  const targetGroups = currentGroups.filter((g) => idSet.has(g.id));
  if (targetGroups.length === 0) {
    return { newGroupId: 0, consolidatedTabsCount: 0, prunedGroupsCount: 0 };
  }

  // Aggregate tabs and deduplicate by URL
  const seenUrls = new Set<string>();
  const consolidatedTabs: Tab[] = [];

  for (const group of targetGroups) {
    for (const tab of group.tabs || []) {
      if (!tab || !tab.url) continue;
      const normalizedUrl = tab.url.trim().toLowerCase();
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        consolidatedTabs.push({
          title: tab.title?.trim() || tab.url,
          url: tab.url.trim(),
        });
      }
    }
  }

  const newGroupId = Date.now();
  const dateStr = new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  const newGroupName = options?.groupName?.trim() || `Cold Storage Archive (${dateStr})`;
  const newGroupColor = options?.groupColor || 'purple';

  const newGroup: TabGroup = {
    id: newGroupId,
    date: new Date().toISOString(),
    name: newGroupName,
    color: newGroupColor,
    tabs: consolidatedTabs,
  };

  // Remove source groups and prepend new consolidated group
  const remainingGroups = currentGroups.filter((g) => !idSet.has(g.id));
  await saveGroups([newGroup, ...remainingGroups]);

  return {
    newGroupId,
    consolidatedTabsCount: consolidatedTabs.length,
    prunedGroupsCount: targetGroups.length,
  };
}

/**
 * Permanently deletes specified groups with a mandatory rolling backup safeguard.
 */
export async function deleteStaleGroups(
  groupIds: number[]
): Promise<{ count: number; tabsDeleted: number }> {
  if (!groupIds || groupIds.length === 0) {
    return { count: 0, tabsDeleted: 0 };
  }

  await createRollingBackup(true);
  return deleteMultipleGroups(groupIds);
}

/**
 * Deletes a single tab from a group.
 * Automatically cleans up the parent group if it becomes empty.
 */
export async function deleteSingleStaleTab(
  groupId: number,
  tabIndex: number
): Promise<{ groupPruned: boolean; remainingTabsCount: number }> {
  await createRollingBackup(true);

  const groups = await getGroups();
  const targetGroup = groups.find((g) => g.id === groupId);
  if (!targetGroup || !targetGroup.tabs || tabIndex < 0 || tabIndex >= targetGroup.tabs.length) {
    return { groupPruned: false, remainingTabsCount: 0 };
  }

  // Remove tab
  targetGroup.tabs.splice(tabIndex, 1);

  if (targetGroup.tabs.length === 0) {
    // Prune empty group
    const remaining = groups.filter((g) => g.id !== groupId);
    await saveGroups(remaining);
    return { groupPruned: true, remainingTabsCount: 0 };
  } else {
    await saveGroups(groups);
    return { groupPruned: false, remainingTabsCount: targetGroup.tabs.length };
  }
}

/**
 * Formats a clean, high-readability Markdown document of selected stale collections.
 */
export function exportStaleTabsToMarkdown(groups: StaleGroupInfo[]): string {
  const timestamp = new Date().toLocaleString();
  const totalTabs = groups.reduce((acc, g) => acc + g.tabCount, 0);

  let md = `# TwoTab Dormant Collections Archive\n`;
  md += `*Exported on ${timestamp} — ${groups.length} groups, ${totalTabs} total tabs*\n\n`;

  for (const group of groups) {
    md += `## ${group.name} (${group.tabCount} ${group.tabCount === 1 ? 'tab' : 'tabs'})\n`;
    md += `*Saved: ${group.date ? new Date(group.date).toLocaleDateString() : 'Unknown'} (${group.ageLabel})*\n\n`;

    for (const tab of group.tabs) {
      const title = tab.title || tab.url;
      md += `- [${title.replace(/[[\]]/g, '')}](${tab.url})\n`;
    }

    md += `\n`;
  }

  return md;
}
