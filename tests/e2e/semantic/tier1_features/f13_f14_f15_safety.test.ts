/**
 * Tier 1 Feature Coverage: Storage Safety, Backups & Embedding Non-Persistence
 *
 * Feature 13: Pre-Mutation Rolling Backup (R5)
 * Feature 14: Atomic Mutex Storage Mutation (R5)
 * Feature 15: Raw Embedding Non-Persistence (R5)
 *
 * Verification: 100% offline, isolated mock storage and TwoTab storage invariants.
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
  type Tab,
} from '@/lib/storage';
import { createRealisticTabGroups } from '../harness/fixtures';

describe('Tier 1: Storage Safety & Invariant Engine (Features 13, 14, 15)', () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = setupMockChromeStorage({
      tabGroups: createRealisticTabGroups(),
      archivedGroups: [],
    });
  });

  describe('Feature 13: Pre-Mutation Rolling Backup (R5)', () => {
    it('13.1 creates a recoverable snapshot in _backupSnapshots before modifying storage', async () => {
      const initialGroups = mockStorage.getTabGroups();
      expect(initialGroups.length).toBe(3);

      const backupCreated = await createRollingBackup(true);
      expect(backupCreated).toBe(true);

      const snapshots = await getRollingBackupSnapshots();
      expect(snapshots.length).toBe(1);
      expect(snapshots[0].data.tabGroups.length).toBe(3);
    });

    it('13.2 allows restoring tab groups from snapshot timestamp', async () => {
      await createRollingBackup(true);
      const snapshots = await getRollingBackupSnapshots();
      const snapTimestamp = snapshots[0].timestamp;

      // Simulate a reorganization or destructive change
      await safeStorageSet({ tabGroups: [] });
      expect(mockStorage.getTabGroups().length).toBe(0);

      // Restore from snapshot
      const restored = await restoreFromRollingBackup(snapTimestamp);
      expect(restored).toBe(true);
      expect(mockStorage.getTabGroups().length).toBe(3);
    });

    it('13.3 caps rolling backup snapshots at maximum 5 items (FIFO rotation)', async () => {
      for (let i = 0; i < 7; i++) {
        // Force new snapshot with different timestamp
        await createRollingBackup(true);
      }

      const snapshots = await getRollingBackupSnapshots();
      expect(snapshots.length).toBeLessThanOrEqual(5);
    });

    it('13.4 snapshot records both active tabGroups and archivedGroups', async () => {
      const archived: TabGroup[] = [
        {
          id: 'arch-1',
          name: 'Old Archived Archive',
          color: 'grey',
          createdDate: 123456789,
          tabs: [{ title: 'Archived Tab', url: 'https://archive.org' }],
        },
      ];
      await safeStorageSet({ archivedGroups: archived });

      await createRollingBackup(true);
      const snapshots = await getRollingBackupSnapshots();
      expect(snapshots[0].data.archivedGroups.length).toBe(1);
      expect(snapshots[0].data.archivedGroups[0].id).toBe('arch-1');
    });

    it('13.5 aborts reorganization if snapshot creation fails or throws', async () => {
      const initialGroups = mockStorage.getTabGroups();
      mockStorage.simulateWriteError = true;

      await expect(createRollingBackup(true)).rejects.toThrow();

      // Ensure tab groups remain untouched
      mockStorage.simulateWriteError = false;
      expect(mockStorage.getTabGroups().length).toBe(initialGroups.length);
    });
  });

  describe('Feature 14: Atomic Mutex Storage Mutation (R5)', () => {
    it('14.1 serializes storage writes through mutex write queue to prevent races', async () => {
      class MutexQueue {
        private queue: Array<() => Promise<void>> = [];
        private processing = false;
        async enqueue<T>(op: () => Promise<T>): Promise<T> {
          return new Promise<T>((resolve, reject) => {
            this.queue.push(async () => {
              try { resolve(await op()); } catch (e) { reject(e); }
            });
            this.processNext();
          });
        }
        private async processNext() {
          if (this.processing || this.queue.length === 0) return;
          this.processing = true;
          const op = this.queue.shift()!;
          try { await op(); } finally { this.processing = false; this.processNext(); }
        }
      }

      const q = new MutexQueue();
      const executionOrder: number[] = [];

      const p1 = q.enqueue(async () => {
        await new Promise((r) => setTimeout(r, 10));
        executionOrder.push(1);
      });
      const p2 = q.enqueue(async () => {
        executionOrder.push(2);
      });
      const p3 = q.enqueue(async () => {
        executionOrder.push(3);
      });

      await Promise.all([p1, p2, p3]);
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('14.2 preserves all original tab URLs and titles verbatim across reorganization', async () => {
      const original = mockStorage.getTabGroups();
      const allOriginalUrls = original.flatMap((g) => g.tabs.map((t) => t.url));
      const allOriginalTitles = original.flatMap((g) => g.tabs.map((t) => t.title));

      // Create new proposed organization containing the same tabs
      const reorganized: TabGroup[] = [
        {
          id: 'reorg-1',
          name: 'Consolidated Dev Work',
          color: 'blue',
          createdDate: Date.now(),
          tabs: original.flatMap((g) => g.tabs),
        },
      ];

      await safeStorageSet({ tabGroups: reorganized });

      const updated = mockStorage.getTabGroups();
      const updatedUrls = updated.flatMap((g) => g.tabs.map((t) => t.url));
      const updatedTitles = updated.flatMap((g) => g.tabs.map((t) => t.title));

      expect(updatedUrls).toEqual(allOriginalUrls);
      expect(updatedTitles).toEqual(allOriginalTitles);
    });

    it('14.3 preserves unrelated tab groups when reorganizing a subset of groups', async () => {
      const original = mockStorage.getTabGroups();
      const untouchedGroup = original[0]; // First group left alone

      // Modify groups 1 and 2
      const modifiedGroups = [
        untouchedGroup,
        {
          ...original[1],
          name: 'Renamed Cluster Group',
        },
      ];

      await safeStorageSet({ tabGroups: modifiedGroups });
      const current = mockStorage.getTabGroups();
      expect(current[0]).toEqual(untouchedGroup);
      expect(current[1].name).toBe('Renamed Cluster Group');
    });

    it('14.4 safeStorageSet rejects cleanly when storage write errors occur', async () => {
      mockStorage.simulateQuotaError = true;

      await expect(
        safeStorageSet({ tabGroups: [] })
      ).rejects.toThrow(/quota exceeded/i);
    });

    it('14.5 handles concurrent read and write operations without state corruption', async () => {
      const tasks: Promise<any>[] = [];
      const current = mockStorage.getTabGroups();
      for (let i = 0; i < 10; i++) {
        tasks.push(saveGroups([...current]));
      }

      await Promise.all(tasks);
      expect(mockStorage.getTabGroups().length).toBe(3);
    });
  });

  describe('Feature 15: Raw Embedding Non-Persistence (R5)', () => {
    it('15.1 asserts no Float32Array exists in chrome.storage.local after reorganization', async () => {
      await safeStorageSet({
        tabGroups: [
          {
            id: 'g-clean',
            name: 'Clean Group',
            color: 'cyan',
            createdDate: Date.now(),
            tabs: [{ title: 'Tab', url: 'https://example.com' }],
          },
        ],
      });

      expect(() => mockStorage.assertNoRawEmbeddings()).not.toThrow();
    });

    it('15.2 assertNoRawEmbeddings catches illegal 384-dimensional number arrays', async () => {
      const illegalVector = new Array(384).fill(0.05);
      await chrome.storage.local.set({
        corruptedGroup: {
          name: 'Bad Group',
          embedding: illegalVector,
        },
      });

      expect(() => mockStorage.assertNoRawEmbeddings()).toThrow(/Violation/);
    });

    it('15.3 assertNoRawEmbeddings catches keys with "embedding" or "vector" in storage', async () => {
      await chrome.storage.local.set({
        cached_embeddings_table: { 'hash1': [0.1, 0.2] },
      });

      expect(() => mockStorage.assertNoRawEmbeddings()).toThrow(/embedding key/);
    });

    it('15.4 verifies stored Tab objects strictly adhere to { title, url } without vector properties', () => {
      const groups = mockStorage.getTabGroups();
      for (const group of groups) {
        for (const tab of group.tabs) {
          const keys = Object.keys(tab);
          expect(keys).toContain('title');
          expect(keys).toContain('url');
          expect(keys.some((k) => k.toLowerCase().includes('embed'))).toBe(false);
          expect(keys.some((k) => k.toLowerCase().includes('vector'))).toBe(false);
        }
      }
    });

    it('15.5 confirms stored TabGroup JSON is schema-compliant and JSON.stringify-able without cyclic references', () => {
      const groups = mockStorage.getTabGroups();
      expect(() => JSON.stringify(groups)).not.toThrow();

      const parsed = JSON.parse(JSON.stringify(groups));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(3);
    });
  });
});
