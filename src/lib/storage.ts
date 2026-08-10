// Types
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

export async function exportData(): Promise<string> {
  const data = await chrome.storage.local.get(null);
  return JSON.stringify(data, null, 2);
}

export async function importData(jsonString: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed.tabGroups || parsed.archivedGroups) {
      await chrome.storage.local.set(parsed);
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

export function getRelativeTime(dateString: string): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
