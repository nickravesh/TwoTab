import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { DuplicateCleanerTool } from './DuplicateCleanerTool';
import { type TabGroup } from '@/lib/storage';
import * as deduplicationLib from '@/lib/deduplication';

describe('<DuplicateCleanerTool /> Power Tool Component Suite', () => {
  const mockTabGroups: TabGroup[] = [
    {
      id: 101,
      name: 'Work Research',
      color: 'blue',
      date: new Date(1700000000000).toISOString(),
      tabs: [
        { title: 'GitHub Documentation', url: 'https://docs.github.com/en' },
        { title: 'React Documentation', url: 'https://react.dev/learn' },
        { title: 'Vite Guide', url: 'https://vitejs.dev/guide/?utm_source=nav' },
      ],
    },
    {
      id: 102,
      name: 'Duplicate Group',
      color: 'purple',
      date: new Date(1700000500000).toISOString(),
      tabs: [
        { title: 'GitHub Documentation', url: 'https://docs.github.com/en' }, // exact match with id 1
        { title: 'React Docs (learn)', url: 'https://react.dev/learn' }, // exact URL match
        { title: 'Vite Guide', url: 'https://vitejs.dev/guide/' }, // canonical match with id 3
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

  it('renders zero duplicates empty state when library has no duplicate links', () => {
    const singleGroup: TabGroup[] = [
      {
        id: 201,
        name: 'Unique Group',
        color: 'cyan',
        date: new Date().toISOString(),
        tabs: [{ title: 'TwoTab Home', url: 'https://twotab.dev' }],
      },
    ];

    render(<DuplicateCleanerTool tabGroups={singleGroup} />);

    expect(screen.getByText('Zero Duplicate Tabs Found')).toBeTruthy();
    expect(screen.getByText(/Your library of 1 tab is completely clean/i)).toBeTruthy();
  });

  it('computes metrics and renders overview cards with redundant tabs and memory saved', () => {
    render(<DuplicateCleanerTool tabGroups={mockTabGroups} />);

    expect(screen.getByText('Smart Duplicate & Mirror Cleaner')).toBeTruthy();
    expect(screen.getByText('Redundant Tabs')).toBeTruthy();
    expect(screen.getByText('Distinct Web Pages')).toBeTruthy();
    expect(screen.getByText('Est. Memory Saved')).toBeTruthy();

    // Verify Clean All Duplicates button is visible
    expect(screen.getByRole('button', { name: /Clean All/i })).toBeTruthy();
  });

  it('filters duplicate clusters by match type tab (all, exact, canonical)', () => {
    render(<DuplicateCleanerTool tabGroups={mockTabGroups} />);

    // Filter by Exact URLs
    const exactFilterBtn = screen.getByRole('button', { name: /Exact URLs/i });
    fireEvent.click(exactFilterBtn);

    // GitHub Documentation should be present as exact match
    expect(screen.getAllByText('GitHub Documentation').length).toBeGreaterThan(0);

    // Filter by Cleaned Links (canonical match)
    const canonicalFilterBtn = screen.getByRole('button', { name: /Cleaned Links/i });
    fireEvent.click(canonicalFilterBtn);

    expect(screen.getAllByText('Vite Guide').length).toBeGreaterThan(0);
  });

  it('filters duplicate clusters with search query input', () => {
    render(<DuplicateCleanerTool tabGroups={mockTabGroups} />);

    const searchInput = screen.getByPlaceholderText('Filter duplicates...');
    fireEvent.change(searchInput, { target: { value: 'React' } });

    // React should be displayed
    expect(screen.getAllByText(/React Documentation/i).length).toBeGreaterThan(0);

    // Search query with no match
    fireEvent.change(searchInput, { target: { value: 'NonexistentTabXYZ' } });
    expect(screen.getByText('No matching duplicate tabs found')).toBeTruthy();
    expect(screen.getByText(/No duplicates match "NonexistentTabXYZ"/i)).toBeTruthy();
  });

  it('allows changing deduplication strategy from select dropdown', () => {
    render(<DuplicateCleanerTool tabGroups={mockTabGroups} />);

    const strategySelect = screen.getByLabelText('Deduplication Strategy') as HTMLSelectElement;
    expect(strategySelect.value).toBe('keep_oldest');

    fireEvent.change(strategySelect, { target: { value: 'keep_newest' } });
    expect(strategySelect.value).toBe('keep_newest');

    fireEvent.change(strategySelect, { target: { value: 'keep_largest' } });
    expect(strategySelect.value).toBe('keep_largest');
  });

  it('toggles collapse and expand for duplicate clusters', () => {
    render(<DuplicateCleanerTool tabGroups={mockTabGroups} />);

    // Chevrons button to collapse all
    const collapseAllBtn = screen.getByRole('button', { name: /Collapse All/i });
    fireEvent.click(collapseAllBtn);

    // Button text should now offer "Expand All"
    expect(screen.getByRole('button', { name: /Expand All/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Expand All/i }));
    expect(screen.getByRole('button', { name: /Collapse All/i })).toBeTruthy();
  });

  it('executes clean all duplicates flow with modal confirmation and callback', async () => {
    const onDataMutated = vi.fn();
    const cleanAllSpy = vi.spyOn(deduplicationLib, 'cleanAllDuplicates').mockResolvedValue({
      removedCount: 3,
      cleanedGroupsCount: 0,
    });

    render(<DuplicateCleanerTool tabGroups={mockTabGroups} onDataMutated={onDataMutated} />);

    // Click Clean All button to open modal
    const cleanAllBtn = screen.getByRole('button', { name: /Clean All/i });
    fireEvent.click(cleanAllBtn);

    // Modal dialog is shown
    expect(screen.getAllByText('Clean All Duplicates').length).toBeGreaterThan(0);
    expect(screen.getByText(/You are about to remove/i)).toBeTruthy();

    // Click Confirm button inside dialog
    const confirmBtn = screen.getByRole('button', { name: /Proceed & Clean/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(cleanAllSpy).toHaveBeenCalled();
      expect(onDataMutated).toHaveBeenCalled();
    });

    // Toast notification appears
    expect(await screen.findByText(/Cleaned 3 duplicate tabs/i)).toBeTruthy();
  });

  it('handles cancelling the clean all modal without mutating data', () => {
    const cleanAllSpy = vi.spyOn(deduplicationLib, 'cleanAllDuplicates');

    render(<DuplicateCleanerTool tabGroups={mockTabGroups} />);

    const cleanAllBtn = screen.getByRole('button', { name: /Clean All/i });
    fireEvent.click(cleanAllBtn);

    // Cancel modal
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(cleanAllSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/You are about to remove/i)).toBeNull();
  });

  it('removes a specific single duplicate instance', async () => {
    const onDataMutated = vi.fn();
    const removeSpecificSpy = vi.spyOn(deduplicationLib, 'removeSpecificInstances').mockResolvedValue(undefined);

    render(<DuplicateCleanerTool tabGroups={mockTabGroups} onDataMutated={onDataMutated} />);

    // Find instance delete buttons (Trash icon buttons)
    const removeButtons = screen.getAllByTitle('Delete only this tab copy immediately');
    expect(removeButtons.length).toBeGreaterThan(0);

    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(removeSpecificSpy).toHaveBeenCalled();
      expect(onDataMutated).toHaveBeenCalled();
    });

    expect(await screen.findByText(/Removed 1 copy from/i)).toBeTruthy();
  });

  it('switches to Similar Groups mode and performs group merge', async () => {
    const onDataMutated = vi.fn();
    const mergeSpy = vi.spyOn(deduplicationLib, 'mergeGroups').mockResolvedValue(undefined);

    render(<DuplicateCleanerTool tabGroups={mockTabGroups} onDataMutated={onDataMutated} />);

    // Switch mode to Similar Groups
    const similarGroupsBtn = screen.getByRole('button', { name: /Similar Groups/i });
    fireEvent.click(similarGroupsBtn);

    // Group pair should be listed because mockTabGroups share identical tabs (100% similarity)
    expect(screen.getByText(/"Work Research"/i)).toBeTruthy();
    expect(screen.getByText(/"Duplicate Group"/i)).toBeTruthy();

    // Click Merge button
    const mergeBtn = screen.getByRole('button', { name: /Merge Groups/i });
    fireEvent.click(mergeBtn);

    // Confirmation modal appears
    expect(screen.getByText('Merge Overlapping Tab Groups')).toBeTruthy();
    const confirmMergeBtn = screen.getByRole('button', { name: /Confirm & Merge/i });
    fireEvent.click(confirmMergeBtn);

    await waitFor(() => {
      expect(mergeSpy).toHaveBeenCalled();
      expect(onDataMutated).toHaveBeenCalled();
    });

    expect(await screen.findByText(/Merged "Work Research" into "Duplicate Group" seamlessly/i)).toBeTruthy();
  });
});
