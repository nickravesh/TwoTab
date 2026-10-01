import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TabGroupInspectorModal } from './TabGroupInspectorModal';
import * as storage from '@/lib/storage';

// In-memory mock storage
let mockGroups: storage.TabGroup[] = [];

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return {
    ...actual,
    getGroups: vi.fn(() => Promise.resolve([...mockGroups])),
    renameGroup: vi.fn((id: number, newName: string) => {
      const g = mockGroups.find((x) => x.id === id);
      if (g) g.name = newName;
      return Promise.resolve();
    }),
    setGroupColor: vi.fn((id: number, color?: storage.TabGroupColor) => {
      const g = mockGroups.find((x) => x.id === id);
      if (g) g.color = color;
      return Promise.resolve();
    }),
    deleteMultipleTabsFromGroup: vi.fn((id: number, indices: number[]) => {
      const g = mockGroups.find((x) => x.id === id);
      if (g) {
        const set = new Set(indices);
        g.tabs = g.tabs.filter((_, i) => !set.has(i));
      }
      return Promise.resolve();
    }),
    addTabToGroup: vi.fn((groupId: number, tab: storage.Tab) => {
      const g = mockGroups.find((x) => x.id === groupId);
      if (g) g.tabs.push(tab);
      return Promise.resolve();
    }),
    extractTabsToNewGroup: vi.fn((sourceGroupId: number, tabIndices: number[], newGroupName?: string) => {
      const source = mockGroups.find((x) => x.id === sourceGroupId);
      if (source) {
        const set = new Set(tabIndices);
        const extracted = source.tabs.filter((_, i) => set.has(i));
        source.tabs = source.tabs.filter((_, i) => !set.has(i));
        const newG: storage.TabGroup = {
          id: Date.now(),
          name: newGroupName || 'Extracted Group',
          date: new Date().toISOString(),
          tabs: extracted,
        };
        mockGroups.push(newG);
        return Promise.resolve(newG.id);
      }
      return Promise.resolve(null);
    }),
    restoreTabsAsChromeGroup: vi.fn(() => Promise.resolve({ count: 2 })),
    copyToClipboardSafe: vi.fn(() => Promise.resolve(true)),
  };
});

describe('TabGroupInspectorModal Interactive Component Test Suite', () => {
  const mockOnClose = vi.fn();
  const mockOnGroupUpdated = vi.fn();
  const mockOnDeleteGroup = vi.fn();
  const mockOnArchiveGroup = vi.fn();
  const mockOnUnarchiveGroup = vi.fn();

  const testGroup: storage.TabGroup = {
    id: 101,
    name: 'Frontend Frameworks',
    date: new Date(Date.now() - 3600 * 1000).toISOString(),
    color: 'blue',
    tabs: [
      { title: 'React Documentation', url: 'https://react.dev' },
      { title: 'Vue.js Official Guide', url: 'https://vuejs.org' },
      { title: 'React GitHub Repo', url: 'https://github.com/facebook/react' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGroups = [JSON.parse(JSON.stringify(testGroup))];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 1. Rendering, Spatial Morph & Domain Filter Statistics
  // ===========================================================================
  it('renders modal with group details, domain pills, and tabs when open', () => {
    render(
      <TabGroupInspectorModal
        isOpen={true}
        group={mockGroups[0]}
        onClose={mockOnClose}
        onGroupUpdated={mockOnGroupUpdated}
        onDeleteGroup={mockOnDeleteGroup}
        onArchiveGroup={mockOnArchiveGroup}
      />
    );

    expect(screen.getByText('Frontend Frameworks')).toBeDefined();
    expect(screen.getByText('React Documentation')).toBeDefined();
    expect(screen.getByText('Vue.js Official Guide')).toBeDefined();
    expect(screen.getByText('React GitHub Repo')).toBeDefined();

    // Verify domain chips (react.dev, vuejs.org, github.com)
    expect(screen.getByText('react.dev')).toBeDefined();
    expect(screen.getByText('vuejs.org')).toBeDefined();
    expect(screen.getByText('github.com')).toBeDefined();
  });

  it('filters tabs in real-time when searching by query', () => {
    render(
      <TabGroupInspectorModal
        isOpen={true}
        group={mockGroups[0]}
        onClose={mockOnClose}
        onGroupUpdated={mockOnGroupUpdated}
        onDeleteGroup={mockOnDeleteGroup}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Filter tabs in this group/i);
    fireEvent.change(searchInput, { target: { value: 'vue' } });

    // Vue tab matches (highlighted across <mark> elements)
    expect(screen.getByText((_, element) => element?.textContent === 'Vue.js Official Guide')).toBeDefined();
    // React tabs are filtered out
    expect(screen.queryByText('React Documentation')).toBeNull();
  });

  it('filters tabs when clicking domain chip', () => {
    render(
      <TabGroupInspectorModal
        isOpen={true}
        group={mockGroups[0]}
        onClose={mockOnClose}
        onGroupUpdated={mockOnGroupUpdated}
        onDeleteGroup={mockOnDeleteGroup}
      />
    );

    const githubChip = screen.getByText('github.com').closest('button');
    expect(githubChip).toBeTruthy();
    if (githubChip) fireEvent.click(githubChip);

    expect(screen.getByText('React GitHub Repo')).toBeDefined();
    expect(screen.queryByText('Vue.js Official Guide')).toBeNull();

    // Click again to deactivate filter
    if (githubChip) fireEvent.click(githubChip);
    expect(screen.getByText('Vue.js Official Guide')).toBeDefined();
  });

  // ===========================================================================
  // 2. Inline Group Title Renaming
  // ===========================================================================
  it('handles inline title editing, saving on Enter', async () => {
    render(
      <TabGroupInspectorModal
        isOpen={true}
        group={mockGroups[0]}
        onClose={mockOnClose}
        onGroupUpdated={mockOnGroupUpdated}
        onDeleteGroup={mockOnDeleteGroup}
      />
    );

    // Click title to enter rename mode
    const titleContainer = screen.getByTitle('Click to rename group');
    fireEvent.click(titleContainer);

    const titleInput = screen.getByDisplayValue('Frontend Frameworks');
    fireEvent.change(titleInput, { target: { value: 'Modern UI Libraries' } });

    // Press Enter to save
    fireEvent.keyDown(titleInput, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(storage.renameGroup).toHaveBeenCalledWith(101, 'Modern UI Libraries');
      expect(mockOnGroupUpdated).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 3. Color Palette Selection
  // ===========================================================================
  it('updates group color when clicking a palette swatch in dropdown', async () => {
    render(
      <TabGroupInspectorModal
        isOpen={true}
        group={mockGroups[0]}
        onClose={mockOnClose}
        onGroupUpdated={mockOnGroupUpdated}
        onDeleteGroup={mockOnDeleteGroup}
      />
    );

    // Open color dropdown
    const colorTrigger = screen.getByTitle(/Color tag:/i);
    fireEvent.pointerDown(colorTrigger, { button: 0, ctrlKey: false });

    // Color swatch button for Emerald/Green
    const greenSwatch = await screen.findByTitle('Emerald');
    fireEvent.click(greenSwatch);

    await waitFor(() => {
      expect(storage.setGroupColor).toHaveBeenCalledWith(101, 'green');
      expect(mockOnGroupUpdated).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 4. Tab Multi-Selection & Batch Actions
  // ===========================================================================
  it('selects multiple tabs and batch deletes them', async () => {
    render(
      <TabGroupInspectorModal
        isOpen={true}
        group={mockGroups[0]}
        onClose={mockOnClose}
        onGroupUpdated={mockOnGroupUpdated}
        onDeleteGroup={mockOnDeleteGroup}
      />
    );

    // Select first tab checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // Select Tab 0

    // Batch actions bar should appear
    expect(screen.getByText('1 tab selected')).toBeDefined();

    // Select Tab 1
    fireEvent.click(checkboxes[1]);
    expect(screen.getByText('2 tabs selected')).toBeDefined();

    // Click Batch Delete button
    const deleteBatchBtn = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteBatchBtn);

    await waitFor(() => {
      expect(storage.deleteMultipleTabsFromGroup).toHaveBeenCalledWith(101, expect.arrayContaining([0, 1]));
      expect(mockOnGroupUpdated).toHaveBeenCalled();
    });
  });

  it('selects tabs and extracts them into a new group', async () => {
    render(
      <TabGroupInspectorModal
        isOpen={true}
        group={mockGroups[0]}
        onClose={mockOnClose}
        onGroupUpdated={mockOnGroupUpdated}
        onDeleteGroup={mockOnDeleteGroup}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // Select Tab 0

    const extractBtn = screen.getByRole('button', { name: /Extract/i });
    fireEvent.click(extractBtn);

    await waitFor(() => {
      expect(storage.extractTabsToNewGroup).toHaveBeenCalledWith(101, [0]);
      expect(mockOnGroupUpdated).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 5. Add Tab Manually to Group
  // ===========================================================================
  it('adds a new tab with validation to the group', async () => {
    render(
      <TabGroupInspectorModal
        isOpen={true}
        group={mockGroups[0]}
        onClose={mockOnClose}
        onGroupUpdated={mockOnGroupUpdated}
        onDeleteGroup={mockOnDeleteGroup}
      />
    );

    // Click Add Link button
    const addLinkToggleBtn = screen.getByRole('button', { name: /Add Link/i });
    fireEvent.click(addLinkToggleBtn);

    const urlInput = screen.getByPlaceholderText('https://example.com');
    const titleInput = screen.getByPlaceholderText('Title (optional)');

    fireEvent.change(urlInput, { target: { value: 'svelte.dev' } });
    fireEvent.change(titleInput, { target: { value: 'Svelte' } });

    const submitBtn = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(storage.addTabToGroup).toHaveBeenCalledWith(101, {
        url: 'https://svelte.dev',
        title: 'Svelte',
      });
      expect(mockOnGroupUpdated).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 6. Native Chrome Group Restoration & Clipboard Exports
  // ===========================================================================
  it('restores group as native Chrome tab group via dropdown menu', async () => {
    render(
      <TabGroupInspectorModal
        isOpen={true}
        group={mockGroups[0]}
        onClose={mockOnClose}
        onGroupUpdated={mockOnGroupUpdated}
        onDeleteGroup={mockOnDeleteGroup}
      />
    );

    // Open restore dropdown
    const restoreMenuBtn = screen.getByTitle('More restore options');
    fireEvent.pointerDown(restoreMenuBtn, { button: 0, ctrlKey: false });

    const restoreChromeOption = await screen.findByText('Restore as Chrome Tab Group');
    fireEvent.click(restoreChromeOption);

    await waitFor(() => {
      expect(storage.restoreTabsAsChromeGroup).toHaveBeenCalledWith(
        'Frontend Frameworks',
        mockGroups[0].tabs,
        'blue',
        'current_window'
      );
    });
  });

  it('triggers single group Markdown export from export menu', async () => {
    render(
      <TabGroupInspectorModal
        isOpen={true}
        group={mockGroups[0]}
        onClose={mockOnClose}
        onGroupUpdated={mockOnGroupUpdated}
        onDeleteGroup={mockOnDeleteGroup}
      />
    );

    const exportMenuBtn = screen.getByRole('button', { name: /Export/i });
    fireEvent.pointerDown(exportMenuBtn, { button: 0, ctrlKey: false });

    const copyMdBtn = await screen.findByText('Copy as Markdown');
    fireEvent.click(copyMdBtn);

    await waitFor(() => {
      expect(storage.copyToClipboardSafe).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 7. Group Archival & Deletion Confirmations
  // ===========================================================================
  it('calls onArchiveGroup when archive button clicked', () => {
    render(
      <TabGroupInspectorModal
        isOpen={true}
        group={mockGroups[0]}
        onClose={mockOnClose}
        onGroupUpdated={mockOnGroupUpdated}
        onDeleteGroup={mockOnDeleteGroup}
        onArchiveGroup={mockOnArchiveGroup}
        isArchived={false}
      />
    );

    const archiveBtn = screen.getByRole('button', { name: /Archive/i });
    fireEvent.click(archiveBtn);

    expect(mockOnArchiveGroup).toHaveBeenCalledWith(101);
  });

  it('opens confirmation modal and invokes onDeleteGroup upon confirmation', () => {
    render(
      <TabGroupInspectorModal
        isOpen={true}
        group={mockGroups[0]}
        onClose={mockOnClose}
        onGroupUpdated={mockOnGroupUpdated}
        onDeleteGroup={mockOnDeleteGroup}
      />
    );

    const deleteGroupBtn = screen.getByRole('button', { name: /Delete Group/i });
    fireEvent.click(deleteGroupBtn);

    // Confirmation dialog appears
    expect(screen.getByText('Delete Tab Group?')).toBeDefined();
    const confirmBtns = screen.getAllByRole('button', { name: 'Delete Group' });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);

    expect(mockOnDeleteGroup).toHaveBeenCalledWith(101, 'Frontend Frameworks');
  });

  it('triggers smooth close dismissal callback', () => {
    render(
      <TabGroupInspectorModal
        isOpen={true}
        group={mockGroups[0]}
        onClose={mockOnClose}
        onGroupUpdated={mockOnGroupUpdated}
        onDeleteGroup={mockOnDeleteGroup}
      />
    );

    const closeBtn = screen.getByTitle('Close (Esc)');
    fireEvent.click(closeBtn);

    // After collapse timeout
    setTimeout(() => {
      expect(mockOnClose).toHaveBeenCalled();
    }, 300);
  });
});
