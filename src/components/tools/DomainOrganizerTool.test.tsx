import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { DomainOrganizerTool } from './DomainOrganizerTool';
import { type TabGroup } from '@/lib/storage';
import * as domainOrganizerLib from '@/lib/domainOrganizer';
import * as storageLib from '@/lib/storage';

describe('<DomainOrganizerTool /> Power Tool Component Suite', () => {
  const mockTabGroups: TabGroup[] = [
    {
      id: 101,
      name: 'Development',
      color: 'blue',
      date: new Date(1700000000000).toISOString(),
      tabs: [
        { title: 'GitHub TwoTab Repo', url: 'https://github.com/nickravesh/TwoTab' },
        { title: 'GitHub PRs', url: 'https://github.com/pulls' },
        { title: 'Google Search', url: 'https://google.com/search?q=react' },
      ],
    },
    {
      id: 102,
      name: 'Reference & Reading',
      color: 'purple',
      date: new Date(1700000500000).toISOString(),
      tabs: [
        { title: 'GitHub Explore', url: 'https://github.com/explore' },
        { title: 'Google Cloud Console', url: 'https://console.cloud.google.com' },
        { title: 'Stack Overflow Question', url: 'https://stackoverflow.com/questions/123' },
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

  it('renders zero domains empty state when no tab groups exist', () => {
    render(<DomainOrganizerTool tabGroups={[]} />);

    expect(screen.getByText('No Domains Found')).toBeTruthy();
    expect(screen.getByText(/Save some open tabs to inspect/i)).toBeTruthy();
  });

  it('computes metrics and displays domain clusters correctly', () => {
    render(<DomainOrganizerTool tabGroups={mockTabGroups} />);

    expect(screen.getByText('Domain Sorter & Organizer')).toBeTruthy();
    expect(screen.getByText('Unique Domains')).toBeTruthy();
    expect(screen.getByText('Scattered Domains')).toBeTruthy();

    // GitHub should be detected as scattered across 2 groups
    expect(screen.getAllByText('github.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Scattered in 2 groups/i).length).toBeGreaterThan(0);
  });

  it('filters domain clusters using filter tabs (all, scattered, organized)', () => {
    render(<DomainOrganizerTool tabGroups={mockTabGroups} />);

    // Click Scattered filter button
    const scatteredFilterBtn = screen.getByTitle('Click to filter to websites saved across 2 or more different groups');
    fireEvent.click(scatteredFilterBtn);

    // GitHub should be shown because it is scattered across 2 groups
    expect(screen.getAllByText('github.com').length).toBeGreaterThan(0);

    // Click Organized filter tab (single collection domains)
    const organizedFilterBtn = screen.getByTitle('Click to filter to domains already organized in a single collection');
    fireEvent.click(organizedFilterBtn);

    // stackoverflow.com is in only 1 group
    expect(screen.getAllByText('stackoverflow.com').length).toBeGreaterThan(0);
  });

  it('searches domains and tab titles via search input', () => {
    render(<DomainOrganizerTool tabGroups={mockTabGroups} />);

    const searchInput = screen.getByPlaceholderText(/Search domains or URLs/i);
    fireEvent.change(searchInput, { target: { value: 'Stack' } });

    expect(screen.getAllByText('stackoverflow.com').length).toBeGreaterThan(0);
    expect(screen.queryByText('github.com')).toBeNull();

    // Search query with no match
    fireEvent.change(searchInput, { target: { value: 'NonexistentDomainXYZ' } });
    expect(screen.getByText('No matching domains found')).toBeTruthy();
  });

  it('sorts domain clusters by selected sort option', () => {
    render(<DomainOrganizerTool tabGroups={mockTabGroups} />);

    const sortSelect = screen.getByLabelText('Sort Domains') as HTMLSelectElement;
    expect(sortSelect.value).toBe('tabs_desc');

    fireEvent.change(sortSelect, { target: { value: 'alpha_asc' } });
    expect(sortSelect.value).toBe('alpha_asc');

    fireEvent.change(sortSelect, { target: { value: 'scattered_desc' } });
    expect(sortSelect.value).toBe('scattered_desc');
  });

  it('toggles collapse and expand for all domain cards', () => {
    render(<DomainOrganizerTool tabGroups={mockTabGroups} />);

    const collapseAllBtn = screen.getByRole('button', { name: /Collapse All/i });
    fireEvent.click(collapseAllBtn);

    expect(screen.getByRole('button', { name: /Expand All/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Expand All/i }));
    expect(screen.getByRole('button', { name: /Collapse All/i })).toBeTruthy();
  });

  it('toggles group by subdomain button', () => {
    render(<DomainOrganizerTool tabGroups={mockTabGroups} />);

    const subdomainBtn = screen.getByRole('button', { name: /Root Domains/i });
    fireEvent.click(subdomainBtn);

    // Button label toggles to 'Subdomains'
    expect(screen.getByRole('button', { name: /Subdomains/i })).toBeTruthy();
  });

  it('opens consolidate modal and executes consolidation to a new group', async () => {
    const onDataMutated = vi.fn();
    const consolidateSpy = vi.spyOn(domainOrganizerLib, 'consolidateDomain').mockResolvedValue({
      consolidatedCount: 3,
      prunedGroupsCount: 0,
      newGroupId: 301,
      affectedGroupsCount: 1,
    });

    render(<DomainOrganizerTool tabGroups={mockTabGroups} onDataMutated={onDataMutated} />);

    // Click Consolidate button on GitHub cluster
    const consolidateButtons = screen.getAllByTitle('Gather all tabs of this domain into a single dedicated group');
    expect(consolidateButtons.length).toBeGreaterThan(0);
    fireEvent.click(consolidateButtons[0]);

    // Modal dialog opens
    expect(screen.getByText('Consolidate Domain Tabs')).toBeTruthy();

    // Confirm consolidation
    const confirmBtn = screen.getByRole('button', { name: /Consolidate Tabs/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(consolidateSpy).toHaveBeenCalled();
      expect(onDataMutated).toHaveBeenCalled();
    });

    expect(await screen.findByText(/Consolidated 3 GitHub tabs/i)).toBeTruthy();
  });

  it('executes library auto-organize with grouping threshold picker', async () => {
    const onDataMutated = vi.fn();
    const autoOrganizeSpy = vi.spyOn(domainOrganizerLib, 'autoOrganizeLibraryByDomain').mockResolvedValue({
      organizedTabsCount: 6,
      createdGroupsCount: 2,
    });

    render(<DomainOrganizerTool tabGroups={mockTabGroups} onDataMutated={onDataMutated} />);

    // Open Auto-Organize modal
    const autoOrganizeBtn = screen.getByRole('button', { name: /Auto-Organize Library/i });
    fireEvent.click(autoOrganizeBtn);

    expect(screen.getByText('Auto-Organize Entire Library by Domain')).toBeTruthy();

    // Click threshold button (At least 5 tabs)
    const thresholdBtn = screen.getByRole('button', { name: /At least 5 tabs/i });
    fireEvent.click(thresholdBtn);

    // Click Proceed & Organize
    const proceedBtn = screen.getByRole('button', { name: /Proceed & Organize/i });
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(autoOrganizeSpy).toHaveBeenCalledWith(mockTabGroups, { minTabsThreshold: 5 });
      expect(onDataMutated).toHaveBeenCalled();
    });

    expect(await screen.findByText(/Organized library into 2 domain collections/i)).toBeTruthy();
  });

  it('opens delete domain confirmation dialog and executes permanent deletion', async () => {
    const onDataMutated = vi.fn();
    const deleteSpy = vi.spyOn(domainOrganizerLib, 'deleteDomainTabs').mockResolvedValue({
      deletedCount: 3,
      cleanedGroupsCount: 0,
    });

    render(<DomainOrganizerTool tabGroups={mockTabGroups} onDataMutated={onDataMutated} />);

    // Click Delete Domain button (Trash icon with title)
    const deleteButtons = screen.getAllByTitle('Delete all tabs of this domain across the library');
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[0]);

    // Delete confirmation modal appears
    expect(screen.getByText(/Delete All GitHub Tabs/i)).toBeTruthy();

    // Confirm deletion
    const confirmDeleteBtn = screen.getByRole('button', { name: /Permanently Delete/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalled();
      expect(onDataMutated).toHaveBeenCalled();
    });

    expect(await screen.findByText(/Removed all 3 tabs from "GitHub"/i)).toBeTruthy();
  });

  it('deletes a single tab instance directly from domain card', async () => {
    const onDataMutated = vi.fn();
    const deleteTabSpy = vi.spyOn(domainOrganizerLib, 'deleteSingleTabInstance').mockResolvedValue({
      success: true,
      remainingTabsCount: 2,
    });

    render(<DomainOrganizerTool tabGroups={mockTabGroups} onDataMutated={onDataMutated} />);

    // Find tab delete button
    const deleteTabButtons = screen.getAllByTitle('Remove tab from collection');
    expect(deleteTabButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteTabButtons[0]);

    await waitFor(() => {
      expect(deleteTabSpy).toHaveBeenCalled();
      expect(onDataMutated).toHaveBeenCalled();
    });

    expect(await screen.findByText(/Removed "/i)).toBeTruthy();
  });

  it('copies tab URL to clipboard when copy button is clicked', async () => {
    const copySpy = vi.spyOn(storageLib, 'copyToClipboardSafe').mockResolvedValue(true);

    render(<DomainOrganizerTool tabGroups={mockTabGroups} />);

    const copyButtons = screen.getAllByTitle('Copy URL');
    expect(copyButtons.length).toBeGreaterThan(0);
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(copySpy).toHaveBeenCalled();
    });
  });
});
