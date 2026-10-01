import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { StaleTabsTool } from './StaleTabsTool';
import { type TabGroup } from '@/lib/storage';
import * as staleTabsLib from '@/lib/staleTabs';
import * as storageLib from '@/lib/storage';

describe('<StaleTabsTool /> Power Tool Component Suite', () => {
  const oneHundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
  const twoHundredDaysAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  const mockTabGroups: TabGroup[] = [
    {
      id: 101,
      name: 'Old Summer Vacation',
      color: 'orange',
      date: oneHundredDaysAgo,
      tabs: [
        { title: 'Airbnb Booking', url: 'https://airbnb.com/rooms/1' },
      ],
    },
    {
      id: 102,
      name: 'Legacy Project Spec',
      color: 'purple',
      date: twoHundredDaysAgo,
      tabs: [
        { title: 'Project Spec RFC', url: 'https://docs.google.com/document/d/1' },
        { title: 'Legacy Architecture', url: 'https://github.com/org/repo' },
      ],
    },
    {
      id: 103,
      name: 'Fresh Daily Tabs',
      color: 'blue',
      date: fiveDaysAgo,
      tabs: [
        { title: 'Daily News', url: 'https://news.ycombinator.com' },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders up-to-date empty state when all tabs are newer than horizon', () => {
    const recentGroups: TabGroup[] = [
      {
        id: 201,
        name: 'Recent Work',
        color: 'blue',
        date: new Date().toISOString(),
        tabs: [{ title: 'Current Task', url: 'https://linear.app' }],
      },
    ];

    render(<StaleTabsTool tabGroups={recentGroups} />);

    expect(screen.getByText('Your Workspace is Up to Date!')).toBeTruthy();
    expect(screen.getByText(/You have no collections older than 3 months/i)).toBeTruthy();
  });

  it('renders impact preview and stale collections matching 3 months horizon', () => {
    render(<StaleTabsTool tabGroups={mockTabGroups} />);

    expect(screen.getByText('Inactive Collections Review')).toBeTruthy();
    expect(screen.getByText(/Old Summer Vacation/i)).toBeTruthy();
    expect(screen.getByText(/Legacy Project Spec/i)).toBeTruthy();
    // 5-day old group should NOT appear under 90-day horizon
    expect(screen.queryByText(/Fresh Daily Tabs/i)).toBeNull();
  });

  it('switches time horizon filter to 1 Month and 6 Months', () => {
    render(<StaleTabsTool tabGroups={mockTabGroups} />);

    // Switch to 6 Months (180 days)
    const sixMonthsBtn = screen.getByRole('button', { name: /6 Months ago/i });
    fireEvent.click(sixMonthsBtn);

    // Only Legacy Project Spec (200 days old) should remain
    expect(screen.getByText(/Legacy Project Spec/i)).toBeTruthy();
    expect(screen.queryByText(/Old Summer Vacation/i)).toBeNull();

    // Switch to 1 Month (30 days)
    const oneMonthBtn = screen.getByRole('button', { name: /1 Month ago/i });
    fireEvent.click(oneMonthBtn);

    expect(screen.getByText(/Old Summer Vacation/i)).toBeTruthy();
    expect(screen.getByText(/Legacy Project Spec/i)).toBeTruthy();
  });

  it('searches stale collections by name or tab url', () => {
    render(<StaleTabsTool tabGroups={mockTabGroups} />);

    const searchInput = screen.getByPlaceholderText('Search older collections...');
    fireEvent.change(searchInput, { target: { value: 'Vacation' } });

    expect(screen.getByText(/Old Summer Vacation/i)).toBeTruthy();
    expect(screen.queryByText(/Legacy Project Spec/i)).toBeNull();

    // Search query with no match
    fireEvent.change(searchInput, { target: { value: 'NonexistentSearch' } });
    expect(screen.getByText(/No collections match "NonexistentSearch"/i)).toBeTruthy();
  });

  it('sorts stale collections using sort selector', () => {
    render(<StaleTabsTool tabGroups={mockTabGroups} />);

    const sortSelect = screen.getByDisplayValue('Oldest First') as HTMLSelectElement;
    expect(sortSelect.value).toBe('oldest');

    fireEvent.change(sortSelect, { target: { value: 'newest' } });
    expect(sortSelect.value).toBe('newest');

    fireEvent.change(sortSelect, { target: { value: 'most_tabs' } });
    expect(sortSelect.value).toBe('most_tabs');
  });

  it('toggles selection of individual groups and select/deselect all', () => {
    render(<StaleTabsTool tabGroups={mockTabGroups} />);

    // Click Deselect All
    const selectAllCheckbox = screen.getByLabelText(/Select All|Deselect All/i);
    fireEvent.click(selectAllCheckbox);

    // Button should now be disabled because 0 selected
    const archiveBtn = screen.getByRole('button', { name: /Move 0 to Archive/i }) as HTMLButtonElement;
    expect(archiveBtn.disabled).toBe(true);

    // Toggle select all back on
    fireEvent.click(selectAllCheckbox);
    const activeArchiveBtn = screen.getByRole('button', { name: /Move 2 to Archive/i }) as HTMLButtonElement;
    expect(activeArchiveBtn.disabled).toBe(false);
  });

  it('toggles expand and collapse for all collections', () => {
    render(<StaleTabsTool tabGroups={mockTabGroups} />);

    const expandAllBtn = screen.getByTitle('Expand All');
    fireEvent.click(expandAllBtn);

    // After expanding, title should be Collapse All
    expect(screen.getByTitle('Collapse All')).toBeTruthy();
  });

  it('executes batch move to archive flow with confirmation modal', async () => {
    const onDataMutated = vi.fn();
    const archiveSpy = vi.spyOn(staleTabsLib, 'archiveStaleGroups').mockResolvedValue({
      count: 2,
      tabsArchived: 3,
    });

    render(<StaleTabsTool tabGroups={mockTabGroups} onDataMutated={onDataMutated} />);

    // Click Move to Archive button
    const archiveBtn = screen.getByRole('button', { name: /Move 2 to Archive/i });
    fireEvent.click(archiveBtn);

    // Modal dialog is shown
    expect(screen.getByText(/Move 2 Collections to Archive\?/i)).toBeTruthy();

    // Confirm archive
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Move to Archive/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(archiveSpy).toHaveBeenCalledWith(expect.arrayContaining([101, 102]));
      expect(onDataMutated).toHaveBeenCalled();
    });

    expect(await screen.findByText(/Moved 2 collections \(3 tabs\) to Archive/i)).toBeTruthy();
  });

  it('bundles small collections when 2+ small collections exist', async () => {
    const onDataMutated = vi.fn();
    const bundleSpy = vi.spyOn(staleTabsLib, 'consolidateStaleFragments').mockResolvedValue({
      prunedGroupsCount: 2,
      consolidatedTabsCount: 3,
      newGroupId: 301,
    });

    render(<StaleTabsTool tabGroups={mockTabGroups} onDataMutated={onDataMutated} />);

    // Bundle Small Groups banner button
    const bundleBtn = screen.getByRole('button', { name: /Bundle Small Groups/i });
    fireEvent.click(bundleBtn);

    // Bundle dialog opens
    expect(screen.getByText('Bundle Small Collections into One')).toBeTruthy();

    // Confirm bundle
    const confirmBundleBtn = screen.getByRole('button', { name: /Bundle into 1 Collection/i });
    fireEvent.click(confirmBundleBtn);

    await waitFor(() => {
      expect(bundleSpy).toHaveBeenCalled();
      expect(onDataMutated).toHaveBeenCalled();
    });

    expect(await screen.findByText(/Bundled 2 small collections into 1 consolidated archive/i)).toBeTruthy();
  });

  it('opens delete confirmation modal and permanently deletes selected collections', async () => {
    const onDataMutated = vi.fn();
    const deleteSpy = vi.spyOn(staleTabsLib, 'deleteStaleGroups').mockResolvedValue({
      count: 1,
      tabsDeleted: 1,
    });

    render(<StaleTabsTool tabGroups={mockTabGroups} onDataMutated={onDataMutated} />);

    // Individual delete button on card
    const deleteButtons = screen.getAllByTitle('Permanently delete collection (Safety backup taken)');
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[0]);

    // Modal opens
    expect(screen.getByText('Confirm Permanent Deletion')).toBeTruthy();

    // Confirm deletion
    const confirmDeleteBtn = screen.getByRole('button', { name: /Delete Collections/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalled();
      expect(onDataMutated).toHaveBeenCalled();
    });

    expect(await screen.findByText(/Deleted 1 collection \(1 tab\)\. Safety backup snapshot saved\./i)).toBeTruthy();
  });

  it('deletes a single tab inside an expanded stale collection', async () => {
    const onDataMutated = vi.fn();
    const deleteTabSpy = vi.spyOn(staleTabsLib, 'deleteSingleStaleTab').mockResolvedValue({
      groupPruned: false,
      remainingTabsCount: 1,
    });

    render(<StaleTabsTool tabGroups={mockTabGroups} onDataMutated={onDataMutated} />);

    // Expand the first group
    const expandButtons = screen.getAllByLabelText('Expand collection');
    if (expandButtons.length > 0) {
      fireEvent.click(expandButtons[0]);
    }

    // Delete tab button
    const deleteTabBtns = screen.getAllByTitle('Remove tab');
    expect(deleteTabBtns.length).toBeGreaterThan(0);
    fireEvent.click(deleteTabBtns[0]);

    await waitFor(() => {
      expect(deleteTabSpy).toHaveBeenCalled();
      expect(onDataMutated).toHaveBeenCalled();
    });

    expect(await screen.findByText('Tab removed from collection.')).toBeTruthy();
  });

  it('exports stale collections to Markdown', async () => {
    const copySpy = vi.spyOn(storageLib, 'copyToClipboardSafe').mockResolvedValue(true);

    render(<StaleTabsTool tabGroups={mockTabGroups} />);

    const exportBtn = screen.getByRole('button', { name: /Export/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(copySpy).toHaveBeenCalled();
    });

    expect(await screen.findByText(/Copied Markdown archive of 2 collections to clipboard!/i)).toBeTruthy();
  });
});
