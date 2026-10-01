import { describe, it, expect, beforeEach } from 'vitest';
import { setupMockChromeStorage, MockLocalStorage } from '../../../tests/e2e/semantic/harness/mockStorage';
import {
  applyReorganization,
  rollbackReorganization,
} from './reorganizer';
import type { ReorganizationPlan } from './types';
import type { TabGroup } from '../storage';
import { getRollingBackupSnapshots } from '../storage';

describe('Storage Safety & Reorganization (reorganizer.ts)', () => {
  let mockStorage: MockLocalStorage;

  const initialGroups: TabGroup[] = [
    {
      id: 101,
      date: '2026-10-01T10:00:00Z',
      name: 'Unorganized Mess',
      color: 'blue',
      tabs: [
        { title: 'Django Auth', url: 'https://docs.djangoproject.com/auth' },
        { title: 'PostgreSQL Indexing', url: 'https://postgresql.org/index' },
      ],
    },
    {
      id: 102,
      date: '2026-10-01T11:00:00Z',
      name: 'Untouched Work',
      color: 'grey',
      tabs: [{ title: 'Work Jira', url: 'https://jira.company.com' }],
    },
  ];

  beforeEach(() => {
    mockStorage = setupMockChromeStorage({
      tabGroups: initialGroups,
      archivedGroups: [],
    });
  });

  it('creates rolling backup before applying reorganization', async () => {
    const plan: ReorganizationPlan = {
      originalGroups: [initialGroups[0]],
      proposedGroups: [
        {
          id: 201,
          date: new Date().toISOString(),
          name: 'Django Group',
          color: 'green',
          tabs: [{ title: 'Django Auth', url: 'https://docs.djangoproject.com/auth' }],
        },
      ],
      ungroupedTabs: [{ title: 'PostgreSQL Indexing', url: 'https://postgresql.org/index' }],
    };

    const res = await applyReorganization(plan);
    expect(res.success).toBe(true);
    expect(res.snapshotTimestamp).toBeGreaterThan(0);

    const snapshots = await getRollingBackupSnapshots();
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0].data.tabGroups).toHaveLength(2); // Original 2 groups preserved in snapshot
  });

  it('preserves unrelated groups and replaces targeted group with proposed groups', async () => {
    const plan: ReorganizationPlan = {
      originalGroups: [initialGroups[0]],
      proposedGroups: [
        {
          id: 301,
          date: new Date().toISOString(),
          name: 'Clean Django',
          color: 'purple',
          tabs: [{ title: 'Django Auth', url: 'https://docs.djangoproject.com/auth' }],
        },
      ],
      ungroupedTabs: [],
    };

    const res = await applyReorganization(plan);
    expect(res.success).toBe(true);

    const stored = mockStorage.getTabGroups();
    expect(stored.some((g) => g.name === 'Clean Django')).toBe(true);
    expect(stored.some((g) => g.name === 'Untouched Work')).toBe(true);
    expect(stored.some((g) => g.id === 101)).toBe(false); // Original targeted group replaced
  });

  it('strictly preserves tab URLs and titles verbatim without vector pollution', async () => {
    const plan: ReorganizationPlan = {
      originalGroups: [initialGroups[0]],
      proposedGroups: [
        {
          id: 401,
          date: new Date().toISOString(),
          name: 'Target Group',
          tabs: [
            {
              title: 'Django Auth',
              url: 'https://docs.djangoproject.com/auth',
              // @ts-expect-error test illegal property injection
              embedding: new Float32Array(384),
            },
          ],
        },
      ],
      ungroupedTabs: [],
    };

    const res = await applyReorganization(plan);
    expect(res.success).toBe(true);

    const stored = mockStorage.getTabGroups();
    for (const group of stored) {
      for (const tab of group.tabs) {
        expect(tab.title).toBeTruthy();
        expect(tab.url).toBeTruthy();
        expect(Object.keys(tab)).toEqual(['title', 'url']);
      }
    }
  });

  it('allows rolling back reorganization using snapshot timestamp', async () => {
    const plan: ReorganizationPlan = {
      originalGroups: [initialGroups[0]],
      proposedGroups: [],
      ungroupedTabs: [],
    };

    const res = await applyReorganization(plan);
    expect(res.success).toBe(true);
    expect(mockStorage.getTabGroups()).toHaveLength(1); // Only untouched group remains

    const rolledBack = await rollbackReorganization(res.snapshotTimestamp);
    expect(rolledBack).toBe(true);
    expect(mockStorage.getTabGroups()).toHaveLength(2); // Restored original 2 groups!
  });
});
