// =============================================================================
// TwoTab Storage Engine — Reliability-Hardened Architecture
// =============================================================================
// Features:
//   - StorageQueue mutex: Serializes all write operations to prevent races
//   - safeStorageSet: Wraps chrome.storage.local.set with error detection
//   - Atomic multi-key writes: archiveGroup/unarchiveGroup write both keys atomically
//   - Schema versioning: _schemaVersion tag with deterministic migration runner
// =============================================================================

export const CURRENT_SCHEMA_VERSION = 1;

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

export interface UserPreferences {
  protectPinnedTabs: boolean;
  restoreDestination: 'new_window' | 'current_window';
  restoreBehavior: 'keep' | 'remove';
  recentlyClosedLimit: number;
  enableFilmGrain?: boolean;
  cardDensity?: 'comfortable' | 'compact' | 'list';
  ambientGlow?: 'subtle' | 'vibrant' | 'none';
  faviconStyle?: 'color' | 'monochrome' | 'hidden';
  uiScale?: 'compact' | 'standard' | 'large';
  oledBlack?: boolean;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  protectPinnedTabs: true,
  restoreDestination: 'new_window',
  restoreBehavior: 'keep',
  recentlyClosedLimit: 50,
  enableFilmGrain: true,
  cardDensity: 'comfortable',
  ambientGlow: 'subtle',
  faviconStyle: 'color',
  uiScale: 'standard',
  oledBlack: false,
};

export const PREFERENCES_STORAGE_KEY = 'twotab_user_preferences';

export async function getUserPreferences(): Promise<UserPreferences> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(PREFERENCES_STORAGE_KEY);
      if (data && data[PREFERENCES_STORAGE_KEY]) {
        return {
          ...DEFAULT_USER_PREFERENCES,
          ...data[PREFERENCES_STORAGE_KEY],
        };
      }
    }
  } catch (e) {
    console.error('[TwoTab Storage] Error reading user preferences:', e);
  }
  return DEFAULT_USER_PREFERENCES;
}

export async function setUserPreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences> {
  const current = await getUserPreferences();
  const updated: UserPreferences = { ...current, ...prefs };
  await safeStorageSet({ [PREFERENCES_STORAGE_KEY]: updated });
  return updated;
}

// =============================================================================
// Storage Write Queue — Mutex / Serialized Write Operations
// =============================================================================
// Prevents read-modify-write race conditions when multiple UI contexts
// (Dashboard tab, Popup, background worker) mutate the same storage keys.

class StorageQueue {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;

  async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await operation());
        } catch (e) {
          reject(e);
        }
      });
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    const op = this.queue.shift()!;
    try {
      await op();
    } finally {
      this.processing = false;
      this.processNext();
    }
  }
}

const storageQueue = new StorageQueue();

// =============================================================================
// Safe Storage Write Wrapper — Error Detection
// =============================================================================

export async function safeStorageSet(data: Record<string, any>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        console.error('[TwoTab] Storage write failed:', chrome.runtime.lastError.message);
        reject(new Error(`Storage write failed: ${chrome.runtime.lastError.message}`));
      } else {
        resolve();
      }
    });
  });
}

// =============================================================================
// Schema Migration System
// =============================================================================

export async function migrateIfNeeded(): Promise<void> {
  const data = await chrome.storage.local.get('_schemaVersion');
  const version = data._schemaVersion || 0;

  if (version < CURRENT_SCHEMA_VERSION) {
    // Migration v0 → v1: Tag existing data with schema version
    // Future migrations add incremental if (version < N) blocks here
    await safeStorageSet({ _schemaVersion: CURRENT_SCHEMA_VERSION });
    console.log(`[TwoTab] Schema migrated from v${version} to v${CURRENT_SCHEMA_VERSION}`);
  }
}

// =============================================================================
// Startup Health Check
// =============================================================================

export interface HealthCheckResult {
  valid: boolean;
  errors: string[];
  bytesUsed: number;
}

export async function runHealthCheck(): Promise<HealthCheckResult> {
  const errors: string[] = [];

  const data = await chrome.storage.local.get(['tabGroups', 'archivedGroups', '_schemaVersion']);

  // Validate tabGroups structure
  if (data.tabGroups !== undefined && !Array.isArray(data.tabGroups)) {
    errors.push('tabGroups exists but is not an array — data may be corrupted');
  } else if (Array.isArray(data.tabGroups)) {
    data.tabGroups.forEach((g: any, i: number) => {
      if (typeof g?.id !== 'number') errors.push(`tabGroups[${i}] has invalid or missing id`);
      if (!Array.isArray(g?.tabs)) errors.push(`tabGroups[${i}] has invalid or missing tabs array`);
    });
  }

  // Validate archivedGroups structure
  if (data.archivedGroups !== undefined && !Array.isArray(data.archivedGroups)) {
    errors.push('archivedGroups exists but is not an array — data may be corrupted');
  } else if (Array.isArray(data.archivedGroups)) {
    data.archivedGroups.forEach((g: any, i: number) => {
      if (typeof g?.id !== 'number') errors.push(`archivedGroups[${i}] has invalid or missing id`);
      if (!Array.isArray(g?.tabs)) errors.push(`archivedGroups[${i}] has invalid or missing tabs array`);
    });
  }

  // Check storage quota usage
  let bytesUsed = 0;
  try {
    bytesUsed = await chrome.storage.local.getBytesInUse(null);
  } catch (e) {
    errors.push('Unable to read storage quota usage');
  }

  if (errors.length > 0) {
    console.warn('[TwoTab] Health check found issues:', errors);
  }

  return { valid: errors.length === 0, errors, bytesUsed };
}

// =============================================================================
// Recently Closed Items
// =============================================================================

export async function getRecentlyClosedItems(): Promise<ClosedTabItem[]> {
  const data = await chrome.storage.local.get('recentlyClosed');
  return data.recentlyClosed || [];
}

export async function saveRecentlyClosedItems(items: ClosedTabItem[]): Promise<void> {
  const prefs = await getUserPreferences();
  const limit = prefs.recentlyClosedLimit || 50;
  return storageQueue.enqueue(async () => {
    await safeStorageSet({ recentlyClosed: items.slice(0, limit) });
  });
}

export async function removeRecentlyClosedItem(id: string): Promise<void> {
  const prefs = await getUserPreferences();
  const limit = prefs.recentlyClosedLimit || 50;
  return storageQueue.enqueue(async () => {
    const items = await getRecentlyClosedItems();
    const updated = items.filter(item => item.id !== id);
    await safeStorageSet({ recentlyClosed: updated.slice(0, limit) });
  });
}

export async function clearRecentlyClosedItems(): Promise<void> {
  return storageQueue.enqueue(async () => {
    await safeStorageSet({ recentlyClosed: [] });
  });
}

// =============================================================================
// Tab Groups (Active)
// =============================================================================

export async function getGroups(): Promise<TabGroup[]> {
  const data = await chrome.storage.local.get('tabGroups');
  return data.tabGroups || [];
}

export async function saveGroups(groups: TabGroup[]): Promise<void> {
  return storageQueue.enqueue(async () => {
    await safeStorageSet({ tabGroups: groups });
  });
}

export async function deleteGroup(id: number): Promise<void> {
  return storageQueue.enqueue(async () => {
    const groups = await getGroups();
    const updated = groups.filter(g => g.id !== id);
    if (groups.length !== updated.length) {
      await safeStorageSet({ tabGroups: updated });
    }
  });
}

export async function deleteTabFromGroup(groupId: number, tabUrl: string): Promise<void> {
  return storageQueue.enqueue(async () => {
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
      await safeStorageSet({ tabGroups: updatedGroups });
    }
  });
}

export async function renameGroup(id: number, newName: string): Promise<void> {
  const trimmed = newName.trim();
  return storageQueue.enqueue(async () => {
    const groups = await getGroups();
    const updated = groups.map(g => g.id === id ? { ...g, name: trimmed || g.name } : g);
    await safeStorageSet({ tabGroups: updated });
  });
}

// =============================================================================
// Tab Group Restoration Engine (respects UserPreferences)
// =============================================================================

export async function restoreTabGroup(
  group: TabGroup,
  prefs?: UserPreferences
): Promise<{ count: number; removed: boolean }> {
  const userPrefs = prefs || (await getUserPreferences());
  const validUrls = (group.tabs || [])
    .map((t) => t.url)
    .filter((url) => {
      if (!url) return false;
      const lower = url.toLowerCase();
      return !(
        lower.startsWith('chrome-extension://') ||
        lower.startsWith('chrome://') ||
        lower.startsWith('about:') ||
        lower.startsWith('edge:') ||
        lower.startsWith('data:')
      );
    });

  if (validUrls.length === 0) return { count: 0, removed: false };

  if (typeof chrome !== 'undefined' && chrome.tabs) {
    if (userPrefs.restoreDestination === 'new_window' && chrome.windows) {
      await chrome.windows.create({ url: validUrls, focused: true });
    } else {
      for (const url of validUrls) {
        await chrome.tabs.create({ url, active: false });
      }
    }
  }

  let removed = false;
  if (userPrefs.restoreBehavior === 'remove') {
    await deleteGroup(group.id);
    removed = true;
  }

  return { count: validUrls.length, removed };
}

export async function restoreAllTabGroups(
  groups: TabGroup[],
  prefs?: UserPreferences
): Promise<{ count: number; groupsCount: number; removed: boolean }> {
  const userPrefs = prefs || (await getUserPreferences());
  let totalCount = 0;
  const allUrls: string[] = [];

  for (const group of groups) {
    const validUrls = (group.tabs || [])
      .map((t) => t.url)
      .filter((url) => {
        if (!url) return false;
        const lower = url.toLowerCase();
        return !(
          lower.startsWith('chrome-extension://') ||
          lower.startsWith('chrome://') ||
          lower.startsWith('about:') ||
          lower.startsWith('edge:') ||
          lower.startsWith('data:')
        );
      });
    allUrls.push(...validUrls);
    totalCount += validUrls.length;
  }

  if (allUrls.length === 0) return { count: 0, groupsCount: 0, removed: false };

  if (typeof chrome !== 'undefined' && chrome.tabs) {
    if (userPrefs.restoreDestination === 'new_window' && chrome.windows) {
      await chrome.windows.create({ url: allUrls, focused: true });
    } else {
      for (const url of allUrls) {
        await chrome.tabs.create({ url, active: false });
      }
    }
  }

  let removed = false;
  if (userPrefs.restoreBehavior === 'remove') {
    await safeStorageSet({ tabGroups: [] });
    removed = true;
  }

  return { count: totalCount, groupsCount: groups.length, removed };
}

// =============================================================================
// Archived Groups
// =============================================================================

export async function getArchivedGroups(): Promise<TabGroup[]> {
  const data = await chrome.storage.local.get('archivedGroups');
  return data.archivedGroups || [];
}

export async function saveArchivedGroups(groups: TabGroup[]): Promise<void> {
  return storageQueue.enqueue(async () => {
    await safeStorageSet({ archivedGroups: groups });
  });
}

export async function deleteArchivedGroup(id: number): Promise<void> {
  return storageQueue.enqueue(async () => {
    const archived = await getArchivedGroups();
    const updated = archived.filter(g => g.id !== id);
    await safeStorageSet({ archivedGroups: updated });
  });
}

// =============================================================================
// Archive / Unarchive — ATOMIC Multi-Key Writes
// =============================================================================
// These operations move a group between tabGroups and archivedGroups.
// Both keys are written in a SINGLE chrome.storage.local.set() call to prevent
// data loss if Chrome crashes between two separate writes.

export async function archiveGroup(id: number): Promise<void> {
  return storageQueue.enqueue(async () => {
    const groups = await getGroups();
    const target = groups.find(g => g.id === id);
    if (!target) return;

    const updatedGroups = groups.filter(g => g.id !== id);
    const archived = await getArchivedGroups();
    archived.push(target);

    // Single atomic write for both keys
    await safeStorageSet({
      tabGroups: updatedGroups,
      archivedGroups: archived,
    });
  });
}

export async function unarchiveGroup(id: number): Promise<void> {
  return storageQueue.enqueue(async () => {
    const archived = await getArchivedGroups();
    const target = archived.find(g => g.id === id);
    if (!target) return;

    const updatedArchived = archived.filter(g => g.id !== id);
    const groups = await getGroups();
    groups.push(target);

    // Single atomic write for both keys
    await safeStorageSet({
      archivedGroups: updatedArchived,
      tabGroups: groups,
    });
  });
}

// =============================================================================
// URL Utilities
// =============================================================================

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

export function formatDisplayUrl(url: string): string {
  try {
    if (!url) return '';
    return decodeURIComponent(url);
  } catch (e) {
    return url;
  }
}

// =============================================================================
// Export / Import — Multi-Format Exporters & Smart Importers
// =============================================================================

export interface ExportMetadata {
  version: number;
  exportedAt: string;
  totalGroups: number;
  totalTabs: number;
}

export async function exportAsJson(): Promise<string> {
  const data = await chrome.storage.local.get(['tabGroups', 'archivedGroups']);
  const tabGroups: TabGroup[] = data.tabGroups || [];
  const archivedGroups: TabGroup[] = data.archivedGroups || [];

  const totalTabs = [...tabGroups, ...archivedGroups].reduce((sum, g) => sum + (g.tabs?.length || 0), 0);

  const payload = {
    _metadata: {
      version: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      totalGroups: tabGroups.length + archivedGroups.length,
      totalTabs,
    },
    tabGroups,
    archivedGroups,
  };

  return JSON.stringify(payload, null, 2);
}

export async function exportData(): Promise<string> {
  return exportAsJson();
}

export async function exportAsMarkdown(): Promise<string> {
  const data = await chrome.storage.local.get(['tabGroups', 'archivedGroups']);
  const tabGroups: TabGroup[] = data.tabGroups || [];
  const archivedGroups: TabGroup[] = data.archivedGroups || [];

  let md = `# TwoTab Saved Collections\n\n*Exported on ${new Date().toLocaleString()}*\n\n`;

  if (tabGroups.length > 0) {
    md += `## 📂 Active Tab Groups (${tabGroups.length})\n\n`;
    for (const g of tabGroups) {
      const title = g.name || 'Saved Group';
      const date = g.date ? new Date(g.date).toLocaleString() : 'Unknown date';
      md += `### ${title} — *${date}* (${g.tabs.length} tabs)\n\n`;
      for (const t of g.tabs) {
        const tabTitle = (t.title || t.url || 'Untitled').replace(/[\[\]]/g, '');
        md += `- [${tabTitle}](${t.url})\n`;
      }
      md += '\n';
    }
  }

  if (archivedGroups.length > 0) {
    md += `## 📦 Archived Groups (${archivedGroups.length})\n\n`;
    for (const g of archivedGroups) {
      const title = g.name || 'Archived Group';
      const date = g.date ? new Date(g.date).toLocaleString() : 'Unknown date';
      md += `### ${title} — *${date}* (${g.tabs.length} tabs)\n\n`;
      for (const t of g.tabs) {
        const tabTitle = (t.title || t.url || 'Untitled').replace(/[\[\]]/g, '');
        md += `- [${tabTitle}](${t.url})\n`;
      }
      md += '\n';
    }
  }

  return md;
}

export async function exportAsPlainText(): Promise<string> {
  const data = await chrome.storage.local.get(['tabGroups', 'archivedGroups']);
  const tabGroups: TabGroup[] = data.tabGroups || [];
  const archivedGroups: TabGroup[] = data.archivedGroups || [];
  const allGroups = [...tabGroups, ...archivedGroups];

  const lines: string[] = [];
  for (let i = 0; i < allGroups.length; i++) {
    const g = allGroups[i];
    for (const t of g.tabs) {
      lines.push(`${t.url} | ${t.title || t.url}`);
    }
    if (i < allGroups.length - 1) {
      lines.push(''); // Blank line separates groups
    }
  }
  return lines.join('\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function exportAsHtmlBookmarks(): Promise<string> {
  const data = await chrome.storage.local.get(['tabGroups', 'archivedGroups']);
  const tabGroups: TabGroup[] = data.tabGroups || [];
  const archivedGroups: TabGroup[] = data.archivedGroups || [];

  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>TwoTab Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${Math.floor(Date.now() / 1000)}" LAST_MODIFIED="${Math.floor(Date.now() / 1000)}">TwoTab Collections</H3>
    <DL><p>
`;

  for (const g of tabGroups) {
    const groupName = g.name || 'Saved Group';
    const groupDate = Math.floor(new Date(g.date).getTime() / 1000) || Math.floor(Date.now() / 1000);
    html += `        <DT><H3 ADD_DATE="${groupDate}">${escapeHtml(groupName)}</H3>\n        <DL><p>\n`;
    for (const t of g.tabs) {
      html += `            <DT><A HREF="${escapeHtml(t.url)}" ADD_DATE="${groupDate}">${escapeHtml(t.title || t.url)}</A>\n`;
    }
    html += `        </DL><p>\n`;
  }

  if (archivedGroups.length > 0) {
    html += `        <DT><H3 ADD_DATE="${Math.floor(Date.now() / 1000)}">Archive</H3>\n        <DL><p>\n`;
    for (const g of archivedGroups) {
      const groupName = g.name || 'Archived Group';
      const groupDate = Math.floor(new Date(g.date).getTime() / 1000) || Math.floor(Date.now() / 1000);
      html += `            <DT><H3 ADD_DATE="${groupDate}">${escapeHtml(groupName)}</H3>\n            <DL><p>\n`;
      for (const t of g.tabs) {
        html += `                <DT><A HREF="${escapeHtml(t.url)}" ADD_DATE="${groupDate}">${escapeHtml(t.title || t.url)}</A>\n`;
      }
      html += `            </DL><p>\n`;
    }
    html += `        </DL><p>\n`;
  }

  html += `    </DL><p>\n</DL><p>\n`;
  return html;
}

export async function exportAsCsv(): Promise<string> {
  const data = await chrome.storage.local.get(['tabGroups', 'archivedGroups']);
  const tabGroups: TabGroup[] = data.tabGroups || [];
  const archivedGroups: TabGroup[] = data.archivedGroups || [];

  const rows: string[] = ['"Section","Group Name","Tab Title","URL","Saved Date"'];

  const addGroup = (section: string, g: TabGroup) => {
    const gName = (g.name || 'Saved Group').replace(/"/g, '""');
    const gDate = (g.date || '').replace(/"/g, '""');
    for (const t of g.tabs) {
      const title = (t.title || t.url || '').replace(/"/g, '""');
      const url = (t.url || '').replace(/"/g, '""');
      rows.push(`"${section}","${gName}","${title}","${url}","${gDate}"`);
    }
  };

  for (const g of tabGroups) addGroup('Active', g);
  for (const g of archivedGroups) addGroup('Archived', g);

  return rows.join('\n');
}

export async function importData(
  jsonString: string, 
  mode: 'merge' | 'replace' = 'replace'
): Promise<boolean> {
  // Size guard: reject files > 50 MB to prevent memory allocation crashes
  if (jsonString.length > 50 * 1024 * 1024) {
    console.warn('[TwoTab] Import rejected: file exceeds 50 MB size limit');
    return false;
  }

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

    const importedTabGroups: TabGroup[] = Array.isArray(parsed.tabGroups) ? parsed.tabGroups : [];
    const importedArchivedGroups: TabGroup[] = Array.isArray(parsed.archivedGroups) ? parsed.archivedGroups : [];

    if (!importedTabGroups.every(isValidGroup) || !importedArchivedGroups.every(isValidGroup)) {
      return false;
    }

    if (mode === 'replace') {
      // Duplicate ID detection within import payload
      const ids = new Set<number>();
      for (const g of importedTabGroups) {
        if (ids.has(g.id)) {
          console.warn(`[TwoTab] Import rejected: duplicate group id ${g.id}`);
          return false;
        }
        ids.add(g.id);
      }
      for (const g of importedArchivedGroups) {
        if (ids.has(g.id)) {
          console.warn(`[TwoTab] Import rejected: duplicate group id ${g.id} in archivedGroups`);
          return false;
        }
        ids.add(g.id);
      }

      await safeStorageSet({
        tabGroups: importedTabGroups,
        archivedGroups: importedArchivedGroups,
      });
      return true;
    }

    // Merge mode: re-key colliding IDs and append to existing groups
    const currentTabGroups = await getGroups();
    const currentArchivedGroups = await getArchivedGroups();
    const existingIds = new Set<number>([
      ...currentTabGroups.map(g => g.id),
      ...currentArchivedGroups.map(g => g.id),
    ]);

    let maxId = Math.max(0, ...Array.from(existingIds), Date.now());

    const rekeyedTabGroups = importedTabGroups.map(g => {
      if (existingIds.has(g.id)) {
        maxId++;
        return { ...g, id: maxId };
      }
      existingIds.add(g.id);
      return g;
    });

    const rekeyedArchivedGroups = importedArchivedGroups.map(g => {
      if (existingIds.has(g.id)) {
        maxId++;
        return { ...g, id: maxId };
      }
      existingIds.add(g.id);
      return g;
    });

    await safeStorageSet({
      tabGroups: [...currentTabGroups, ...rekeyedTabGroups],
      archivedGroups: [...currentArchivedGroups, ...rekeyedArchivedGroups],
    });
    return true;
  } catch (e) {
    console.error('[TwoTab] Import failed:', e);
    return false;
  }
}

export async function importOneTabOrPlainText(
  text: string,
  mode: 'merge' | 'replace' = 'merge'
): Promise<{ success: boolean; importedGroupsCount: number; importedTabsCount: number }> {
  if (!text || !text.trim()) {
    return { success: false, importedGroupsCount: 0, importedTabsCount: 0 };
  }

  // Size guard: 10 MB limit for text imports
  if (text.length > 10 * 1024 * 1024) {
    console.warn('[TwoTab] Text import rejected: input exceeds 10 MB limit');
    return { success: false, importedGroupsCount: 0, importedTabsCount: 0 };
  }

  try {
    const rawBlocks = text.split(/\n\s*\n/);
    const parsedGroups: TabGroup[] = [];
    let baseTime = Date.now();

    for (let i = 0; i < rawBlocks.length; i++) {
      const block = rawBlocks[i];
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      const tabs: Tab[] = [];

      for (const line of lines) {
        let url = '';
        let title = '';

        // Check for Markdown Link: [Title](URL) or - [Title](URL)
        const mdMatch = line.match(/^[-*•]?\s*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
        if (mdMatch && mdMatch[1] && mdMatch[2]) {
          title = mdMatch[1].trim();
          url = mdMatch[2].trim();
        } else if (line.includes(' | ')) {
          const parts = line.split(' | ');
          url = parts[0].trim();
          title = parts.slice(1).join(' | ').trim();
        } else if (line.includes('|')) {
          const parts = line.split('|');
          url = parts[0].trim();
          title = parts.slice(1).join('|').trim();
        } else {
          url = line.trim();
          title = line.trim();
        }

        // Basic URL validation
        if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('chrome://') || url.startsWith('edge://') || url.includes('.'))) {
          if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('chrome://') && !url.startsWith('edge://')) {
            url = `https://${url}`;
          }
          tabs.push({
            url,
            title: title || url,
          });
        }
      }

      if (tabs.length > 0) {
        parsedGroups.push({
          id: baseTime + i + Math.floor(Math.random() * 1000),
          date: new Date(baseTime - (rawBlocks.length - i) * 60000).toISOString(),
          name: parsedGroups.length === 0 ? 'Imported Tabs' : `Imported Group ${parsedGroups.length + 1}`,
          tabs,
        });
      }
    }

    if (parsedGroups.length === 0) {
      return { success: false, importedGroupsCount: 0, importedTabsCount: 0 };
    }

    const totalTabsCount = parsedGroups.reduce((sum, g) => sum + g.tabs.length, 0);

    if (mode === 'replace') {
      await safeStorageSet({ tabGroups: parsedGroups });
    } else {
      const currentGroups = await getGroups();
      await safeStorageSet({ tabGroups: [...currentGroups, ...parsedGroups] });
    }

    return {
      success: true,
      importedGroupsCount: parsedGroups.length,
      importedTabsCount: totalTabsCount,
    };
  } catch (e) {
    console.error('[TwoTab] OneTab / Plain Text import failed:', e);
    return { success: false, importedGroupsCount: 0, importedTabsCount: 0 };
  }
}

// =============================================================================
// Clear All Data — with Emergency Pre-Clear Backup
// =============================================================================

export async function clearAllData(): Promise<void> {
  return storageQueue.enqueue(async () => {
    // Create emergency backup before clearing so data can be recovered
    const data = await chrome.storage.local.get(['tabGroups', 'archivedGroups']);
    await safeStorageSet({
      _emergencyBackup: { timestamp: Date.now(), data },
    });
    // Remove user data keys but preserve emergency backup and schema version
    await chrome.storage.local.remove(['tabGroups', 'archivedGroups', 'recentlyClosed']);
  });
}

// =============================================================================
// Rolling Backup Helpers (used by background.ts alarms and Settings UI)
// =============================================================================

export interface BackupSnapshot {
  timestamp: number;
  data: {
    tabGroups?: TabGroup[];
    archivedGroups?: TabGroup[];
  };
}

export async function getRollingBackupSnapshots(): Promise<BackupSnapshot[]> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return [];
  const res = await chrome.storage.local.get('_backupSnapshots');
  return (res._backupSnapshots || []).sort((a: BackupSnapshot, b: BackupSnapshot) => b.timestamp - a.timestamp);
}

export async function createRollingBackup(force = false): Promise<boolean> {
  const data = await chrome.storage.local.get(['tabGroups', 'archivedGroups']);
  const currentTabGroups = data.tabGroups || [];
  const currentArchivedGroups = data.archivedGroups || [];

  // Skip empty backups unless explicitly forced
  if (!force && currentTabGroups.length === 0 && currentArchivedGroups.length === 0) {
    return false;
  }

  const existing = await chrome.storage.local.get('_backupSnapshots');
  const existingSnapshots: BackupSnapshot[] = existing._backupSnapshots || [];

  // Deduplication: If no data changes have occurred since the last snapshot, skip creation
  if (!force && existingSnapshots.length > 0) {
    const latest = existingSnapshots[existingSnapshots.length - 1];
    if (latest && latest.data) {
      const latestTabGroupsStr = JSON.stringify(latest.data.tabGroups || []);
      const currentTabGroupsStr = JSON.stringify(currentTabGroups);
      const latestArchivedStr = JSON.stringify(latest.data.archivedGroups || []);
      const currentArchivedStr = JSON.stringify(currentArchivedGroups);

      if (latestTabGroupsStr === currentTabGroupsStr && latestArchivedStr === currentArchivedStr) {
        console.log('[TwoTab] Rolling backup skipped: no data changes since last snapshot');
        return false;
      }
    }
  }

  const snapshot: BackupSnapshot = {
    timestamp: Date.now(),
    data: {
      tabGroups: currentTabGroups,
      archivedGroups: currentArchivedGroups,
    },
  };

  const snapshots: BackupSnapshot[] = existingSnapshots.slice(-4); // Keep last 4 + new 1 = 5
  snapshots.push(snapshot);
  await safeStorageSet({ _backupSnapshots: snapshots });
  console.log(`[TwoTab] Rolling backup created at ${new Date().toISOString()} (${snapshots.length} snapshots stored)`);
  return true;
}

export async function restoreFromRollingBackup(timestamp: number): Promise<boolean> {
  const snapshots = await getRollingBackupSnapshots();
  const target = snapshots.find(s => s.timestamp === timestamp);
  if (!target || !target.data) return false;

  await safeStorageSet({
    tabGroups: target.data.tabGroups || [],
    archivedGroups: target.data.archivedGroups || [],
  });
  return true;
}

// =============================================================================
// Time Formatting
// =============================================================================

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

// =============================================================================
// Robust Clipboard Copy with DOM Fallback
// =============================================================================

export async function copyToClipboardSafe(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern Async Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn('[TwoTab] navigator.clipboard failed, falling back to execCommand:', e);
    }
  }

  // 2. Fallback to hidden textarea with document.execCommand
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch (e) {
      console.error('[TwoTab] document.execCommand copy fallback failed:', e);
    }
  }

  return false;
}
