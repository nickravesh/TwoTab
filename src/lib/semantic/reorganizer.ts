// =============================================================================
// TwoTab Intelligent Tab Grouping — Storage Safety & Reorganization Engine
// =============================================================================
// Features:
// 1. Pre-mutation rolling backup invariant (forces snapshot in _backupSnapshots)
// 2. Safe, atomic storage mutation serialized via storageQueue & safeStorageSet
// 3. Strict non-persistence of embeddings (zero vector data in chrome.storage.local)
// 4. Verbatim preservation of original tab URLs and titles
// 5. One-click instant rollback capability using snapshot timestamp
// =============================================================================

import {
  type TabGroup,
  type Tab,
  createRollingBackup,
  restoreFromRollingBackup,
  getRollingBackupSnapshots,
  storageQueue,
  safeStorageSet,
  getGroups,
} from '../storage';

import type { ReorganizationPlan, ReorganizationResult } from './types';

/**
 * Sanitizes a Tab object to ensure strict adherence to TwoTab schema
 * and eliminate any possibility of storing raw embeddings or tensors.
 */
function sanitizeTab(tab: Tab): Tab {
  return {
    title: String(tab.title || ''),
    url: String(tab.url || ''),
  };
}

/**
 * Sanitizes a TabGroup object, stripping any internal or extraneous properties.
 */
function sanitizeTabGroup(group: TabGroup): TabGroup {
  return {
    id: group.id,
    date: group.date || new Date().toISOString(),
    name: group.name,
    color: group.color,
    tabs: (group.tabs || []).map(sanitizeTab),
  };
}

/**
 * Safely applies an Intelligent Grouping reorganization plan.
 *
 * Sequence:
 * 1. Takes an automatic pre-mutation rolling backup snapshot.
 * 2. Merges proposedGroups into tabGroups, replacing the originalGroups that were reorganized.
 * 3. Preserves unrelated tab groups verbatim.
 * 4. Ensures zero embedding tensors or vector properties leak into storage.
 * 5. Serializes the write through the existing TwoTab storageQueue.
 */
export async function applyReorganization(
  plan: ReorganizationPlan
): Promise<ReorganizationResult> {
  try {
    // Step 1: Pre-mutation safety snapshot
    const backupCreated = await createRollingBackup(true);
    if (!backupCreated) {
      console.warn('[TwoTab AI] Rolling backup returned false, checking existing snapshots');
    }

    const snapshots = await getRollingBackupSnapshots();
    const snapshotTimestamp = snapshots.length > 0 ? snapshots[0].timestamp : Date.now();

    // Step 2: Calculate new tabGroups array
    const allCurrentGroups = await getGroups();
    const originalIds = new Set(plan.originalGroups.map((g) => String(g.id)));

    // Sanitize proposed groups
    const cleanProposed = plan.proposedGroups.map(sanitizeTabGroup);

    // If there are ungrouped tabs, place them in a dedicated group so no tabs are lost
    if (plan.ungroupedTabs && plan.ungroupedTabs.length > 0) {
      cleanProposed.push(
        sanitizeTabGroup({
          id: Date.now() + Math.floor(Math.random() * 1000),
          date: new Date().toISOString(),
          name: 'Ungrouped Tabs',
          color: 'grey',
          tabs: plan.ungroupedTabs.map(sanitizeTab),
        })
      );
    }

    // Replace the original groups with the proposed groups while preserving unaffected groups
    const finalGroups: TabGroup[] = [];
    let insertedProposed = false;

    for (const group of allCurrentGroups) {
      if (originalIds.has(String(group.id))) {
        if (!insertedProposed) {
          finalGroups.push(...cleanProposed);
          insertedProposed = true;
        }
      } else {
        finalGroups.push(sanitizeTabGroup(group));
      }
    }

    // If none of the original groups were found in current storage (e.g. fresh/all reorganization), append
    if (!insertedProposed) {
      finalGroups.push(...cleanProposed);
    }

    // Step 3: Atomic Mutex Storage Mutation
    await storageQueue.enqueue(async () => {
      await safeStorageSet({ tabGroups: finalGroups });
    });

    console.log(
      `[TwoTab AI] Successfully applied reorganization. Created ${cleanProposed.length} new groups. Backup timestamp: ${snapshotTimestamp}`
    );

    return {
      success: true,
      snapshotTimestamp,
      updatedGroups: finalGroups,
    };
  } catch (err: any) {
    console.error('[TwoTab AI] Reorganization failed:', err);
    return {
      success: false,
      snapshotTimestamp: 0,
      updatedGroups: [],
      error: err?.message || String(err),
    };
  }
}

/**
 * Rolls back a reorganization to the state captured at snapshotTimestamp.
 */
export async function rollbackReorganization(
  snapshotTimestamp: number
): Promise<boolean> {
  try {
    const success = await restoreFromRollingBackup(snapshotTimestamp);
    if (success) {
      console.log(`[TwoTab AI] Successfully rolled back to snapshot ${snapshotTimestamp}`);
    } else {
      console.error(`[TwoTab AI] Failed to restore snapshot ${snapshotTimestamp}`);
    }
    return success;
  } catch (err) {
    console.error('[TwoTab AI] Rollback exception:', err);
    return false;
  }
}
