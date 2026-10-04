// =============================================================================
// TwoTab Intelligent Tab Grouping — Review Proposal Studio
// =============================================================================
// A clean, spacious, Apple-grade productivity studio for reviewing and fine-tuning
// intelligent tab organization before applying changes.
//
// Philosophy: "Simple on the surface, thoughtful underneath."
// 1. Spacious, breathable responsive card deck with real whitespace (gap-5 / gap-6).
// 2. High-legibility tab cards: full titles, real favicons, domain summaries.
// 3. Meaningful AI insight: subtle semantic cohesion score and domain breakdown.
// 4. Effortless 2-way controls: inline rename, quick exclude (✕), dissolve, color picker.
// 5. Reversible ungrouped shelf: 1-click "Move to" and "New Group".
// 6. Fast, responsive search and in-memory granularity adjustment.
// =============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  ShieldCheck,
  Check,
  Edit2,
  X,
  HelpCircle,
  ChevronDown,
  Search,
  Trash2,
  FolderPlus,
  MoreHorizontal,
  ChevronRight,
  Clock,
  RotateCcw,
} from 'lucide-react';
import type { Tab, TabGroupColor } from '@/lib/storage';
import type { ClusterGroup } from '@/lib/semantic/types';
import { clusterTabs } from '@/lib/semantic/clustering';
import { cn } from '@/lib/utils';

export interface GroupingPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusters: ClusterGroup[];
  ungroupedTabs: Tab[];
  items?: Array<{ tab: Tab; embedding: Float32Array }>;
  initialThreshold?: number;
  cachedTimestamp?: number | null;
  onRescan?: () => void;
  onApply: (editedClusters: ClusterGroup[], ungrouped: Tab[]) => Promise<void>;
  onCancel: () => void;
}

const COLOR_SWATCHES: Array<{ color: TabGroupColor; label: string; hex: string }> = [
  { color: 'blue', label: 'Blue', hex: '#4f6df5' },
  { color: 'cyan', label: 'Cyan', hex: '#0284c7' },
  { color: 'green', label: 'Green', hex: '#10b981' },
  { color: 'yellow', label: 'Amber', hex: '#f59e0b' },
  { color: 'orange', label: 'Orange', hex: '#f97316' },
  { color: 'red', label: 'Rose', hex: '#f43f5e' },
  { color: 'pink', label: 'Orchid', hex: '#d946ef' },
  { color: 'purple', label: 'Violet', hex: '#8b5cf6' },
  { color: 'grey', label: 'Slate', hex: '#64748b' },
];

function formatRelativeTime(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return '1d ago';
}

const getSafeHost = (url?: string): string => {
  if (!url) return 'internal';
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'internal';
  } catch {
    return 'internal';
  }
};

const getHostInitial = (host: string): string => {
  const clean = host.replace(/^(docs\.|api\.|en\.|m\.)/, '');
  return (clean.charAt(0) || '•').toUpperCase();
};

export const GroupingPreviewDialog: React.FC<GroupingPreviewDialogProps> = ({
  open,
  onOpenChange,
  clusters,
  ungroupedTabs,
  items,
  initialThreshold = 0.70,
  cachedTimestamp,
  onRescan,
  onApply,
  onCancel,
}) => {
  const [editedClusters, setEditedClusters] = useState<ClusterGroup[]>([]);
  const [editedUngrouped, setEditedUngrouped] = useState<Tab[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [granularity, setGranularity] = useState<number>(initialThreshold);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasUserEdits, setHasUserEdits] = useState(false);
  const [pendingGranularity, setPendingGranularity] = useState<number | null>(null);
  const [confirmRescan, setConfirmRescan] = useState(false);
  const [isUngroupedExpanded, setIsUngroupedExpanded] = useState(true);

  useEffect(() => {
    if (open) {
      setEditedClusters(clusters.map((c) => ({ ...c })));
      setEditedUngrouped([...ungroupedTabs]);
      setEditingGroupId(null);
      setIsApplying(false);
      setGranularity(initialThreshold);
      setSearchQuery('');
      setHasUserEdits(false);
      setPendingGranularity(null);
      setIsUngroupedExpanded(true);
    }
  }, [open, clusters, ungroupedTabs, initialThreshold]);

  // Dynamic In-Memory Re-clustering on Granularity Change
  const applyGranularity = (newThreshold: number) => {
    setGranularity(newThreshold);
    setPendingGranularity(null);
    if (items && items.length >= 2) {
      const result = clusterTabs(items, {
        similarityThreshold: newThreshold,
        minimumGroupSize: 2,
      });
      setEditedClusters(result.clusters);
      setEditedUngrouped(result.ungroupedTabs);
      setEditingGroupId(null);
      setHasUserEdits(false);
    }
  };

  const handleGranularitySelect = (newThreshold: number) => {
    if (hasUserEdits) {
      setPendingGranularity(newThreshold);
    } else {
      applyGranularity(newThreshold);
    }
  };

  // In-place Rename Handlers
  const handleStartRename = (cluster: ClusterGroup) => {
    setEditingGroupId(cluster.id);
    setEditNameValue(cluster.name);
  };

  const handleSaveRename = (clusterId: string) => {
    if (editNameValue.trim()) {
      setEditedClusters((prev) =>
        prev.map((c) => (c.id === clusterId ? { ...c, name: editNameValue.trim() } : c))
      );
      setHasUserEdits(true);
    }
    setEditingGroupId(null);
  };

  // Color Swatch Change
  const handleChangeColor = (clusterId: string, newColor: TabGroupColor) => {
    setEditedClusters((prev) =>
      prev.map((c) => (c.id === clusterId ? { ...c, color: newColor } : c))
    );
    setHasUserEdits(true);
  };

  // 1-Click Tab Exclusion to Ungrouped (supports Tab reference or index)
  const handleExcludeTab = (clusterId: string, tabOrIndex: Tab | number) => {
    const targetCluster = editedClusters.find((c) => c.id === clusterId);
    if (!targetCluster) return;

    const excludedTab =
      typeof tabOrIndex === 'number' ? targetCluster.tabs[tabOrIndex] : tabOrIndex;
    if (!excludedTab) return;

    const remainingTabs = targetCluster.tabs.filter((t) => t !== excludedTab);

    let updatedClusters: ClusterGroup[];
    let updatedUngrouped = [...editedUngrouped, excludedTab];

    if (remainingTabs.length < 2) {
      if (remainingTabs.length === 1) {
        updatedUngrouped.push(remainingTabs[0]);
      }
      updatedClusters = editedClusters.filter((c) => c.id !== clusterId);
    } else {
      updatedClusters = editedClusters.map((c) =>
        c.id === clusterId ? { ...c, tabs: remainingTabs } : c
      );
    }

    setEditedClusters(updatedClusters);
    setEditedUngrouped(updatedUngrouped);
    setHasUserEdits(true);
  };

  // Dissolve an entire group into ungrouped
  const handleDissolveGroup = (clusterId: string) => {
    const targetCluster = editedClusters.find((c) => c.id === clusterId);
    if (!targetCluster) return;

    setEditedUngrouped((prev) => [...prev, ...targetCluster.tabs]);
    setEditedClusters((prev) => prev.filter((c) => c.id !== clusterId));
    setHasUserEdits(true);
  };

  // Re-assign an ungrouped tab to an existing group
  const handleAssignTabToGroup = (tabOrIndex: Tab | number, targetClusterId: string) => {
    const targetTab =
      typeof tabOrIndex === 'number' ? editedUngrouped[tabOrIndex] : tabOrIndex;
    if (!targetTab) return;

    const remainingUngrouped = editedUngrouped.filter((t) => t !== targetTab);
    const updatedClusters = editedClusters.map((c) =>
      c.id === targetClusterId ? { ...c, tabs: [...c.tabs, targetTab] } : c
    );

    setEditedUngrouped(remainingUngrouped);
    setEditedClusters(updatedClusters);
    setHasUserEdits(true);
  };

  // Create a new cluster group from an ungrouped tab
  const handleCreateGroupFromTab = (tabOrIndex: Tab | number) => {
    const targetTab =
      typeof tabOrIndex === 'number' ? editedUngrouped[tabOrIndex] : tabOrIndex;
    if (!targetTab) return;

    const remainingUngrouped = editedUngrouped.filter((t) => t !== targetTab);
    const host = getSafeHost(targetTab.url);
    const newGroup: ClusterGroup = {
      id: `group-custom-${Date.now()}`,
      name: host !== 'internal' && host !== 'unknown' ? host : targetTab.title || 'New Group',
      color: 'blue',
      coherenceScore: 1.0,
      tabs: [targetTab],
    };

    setEditedUngrouped(remainingUngrouped);
    setEditedClusters((prev) => [...prev, newGroup]);
    setHasUserEdits(true);
  };

  const handleTriggerRescan = () => {
    if (hasUserEdits) {
      setConfirmRescan(true);
    } else {
      onRescan?.();
    }
  };

  // Apply Changes Handler
  const handleConfirmApply = async () => {
    if (isApplying) return;
    setIsApplying(true);
    try {
      let clustersToApply = editedClusters;
      if (editingGroupId && editNameValue.trim()) {
        clustersToApply = editedClusters.map((c) =>
          c.id === editingGroupId ? { ...c, name: editNameValue.trim() } : c
        );
      }
      await onApply(clustersToApply, editedUngrouped);
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  };

  const totalTabsCount =
    editedClusters.reduce((sum, c) => sum + c.tabs.length, 0) + editedUngrouped.length;

  // Search filtering
  const cleanSearch = searchQuery.trim().toLowerCase();
  const filteredClusters = useMemo(() => {
    if (!cleanSearch) return editedClusters;
    return editedClusters.filter((c) => {
      const matchesName = c.name.toLowerCase().includes(cleanSearch);
      const matchesTab = c.tabs.some(
        (t) =>
          (t.title && t.title.toLowerCase().includes(cleanSearch)) ||
          t.url.toLowerCase().includes(cleanSearch)
      );
      return matchesName || matchesTab;
    });
  }, [editedClusters, cleanSearch]);

  const filteredUngrouped = useMemo(() => {
    if (!cleanSearch) return editedUngrouped;
    return editedUngrouped.filter(
      (t) =>
        (t.title && t.title.toLowerCase().includes(cleanSearch)) ||
        t.url.toLowerCase().includes(cleanSearch)
    );
  }, [editedUngrouped, cleanSearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col p-0 overflow-hidden rounded-3xl bg-card border border-border/80 ring-1 ring-black/10 dark:ring-white/10 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.4)] dark:shadow-[0_25px_70px_-15px_rgba(0,0,0,0.8)] transition-all duration-300 w-[92vw] max-w-[1240px] h-[86vh]">
        {/* Tier 1: Calm, Unified Command Bar (Header) — pr-12 ensures breathing room against dialog close X */}
        <DialogHeader className="shrink-0 pl-6 pr-12 sm:pr-14 py-4 border-b border-border/60 bg-muted/15">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Left: Purposeful Title, Cached Scan Badge & Tab Count */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-sm font-bold text-foreground tracking-tight">
                    Review Intelligent Grouping Proposal
                  </DialogTitle>
                  {cachedTimestamp && (
                    <Badge
                      variant="outline"
                      className="h-5 px-2 text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1 rounded-full shrink-0"
                      title={`Scanned ${new Date(cachedTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    >
                      <Clock className="w-2.5 h-2.5 text-emerald-500" />
                      <span>Cached scan · {formatRelativeTime(cachedTimestamp)}</span>
                    </Badge>
                  )}
                </div>
                <DialogDescription className="text-xs text-muted-foreground truncate mt-0.5">
                  Found {editedClusters.length}{' '}
                  {editedClusters.length === 1 ? 'semantic group' : 'semantic groups'} across{' '}
                  {totalTabsCount} {totalTabsCount === 1 ? 'tab' : 'tabs'}
                </DialogDescription>
              </div>
            </div>

            {/* Right: Granularity Pill, Minimal Search & Re-scan Button */}
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Granularity Pill Selector */}
              {items && items.length >= 2 && (
                <div className="hidden md:flex items-center gap-1 p-0.5 rounded-full bg-muted/60 border border-border/50 text-xs shadow-sm">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pl-2 pr-1">
                    Granularity:
                  </span>
                  {[
                    { value: 0.64, label: 'Broad', ariaLabel: 'Broad Themes' },
                    { value: 0.70, label: 'Balanced', ariaLabel: 'Balanced' },
                    { value: 0.76, label: 'Focused', ariaLabel: 'Tight & Focused' },
                  ].map((tier) => (
                    <button
                      key={tier.value}
                      type="button"
                      aria-label={tier.ariaLabel}
                      onClick={() => handleGranularitySelect(tier.value)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-[11px] font-medium transition-all',
                        Math.abs(granularity - tier.value) < 0.02
                          ? 'bg-card text-foreground font-semibold shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {tier.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Minimal Search Input */}
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 absolute left-3 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search tabs or domains..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-36 sm:w-44 focus:w-56 transition-all text-xs pl-8 pr-7 rounded-full bg-card border-border/60 shadow-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded-full"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* 1-Click Re-scan Button */}
              {onRescan && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTriggerRescan}
                  className="h-8 text-xs px-2.5 sm:px-3 rounded-full border-border/60 hover:bg-muted/60 gap-1.5 text-muted-foreground hover:text-foreground shadow-sm transition-all"
                  title="Run a fresh scan (bypasses 24-hour cache)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Re-scan</span>
                </Button>
              )}
            </div>
          </div>

          {/* Granularity Reset Confirmation Banner if Dirty */}
          {pendingGranularity !== null && (
            <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
              <span className="text-amber-800 dark:text-amber-200 font-medium text-xs">
                You have custom edits. Re-clustering will recalculate groups from scratch. Proceed?
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPendingGranularity(null)}
                  className="h-6 text-[11px] px-2.5 rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => applyGranularity(pendingGranularity)}
                  className="h-6 text-[11px] px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium"
                >
                  Re-cluster
                </Button>
              </div>
            </div>
          )}

          {/* Re-scan Confirmation Banner if Dirty */}
          {confirmRescan && (
            <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
              <span className="text-amber-800 dark:text-amber-200 font-medium text-xs">
                You have custom edits. Running a fresh scan will recalculate all groups from scratch. Proceed?
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmRescan(false)}
                  className="h-6 text-[11px] px-2.5 rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setConfirmRescan(false);
                    onRescan?.();
                  }}
                  className="h-6 text-[11px] px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium"
                >
                  Re-scan
                </Button>
              </div>
            </div>
          )}
        </DialogHeader>

        {/* Tier 2: Scrollable Main Body (Spacious Card Deck with Generous Gaps) */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-6 bg-muted/10">
          {filteredClusters.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto text-muted-foreground/50">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                {searchQuery ? 'No matching groups found' : 'No confident groups found'}
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {searchQuery
                  ? `No tabs or groups match "${searchQuery}". Try clearing your search.`
                  : 'The analyzed tabs did not reach the semantic similarity threshold to form groups. All tabs remain safely preserved.'}
              </p>
              {searchQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-xs rounded-xl"
                >
                  Clear Search Filter
                </Button>
              )}
            </div>
          ) : (
            <div
              className={cn(
                'grid gap-6',
                filteredClusters.length === 1
                  ? 'grid-cols-1 max-w-xl mx-auto'
                  : filteredClusters.length === 2
                  ? 'grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto'
                  : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
              )}
            >
              {filteredClusters.map((cluster) => {
                const swatch =
                  COLOR_SWATCHES.find((s) => s.color === cluster.color) || COLOR_SWATCHES[0];
                const tabCount = cluster.tabs.length;

                // Domain breakdown summary
                const domainCounts: Record<string, number> = {};
                for (const t of cluster.tabs) {
                  const h = getSafeHost(t.url);
                  domainCounts[h] = (domainCounts[h] || 0) + 1;
                }
                const topDomains = Object.entries(domainCounts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3);

                // In-card search filtering: show matching tabs or full list if group name matched
                const displayTabs = cleanSearch
                  ? cluster.tabs.filter(
                      (t) =>
                        (t.title && t.title.toLowerCase().includes(cleanSearch)) ||
                        t.url.toLowerCase().includes(cleanSearch)
                    )
                  : cluster.tabs;
                const visibleTabs = displayTabs.length > 0 ? displayTabs : cluster.tabs;

                return (
                  <div
                    key={cluster.id}
                    className="flex flex-col h-[380px] overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm hover:shadow-md hover:border-border transition-all group/card"
                  >
                    {/* Card Tier 1: Fixed Header */}
                    <div className="shrink-0 p-3.5 border-b border-border/40 bg-muted/15 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        {/* Title & Accent */}
                        <div className="flex items-center gap-2.5 flex-1 min-w-0 mr-1">
                          <span
                            className="w-1.5 h-5 rounded-full shrink-0 shadow-sm"
                            style={{ backgroundColor: swatch.hex }}
                          />
                          {editingGroupId === cluster.id ? (
                            <div className="flex items-center gap-1.5 flex-1 max-w-[200px] sm:max-w-xs">
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
                                className="h-7 w-7 text-primary hover:bg-primary/10 rounded-md shrink-0"
                                title="Save name"
                                aria-label="Save name"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                dir="auto"
                                className="font-semibold text-sm text-foreground tracking-tight truncate cursor-pointer hover:underline"
                                onClick={() => handleStartRename(cluster)}
                                style={{ unicodeBidi: 'plaintext' }}
                              >
                                {cluster.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleStartRename(cluster)}
                                className="opacity-40 group-hover/card:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition-opacity"
                                title="Rename group"
                                aria-label="Rename group"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Right: Badge, Dissolve & More Options */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge
                            variant="outline"
                            className="text-[11px] font-medium shrink-0 rounded-full px-2 py-0.5 bg-card"
                          >
                            {tabCount} {tabCount === 1 ? 'tab' : 'tabs'}
                          </Badge>

                          {/* Quick Dissolve Action */}
                          <button
                            type="button"
                            onClick={() => handleDissolveGroup(cluster.id)}
                            className="p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Dissolve group into ungrouped"
                            aria-label="Dissolve group into ungrouped"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          {/* More Options / Color Picker */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                title="Group options"
                                aria-label="Group options"
                              >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="p-2 min-w-[160px]">
                              <DropdownMenuLabel className="text-[10px] uppercase font-bold text-muted-foreground px-1 pb-1.5">
                                Group Color
                              </DropdownMenuLabel>
                              <div className="grid grid-cols-5 gap-2 p-1">
                                {COLOR_SWATCHES.map((s) => (
                                  <button
                                    key={s.color}
                                    type="button"
                                    onClick={() => handleChangeColor(cluster.id, s.color)}
                                    className={cn(
                                      'w-5 h-5 rounded-full border flex items-center justify-center transition-transform hover:scale-110 shadow-sm',
                                      cluster.color === s.color
                                        ? 'ring-2 ring-primary ring-offset-2'
                                        : 'border-transparent'
                                    )}
                                    style={{ backgroundColor: s.hex }}
                                    title={s.label}
                                  />
                                ))}
                              </div>
                              <DropdownMenuSeparator className="my-1.5" />
                              <DropdownMenuItem
                                onClick={() => handleDissolveGroup(cluster.id)}
                                className="text-xs py-1.5 cursor-pointer text-destructive focus:text-destructive flex items-center gap-1.5"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Dissolve Group</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Subtle Semantic Context Strip */}
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground/80 font-mono pt-0.5">
                        <span className="truncate mr-2">
                          {topDomains.map(([d]) => d).join(' · ')}
                        </span>
                        {typeof cluster.coherenceScore === 'number' && cluster.coherenceScore > 0 && (
                          <span className="shrink-0 flex items-center gap-1 font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10 text-[10px]">
                            <Sparkles className="w-2.5 h-2.5" />
                            {Math.round(cluster.coherenceScore * 100)}% Cohesion
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Tier 2: Scrollable Tab List (AGENTS.md § 5) */}
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2.5 space-y-1 scroll-fade-bottom">
                      {visibleTabs.map((tab, idx) => {
                        const host = getSafeHost(tab.url);
                        const initial = getHostInitial(host);

                        return (
                          <div
                            key={idx}
                            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-muted/50 text-xs transition-colors group/item"
                          >
                            {/* Local Favicon or Elegant Host Initial Token */}
                            {(tab as { favIconUrl?: string }).favIconUrl ? (
                              <img
                                src={(tab as { favIconUrl?: string }).favIconUrl}
                                alt=""
                                className="w-4 h-4 shrink-0 rounded-sm object-contain"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="w-4 h-4 shrink-0 rounded-full bg-muted/80 text-[8px] font-bold font-mono flex items-center justify-center text-foreground/80">
                                {initial}
                              </span>
                            )}
                            <span
                              dir="auto"
                              className="truncate flex-1 text-foreground/90 font-medium hover:text-foreground transition-colors"
                              style={{ unicodeBidi: 'plaintext' }}
                              title={tab.title || tab.url}
                            >
                              {tab.title || tab.url || 'Untitled Tab'}
                            </span>
                            <span className="text-[10px] text-muted-foreground/70 shrink-0 font-mono px-1.5 py-0.5 rounded bg-muted/40">
                              {host}
                            </span>

                            {/* 1-Click Tab Exclusion Button */}
                            <button
                              type="button"
                              onClick={() => handleExcludeTab(cluster.id, tab)}
                              className="opacity-0 group-hover/item:opacity-100 p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all shrink-0 ml-1"
                              title="Exclude from group"
                              aria-label="Exclude tab from group"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Card Tier 3: Fixed Footer */}
                    <div className="shrink-0 bg-card border-t border-border/40 px-3.5 py-2 flex justify-between items-center text-[11px] text-muted-foreground">
                      <span>
                        {cleanSearch && visibleTabs.length !== tabCount
                          ? `${visibleTabs.length} of ${tabCount} tabs match`
                          : `${tabCount} ${tabCount === 1 ? 'tab' : 'tabs'} included`}
                      </span>
                      <span className="text-muted-foreground/60 text-[10px]">Hover ✕ to exclude</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Ungrouped Tabs Section: Clean Collapsible Bottom Shelf */}
          {filteredUngrouped.length > 0 && (
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setIsUngroupedExpanded(!isUngroupedExpanded)}
                className="w-full flex items-center justify-between p-4 text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
              >
                <div className="flex items-center gap-2.5">
                  <ChevronRight
                    className={cn(
                      'w-4 h-4 transition-transform duration-200 text-muted-foreground',
                      isUngroupedExpanded ? 'rotate-90' : ''
                    )}
                  />
                  <span className="font-semibold text-foreground/90">
                    Ungrouped Tabs ({filteredUngrouped.length}{' '}
                    {filteredUngrouped.length === 1 ? 'tab' : 'tabs'})
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70" />
                  Preserved in your active window as individual tabs
                </span>
              </button>

              {isUngroupedExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-border/40 space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
                  {filteredUngrouped.map((tab, idx) => {
                    const host = getSafeHost(tab.url);
                    const initial = getHostInitial(host);

                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg group/un transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                          {(tab as { favIconUrl?: string }).favIconUrl ? (
                            <img
                              src={(tab as { favIconUrl?: string }).favIconUrl}
                              alt=""
                              className="w-4 h-4 shrink-0 rounded-sm object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <span className="w-4 h-4 shrink-0 rounded-full bg-muted/80 text-[8px] font-bold font-mono flex items-center justify-center text-foreground/80">
                              {initial}
                            </span>
                          )}
                          <span
                            dir="auto"
                            className="truncate flex-1 font-medium"
                            style={{ unicodeBidi: 'plaintext' }}
                            title={tab.title || tab.url}
                          >
                            {tab.title || tab.url || 'Untitled Tab'}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0 px-1.5 py-0.5 rounded bg-muted/40">
                            {host}
                          </span>
                        </div>

                        {/* Reversible Assignment Dropdown */}
                        <div className="opacity-70 group-hover/un:opacity-100 transition-opacity shrink-0 flex items-center gap-1">
                          {editedClusters.length > 0 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[11px] gap-1 text-primary hover:bg-primary/10 rounded-md font-medium"
                                >
                                  <span>Move to</span>
                                  <ChevronDown className="w-2.5 h-2.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="p-1.5 min-w-[160px] max-h-48 overflow-y-auto custom-scrollbar"
                              >
                                {editedClusters.map((c) => {
                                  const cSwatch =
                                    COLOR_SWATCHES.find((s) => s.color === c.color) ||
                                    COLOR_SWATCHES[0];
                                  return (
                                    <DropdownMenuItem
                                      key={c.id}
                                      onClick={() => handleAssignTabToGroup(tab, c.id)}
                                      className="text-xs py-1.5 cursor-pointer truncate flex items-center gap-2"
                                    >
                                      <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: cSwatch.hex }}
                                      />
                                      <span className="truncate">{c.name}</span>
                                    </DropdownMenuItem>
                                  );
                                })}
                                <DropdownMenuSeparator className="my-1" />
                                <DropdownMenuItem
                                  onClick={() => handleCreateGroupFromTab(tab)}
                                  className="text-xs py-1.5 cursor-pointer text-primary font-medium flex items-center gap-1.5"
                                >
                                  <FolderPlus className="w-3.5 h-3.5" />
                                  <span>New Group</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tier 3: Fixed Footer */}
        <DialogFooter className="shrink-0 bg-card border-t border-border px-6 py-4 relative z-10 flex sm:justify-between items-center">
          <p className="text-[11px] text-muted-foreground hidden sm:flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>A safety snapshot is automatically created before applying.</span>
          </p>
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isApplying}
              className="rounded-xl text-xs h-9 px-4 font-medium"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmApply}
              disabled={isApplying || (editedClusters.length === 0 && editedUngrouped.length === 0)}
              className="rounded-xl text-xs h-9 px-5 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              {isApplying
                ? 'Applying...'
                : editedClusters.length > 0
                ? `Apply Grouping (${editedClusters.length} ${
                    editedClusters.length === 1 ? 'group' : 'groups'
                  })`
                : `Apply Grouping (${editedUngrouped.length} ungrouped)`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
