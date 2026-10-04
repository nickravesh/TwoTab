import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConsentDialog } from './ConsentDialog';
import { ProgressDialog } from './ProgressDialog';
import { GroupingPreviewDialog } from './GroupingPreviewDialog';
import { CohesionRing } from './CohesionRing';
import { VectorSpectrum } from './VectorSpectrum';
import { SemanticConstellation } from './SemanticConstellation';
import type { ClusterGroup } from '@/lib/semantic';
import type { Tab } from '@/lib/storage';

describe('Semantic UI Components DOM Rendering & Interaction Suite', () => {
  describe('<ConsentDialog />', () => {
    it('renders consent disclosure with model size, privacy guarantees, and action buttons', () => {
      const handleConfirm = vi.fn();
      const handleOpenChange = vi.fn();

      render(
        <ConsentDialog
          open={true}
          onOpenChange={handleOpenChange}
          onConfirm={handleConfirm}
        />
      );

      expect(screen.getByText('Enable Intelligent Tab Grouping')).toBeDefined();
      expect(screen.getByText(/~90 MB One-Time Download/i)).toBeDefined();
      expect(screen.getByText(/100% Local & Private/i)).toBeDefined();
      expect(screen.getByText(/Works Offline/i)).toBeDefined();

      const downloadBtn = screen.getByRole('button', { name: /Download & Enable/i });
      fireEvent.click(downloadBtn);

      expect(handleOpenChange).toHaveBeenCalledWith(false);
      expect(handleConfirm).toHaveBeenCalled();
    });

    it('cancels without confirming when Cancel button is clicked', () => {
      const handleConfirm = vi.fn();
      const handleOpenChange = vi.fn();

      render(
        <ConsentDialog
          open={true}
          onOpenChange={handleOpenChange}
          onConfirm={handleConfirm}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelBtn);

      expect(handleOpenChange).toHaveBeenCalledWith(false);
      expect(handleConfirm).not.toHaveBeenCalled();
    });
  });

  describe('<ProgressDialog />', () => {
    it('renders downloading stage with progress percentage and file info', () => {
      render(
        <ProgressDialog
          open={true}
          stage="downloading"
          downloadProgress={{
            status: 'progress',
            file: 'onnx/model.onnx',
            progress: 45.6,
          }}
          error={null}
        />
      );

      expect(screen.getByText('Downloading Local AI Model...')).toBeDefined();
      expect(screen.getByText(/46%/)).toBeDefined();
    });

    it('displays file-specific details for config and tokenizer downloads without progress percentage', () => {
      render(
        <ProgressDialog
          open={true}
          stage="downloading"
          downloadProgress={{
            status: 'initiate',
            file: 'tokenizer.json',
          }}
          error={null}
        />
      );

      expect(screen.getByText(/Acquiring tokenizer\.json into local cache\.\.\./i)).toBeDefined();
    });

    it('triggers onCancel when Cancel button is clicked during downloading', () => {
      const handleCancel = vi.fn();
      render(
        <ProgressDialog
          open={true}
          stage="downloading"
          downloadProgress={null}
          error={null}
          onCancel={handleCancel}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelBtn);
      expect(handleCancel).toHaveBeenCalledTimes(1);
    });

    it('renders loading and embedding stages correctly', () => {
      const { rerender } = render(
        <ProgressDialog
          open={true}
          stage="loading"
          downloadProgress={null}
          error={null}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('Initializing ONNX WebAssembly Runtime...')).toBeDefined();

      rerender(
        <ProgressDialog
          open={true}
          stage="embedding"
          downloadProgress={null}
          error={null}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('Analyzing Tab Semantics...')).toBeDefined();
    });

    it('renders error stage with error message and close button', () => {
      const handleCancel = vi.fn();
      render(
        <ProgressDialog
          open={true}
          stage="error"
          downloadProgress={null}
          error="Network timeout downloading ONNX weights"
          onCancel={handleCancel}
        />
      );

      expect(screen.getByText('Analysis Failed')).toBeDefined();
      expect(screen.getByText('Network timeout downloading ONNX weights')).toBeDefined();

      const closeBtns = screen.getAllByRole('button', { name: /Close/i });
      fireEvent.click(closeBtns[0]);
      expect(handleCancel).toHaveBeenCalled();
    });
  });

  describe('<GroupingPreviewDialog />', () => {
    const mockClusters: ClusterGroup[] = [
      {
        id: 'cluster-1',
        name: 'Django & Python Web Development',
        color: 'blue',
        coherenceScore: 0.88,
        tabs: [
          { title: 'Django Authentication', url: 'https://docs.djangoproject.com/en/5.0/topics/auth/' },
          { title: 'Django REST Framework', url: 'https://www.django-rest-framework.org/' },
        ],
      },
      {
        id: 'cluster-2',
        name: 'PostgreSQL Database Optimization',
        color: 'green',
        coherenceScore: 0.82,
        tabs: [
          { title: 'PostgreSQL Indexes', url: 'https://www.postgresql.org/docs/current/indexes.html' },
          { title: 'EXPLAIN ANALYZE Guide', url: 'https://pgmustard.com/docs/explain' },
        ],
      },
    ];

    const mockUngrouped: Tab[] = [
      { title: 'Radiohead Spotify', url: 'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb' },
    ];

    it('renders proposed clusters, tab lists, ungrouped bucket, and count labels', () => {
      const handleApply = vi.fn();
      const handleCancel = vi.fn();
      const handleOpenChange = vi.fn();

      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={handleOpenChange}
          clusters={mockClusters}
          ungroupedTabs={mockUngrouped}
          onApply={handleApply}
          onCancel={handleCancel}
        />
      );

      expect(screen.getByText('Review Intelligent Grouping Proposal')).toBeDefined();
      expect(screen.getByText('Django & Python Web Development')).toBeDefined();
      expect(screen.getByText('PostgreSQL Database Optimization')).toBeDefined();
      expect(screen.getByText('Django Authentication')).toBeDefined();
      expect(screen.getByText(/Ungrouped Tabs/i)).toBeDefined();
    });

    it('allows in-place renaming of a proposed cluster group', async () => {
      const handleApply = vi.fn();
      const handleCancel = vi.fn();
      const handleOpenChange = vi.fn();

      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={handleOpenChange}
          clusters={mockClusters}
          ungroupedTabs={mockUngrouped}
          onApply={handleApply}
          onCancel={handleCancel}
        />
      );

      const renameBtns = screen.getAllByTitle('Rename group');
      fireEvent.click(renameBtns[0]);

      const editInput = screen.getByDisplayValue('Django & Python Web Development');
      fireEvent.change(editInput, { target: { value: 'Custom Python Backend Suite' } });

      const saveBtn = screen.getByTitle('Save name');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText('Custom Python Backend Suite')).toBeDefined();
      });

      const applyBtn = screen.getByRole('button', { name: /Apply Grouping/i });
      fireEvent.click(applyBtn);

      await waitFor(() => {
        expect(handleApply).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ name: 'Custom Python Backend Suite' }),
          ]),
          mockUngrouped
        );
      });
    });

    it('flushes in-progress rename automatically when Apply Grouping is clicked without hitting Enter', async () => {
      const handleApply = vi.fn();
      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={vi.fn()}
          clusters={mockClusters}
          ungroupedTabs={mockUngrouped}
          onApply={handleApply}
          onCancel={vi.fn()}
        />
      );

      const renameBtns = screen.getAllByTitle('Rename group');
      fireEvent.click(renameBtns[0]);

      const editInput = screen.getByDisplayValue('Django & Python Web Development');
      fireEvent.change(editInput, { target: { value: 'Flushed Without Enter' } });

      // Click Apply directly while input is active
      const applyBtn = screen.getByRole('button', { name: /Apply Grouping/i });
      fireEvent.click(applyBtn);

      await waitFor(() => {
        expect(handleApply).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ name: 'Flushed Without Enter' }),
          ]),
          mockUngrouped
        );
      });
    });

    it('cancels rename on Escape key without modifying the cluster name', () => {
      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={vi.fn()}
          clusters={mockClusters}
          ungroupedTabs={mockUngrouped}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const renameBtns = screen.getAllByTitle('Rename group');
      fireEvent.click(renameBtns[0]);

      const editInput = screen.getByDisplayValue('Django & Python Web Development');
      fireEvent.change(editInput, { target: { value: 'Cancelled Change' } });
      fireEvent.keyDown(editInput, { key: 'Escape' });

      expect(screen.queryByDisplayValue('Cancelled Change')).toBeNull();
      expect(screen.getByText('Django & Python Web Development')).toBeDefined();
    });

    it('gracefully renders tabs with internal or malformed URLs without crashing', () => {
      const edgeCaseClusters: ClusterGroup[] = [
        {
          id: 'cluster-edge',
          name: 'Edge Case Tabs',
          color: 'purple',
          coherenceScore: 0.9,
          tabs: [
            { title: 'Chrome Settings', url: 'chrome://settings' },
            { title: 'Blank Tab', url: 'about:blank' },
            { title: 'Malformed URL Tab', url: 'ht tp://broken url/' },
          ],
        },
      ];

      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={vi.fn()}
          clusters={edgeCaseClusters}
          ungroupedTabs={[]}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('Chrome Settings')).toBeDefined();
      expect(screen.getByText('Blank Tab')).toBeDefined();
      expect(screen.getByText('Malformed URL Tab')).toBeDefined();
    });

    it('renders empty fallback state when no clusters could be formed', () => {
      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={vi.fn()}
          clusters={[]}
          ungroupedTabs={mockUngrouped}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('No confident groups found')).toBeDefined();
    });

    it('renders proposal cards with semantic cohesion and domain summaries', () => {
      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={vi.fn()}
          clusters={mockClusters}
          ungroupedTabs={mockUngrouped}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('Django & Python Web Development')).toBeDefined();
      expect(screen.getAllByText(/Cohesion/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText('2 tabs').length).toBeGreaterThan(0);
    });

    it('dynamically excludes a tab from a cluster using the ✕ button, moving it to ungrouped', () => {
      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={vi.fn()}
          clusters={mockClusters}
          ungroupedTabs={mockUngrouped}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const excludeBtns = screen.getAllByTitle('Exclude from group');
      expect(excludeBtns.length).toBeGreaterThan(0);

      // Exclude first tab (Django Authentication)
      fireEvent.click(excludeBtns[0]);

      // Because cluster-1 now only had 1 tab remaining, that cluster dissolved into ungrouped
      expect(screen.getByText(/Ungrouped Tabs/i)).toBeDefined();
    });

    it('re-clusters dynamically when granularity preset buttons are clicked', () => {
      const mockItems = [
        {
          tab: { title: 'Django Auth', url: 'https://docs.djangoproject.com/en/5.0/topics/auth/' },
          embedding: new Float32Array(384).fill(0.1),
        },
        {
          tab: { title: 'Django REST', url: 'https://www.django-rest-framework.org/' },
          embedding: new Float32Array(384).fill(0.1),
        },
        {
          tab: { title: 'PostgreSQL', url: 'https://www.postgresql.org/' },
          embedding: new Float32Array(384).fill(0.9),
        },
        {
          tab: { title: 'Postgres Explain', url: 'https://pgmustard.com/' },
          embedding: new Float32Array(384).fill(0.9),
        },
      ];

      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={vi.fn()}
          clusters={mockClusters}
          ungroupedTabs={mockUngrouped}
          items={mockItems}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('Granularity:')).toBeDefined();
      const broadBtn = screen.getByRole('button', { name: 'Broad Themes' });
      fireEvent.click(broadBtn);

      const focusedBtn = screen.getByRole('button', { name: 'Tight & Focused' });
      fireEvent.click(focusedBtn);
    });

    it('displays cached scan badge and relative time when cachedTimestamp is provided', () => {
      const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={vi.fn()}
          clusters={mockClusters}
          ungroupedTabs={mockUngrouped}
          cachedTimestamp={fiveMinsAgo}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText(/Cached scan · 5m ago/i)).toBeDefined();
    });

    it('triggers onRescan directly when Re-scan button is clicked without custom edits', () => {
      const handleRescan = vi.fn();
      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={vi.fn()}
          clusters={mockClusters}
          ungroupedTabs={mockUngrouped}
          cachedTimestamp={Date.now()}
          onRescan={handleRescan}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const rescanBtn = screen.getByRole('button', { name: /Re-scan/i });
      fireEvent.click(rescanBtn);
      expect(handleRescan).toHaveBeenCalledTimes(1);
    });

    it('guards re-scan with a confirmation banner when custom edits have been made', () => {
      const handleRescan = vi.fn();
      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={vi.fn()}
          clusters={mockClusters}
          ungroupedTabs={mockUngrouped}
          cachedTimestamp={Date.now()}
          onRescan={handleRescan}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      // Make a custom edit: rename cluster
      const renameBtns = screen.getAllByTitle('Rename group');
      fireEvent.click(renameBtns[0]);
      const editInput = screen.getByDisplayValue('Django & Python Web Development');
      fireEvent.change(editInput, { target: { value: 'Modified Name' } });
      const saveBtn = screen.getByTitle('Save name');
      fireEvent.click(saveBtn);

      // Click Re-scan
      const rescanBtn = screen.getByRole('button', { name: /Re-scan/i });
      fireEvent.click(rescanBtn);

      // Verify safety confirmation banner is displayed
      expect(screen.getByText(/Running a fresh scan will recalculate all groups from scratch/i)).toBeDefined();
      expect(handleRescan).not.toHaveBeenCalled();

      // Click confirm Re-scan button in banner
      const confirmBtns = screen.getAllByRole('button', { name: /Re-scan/i });
      const bannerConfirmBtn = confirmBtns[confirmBtns.length - 1];
      fireEvent.click(bannerConfirmBtn);
      expect(handleRescan).toHaveBeenCalledTimes(1);
    });

    it('filters visible tabs in cards when search query matches specific tabs', () => {
      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={vi.fn()}
          clusters={mockClusters}
          ungroupedTabs={mockUngrouped}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const searchInput = screen.getByPlaceholderText(/Search tabs or domains/i);
      fireEvent.change(searchInput, { target: { value: 'Authentication' } });

      // Tab matching "Authentication" should be visible
      expect(screen.getByText('Django Authentication')).toBeDefined();
      // Tab not matching should be hidden
      expect(screen.queryByText('Django REST Framework')).toBeNull();
      // Match summary in card footer
      expect(screen.getByText('1 of 2 tabs match')).toBeDefined();
    });
  });

  describe('<CohesionRing />', () => {
    it('renders circular activity ring with accurate percentage label', () => {
      const { container } = render(<CohesionRing score={0.88} size={36} showLabel={true} />);
      expect(screen.getByText('88% Cohesion')).toBeDefined();
      const circle = container.querySelector('circle.stroke-emerald-500');
      expect(circle).toBeDefined();
    });
  });

  describe('<VectorSpectrum />', () => {
    it('renders 12 energy bars for a given latent embedding', () => {
      const dummyVec = new Float32Array(384);
      for (let i = 0; i < 384; i++) dummyVec[i] = Math.sin(i * 0.1);

      const { container } = render(<VectorSpectrum embedding={dummyVec} color="blue" height={16} />);
      const bars = container.querySelectorAll('span.w-\\[3px\\]');
      expect(bars.length).toBe(12);
    });
  });

  describe('<SemanticConstellation />', () => {
    it('renders star map with projected points, connection lines, and handles cluster selection', () => {
      const handleSelect = vi.fn();
      const mockPoints = [
        {
          id: 'pt-1',
          tab: { title: 'React Hooks Guide', url: 'https://react.dev/reference/react' },
          x: 0.3,
          y: 0.4,
          clusterId: 'c-react',
          clusterName: 'React Documentation',
          clusterColor: 'cyan' as const,
          coherence: 0.92,
        },
        {
          id: 'pt-2',
          tab: { title: 'React useEffect', url: 'https://react.dev/reference/react/useEffect' },
          x: 0.35,
          y: 0.45,
          clusterId: 'c-react',
          clusterName: 'React Documentation',
          clusterColor: 'cyan' as const,
          coherence: 0.92,
        },
      ];

      const { container } = render(
        <SemanticConstellation
          points={mockPoints}
          selectedClusterId={null}
          onSelectCluster={handleSelect}
        />
      );

      expect(screen.getByText('Semantic Constellation Map')).toBeDefined();
      expect(screen.getByText('2 nodes')).toBeDefined();

      // Check SVG nodes rendered
      const circles = container.querySelectorAll('circle');
      expect(circles.length).toBeGreaterThan(0);

      // Check line connecting nodes to centroid in canvas SVG
      const canvasSvg = container.querySelector('svg[viewBox="0 0 800 560"]');
      const lines = canvasSvg?.querySelectorAll('line');
      expect(lines?.length).toBe(2);

      // Click legend item or centroid to select cluster
      const clusterLabels = screen.getAllByText('React Documentation');
      expect(clusterLabels.length).toBeGreaterThan(0);
      fireEvent.click(clusterLabels[0]);
      expect(handleSelect).toHaveBeenCalledWith('c-react');
    });

    it('handles interactive zoom in and zoom out controls cleanly', () => {
      const { container } = render(
        <SemanticConstellation
          points={[
            {
              id: 'p1',
              tab: { title: 'Node 1', url: 'https://example.com/1' },
              x: 0.4,
              y: 0.4,
            },
          ]}
        />
      );

      const zoomInBtn = screen.getByTitle('Zoom in');
      const zoomOutBtn = screen.getByTitle('Zoom out');

      expect(screen.getByText('100%')).toBeDefined();
      fireEvent.click(zoomInBtn);
      expect(screen.getByText('125%')).toBeDefined();

      fireEvent.click(zoomOutBtn);
      expect(screen.getByText('100%')).toBeDefined();
    });
  });

  describe('Advanced Studio Controls & Two-Way Tab Flow', () => {
    const mockClusters: ClusterGroup[] = [
      {
        id: 'c-web',
        name: 'Web Frameworks',
        color: 'blue',
        coherenceScore: 0.85,
        tabs: [
          { title: 'React Documentation', url: 'https://react.dev' },
          { title: 'Next.js Framework', url: 'https://nextjs.org' },
        ],
      },
    ];

    const mockUngrouped: Tab[] = [
      { title: 'Vue.js Progressive Framework', url: 'https://vuejs.org' },
    ];

    it('filters tabs in real-time when typing in studio search input', () => {
      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={vi.fn()}
          clusters={mockClusters}
          ungroupedTabs={mockUngrouped}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search tabs or domains...');
      fireEvent.change(searchInput, { target: { value: 'React' } });

      expect(screen.getByText('React Documentation')).toBeDefined();
      expect(screen.queryByText('Vue.js Progressive Framework')).toBeNull();

      // Clear search via clear button
      const clearBtn = screen.getByTitle('Clear search');
      fireEvent.click(clearBtn);

      expect(screen.getByText('Vue.js Progressive Framework')).toBeDefined();
    });

    it('dissolves an entire cluster into ungrouped with one click on the trash button', () => {
      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={vi.fn()}
          clusters={mockClusters}
          ungroupedTabs={mockUngrouped}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const dissolveBtn = screen.getByTitle('Dissolve group into ungrouped');
      fireEvent.click(dissolveBtn);

      // Web Frameworks should no longer be a cluster
      expect(screen.queryByText('Web Frameworks')).toBeNull();
      // All its tabs are now in Ungrouped
      expect(screen.getByText(/Ungrouped Tabs \(3 tabs\)/i)).toBeDefined();
    });

    it('allows moving an ungrouped tab into an existing group', async () => {
      render(
        <GroupingPreviewDialog
          open={true}
          onOpenChange={vi.fn()}
          clusters={mockClusters}
          ungroupedTabs={mockUngrouped}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      // "Move to" trigger button
      const moveBtns = screen.getAllByRole('button', { name: /Move to/i });
      expect(moveBtns.length).toBeGreaterThan(0);
      fireEvent.pointerDown(moveBtns[0]);

      // Wait for Radix portal menu item to open
      await waitFor(() => {
        expect(screen.getAllByText('Web Frameworks').length).toBeGreaterThan(0);
      });
      const groupMenuItems = screen.getAllByText('Web Frameworks');
      fireEvent.click(groupMenuItems[groupMenuItems.length - 1]);

      // Group now has 3 tabs
      await waitFor(() => {
        expect(screen.getByText('3 tabs')).toBeDefined();
      });
    });
  });
});
