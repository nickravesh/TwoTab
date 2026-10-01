import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { LinkHealthTool } from './LinkHealthTool';
import { type TabGroup } from '@/lib/storage';
import * as linkHealthLib from '@/lib/linkHealth';

describe('<LinkHealthTool /> Power Tool Component Suite', () => {
  const mockTabGroups: TabGroup[] = [
    {
      id: 101,
      name: 'Docs & Tools',
      color: 'blue',
      date: new Date().toISOString(),
      tabs: [
        { title: 'Healthy Website', url: 'https://example.com/ok' },
        { title: 'Old Redirect Link', url: 'https://example.com/old-path' },
        { title: 'Broken 404 Page', url: 'https://example.com/dead-link' },
      ],
    },
  ];

  let runtimeMessageListeners: Array<(msg: any) => void> = [];
  let storageChangeListeners: Array<(changes: any, area: string) => void> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMessageListeners = [];
    storageChangeListeners = [];

    (globalThis as any).chrome = {
      runtime: {
        lastError: null,
        sendMessage: vi.fn((msg: any, callback?: (res: any) => void) => {
          if (callback) {
            if (msg.action === 'startLinkHealthScan') {
              callback({ status: 'started', total: 3 });
            } else if (msg.action === 'pauseLinkHealthScan') {
              callback({ state: { isPaused: true } });
            } else if (msg.action === 'resumeLinkHealthScan') {
              callback({ state: { isPaused: false } });
            } else {
              callback({});
            }
          }
        }),
        onMessage: {
          addListener: vi.fn((fn: any) => runtimeMessageListeners.push(fn)),
          removeListener: vi.fn(),
        },
      },
      storage: {
        onChanged: {
          addListener: vi.fn((fn: any) => storageChangeListeners.push(fn)),
          removeListener: vi.fn(),
        },
      },
    };

    // Mock initial cache to return evaluated items
    vi.spyOn(linkHealthLib, 'getLinkHealthCache').mockResolvedValue({
      'https://example.com/ok': {
        url: 'https://example.com/ok',
        status: 'healthy',
        statusCode: 200,
        checkedAt: new Date().toISOString(),
      },
      'https://example.com/old-path': {
        url: 'https://example.com/old-path',
        finalUrl: 'https://example.com/new-path',
        status: 'redirected',
        statusCode: 301,
        checkedAt: new Date().toISOString(),
      },
      'https://example.com/dead-link': {
        url: 'https://example.com/dead-link',
        status: 'broken',
        statusCode: 404,
        error: 'Not Found',
        checkedAt: new Date().toISOString(),
      },
    });

    vi.spyOn(linkHealthLib, 'getLinkHealthScanState').mockResolvedValue({
      total: 3,
      checked: 3,
      healthy: 1,
      redirected: 1,
      protected: 0,
      broken: 1,
      unreachable: 0,
      isScanning: false,
      isPaused: false,
      isWaitingForNetwork: false,
      velocity: 0,
      lastUpdated: new Date().toISOString(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads persistent cache on mount and displays summary metrics', async () => {
    render(<LinkHealthTool tabGroups={mockTabGroups} />);

    expect(screen.getByText('Link Health & Dead Link Inspector')).toBeTruthy();

    await waitFor(() => {
      // Results should be displayed
      expect(screen.getByText('https://example.com/ok')).toBeTruthy();
      expect(screen.getByText('https://example.com/old-path')).toBeTruthy();
      expect(screen.getByText('https://example.com/dead-link')).toBeTruthy();
    });
  });

  it('filters evaluated links by status tab', async () => {
    render(<LinkHealthTool tabGroups={mockTabGroups} />);

    await waitFor(() => {
      expect(screen.getByText('https://example.com/dead-link')).toBeTruthy();
    });

    // Filter to Broken links only
    const brokenFilterBtn = screen.getByRole('button', { name: /Broken/i });
    fireEvent.click(brokenFilterBtn);

    expect(screen.getByText('https://example.com/dead-link')).toBeTruthy();
    expect(screen.queryByText('https://example.com/ok')).toBeNull();

    // Filter to Redirects links only
    const redirectedFilterBtn = screen.getByRole('button', { name: /Redirects/i });
    fireEvent.click(redirectedFilterBtn);

    expect(screen.getByText('https://example.com/old-path')).toBeTruthy();
    expect(screen.queryByText('https://example.com/dead-link')).toBeNull();
  });

  it('filters links using the search input', async () => {
    render(<LinkHealthTool tabGroups={mockTabGroups} />);

    await waitFor(() => {
      expect(screen.getByText('https://example.com/ok')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText(/Search evaluated links/i);
    fireEvent.change(searchInput, { target: { value: 'dead-link' } });

    expect(screen.getByText('https://example.com/dead-link')).toBeTruthy();
    expect(screen.queryByText('https://example.com/ok')).toBeNull();
  });

  it('starts a background scan when Scan Library is clicked', async () => {
    render(<LinkHealthTool tabGroups={mockTabGroups} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Re-scan All/i })).toBeTruthy();
    });

    const scanBtn = screen.getByRole('button', { name: /Resume \/ Check Unscanned|Scan Library/i });
    fireEvent.click(scanBtn);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { action: 'startLinkHealthScan', forceRefresh: false },
      expect.any(Function)
    );
  });

  it('handles offline error response when network is disconnected', async () => {
    (chrome.runtime.sendMessage as any).mockImplementation((msg: any, cb: any) => {
      if (msg.action === 'startLinkHealthScan') {
        cb({ status: 'offline', message: 'No internet connection detected' });
      }
    });

    render(<LinkHealthTool tabGroups={mockTabGroups} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Resume \/ Check Unscanned|Scan Library/i })).toBeTruthy();
    });

    const scanBtn = screen.getByRole('button', { name: /Resume \/ Check Unscanned|Scan Library/i });
    fireEvent.click(scanBtn);

    expect(await screen.findByText('No internet connection detected')).toBeTruthy();
  });

  it('updates live progress when runtime messages are received', async () => {
    render(<LinkHealthTool tabGroups={mockTabGroups} />);

    await waitFor(() => {
      expect(runtimeMessageListeners.length).toBeGreaterThan(0);
    });

    // Simulate progress message from service worker
    act(() => {
      for (const listener of runtimeMessageListeners) {
        listener({
          action: 'linkHealthProgress',
          progress: {
            total: 10,
            checked: 5,
            healthy: 3,
            redirected: 1,
            protected: 0,
            broken: 1,
            unreachable: 0,
            isScanning: true,
            isPaused: false,
          },
        });
      }
    });

    // Percent progress should be 50%
    await waitFor(() => {
      expect(screen.getByText(/50%/i)).toBeTruthy();
    });
  });

  it('executes batch update redirects with confirmation modal', async () => {
    const onDataMutated = vi.fn();
    const updateRedirectsSpy = vi.spyOn(linkHealthLib, 'applyBatchRedirects').mockResolvedValue({
      updatedCount: 1,
      affectedGroupsCount: 1,
    });

    render(<LinkHealthTool tabGroups={mockTabGroups} onDataMutated={onDataMutated} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Update 1 Redirect/i })).toBeTruthy();
    });

    const updateBtn = screen.getByRole('button', { name: /Update 1 Redirect/i });
    fireEvent.click(updateBtn);

    // Modal dialog opens
    expect(screen.getByText('Update Redirected URLs?')).toBeTruthy();

    const confirmBtn = screen.getByRole('button', { name: /Confirm Update/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(updateRedirectsSpy).toHaveBeenCalledWith([
        { oldUrl: 'https://example.com/old-path', newUrl: 'https://example.com/new-path' },
      ]);
      expect(onDataMutated).toHaveBeenCalled();
    });
  });

  it('executes quarantine broken links with confirmation modal', async () => {
    const onDataMutated = vi.fn();
    const quarantineSpy = vi.spyOn(linkHealthLib, 'quarantineBrokenLinks').mockResolvedValue({
      quarantinedCount: 1,
      newGroupId: 501,
    });

    render(<LinkHealthTool tabGroups={mockTabGroups} onDataMutated={onDataMutated} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Quarantine 1 Dead/i })).toBeTruthy();
    });

    const quarantineBtn = screen.getByRole('button', { name: /Quarantine 1 Dead/i });
    fireEvent.click(quarantineBtn);

    expect(screen.getByText('Quarantine Dead Links?')).toBeTruthy();

    const confirmBtn = screen.getByRole('button', { name: /Quarantine \(1\)/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(quarantineSpy).toHaveBeenCalledWith(['https://example.com/dead-link']);
      expect(onDataMutated).toHaveBeenCalled();
    });
  });

  it('executes purge dead links with confirmation modal', async () => {
    const onDataMutated = vi.fn();
    const purgeSpy = vi.spyOn(linkHealthLib, 'purgeBrokenLinks').mockResolvedValue({
      purgedCount: 1,
      affectedGroupsCount: 1,
    });

    render(<LinkHealthTool tabGroups={mockTabGroups} onDataMutated={onDataMutated} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Purge 1 Dead/i })).toBeTruthy();
    });

    const purgeBtn = screen.getByRole('button', { name: /Purge 1 Dead/i });
    fireEvent.click(purgeBtn);

    expect(screen.getByText('Permanently Delete Dead Links?')).toBeTruthy();

    const confirmBtn = screen.getByRole('button', { name: /Purge \(1\)/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(purgeSpy).toHaveBeenCalledWith(['https://example.com/dead-link']);
      expect(onDataMutated).toHaveBeenCalled();
    });
  });

  it('wipes cache and restarts full scan when clicking Re-scan All', async () => {
    const clearCacheSpy = vi.spyOn(linkHealthLib, 'clearLinkHealthCache').mockResolvedValue();

    render(<LinkHealthTool tabGroups={mockTabGroups} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Re-scan All/i })).toBeTruthy();
    });

    const rescanBtn = screen.getByRole('button', { name: /Re-scan All/i });
    fireEvent.click(rescanBtn);

    await waitFor(() => {
      expect(clearCacheSpy).toHaveBeenCalled();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'startLinkHealthScan', forceRefresh: true },
        expect.any(Function)
      );
    });
  });
});
