import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from './App';
import PopupApp from '../popup/App';
import { ToolsView } from '@/components/tools/ToolsView';
import { LinkHealthTool } from '@/components/tools/LinkHealthTool';
import { DuplicateCleanerTool } from '@/components/tools/DuplicateCleanerTool';
import { DomainOrganizerTool } from '@/components/tools/DomainOrganizerTool';
import { StaleTabsTool } from '@/components/tools/StaleTabsTool';
import { DEFAULT_USER_PREFERENCES, PREFERENCES_STORAGE_KEY, type TabGroup } from '@/lib/storage';

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
      set: vi.fn((items: Record<string, any>, cb?: () => void) => {
        Object.assign(mockStorageStore, items);
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      }),
      remove: vi.fn((keys: any, cb?: () => void) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockStorageStore[k];
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      }),
      clear: vi.fn((cb?: () => void) => {
        for (const k in mockStorageStore) delete mockStorageStore[k];
        if (typeof cb === 'function') cb();
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
    getManifest: vi.fn(() => ({ version: '1.15.0' })),
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
    localStorage.clear();
    for (const k in mockStorageStore) delete mockStorageStore[k];

    mockStorageStore[PREFERENCES_STORAGE_KEY] = { ...DEFAULT_USER_PREFERENCES };
    mockStorageStore.userPreferences = { ...DEFAULT_USER_PREFERENCES };
    mockStorageStore._backupSnapshots = [];
    mockStorageStore._schemaVersion = 1;

    const now = Date.now();
    mockStorageStore.tabGroups = [
      {
        id: 1,
        date: new Date(now - 1000).toISOString(),
        name: 'Alpha Research Group',
        color: 'blue',
        tabs: [
          { title: 'Google Search', url: 'https://www.google.com' },
          { title: 'GitHub Repository', url: 'https://github.com/nickravesh/TwoTab' },
        ],
      },
      {
        id: 2,
        date: new Date(now - 2000).toISOString(),
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
        date: new Date(now - 3000).toISOString(),
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

  it('mounts <ToolsView /> and switches to Stale Tabs sub-tool', () => {
    render(<ToolsView tabGroups={mockStorageStore.tabGroups} />);
    expect(screen.getByText('Stale Tabs')).toBeDefined();

    const staleBtn = screen.getByText('Stale Tabs').closest('button');
    expect(staleBtn).toBeTruthy();
    if (staleBtn) fireEvent.click(staleBtn);

    expect(screen.getByText('Inactive Collections Review')).toBeDefined();
    expect(screen.getByText(/100% Reversible • Safe/i)).toBeDefined();
  });

  it('mounts <StaleTabsTool /> and verifies metrics, filtering, and accordion expand/collapse', () => {
    // Provide a test group with older date
    const olderGroups: TabGroup[] = [
      ...mockStorageStore.tabGroups,
      {
        id: 99,
        date: new Date(Date.now() - 150 * 24 * 3600 * 1000).toISOString(), // 150 days (Stale)
        name: 'Dormant Collection 99',
        color: 'orange',
        tabs: [{ title: 'Ancient Article', url: 'https://archive.org/article' }],
      },
    ];

    render(<StaleTabsTool tabGroups={olderGroups} />);
    expect(screen.getByText('Inactive Collections Review')).toBeDefined();

    // Verify presence of time horizon pills
    expect(screen.getByRole('button', { name: /1 Month ago/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /3 Months ago/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /6 Months ago/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /1 Year ago/i })).toBeDefined();

    // Verify dormant collection card is shown
    expect(screen.getByText('Dormant Collection 99')).toBeDefined();

    // Test Expand collection
    const expandBtn = screen.getByLabelText(/Expand collection/i);
    fireEvent.click(expandBtn);
    expect(screen.getByText('Ancient Article')).toBeDefined();

    // Test Collapse collection
    const collapseBtn = screen.getByLabelText(/Collapse collection/i);
    fireEvent.click(collapseBtn);
  });

  it('opens and verifies Move Collections to Cold Storage modal in <StaleTabsTool />', () => {
    const olderGroups: TabGroup[] = [
      {
        id: 99,
        date: new Date(Date.now() - 150 * 24 * 3600 * 1000).toISOString(),
        name: 'Dormant Collection 99',
        color: 'orange',
        tabs: [{ title: 'Ancient Article', url: 'https://archive.org/article' }],
      },
    ];

    render(<StaleTabsTool tabGroups={olderGroups} />);

    // Click single archive button
    const archiveBtn = screen.getByTitle(/Move this collection to Archive/i);
    fireEvent.click(archiveBtn);

    expect(screen.getByText(/Move 1 Collection to Archive\?/i)).toBeDefined();
    expect(screen.getByText(/What will happen:/i)).toBeDefined();
    expect(screen.getByText('Confirm & Move to Archive')).toBeDefined();

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
  });

  it('opens and verifies Consolidate Abandoned Fragments modal in <StaleTabsTool />', () => {
    const fragmentGroups: TabGroup[] = [
      {
        id: 98,
        date: new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString(),
        name: 'Fragment 98',
        color: 'purple',
        tabs: [{ title: 'Fragment Tab 1', url: 'https://frag1.org' }],
      },
      {
        id: 99,
        date: new Date(Date.now() - 150 * 24 * 3600 * 1000).toISOString(),
        name: 'Fragment 99',
        color: 'purple',
        tabs: [{ title: 'Fragment Tab 2', url: 'https://frag2.org' }],
      },
    ];

    render(<StaleTabsTool tabGroups={fragmentGroups} />);

    // Click bundle small groups button
    const bundleBtn = screen.getByRole('button', { name: /Bundle Small Groups/i });
    fireEvent.click(bundleBtn);

    expect(screen.getByText('Bundle Small Collections into One')).toBeDefined();
    expect(screen.getByText(/Consolidated Collection Name/i)).toBeDefined();
    expect(screen.getByText('Bundle into 1 Collection')).toBeDefined();

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
  });

  it('opens and verifies Permanent Deletion modal in <StaleTabsTool />', () => {
    const olderGroups: TabGroup[] = [
      {
        id: 99,
        date: new Date(Date.now() - 150 * 24 * 3600 * 1000).toISOString(),
        name: 'Dormant Collection 99',
        color: 'orange',
        tabs: [{ title: 'Ancient Article', url: 'https://archive.org/article' }],
      },
    ];

    render(<StaleTabsTool tabGroups={olderGroups} />);

    const deleteBtn = screen.getByTitle(/Permanently delete collection/i);
    fireEvent.click(deleteBtn);

    expect(screen.getByText('Confirm Permanent Deletion')).toBeDefined();
    expect(screen.getByText(/Guarded by Automatic Rolling Backup/i)).toBeDefined();
    expect(screen.getByText('Delete Collections')).toBeDefined();

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
  });

  // ===========================================================================
  // Dashboard Interactive Workflows & Navigation
  // ===========================================================================

  it('filters dashboard tab groups in real-time using search input and clears via Escape/X', async () => {
    render(<App />);

    // Wait for cards to appear after initial loading completes
    expect(await screen.findByText('Alpha Research Group')).toBeDefined();
    expect(screen.getByText('Beta Secondary Group')).toBeDefined();

    // Type query into search
    const searchInput = screen.getByPlaceholderText('Search saved tabs...');
    fireEvent.change(searchInput, { target: { value: 'Google' } });

    // Alpha group contains Google Search, Beta does not
    expect(screen.getByText('Alpha Research Group')).toBeDefined();
    expect(screen.queryByText('Beta Secondary Group')).toBeNull();

    // Clear search using Escape key
    fireEvent.keyDown(searchInput, { key: 'Escape', code: 'Escape' });
    expect(searchInput.getAttribute('value')).toBe('');
    expect(screen.getByText('Beta Secondary Group')).toBeDefined();
  });

  it('sorts tab groups by name ascending and tab count via sort dropdown', async () => {
    render(<App />);

    expect(await screen.findByText('Alpha Research Group')).toBeDefined();

    // Open sort dropdown
    const sortTrigger = screen.getByTitle('Sort tab groups');
    fireEvent.pointerDown(sortTrigger, { button: 0, ctrlKey: false });

    // Select Name (A to Z)
    const nameSort = await screen.findByText('Name (A → Z)');
    fireEvent.click(nameSort);

    // Verify sort updated in trigger
    await waitFor(() => {
      expect(screen.getAllByText(/Alpha Research Group/i).length).toBeGreaterThan(0);
    });
  });

  it('filters tab groups by color tag selection and clears filters', async () => {
    render(<App />);

    expect(await screen.findByText('Alpha Research Group')).toBeDefined();

    // Open color tag filter dropdown
    const colorFilterTrigger = screen.getByTitle('Filter by color tag');
    fireEvent.pointerDown(colorFilterTrigger, { button: 0, ctrlKey: false });

    // Toggle Purple color filter (Beta group is purple, Alpha is blue)
    const purpleFilter = await screen.findByText('Purple');
    fireEvent.click(purpleFilter);

    await waitFor(() => {
      expect(screen.getByText('Beta Secondary Group')).toBeDefined();
      expect(screen.queryByText('Alpha Research Group')).toBeNull();
    });

    // Clear filters
    const clearBtn = await screen.findByText('Clear all');
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText('Alpha Research Group')).toBeDefined();
      expect(screen.getByText('Beta Secondary Group')).toBeDefined();
    });
  });

  it('renames a tab group directly from the card header inline edit input', async () => {
    render(<App />);

    expect(await screen.findByText('Alpha Research Group')).toBeDefined();

    // Click rename group button
    const renameBtns = screen.getAllByTitle('Rename group');
    fireEvent.click(renameBtns[0]);

    // Inline rename input appears
    const renameInput = screen.getByDisplayValue('Alpha Research Group');
    fireEvent.change(renameInput, { target: { value: 'Renamed Alpha Workspace' } });

    // Save rename
    const saveRenameBtn = screen.getByTitle('Save name');
    fireEvent.click(saveRenameBtn);

    await waitFor(() => {
      expect(screen.getByText('Renamed Alpha Workspace')).toBeDefined();
    });
  });

  it('archives a group from dashboard, navigates to Archive tab, and unarchives it back', async () => {
    render(<App />);

    const alphaHeading = await screen.findByText('Alpha Research Group');
    expect(alphaHeading).toBeDefined();

    // Archive Alpha Research Group using within on its card
    const alphaCard = alphaHeading.closest('[data-group-id]');
    const archiveBtn = within(alphaCard as HTMLElement).getByTitle('Archive group');
    fireEvent.click(archiveBtn);

    // Group disappears from Dashboard
    await waitFor(() => {
      expect(screen.queryByText('Alpha Research Group')).toBeNull();
    });

    // Switch to Archive view via sidebar nav specifically
    const archiveNav = within(screen.getByRole('navigation')).getByRole('button', { name: /Archive/i });
    fireEvent.click(archiveNav);

    // Alpha group now in Archive along with existing Old Archived Project
    expect(await screen.findByText('Alpha Research Group')).toBeDefined();
    expect(screen.getByText('Old Archived Project')).toBeDefined();

    // Unarchive Alpha group
    const alphaArchiveCard = (await screen.findByText('Alpha Research Group')).closest('[data-group-id]');
    const unarchiveBtn = within(alphaArchiveCard as HTMLElement).getByTitle('Unarchive group');
    fireEvent.click(unarchiveBtn);

    // Switch back to Dashboard view
    const dashboardNav = within(screen.getByRole('navigation')).getByRole('button', { name: /Dashboard/i });
    fireEvent.click(dashboardNav);

    // Alpha group back in Dashboard
    expect(await screen.findByText('Alpha Research Group')).toBeDefined();
  });

  it('deletes a group from dashboard after confirming in dialog', async () => {
    render(<App />);

    const betaHeading = await screen.findByText('Beta Secondary Group');
    expect(betaHeading).toBeDefined();

    // Click delete group specifically on Beta group
    const betaCard = betaHeading.closest('[data-group-id]');
    const deleteBtn = within(betaCard as HTMLElement).getByTitle('Delete group');
    fireEvent.click(deleteBtn);

    // Confirmation dialog appears
    expect(await screen.findByText('Confirm Deletion')).toBeDefined();
    const confirmDeleteBtn = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(confirmDeleteBtn);

    // Beta group removed
    await waitFor(() => {
      expect(screen.queryByText('Beta Secondary Group')).toBeNull();
    });
  });

  it('navigates to Recently Closed tab and displays closed items', async () => {
    render(<App />);

    // Switch to Recently Closed view via sidebar
    const closedNav = screen.getByRole('button', { name: /Recently Closed/i });
    fireEvent.click(closedNav);

    // Closed page item appears
    expect(await screen.findByText('Recently Closed Page')).toBeDefined();
    expect(screen.getByText(/news\.ycombinator\.com/)).toBeDefined();

    // Reopen button triggers tab create
    const reopenBtn = screen.getByRole('button', { name: /Reopen Tab/i });
    fireEvent.click(reopenBtn);
    expect(mockChrome.tabs.create).toHaveBeenCalledWith({ url: 'https://news.ycombinator.com', active: true });
  });

  it('navigates to Settings tab and toggles user preferences and card density', async () => {
    render(<App />);

    // Switch to Settings
    const settingsNav = screen.getByRole('button', { name: /Settings/i });
    fireEvent.click(settingsNav);

    expect(await screen.findByText('Appearance & Curated Themes')).toBeDefined();
    expect(screen.getByText('Tab Workflow & Restoration Rules')).toBeDefined();

    // Toggle Protect Pinned Tabs preference
    const protectBtn = screen.getByRole('button', { name: /Protected|Unprotected/i });
    fireEvent.click(protectBtn);

    await waitFor(() => {
      expect(mockStorageStore[PREFERENCES_STORAGE_KEY]?.protectPinnedTabs).toBe(false);
    });

    // Expand Advanced Display Settings
    const advancedToggle = screen.getByText('Advanced Display & Interface Settings');
    fireEvent.click(advancedToggle);

    // Switch card density to Compact Grid
    const compactDensityBtn = await screen.findByText('Compact Grid');
    fireEvent.click(compactDensityBtn);

    await waitFor(() => {
      expect(mockStorageStore[PREFERENCES_STORAGE_KEY]?.cardDensity).toBe('compact');
    });

    // Toggle Restore Destination to Current Active Window
    const currentWindowBtn = screen.getByText('Current Active Window');
    fireEvent.click(currentWindowBtn);

    await waitFor(() => {
      expect(mockStorageStore[PREFERENCES_STORAGE_KEY]?.restoreDestination).toBe('current_window');
    });
  });

  it('creates rolling backup snapshot in Settings and opens restore confirmation modal', async () => {
    render(<App />);

    // Switch to Settings
    const settingsNav = screen.getByRole('button', { name: /Settings/i });
    fireEvent.click(settingsNav);

    expect(await screen.findByText('Automated Rolling Backups')).toBeDefined();

    // Create snapshot
    const createBackupBtn = screen.getByRole('button', { name: /Backup Now/i });
    fireEvent.click(createBackupBtn);

    expect(await screen.findByText('Rolling snapshot created successfully!')).toBeDefined();

    // Verify snapshot entry in table
    const restoreSnapBtn = (await screen.findByText('Restore')).closest('button')!;
    fireEvent.click(restoreSnapBtn);

    expect(await screen.findByText('Restore Rolling Snapshot?')).toBeDefined();
    const cancelModalBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelModalBtn);
  });

  it('parses and imports OneTab formatted tab list in Settings import hub', async () => {
    render(<App />);

    // Switch to Settings
    const settingsNav = screen.getByRole('button', { name: /Settings/i });
    fireEvent.click(settingsNav);

    const importArea = await screen.findByPlaceholderText(/Paste OneTab text export here/i);
    fireEvent.change(importArea, {
      target: {
        value: 'https://vitest.dev | Vitest Next Gen Testing\nhttps://wxt.dev | Next-Gen Framework',
      },
    });

    const parseBtn = screen.getByRole('button', { name: /Parse & Import/i });
    fireEvent.click(parseBtn);

    await waitFor(() => {
      expect(mockStorageStore.tabGroups.length).toBeGreaterThan(2);
    });
  });

  it('opens and verifies Clear All Saved Data disaster recovery modal in Settings', async () => {
    render(<App />);

    // Switch to Settings
    const settingsNav = screen.getByRole('button', { name: /Settings/i });
    fireEvent.click(settingsNav);

    // Danger zone button
    const clearAllBtn = await screen.findByRole('button', { name: /Clear All Saved Data/i });
    fireEvent.click(clearAllBtn);

    // Confirmation dialog
    expect(await screen.findByText('Are you absolutely sure?')).toBeDefined();
    expect(screen.getByText(/This action will permanently delete/i)).toBeDefined();

    // Cancel out
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);
  });

  it('navigates to Help Center and displays guides', async () => {
    render(<App />);

    const helpNav = screen.getByRole('button', { name: /Help/i });
    fireEvent.click(helpNav);

    // Help Center view rendered
    expect(await screen.findByText(/TwoTab Knowledge Center/i)).toBeDefined();
  });

  it('renders Intelligent Grouping button and opens ConsentDialog on first use', async () => {
    render(<App />);

    const intelligentBtn = await screen.findByRole('button', { name: /Group Intelligently/i });
    expect(intelligentBtn).toBeDefined();

    fireEvent.click(intelligentBtn);

    expect(await screen.findByText('Enable Intelligent Tab Grouping')).toBeDefined();
    expect(screen.getByText(/~90 MB One-Time Download/i)).toBeDefined();
  });

  it('toggles sidebar collapse via header button and keyboard shortcut', async () => {
    const { container } = render(<App />);

    // Initially sidebar is expanded (has w-64 class and data-collapsed=false)
    const aside = container.querySelector('aside');
    expect(aside).toBeTruthy();
    expect(aside?.className).toContain('w-64');
    expect(aside?.getAttribute('data-collapsed')).toBe('false');

    // When expanded, the main deck header is clean (no duplicate toolbar toggle)
    expect(screen.queryByTestId('toolbar-sidebar-toggle')).toBeNull();

    // Click collapse button in sidebar header
    const collapseBtn = screen.getByTestId('sidebar-header-collapse');
    fireEvent.click(collapseBtn);

    // Sidebar should now have compact rail class (w-[68px], data-collapsed=true)
    expect(aside?.className).toContain('w-[68px]');
    expect(aside?.getAttribute('data-collapsed')).toBe('true');

    // Toggle back via toolbar toggle button (which appears when collapsed)
    const expandBtn = screen.getByTestId('toolbar-sidebar-toggle');
    expect(expandBtn.getAttribute('aria-label')).toBe('Expand sidebar menu');
    fireEvent.click(expandBtn);

    // Sidebar should be expanded again
    expect(aside?.className).toContain('w-64');
    expect(aside?.getAttribute('data-collapsed')).toBe('false');

    // Press ⌘B shortcut
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(aside?.className).toContain('w-[68px]');

    // Press Ctrl+B shortcut
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(aside?.className).toContain('w-64');

    // Press ⌘\ shortcut
    fireEvent.keyDown(window, { key: '\\', metaKey: true });
    expect(aside?.className).toContain('w-[68px]');
  });

  it('does not toggle sidebar when typing in inputs', async () => {
    const { container } = render(<App />);
    const aside = container.querySelector('aside');
    expect(aside?.className).toContain('w-64');

    const searchInput = screen.getByPlaceholderText(/Search saved tabs/i);
    fireEvent.keyDown(searchInput, { key: 'b', metaKey: true });

    // Should remain expanded
    expect(aside?.className).toContain('w-64');
  });

  it('mounts <PopupApp /> extension popup cleanly', () => {
    const { container } = render(<PopupApp />);
    expect(container).toBeTruthy();
    expect(screen.getByText(/Save Window/i)).toBeDefined();
  });
});
