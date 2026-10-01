import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConsentDialog } from './ConsentDialog';
import { ProgressDialog } from './ProgressDialog';
import { GroupingPreviewDialog } from './GroupingPreviewDialog';
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
  });
});
