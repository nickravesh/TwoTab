import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import PopupApp from '../popup/App';
import { ToolsView } from '@/components/tools/ToolsView';
import { LinkHealthTool } from '@/components/tools/LinkHealthTool';
import { DuplicateCleanerTool } from '@/components/tools/DuplicateCleanerTool';
import { DomainOrganizerTool } from '@/components/tools/DomainOrganizerTool';
import { DEFAULT_USER_PREFERENCES } from '@/lib/storage';

// =============================================================================
// Chrome API In-Memory Mocks for React Component Tests
// =============================================================================

const mockStorageStore: Record<string, any> = {};

const mockChrome = {
  storage: {
    local: {
      get: vi.fn((keys: any) => {
        if (!keys) return Promise.resolve({ ...mockStorageStore });
        if (typeof keys === 'string') return Promise.resolve({ [keys]: mockStorageStore[keys] });
        if (Array.isArray(keys)) {
          const res: Record<string, any> = {};
          for (const k of keys) res[k] = mockStorageStore[k];
          return Promise.resolve(res);
        }
        if (typeof keys === 'object' && keys !== null) {
          const res: Record<string, any> = { ...keys };
          for (const k in keys) {
            if (mockStorageStore[k] !== undefined) {
              res[k] = mockStorageStore[k];
            }
          }
          return Promise.resolve(res);
        }
        return Promise.resolve({ ...mockStorageStore });
      }),
      set: vi.fn((items: Record<string, any>) => {
        Object.assign(mockStorageStore, items);
        return Promise.resolve();
      }),
      remove: vi.fn((keys: any) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockStorageStore[k];
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        for (const k in mockStorageStore) delete mockStorageStore[k];
        return Promise.resolve();
      }),
      getBytesInUse: vi.fn(() => Promise.resolve(1024)),
    },
    session: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => Promise.resolve()),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(() => Promise.resolve([])),
    create: vi.fn(() => Promise.resolve({ id: 1 })),
    remove: vi.fn(() => Promise.resolve()),
    group: vi.fn(() => Promise.resolve(100)),
  },
  windows: {
    create: vi.fn(() => Promise.resolve({ id: 1, tabs: [{ id: 1 }] })),
  },
  tabGroups: {
    update: vi.fn(() => Promise.resolve()),
  },
  runtime: {
    lastError: null,
    sendMessage: vi.fn((_msg, cb) => {
      if (cb) cb({ status: 'success', count: 1 });
      return Promise.resolve({ status: 'success' });
    }),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
};

(globalThis as any).chrome = mockChrome;

describe('React Component Rendering & Regression Smoke Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k in mockStorageStore) delete mockStorageStore[k];

    mockStorageStore.userPreferences = { ...DEFAULT_USER_PREFERENCES };
    mockStorageStore._backupSnapshots = [];
    mockStorageStore._schemaVersion = 1;

    mockStorageStore.tabGroups = [
      {
        id: 1,
        date: new Date().toISOString(),
        name: 'Alpha Research Group',
        color: 'blue',
        tabs: [
          { title: 'Google Search', url: 'https://www.google.com' },
          { title: 'GitHub Repository', url: 'https://github.com/nickravesh/TwoTab' },
        ],
      },
      {
        id: 2,
        date: new Date().toISOString(),
        name: 'Beta Secondary Group',
        color: 'purple',
        tabs: [
          { title: 'GitHub Repository Copy', url: 'https://github.com/nickravesh/TwoTab?utm_source=twitter' },
        ],
      },
    ];

    mockStorageStore.archivedGroups = [
      {
        id: 3,
        date: new Date().toISOString(),
        name: 'Old Archived Project',
        color: 'grey',
        tabs: [{ title: 'Archive Reference', url: 'https://archive.org' }],
      },
    ];

    mockStorageStore.recentlyClosed = [
      {
        id: 'closed_1',
        title: 'Recently Closed Page',
        url: 'https://news.ycombinator.com',
        timestamp: new Date().toISOString(),
      },
    ];
  });

  it('mounts <App /> successfully without throwing errors on Dashboard and renders navigation', () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
    expect(screen.getAllByText(/TwoTab/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Recently Closed/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tools/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Settings/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Help/i).length).toBeGreaterThan(0);
  });

  it('mounts <ToolsView /> sub-tool switcher and renders LinkHealthTool and switches to Duplicates', () => {
    const { container } = render(<ToolsView tabGroups={mockStorageStore.tabGroups} />);
    expect(container).toBeTruthy();
    expect(screen.getAllByText(/Link Health/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Duplicates')).toBeDefined();

    // Switch to Duplicates sub-tool
    const dupBtn = screen.getByText('Duplicates').closest('button');
    expect(dupBtn).toBeTruthy();
    if (dupBtn) fireEvent.click(dupBtn);

    expect(screen.getByText('Smart Duplicate & Mirror Cleaner')).toBeDefined();
    expect(screen.getByText(/4-tier URL normalizer/i)).toBeDefined();
  });

  it('mounts <DuplicateCleanerTool /> full-canvas engine, handles cluster collapse/expand, and bulk toggle', () => {
    const { container } = render(<DuplicateCleanerTool tabGroups={mockStorageStore.tabGroups} />);
    expect(container).toBeTruthy();
    expect(screen.getByText('Smart Duplicate & Mirror Cleaner')).toBeDefined();
    expect(screen.getByText(/Clean All 1 Duplicate/i)).toBeDefined();

    // Verify instances initially expanded
    expect(screen.getAllByText(/Alpha Research Group/i).length).toBeGreaterThan(0);

    // Find collapse button and click it to collapse cluster
    const collapseBtn = screen.getByTitle('Collapse instances');
    expect(collapseBtn).toBeDefined();
    fireEvent.click(collapseBtn);

    // Instances should now be hidden (collapsed)
    expect(screen.queryByText(/Alpha Research Group/i)).toBeNull();

    // Find expand button and click it to expand cluster again
    const expandBtn = screen.getByTitle('Expand instances');
    expect(expandBtn).toBeDefined();
    fireEvent.click(expandBtn);

    // Instances should now be visible again
    expect(screen.getAllByText(/Alpha Research Group/i).length).toBeGreaterThan(0);

    // Test bulk Collapse All button
    const bulkCollapseBtn = screen.getByTitle('Collapse all clusters');
    expect(bulkCollapseBtn).toBeDefined();
    fireEvent.click(bulkCollapseBtn);

    expect(screen.queryByText(/Alpha Research Group/i)).toBeNull();
  });

  it('handles search filtering, empty states, and filter reset in <DuplicateCleanerTool />', () => {
    render(<DuplicateCleanerTool tabGroups={mockStorageStore.tabGroups} />);

    // Initial state: cluster title is visible
    expect(screen.getByText(/GitHub Repository/i)).toBeDefined();

    // Type query matching nothing
    const searchInput = screen.getByPlaceholderText(/Filter duplicates/i);
    fireEvent.change(searchInput, { target: { value: 'nonexistent_query_xyz' } });

    // Empty state should be visible
    expect(screen.getByText('No matching duplicate tabs found')).toBeDefined();
    const resetBtn = screen.getByText('Reset Filters');
    expect(resetBtn).toBeDefined();

    // Click Reset Filters
    fireEvent.click(resetBtn);
    expect(screen.getByText(/GitHub Repository/i)).toBeDefined();
  });

  it('renders KEEP and WILL REMOVE badges and handles Clean All confirmation modal', () => {
    render(<DuplicateCleanerTool tabGroups={mockStorageStore.tabGroups} />);

    // Verify KEEP and WILL REMOVE badges
    expect(screen.getByText('KEEP')).toBeDefined();
    expect(screen.getByText('WILL REMOVE')).toBeDefined();
    expect(screen.getByText('Keep this instead')).toBeDefined();

    // Open Clean All Duplicates modal
    const cleanAllBtn = screen.getByText(/Clean All 1 Duplicate/i);
    fireEvent.click(cleanAllBtn);

    // Modal should be visible
    expect(screen.getAllByText('Clean All Duplicates').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Automatic Rolling Backup/i).length).toBeGreaterThan(0);

    // Cancel modal
    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
  });

  it('switches to Similar Groups mode, displays high overlap pairs, and opens merge modal', () => {
    const overlappingGroups = [
      {
        id: 10,
        name: 'Design Ideas A',
        date: '2026-01-01',
        tabs: [
          { title: 'Dribbble', url: 'https://dribbble.com' },
          { title: 'Behance', url: 'https://behance.net' },
        ],
      },
      {
        id: 11,
        name: 'Design Ideas B',
        date: '2026-02-01',
        tabs: [
          { title: 'Dribbble', url: 'https://dribbble.com?utm_source=pin' },
          { title: 'Behance', url: 'https://behance.net' },
        ],
      },
    ];

    render(<DuplicateCleanerTool tabGroups={overlappingGroups} />);

    // Switch to Similar Groups using the mode tab button
    const modeButtons = screen.getAllByText('Similar Groups');
    const tabButton = modeButtons.find((el) => el.closest('button'))?.closest('button');
    expect(tabButton).toBeDefined();
    if (tabButton) fireEvent.click(tabButton);

    // Verify group pair rendered
    expect(screen.getByText(/100%/i)).toBeDefined();
    expect(screen.getAllByText(/Design Ideas A/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Design Ideas B/i).length).toBeGreaterThan(0);

    // Open merge confirmation modal
    const mergeBtn = screen.getByText('Merge Groups');
    fireEvent.click(mergeBtn);

    expect(screen.getByText('Merge Overlapping Tab Groups')).toBeDefined();
    expect(screen.getByText(/Confirm & Merge/i)).toBeDefined();
  });

  it('mounts <LinkHealthTool /> full-canvas engine and controls without throwing errors', () => {
    const { container } = render(<LinkHealthTool tabGroups={mockStorageStore.tabGroups} />);
    expect(container).toBeTruthy();
    expect(screen.getByText('Link Health & Dead Link Inspector')).toBeDefined();
    expect(screen.getByText(/Scan Library/i)).toBeDefined();
    expect(screen.getByText(/Re-scan All/i)).toBeDefined();
  });

  it('mounts <ToolsView /> sub-tool switcher and switches to Domain Sorter', () => {
    const { container } = render(<ToolsView tabGroups={mockStorageStore.tabGroups} />);
    expect(container).toBeTruthy();
    expect(screen.getByText('Domain Sorter')).toBeDefined();

    // Switch to Domain Sorter sub-tool
    const domainBtn = screen.getByText('Domain Sorter').closest('button');
    expect(domainBtn).toBeTruthy();
    if (domainBtn) fireEvent.click(domainBtn);

    expect(screen.getByText('Domain Sorter & Organizer')).toBeDefined();
    expect(screen.getByText(/Cluster, analyze, and consolidate/i)).toBeDefined();
    expect(screen.getByText('github.com')).toBeDefined();
    expect(screen.getByText('google.com')).toBeDefined();
  });

  it('mounts <DomainOrganizerTool /> and tests search, filter chips, subdomain toggle, and collapse/expand', () => {
    const { container } = render(<DomainOrganizerTool tabGroups={mockStorageStore.tabGroups} />);
    expect(container).toBeTruthy();
    expect(screen.getByText('Domain Sorter & Organizer')).toBeDefined();
    expect(screen.getByText('Unique Domains')).toBeDefined();

    // Search query filtering
    const searchInput = screen.getByPlaceholderText(/Search domains or URLs/i);
    fireEvent.change(searchInput, { target: { value: 'github' } });
    expect(screen.getByText('github.com')).toBeDefined();
    expect(screen.queryByText('google.com')).toBeNull();

    // Reset search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('google.com')).toBeDefined();

    // Test quick filter: Scattered Across Groups
    const scatteredBtn = screen.getByRole('button', { name: /Scattered Across Groups/i });
    fireEvent.click(scatteredBtn);
    expect(screen.getByText('github.com')).toBeDefined();
    expect(screen.queryByText('google.com')).toBeNull(); // google.com is in 1 group only

    // Reset to All Domains
    const allBtn = screen.getByRole('button', { name: /All Domains/i });
    fireEvent.click(allBtn);
    expect(screen.getByText('google.com')).toBeDefined();

    // Toggle Subdomains view mode
    const subdomainToggleBtn = screen.getByTitle('Toggle between grouping by root domain vs separate subdomains');
    fireEvent.click(subdomainToggleBtn);
    expect(screen.getByText('Subdomains')).toBeDefined();

    // Toggle back to Root Domains
    fireEvent.click(subdomainToggleBtn);
    expect(screen.getByText('Root Domains')).toBeDefined();

    // Test cluster collapse and expand
    const githubHeader = screen.getByText('github.com').closest('[role="button"]');
    expect(githubHeader).toBeTruthy();
    if (githubHeader) {
      // It is initially expanded; clicking collapses it
      fireEvent.click(githubHeader);
      expect(githubHeader.getAttribute('aria-expanded')).toBe('false');

      // Clicking again expands it
      fireEvent.click(githubHeader);
      expect(githubHeader.getAttribute('aria-expanded')).toBe('true');
    }

    // Test bulk Collapse All button
    const collapseAllBtn = screen.getByTitle('Collapse all domains');
    fireEvent.click(collapseAllBtn);
    const updatedGithubHeader = screen.getByText('github.com').closest('[role="button"]');
    expect(updatedGithubHeader?.getAttribute('aria-expanded')).toBe('false');

    // Test bulk Expand All button
    const expandAllBtn = screen.getByTitle('Expand all domains');
    fireEvent.click(expandAllBtn);
    expect(screen.getByText('github.com').closest('[role="button"]')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens and verifies Consolidate Domain modal in <DomainOrganizerTool />', () => {
    render(<DomainOrganizerTool tabGroups={mockStorageStore.tabGroups} />);

    const consolidateBtn = screen.getAllByTitle('Gather all tabs of this domain into a single dedicated group')[0];
    fireEvent.click(consolidateBtn);
    expect(screen.getByText('Consolidate Domain Tabs')).toBeDefined();
    expect(screen.getByText(/Move tabs to new group/i)).toBeDefined();
    expect(screen.getByText(/Copy tabs to new group/i)).toBeDefined();

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
  });

  it('opens and verifies Auto-Organize Library modal in <DomainOrganizerTool />', () => {
    render(<DomainOrganizerTool tabGroups={mockStorageStore.tabGroups} />);

    const autoOrganizeBtn = screen.getByRole('button', { name: /Auto-Organize Library/i });
    fireEvent.click(autoOrganizeBtn);

    expect(screen.getByText('Auto-Organize Entire Library by Domain')).toBeDefined();
    expect(screen.getByText(/Grouping Threshold/i)).toBeDefined();
    expect(screen.getByText('Proceed & Organize')).toBeDefined();

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
  });

  it('opens and verifies Delete Domain modal in <DomainOrganizerTool />', () => {
    render(<DomainOrganizerTool tabGroups={mockStorageStore.tabGroups} />);

    const deleteBtn = screen.getAllByTitle('Delete all tabs of this domain across the library')[0];
    fireEvent.click(deleteBtn);

    expect(screen.getByText(/Delete All GitHub Tabs/i)).toBeDefined();
    expect(screen.getByText('Permanently Delete')).toBeDefined();

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
  });

  it('mounts <PopupApp /> extension popup cleanly', () => {
    const { container } = render(<PopupApp />);
    expect(container).toBeTruthy();
    expect(screen.getByText(/Save Window/i)).toBeDefined();
  });
});
