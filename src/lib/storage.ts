export interface Tab {
  title: string;
  url: string;
}

export interface TabGroup {
  id: number;
  date: string;
  name?: string;
  tabs: Tab[];
}

export interface ClosedTabItem {
  id: string;
  title: string;
  url: string;
  timestamp: string;
}

export async function getRecentlyClosedItems(): Promise<ClosedTabItem[]> {
  const data = await chrome.storage.local.get('recentlyClosed');
  return data.recentlyClosed || [];
}

export async function saveRecentlyClosedItems(items: ClosedTabItem[]): Promise<void> {
  await chrome.storage.local.set({ recentlyClosed: items.slice(0, 50) });
}

export async function removeRecentlyClosedItem(id: string): Promise<void> {
  const items = await getRecentlyClosedItems();
  const updated = items.filter(item => item.id !== id);
  await saveRecentlyClosedItems(updated);
}

export async function clearRecentlyClosedItems(): Promise<void> {
  await chrome.storage.local.remove('recentlyClosed');
}

export async function getGroups(): Promise<TabGroup[]> {
  const data = await chrome.storage.local.get('tabGroups');
  return data.tabGroups || [];
}

export async function saveGroups(groups: TabGroup[]): Promise<void> {
  await chrome.storage.local.set({ tabGroups: groups });
}

export async function getArchivedGroups(): Promise<TabGroup[]> {
  const data = await chrome.storage.local.get('archivedGroups');
  return data.archivedGroups || [];
}

export async function saveArchivedGroups(groups: TabGroup[]): Promise<void> {
  await chrome.storage.local.set({ archivedGroups: groups });
}

export async function deleteGroup(id: number): Promise<void> {
  const groups = await getGroups();
  const updated = groups.filter(g => g.id !== id);
  if (groups.length !== updated.length) {
    await saveGroups(updated);
  }
}

export async function deleteTabFromGroup(groupId: number, tabUrl: string): Promise<void> {
  const groups = await getGroups();
  let found = false;
  const updatedGroups = groups.map(g => {
    if (g.id === groupId) {
      g.tabs = g.tabs.filter(t => t.url !== tabUrl);
      found = true;
    }
    return g;
  }).filter(g => g.tabs.length > 0);
  
  if (found) {
    await saveGroups(updatedGroups);
  }
}

export async function archiveGroup(id: number): Promise<void> {
  const groups = await getGroups();
  const target = groups.find(g => g.id === id);
  if (!target) return;
  
  const updatedGroups = groups.filter(g => g.id !== id);
  const archived = await getArchivedGroups();
  archived.push(target);
  
  await saveGroups(updatedGroups);
  await saveArchivedGroups(archived);
}

export async function unarchiveGroup(id: number): Promise<void> {
  const archived = await getArchivedGroups();
  const target = archived.find(g => g.id === id);
  if (!target) return;
  
  const updatedArchived = archived.filter(g => g.id !== id);
  const groups = await getGroups();
  groups.push(target);
  
  await saveArchivedGroups(updatedArchived);
  await saveGroups(groups);
}

export async function deleteArchivedGroup(id: number): Promise<void> {
  const archived = await getArchivedGroups();
  const updated = archived.filter(g => g.id !== id);
  await saveArchivedGroups(updated);
}

export async function renameGroup(id: number, newName: string): Promise<void> {
  const groups = await getGroups();
  const updated = groups.map(g => g.id === id ? { ...g, name: newName } : g);
  await saveGroups(updated);
}

export function getSafeDomain(url: string): string | null {
  try {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (
      lower.startsWith('chrome://') ||
      lower.startsWith('chrome-extension://') ||
      lower.startsWith('about:') ||
      lower.startsWith('data:') ||
      lower.startsWith('edge://')
    ) {
      return null;
    }
    const parsed = new URL(url);
    return parsed.hostname || null;
  } catch (e) {
    return null;
  }
}

export async function exportData(): Promise<string> {
  const data = await chrome.storage.local.get(null);
  return JSON.stringify(data, null, 2);
}

export async function importData(jsonString: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') return false;

    const isValidGroup = (g: any) => (
      typeof g === 'object' &&
      g !== null &&
      typeof g.id === 'number' &&
      Array.isArray(g.tabs) &&
      g.tabs.every((t: any) => typeof t === 'object' && t !== null && typeof t.url === 'string')
    );

    const hasValidTabGroups = Array.isArray(parsed.tabGroups) && parsed.tabGroups.every(isValidGroup);
    const hasValidArchived = !parsed.archivedGroups || (Array.isArray(parsed.archivedGroups) && parsed.archivedGroups.every(isValidGroup));

    if (hasValidTabGroups && hasValidArchived) {
      await chrome.storage.local.set({
        tabGroups: parsed.tabGroups,
        archivedGroups: parsed.archivedGroups || [],
      });
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

export async function clearAllData(): Promise<void> {
  await chrome.storage.local.clear();
}

export function formatDisplayUrl(url: string): string {
  try {
    if (!url) return '';
    return decodeURIComponent(url);
  } catch (e) {
    return url;
  }
}

export function getRelativeTime(input: string | number): string {
  if (!input) return 'N/A';
  let date: Date;
  if (typeof input === 'number') {
    date = new Date(input < 1e11 ? input * 1000 : input);
  } else {
    const num = Number(input);
    if (!isNaN(num) && input.trim() !== '') {
      date = new Date(num < 1e11 ? num * 1000 : num);
    } else {
      date = new Date(input);
    }
  }
  
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (isNaN(diffSec) || diffSec < 0 || diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
