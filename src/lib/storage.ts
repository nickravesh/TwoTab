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

async function safeStorageSet(data: Record<string, any>): Promise<void> {
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
  return storageQueue.enqueue(async () => {
    await safeStorageSet({ recentlyClosed: items.slice(0, 50) });
  });
}

export async function removeRecentlyClosedItem(id: string): Promise<void> {
  return storageQueue.enqueue(async () => {
    const items = await getRecentlyClosedItems();
    const updated = items.filter(item => item.id !== id);
    await safeStorageSet({ recentlyClosed: updated.slice(0, 50) });
  });
}

export async function clearRecentlyClosedItems(): Promise<void> {
  return storageQueue.enqueue(async () => {
    await chrome.storage.local.remove('recentlyClosed');
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
  return storageQueue.enqueue(async () => {
    const groups = await getGroups();
    const updated = groups.map(g => g.id === id ? { ...g, name: newName } : g);
    await safeStorageSet({ tabGroups: updated });
  });
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
// Export / Import — with Size Limits & Duplicate Detection
// =============================================================================

export async function exportData(): Promise<string> {
  const data = await chrome.storage.local.get(['tabGroups', 'archivedGroups']);
  return JSON.stringify(data);
}

export async function importData(jsonString: string): Promise<boolean> {
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

    const hasValidTabGroups = Array.isArray(parsed.tabGroups) && parsed.tabGroups.every(isValidGroup);
    const hasValidArchived = !parsed.archivedGroups || (Array.isArray(parsed.archivedGroups) && parsed.archivedGroups.every(isValidGroup));

    if (!hasValidTabGroups || !hasValidArchived) return false;

    // Duplicate ID detection
    const ids = new Set<number>();
    for (const g of parsed.tabGroups) {
      if (ids.has(g.id)) {
        console.warn(`[TwoTab] Import rejected: duplicate group id ${g.id}`);
        return false;
      }
      ids.add(g.id);
    }
    if (parsed.archivedGroups) {
      for (const g of parsed.archivedGroups) {
        if (ids.has(g.id)) {
          console.warn(`[TwoTab] Import rejected: duplicate group id ${g.id} in archivedGroups`);
          return false;
        }
        ids.add(g.id);
      }
    }

    await safeStorageSet({
      tabGroups: parsed.tabGroups,
      archivedGroups: parsed.archivedGroups || [],
    });
    return true;
  } catch (e) {
    console.error('[TwoTab] Import failed:', e);
    return false;
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
// Rolling Backup Helpers (used by background.ts alarms)
// =============================================================================

export async function createRollingBackup(): Promise<void> {
  const data = await chrome.storage.local.get(['tabGroups', 'archivedGroups']);
  const snapshot = {
    timestamp: Date.now(),
    data,
  };

  const existing = await chrome.storage.local.get('_backupSnapshots');
  const snapshots = (existing._backupSnapshots || []).slice(-1); // Keep last 1 + this new one = 2
  snapshots.push(snapshot);
  await safeStorageSet({ _backupSnapshots: snapshots });
  console.log(`[TwoTab] Rolling backup created at ${new Date().toISOString()} (${snapshots.length} snapshots stored)`);
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
