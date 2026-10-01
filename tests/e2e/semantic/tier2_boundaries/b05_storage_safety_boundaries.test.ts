/**
 * Tier 2 Boundary Value Analysis: Storage Safety & Rolling Backups
 *
 * Boundary Scenarios:
 * - Simulated write error during reorganization
 * - Quota exceeded error during reorganization
 * - Snapshot saturation & FIFO pruning (exceeding 5 snapshots)
 * - Empty library backup handling (force=false vs force=true)
 * - Deduplication of identical consecutive snapshots
 * - Corrupted snapshot recovery resiliency
 * - Empty proposedGroups reorganization plan
 * - High-volume library stress (50 tab groups)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setupMockChromeStorage, MockLocalStorage } from '../harness/mockStorage';
import {
  createRollingBackup,
  restoreFromRollingBackup,
  getRollingBackupSnapshots,
  safeStorageSet,
  saveGroups,
  type TabGroup,
  type BackupSnapshot,
} from '@/lib/storage';
import { createRealisticTabGroups } from '../harness/fixtures';

describe('Tier 2 Boundary: Storage Safety & Backups (B05)', () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = setupMockChromeStorage({
      tabGroups: createRealisticTabGroups(),
      archivedGroups: [],
    });
  });

  it('B5.1 write error during mutation preserves original state without partial corruption', async () => {
    const original = mockStorage.getTabGroups();
    expect(original.length).toBe(3);

    // Create safety backup
    await createRollingBackup(true);

    // Inject write failure
    mockStorage.simulateWriteError = true;

    await expect(
      safeStorageSet({
        tabGroups: [
          {
            id: 'corrupted',
            name: 'Partial',
            color: 'red',
            createdDate: Date.now(),
            tabs: [],
          },
        ],
      })
    ).rejects.toThrow();

    // Verify storage was not updated
    mockStorage.simulateWriteError = false;
    const current = mockStorage.getTabGroups();
    expect(current.length).toBe(3);
    expect(current[0].name).toBe(original[0].name);
  });

  it('B5.2 quota exceeded error during mutation preserves original state', async () => {
    mockStorage.simulateQuotaError = true;

    await expect(
      safeStorageSet({
        tabGroups: [{ id: 'huge', name: 'Huge', color: 'blue', createdDate: 1, tabs: [] }],
      })
    ).rejects.toThrow(/quota exceeded/i);

    mockStorage.simulateQuotaError = false;
    expect(mockStorage.getTabGroups().length).toBe(3);
  });

  it('B5.3 snapshot saturation: enforces FIFO retention limit of 5 snapshots across 10 creations', async () => {
    for (let i = 0; i < 10; i++) {
      // Mutate slightly to bypass duplicate detection
      await chrome.storage.local.set({
        tabGroups: [
          {
            id: `g-${i}`,
            name: `Group ${i}`,
            color: 'blue',
            createdDate: Date.now() + i,
            tabs: [],
          },
        ],
      });
      await createRollingBackup(false);
    }

    const snapshots = await getRollingBackupSnapshots();
    expect(snapshots.length).toBe(5);
  });

  it('B5.4 skips snapshot creation when library is empty and force = false', async () => {
    await chrome.storage.local.set({ tabGroups: [], archivedGroups: [] });

    const created = await createRollingBackup(false);
    expect(created).toBe(false);

    const snapshots = await getRollingBackupSnapshots();
    expect(snapshots.length).toBe(0);
  });

  it('B5.5 forces snapshot creation when force = true even if library is empty', async () => {
    await chrome.storage.local.set({ tabGroups: [], archivedGroups: [] });

    const created = await createRollingBackup(true);
    expect(created).toBe(true);

    const snapshots = await getRollingBackupSnapshots();
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].data.tabGroups).toEqual([]);
  });

  it('B5.6 deduplicates identical snapshots: skips creation when state is unchanged and force = false', async () => {
    const firstCreated = await createRollingBackup(false);
    expect(firstCreated).toBe(true);

    const secondCreated = await createRollingBackup(false);
    expect(secondCreated).toBe(false);

    const snapshots = await getRollingBackupSnapshots();
    expect(snapshots.length).toBe(1);
  });

  it('B5.7 handles corrupted or malformed snapshot objects gracefully without throwing', async () => {
    const corruptedSnapshot = {
      timestamp: Date.now(),
      data: null as any,
    };
    await chrome.storage.local.set({ _backupSnapshots: [corruptedSnapshot] });

    // Restore should return false without crashing
    const restored = await restoreFromRollingBackup(corruptedSnapshot.timestamp);
    expect(restored).toBe(false);
  });

  it('B5.8 restores accurately when multiple snapshots exist by selecting the target timestamp', async () => {
    // Snapshot 1
    await chrome.storage.local.set({
      tabGroups: [{ id: 'v1', name: 'Version 1', color: 'blue', createdDate: 1, tabs: [] }],
    });
    await createRollingBackup(true);
    const snaps1 = await getRollingBackupSnapshots();
    const ts1 = snaps1[snaps1.length - 1].timestamp;

    // Snapshot 2
    await chrome.storage.local.set({
      tabGroups: [{ id: 'v2', name: 'Version 2', color: 'red', createdDate: 2, tabs: [] }],
    });
    await createRollingBackup(true);

    // Restore specifically to Snapshot 1
    const restored = await restoreFromRollingBackup(ts1);
    expect(restored).toBe(true);

    const current = mockStorage.getTabGroups();
    expect(current[0].name).toBe('Version 1');
  });

  it('B5.9 handles massive library stress (50 tab groups, 500 tabs) without serialization breakdown', async () => {
    const largeGroups: TabGroup[] = Array.from({ length: 50 }, (_, gIdx) => ({
      id: `group-stress-${gIdx}`,
      name: `Stress Test Group ${gIdx}`,
      color: 'blue' as const,
      createdDate: Date.now() - gIdx * 1000,
      tabs: Array.from({ length: 10 }, (_, tIdx) => ({
        title: `Tab ${gIdx}-${tIdx} on Large Scale System`,
        url: `https://stress-test.org/group/${gIdx}/tab/${tIdx}`,
      })),
    }));

    await saveGroups(largeGroups);
    expect(mockStorage.getTabGroups().length).toBe(50);

    const backupCreated = await createRollingBackup(true);
    expect(backupCreated).toBe(true);
  });

  it('B5.10 reorganization plan with 0 proposed groups clears tabGroups safely after backup', async () => {
    await createRollingBackup(true);
    await saveGroups([]);

    expect(mockStorage.getTabGroups().length).toBe(0);

    // Verify recovery is possible
    const snaps = await getRollingBackupSnapshots();
    const restored = await restoreFromRollingBackup(snaps[0].timestamp);
    expect(restored).toBe(true);
    expect(mockStorage.getTabGroups().length).toBe(3);
  });

  it('B5.11 preserves archivedGroups intact during active tabGroups reorganization', async () => {
    const archived: TabGroup[] = [
      { id: 'arch-pinned', name: 'Pinned Archive', color: 'purple', createdDate: 999, tabs: [] },
    ];
    await chrome.storage.local.set({ archivedGroups: archived });

    await saveGroups([
      { id: 'reorg-1', name: 'New Reorg', color: 'cyan', createdDate: 1, tabs: [] },
    ]);

    const data = await chrome.storage.local.get(['tabGroups', 'archivedGroups']);
    expect(data.tabGroups.length).toBe(1);
    expect(data.archivedGroups.length).toBe(1);
    expect(data.archivedGroups[0].name).toBe('Pinned Archive');
  });

  it('B5.12 verifies assertNoRawEmbeddings passes on large clean datasets', () => {
    expect(() => mockStorage.assertNoRawEmbeddings()).not.toThrow();
  });

  it('B5.13 handles undefined or missing timestamp restore request returning false', async () => {
    const restored = await restoreFromRollingBackup(9999999999999);
    expect(restored).toBe(false);
  });

  it('B5.14 clear() wipes storage cleanly and getRollingBackupSnapshots returns empty array', async () => {
    await chrome.storage.local.clear();
    const snapshots = await getRollingBackupSnapshots();
    expect(snapshots).toEqual([]);
    expect(mockStorage.getTabGroups()).toEqual([]);
  });

  it('B5.15 deep clone in mockStorage prevents mutation of internal store by external references', async () => {
    const groups = mockStorage.getTabGroups();
    groups[0].name = 'External Mutation Attempt';

    const freshlyRead = mockStorage.getTabGroups();
    expect(freshlyRead[0].name).not.toBe('External Mutation Attempt');
  });
});
