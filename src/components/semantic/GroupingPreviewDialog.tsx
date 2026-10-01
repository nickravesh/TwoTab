// =============================================================================
// TwoTab Intelligent Tab Grouping — Interactive Preview & Confirmation Dialog
// =============================================================================
// Features:
// 1. In-memory proposal review before any persistent storage mutation
// 2. In-place editable group names and color tags
// 3. Clear representation of ungrouped/singleton tabs (zero data loss)
// 4. Conforms strictly to Three-Tier flex layout and semantic tokens (AGENTS.md § 5)
// 5. Pluralization `{count} {count === 1 ? 'tab' : 'tabs'}` (AGENTS.md § 6)
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  ShieldCheck,
  Check,
  Edit2,
  ExternalLink,
  Layers,
  HelpCircle,
} from 'lucide-react';
import type { Tab, TabGroupColor } from '@/lib/storage';
import type { ClusterGroup } from '@/lib/semantic/types';

interface GroupingPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusters: ClusterGroup[];
  ungroupedTabs: Tab[];
  onApply: (editedClusters: ClusterGroup[], ungrouped: Tab[]) => Promise<void>;
  onCancel: () => void;
}

const COLOR_CLASSES: Record<TabGroupColor, string> = {
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  yellow: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  pink: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  grey: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
};

const getSafeHost = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'internal';
  } catch {
    return 'unknown';
  }
};

export const GroupingPreviewDialog: React.FC<GroupingPreviewDialogProps> = ({
  open,
  onOpenChange,
  clusters,
  ungroupedTabs,
  onApply,
  onCancel,
}) => {
  const [editedClusters, setEditedClusters] = useState<ClusterGroup[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (open) {
      setEditedClusters(clusters.map((c) => ({ ...c })));
      setEditingGroupId(null);
      setIsApplying(false);
    }
  }, [open, clusters]);

  const handleStartRename = (cluster: ClusterGroup) => {
    setEditingGroupId(cluster.id);
    setEditNameValue(cluster.name);
  };

  const handleSaveRename = (clusterId: string) => {
    if (editNameValue.trim()) {
      setEditedClusters((prev) =>
        prev.map((c) => (c.id === clusterId ? { ...c, name: editNameValue.trim() } : c))
      );
    }
    setEditingGroupId(null);
  };

  const handleConfirmApply = async () => {
    try {
      setIsApplying(true);
      let clustersToApply = editedClusters;
      if (editingGroupId && editNameValue.trim()) {
        clustersToApply = editedClusters.map((c) =>
          c.id === editingGroupId ? { ...c, name: editNameValue.trim() } : c
        );
      }
      await onApply(clustersToApply, ungroupedTabs);
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  };

  const totalTabsCount =
    editedClusters.reduce((sum, c) => sum + c.tabs.length, 0) + ungroupedTabs.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] h-[85vh] flex flex-col p-0 overflow-hidden rounded-2xl bg-card border-border shadow-2xl">
        {/* Tier 1: Fixed Header */}
        <DialogHeader className="shrink-0 p-5 border-b border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Review Intelligent Grouping Proposal
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Found {editedClusters.length}{' '}
                  {editedClusters.length === 1 ? 'semantic group' : 'semantic groups'} across{' '}
                  {totalTabsCount} {totalTabsCount === 1 ? 'tab' : 'tabs'}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Safe Preview (In-Memory)</span>
            </div>
          </div>
        </DialogHeader>

        {/* Tier 2: Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 space-y-4">
          {editedClusters.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Layers className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm font-semibold text-foreground">No confident groups found</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                The analyzed tabs did not reach the semantic similarity threshold to form groups. All tabs remain safely preserved.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {editedClusters.map((cluster) => {
                const colorClass = COLOR_CLASSES[cluster.color] || COLOR_CLASSES.blue;
                const tabCount = cluster.tabs.length;

                return (
                  <div
                    key={cluster.id}
                    className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-2xs hover:border-border transition-colors"
                  >
                    {/* Cluster Header */}
                    <div className="flex items-center justify-between p-3 border-b border-border/40 bg-muted/30">
                      <div className="flex items-center gap-2 flex-1 min-w-0 mr-3">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorClass}`} />
                        {editingGroupId === cluster.id ? (
                          <div className="flex items-center gap-1.5 flex-1 max-w-sm">
                            <Input
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename(cluster.id);
                                if (e.key === 'Escape') setEditingGroupId(null);
                              }}
                              onBlur={() => handleSaveRename(cluster.id)}
                              autoFocus
                              className="h-7 text-xs font-semibold py-0"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleSaveRename(cluster.id)}
                              className="h-7 w-7 text-primary hover:bg-primary/10"
                              title="Save name"
                              aria-label="Save name"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-xs text-foreground truncate">
                              {cluster.name}
                            </span>
                            <button
                              onClick={() => handleStartRename(cluster)}
                              className="opacity-40 hover:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition-opacity"
                              title="Rename group"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      <Badge variant="outline" className="text-[11px] font-normal shrink-0">
                        {tabCount} {tabCount === 1 ? 'tab' : 'tabs'}
                      </Badge>
                    </div>

                    {/* Tab List */}
                    <div className="p-2.5 space-y-1.5">
                      {cluster.tabs.map((tab, idx) => {
                        const host = getSafeHost(tab.url);
                        const faviconUrl =
                          host !== 'internal' && host !== 'unknown'
                            ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
                            : '';

                        return (
                          <div
                            key={idx}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/40 text-xs transition-colors group"
                          >
                            {faviconUrl ? (
                              <img
                                src={faviconUrl}
                                alt=""
                                className="w-3.5 h-3.5 shrink-0 rounded-xs"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="w-3.5 h-3.5 shrink-0 rounded-xs bg-muted/60" />
                            )}
                            <span className="truncate flex-1 text-foreground/90 font-medium">
                              {tab.title || tab.url}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                              {host}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Ungrouped Tabs Section */}
          {ungroupedTabs.length > 0 && (
            <div className="rounded-xl border border-dashed border-border bg-muted/10 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Ungrouped Tabs ({ungroupedTabs.length}{' '}
                  {ungroupedTabs.length === 1 ? 'tab' : 'tabs'})
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <HelpCircle className="w-3 h-3" />
                  Preserved in a dedicated collection
                </span>
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                {ungroupedTabs.map((tab, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                    <span className="truncate flex-1">{tab.title || tab.url}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tier 3: Fixed Footer */}
        <DialogFooter className="shrink-0 bg-card border-t border-border p-4 relative z-10 flex sm:justify-between items-center">
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            A restorable safety backup snapshot will be created before applying.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isApplying}
              className="rounded-lg text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmApply}
              disabled={isApplying || editedClusters.length === 0}
              className="rounded-lg text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
            >
              <Check className="w-3.5 h-3.5" />
              {isApplying ? 'Applying...' : 'Apply Grouping'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
