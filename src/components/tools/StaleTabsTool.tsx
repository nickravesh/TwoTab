import React, { useState, useMemo } from 'react';
import { type TabGroup, type TabGroupColor, copyToClipboardSafe } from '@/lib/storage';
import {
  calculateAgeInDays,
  formatAgeLabel,
  extractTopDomainsFromTabs,
  archiveStaleGroups,
  consolidateStaleFragments,
  deleteStaleGroups,
  deleteSingleStaleTab,
  exportStaleTabsToMarkdown,
  getInactiveImpactSummary,
  type StaleGroupInfo,
  type InactiveTimeHorizon,
} from '@/lib/staleTabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Archive,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Check,
  CheckCircle2,
  ShieldCheck,
  Trash2,
  Layers,
  ExternalLink,
  Globe,
  FileText,
  Copy,
  Info,
  Sparkles,
} from 'lucide-react';

interface StaleTabsToolProps {
  tabGroups: TabGroup[];
  onDataMutated?: () => void;
}

type SortOption = 'oldest' | 'newest' | 'most_tabs' | 'fewest_tabs';

const GROUP_COLOR_MAP: Record<string, string> = {
  grey: 'hsl(220 10% 55%)',
  blue: 'hsl(217 91% 60%)',
  purple: 'hsl(271 91% 65%)',
  pink: 'hsl(330 85% 65%)',
  red: 'hsl(0 84% 60%)',
  orange: 'hsl(25 95% 53%)',
  yellow: 'hsl(45 93% 47%)',
  green: 'hsl(152 76% 40%)',
  cyan: 'hsl(188 86% 45%)',
};

const COLOR_OPTIONS: { id: TabGroupColor; label: string; color: string }[] = [
  { id: 'purple', label: 'Purple', color: 'hsl(271 91% 65%)' },
  { id: 'blue', label: 'Blue', color: 'hsl(217 91% 60%)' },
  { id: 'cyan', label: 'Cyan', color: 'hsl(188 86% 45%)' },
  { id: 'green', label: 'Green', color: 'hsl(152 76% 40%)' },
  { id: 'orange', label: 'Orange', color: 'hsl(25 95% 53%)' },
  { id: 'red', label: 'Red', color: 'hsl(0 84% 60%)' },
  { id: 'yellow', label: 'Yellow', color: 'hsl(45 93% 47%)' },
  { id: 'pink', label: 'Pink', color: 'hsl(330 85% 65%)' },
  { id: 'grey', label: 'Grey', color: 'hsl(220 10% 55%)' },
];

export function StaleTabsTool({ tabGroups, onDataMutated }: StaleTabsToolProps) {
  // Time horizon: 30 (1 mo), 90 (3 mo recommended), 180 (6 mo), 365 (1 yr)
  const [selectedHorizon, setSelectedHorizon] = useState<InactiveTimeHorizon>(90);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('oldest');
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});

  // Individual selection checkboxes for bulk archiving
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set());
  const [hasManuallyChangedSelection, setHasManuallyChangedSelection] = useState(false);

  // Loading & status feedback
  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Modals state
  const [archiveModalTarget, setArchiveModalTarget] = useState<StaleGroupInfo[] | null>(null);
  const [deleteModalTarget, setDeleteModalTarget] = useState<StaleGroupInfo[] | null>(null);
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [bundleCustomName, setBundleCustomName] = useState('');
  const [bundleCustomColor, setBundleCustomColor] = useState<TabGroupColor>('purple');

  // Compute impact summary before/after
  const impactSummary = useMemo(() => {
    return getInactiveImpactSummary(tabGroups, selectedHorizon);
  }, [tabGroups, selectedHorizon]);

  // Transform tabGroups into structured StaleGroupInfo
  const allParsedGroups = useMemo<StaleGroupInfo[]>(() => {
    const now = new Date();
    return tabGroups.map((g) => {
      const tabs = Array.isArray(g.tabs) ? g.tabs : [];
      const ageDays = calculateAgeInDays(g.date, now);
      const isFragment = tabs.length <= 2 && ageDays >= 60;

      let category: 'fresh' | 'aging' | 'stale' | 'ancient' = 'fresh';
      if (ageDays >= 180) category = 'ancient';
      else if (ageDays >= 90) category = 'stale';
      else if (ageDays >= 30) category = 'aging';

      return {
        id: g.id,
        name: g.name || 'Saved Group',
        color: g.color || 'blue',
        date: g.date || '',
        ageDays,
        ageLabel: formatAgeLabel(ageDays),
        category,
        tabCount: tabs.length,
        tabs,
        isFragment,
        topDomains: extractTopDomainsFromTabs(tabs),
      };
    });
  }, [tabGroups]);

  // Matching inactive groups based on selected horizon
  const matchingInactiveGroups = useMemo(() => {
    return allParsedGroups.filter((g) => g.ageDays >= selectedHorizon);
  }, [allParsedGroups, selectedHorizon]);

  // Reset or initialize selection when horizon changes (unless user manually customized)
  React.useEffect(() => {
    if (!hasManuallyChangedSelection) {
      setSelectedGroupIds(new Set(matchingInactiveGroups.map((g) => g.id)));
    }
  }, [matchingInactiveGroups, hasManuallyChangedSelection]);

  // Filtered & sorted list for display
  const displayedGroups = useMemo(() => {
    let list = matchingInactiveGroups;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((g) => {
        const matchesName = g.name.toLowerCase().includes(q);
        const matchesDomain = g.topDomains.some((d) => d.domain.toLowerCase().includes(q));
        const matchesTabs = g.tabs.some(
          (t) => (t.title && t.title.toLowerCase().includes(q)) || (t.url && t.url.toLowerCase().includes(q))
        );
        return matchesName || matchesDomain || matchesTabs;
      });
    }

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return b.ageDays - a.ageDays;
        case 'newest':
          return a.ageDays - b.ageDays;
        case 'most_tabs':
          return b.tabCount - a.tabCount;
        case 'fewest_tabs':
          return a.tabCount - b.tabCount;
        default:
          return b.ageDays - a.ageDays;
      }
    });
  }, [matchingInactiveGroups, searchQuery, sortBy]);

  // Selected counts
  const selectedGroupsList = useMemo(() => {
    return displayedGroups.filter((g) => selectedGroupIds.has(g.id));
  }, [displayedGroups, selectedGroupIds]);

  const selectedTabsCount = useMemo(() => {
    return selectedGroupsList.reduce((acc, g) => acc + g.tabCount, 0);
  }, [selectedGroupsList]);

  // Notification helper
  const showFeedback = (text: string, type: 'success' | 'info' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage((current) => (current?.text === text ? null : current));
    }, 4500);
  };

  // Expand / collapse all
  const allAreExpanded = useMemo(() => {
    if (displayedGroups.length === 0) return false;
    return displayedGroups.every((g) => expandedGroups[g.id]);
  }, [displayedGroups, expandedGroups]);

  const toggleExpandAll = () => {
    const nextState: Record<number, boolean> = {};
    const target = !allAreExpanded;
    for (const g of displayedGroups) {
      nextState[g.id] = target;
    }
    setExpandedGroups(nextState);
  };

  const toggleGroupExpand = (id: number) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Checkbox selection toggles
  const toggleSelectGroup = (id: number) => {
    setHasManuallyChangedSelection(true);
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setHasManuallyChangedSelection(true);
    if (selectedGroupIds.size === displayedGroups.length && displayedGroups.length > 0) {
      setSelectedGroupIds(new Set());
    } else {
      setSelectedGroupIds(new Set(displayedGroups.map((g) => g.id)));
    }
  };

  // ===========================================================================
  // Batch Execution Handlers
  // ===========================================================================

  const handleArchiveConfirm = async () => {
    if (!archiveModalTarget || archiveModalTarget.length === 0) return;
    setIsPerformingAction(true);
    try {
      const ids = archiveModalTarget.map((g) => g.id);
      const res = await archiveStaleGroups(ids);
      setArchiveModalTarget(null);
      setSelectedGroupIds(new Set());
      setHasManuallyChangedSelection(false);
      showFeedback(
        `Moved ${res.count} ${res.count === 1 ? 'collection' : 'collections'} (${res.tabsArchived} ${
          res.tabsArchived === 1 ? 'tab' : 'tabs'
        }) to Archive. Reversible anytime from the Archive view.`
      );
      if (onDataMutated) onDataMutated();
    } catch (err) {
      console.error('[TwoTab] Failed to archive collections:', err);
      showFeedback('Failed to archive collections. Please try again.', 'info');
    } finally {
      setIsPerformingAction(false);
    }
  };

  const handleBundleConfirm = async () => {
    const smallGroups = matchingInactiveGroups.filter((g) => g.tabCount <= 2);
    if (smallGroups.length === 0) return;
    setIsPerformingAction(true);
    try {
      const ids = smallGroups.map((g) => g.id);
      const res = await consolidateStaleFragments(ids, {
        groupName: bundleCustomName.trim() || undefined,
        groupColor: bundleCustomColor,
      });

      setBundleModalOpen(false);
      setSelectedGroupIds(new Set());
      setHasManuallyChangedSelection(false);
      showFeedback(
        `Bundled ${res.prunedGroupsCount} small collections into 1 consolidated archive (${res.consolidatedTabsCount} tabs). Backup created.`
      );
      if (onDataMutated) onDataMutated();
    } catch (err) {
      console.error('[TwoTab] Failed to bundle small collections:', err);
      showFeedback('Failed to bundle collections. Please try again.', 'info');
    } finally {
      setIsPerformingAction(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModalTarget || deleteModalTarget.length === 0) return;
    setIsPerformingAction(true);
    try {
      const ids = deleteModalTarget.map((g) => g.id);
      const res = await deleteStaleGroups(ids);
      setDeleteModalTarget(null);
      setSelectedGroupIds(new Set());
      setHasManuallyChangedSelection(false);
      showFeedback(
        `Deleted ${res.count} ${res.count === 1 ? 'collection' : 'collections'} (${res.tabsDeleted} ${
          res.tabsDeleted === 1 ? 'tab' : 'tabs'
        }). Safety backup snapshot saved.`
      );
      if (onDataMutated) onDataMutated();
    } catch (err) {
      console.error('[TwoTab] Failed to delete collections:', err);
      showFeedback('Failed to delete collections. Please try again.', 'info');
    } finally {
      setIsPerformingAction(false);
    }
  };

  const handleDeleteSingleTab = async (groupId: number, tabIndex: number) => {
    setIsPerformingAction(true);
    try {
      const res = await deleteSingleStaleTab(groupId, tabIndex);
      if (res.groupPruned) {
        showFeedback('Tab removed and empty collection pruned.');
      } else {
        showFeedback('Tab removed from collection.');
      }
      if (onDataMutated) onDataMutated();
    } catch (err) {
      console.error('[TwoTab] Failed to delete tab:', err);
    } finally {
      setIsPerformingAction(false);
    }
  };

  const handleExportMarkdown = async () => {
    const listToExport = selectedGroupsList.length > 0 ? selectedGroupsList : displayedGroups;
    if (listToExport.length === 0) {
      showFeedback('No collections available to export.', 'info');
      return;
    }

    const md = exportStaleTabsToMarkdown(listToExport);
    const success = await copyToClipboardSafe(md);

    if (success) {
      showFeedback(`Copied Markdown archive of ${listToExport.length} collections to clipboard!`);
    } else {
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `twotab-inactive-archive-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showFeedback(`Downloaded Markdown archive for ${listToExport.length} collections.`);
    }
  };

  const copyUrl = (url: string) => {
    copyToClipboardSafe(url);
    setCopiedUrl(url);
    setTimeout(() => {
      setCopiedUrl((prev) => (prev === url ? null : prev));
    }, 2000);
  };

  const formattedDate = (dateStr?: string) => {
    if (!dateStr) return 'Saved previously';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return 'Saved previously';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* ========================================================================= */}
      {/* 1. Header with Plain-English Purpose & Reassurance Badge                  */}
      {/* ========================================================================= */}
      <Card className="shrink-0 rounded-xl border border-border bg-card/90 shadow-sm backdrop-blur-md overflow-hidden">
        <CardContent className="p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0 shadow-xs">
                <Archive className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground tracking-tight">
                    Inactive Collections Review
                  </h2>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-2 py-0.5 h-4.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 flex items-center gap-1 font-medium"
                  >
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    <span>100% Reversible • Safe</span>
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Declutter your daily workspace by moving older, untouched collections to Archive.
                  Everything stays safe and can be restored anytime.
                </p>
              </div>
            </div>
          </div>

          {/* Time Horizon Selector: 1 Month, 3 Months (Recommended), 6 Months, 1 Year */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/60">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span>Find collections saved more than:</span>
              <div className="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg border border-border/60">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedHorizon(30);
                    setHasManuallyChangedSelection(false);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    selectedHorizon === 30
                      ? 'bg-card text-foreground shadow-xs ring-1 ring-border/80 font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
                >
                  1 Month ago
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedHorizon(90);
                    setHasManuallyChangedSelection(false);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                    selectedHorizon === 90
                      ? 'bg-card text-foreground shadow-xs ring-1 ring-border/80 font-semibold text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
                >
                  <span>3 Months ago</span>
                  <span className="text-[9px] px-1 py-0 rounded bg-primary/15 text-primary border border-primary/25 font-bold">
                    Recommended
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedHorizon(180);
                    setHasManuallyChangedSelection(false);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    selectedHorizon === 180
                      ? 'bg-card text-foreground shadow-xs ring-1 ring-border/80 font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
                >
                  6 Months ago
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedHorizon(365);
                    setHasManuallyChangedSelection(false);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    selectedHorizon === 365
                      ? 'bg-card text-foreground shadow-xs ring-1 ring-border/80 font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
                >
                  1 Year ago
                </button>
              </div>
            </div>

            {/* Quick Status / Cutoff Date indicator */}
            <div className="text-[11px] text-muted-foreground">
              Collections saved before <span className="font-semibold text-foreground">{impactSummary.cutoffFormatted}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* 2. Plain-English Impact Preview Card (Before vs After)                   */}
      {/* ========================================================================= */}
      <Card className="shrink-0 rounded-xl border border-border/80 bg-muted/20 shadow-xs">
        <CardContent className="p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 flex-1 min-w-[280px]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  Found {impactSummary.matchingInactiveGroups}{' '}
                  {impactSummary.matchingInactiveGroups === 1 ? 'collection' : 'collections'} (
                  {impactSummary.matchingInactiveTabs} {impactSummary.matchingInactiveTabs === 1 ? 'tab' : 'tabs'})
                </span>
                <span className="text-muted-foreground text-xs">•</span>
                <span className="text-xs text-muted-foreground">
                  Saved before {impactSummary.cutoffFormatted}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Moving them to Archive will reduce your active dashboard from{' '}
                <strong className="text-foreground">{impactSummary.totalActiveGroups} collections</strong> down to{' '}
                <strong className="text-foreground font-semibold text-emerald-600 dark:text-emerald-400">
                  {impactSummary.remainingActiveGroups} active collections
                </strong>
                . All {impactSummary.matchingInactiveTabs} tabs remain safely preserved in the Archive tab.
              </p>
            </div>

            {/* Visual Before & After comparison badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/80 shadow-xs shrink-0 text-xs">
              <div className="text-center px-1">
                <div className="text-[10px] text-muted-foreground uppercase font-medium">Current</div>
                <div className="font-bold text-foreground">{impactSummary.totalActiveGroups} groups</div>
              </div>
              <span className="text-muted-foreground font-light text-sm">→</span>
              <div className="text-center px-1">
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-medium">After Clean</div>
                <div className="font-bold text-emerald-600 dark:text-emerald-400">
                  {impactSummary.remainingActiveGroups} groups
                </div>
              </div>
            </div>
          </div>

          {/* Helper tip for scattered small groups */}
          {impactSummary.scatteredSmallGroupsCount >= 2 && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-700 dark:text-purple-300">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>
                  You have <strong>{impactSummary.scatteredSmallGroupsCount} small collections</strong> with only 1–2 tabs (
                  {impactSummary.scatteredSmallTabsCount} tabs total). You can bundle them into 1 collection.
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBundleCustomName(
                    `Cold Storage Archive (${new Date().toLocaleDateString(undefined, {
                      month: 'short',
                      year: 'numeric',
                    })})`
                  );
                  setBundleModalOpen(true);
                }}
                className="h-6 px-2 text-[10px] gap-1 text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/20 font-medium shrink-0"
              >
                <Layers className="w-3 h-3" />
                <span>Bundle Small Groups</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* 3. Feedback notification toast                                            */}
      {/* ========================================================================= */}
      {statusMessage && (
        <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/25 text-xs text-foreground shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-muted-foreground hover:text-foreground text-[11px] underline ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. Action Ribbon & Selection Bar                                          */}
      {/* ========================================================================= */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Select all checkbox & counter */}
        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={
                selectedGroupIds.size === displayedGroups.length && displayedGroups.length > 0
              }
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
            />
            <span>
              {selectedGroupIds.size === displayedGroups.length && displayedGroups.length > 0
                ? 'Deselect All'
                : `Select All (${displayedGroups.length})`}
            </span>
          </label>

          <span className="text-muted-foreground text-xs">•</span>

          <Badge variant="secondary" className="text-[11px] font-normal px-2 py-0.5">
            {selectedGroupIds.size} of {displayedGroups.length} selected ({selectedTabsCount} tabs)
          </Badge>
        </div>

        {/* Right: Search, Sort, Markdown export, and Primary Action Button */}
        <div className="flex items-center gap-2">
          {/* Search box */}
          <div className="relative w-44">
            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search older collections..."
              className="h-7 text-xs pl-7 pr-2 bg-muted/20 border-border/70"
            />
          </div>

          {/* Sort selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="h-7 px-2 text-xs rounded-md border border-border/70 bg-card text-foreground"
          >
            <option value="oldest">Oldest First</option>
            <option value="newest">Newest First</option>
            <option value="most_tabs">Most Tabs</option>
            <option value="fewest_tabs">Fewest Tabs</option>
          </select>

          {/* Expand / Collapse All */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleExpandAll}
            className="h-7 px-2 text-xs gap-1 border-border/70"
            title={allAreExpanded ? 'Collapse All' : 'Expand All'}
          >
            <ChevronsUpDown className="w-3 h-3 text-muted-foreground" />
            <span className="hidden sm:inline">{allAreExpanded ? 'Collapse' : 'Expand'}</span>
          </Button>

          {/* Export to Markdown */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportMarkdown}
            className="h-7 px-2.5 text-xs gap-1.5 border-border/70"
            title="Export selected collections as a clean Markdown backup"
          >
            <FileText className="w-3 h-3 text-muted-foreground" />
            <span className="hidden sm:inline">Export</span>
          </Button>

          {/* Primary Action Button: Move Selected to Archive */}
          <Button
            size="sm"
            onClick={() => setArchiveModalTarget(selectedGroupsList)}
            disabled={selectedGroupsList.length === 0}
            className="h-7 px-3.5 text-xs gap-1.5 bg-orange-600 hover:bg-orange-700 text-white font-medium shadow-xs"
          >
            <Archive className="w-3 h-3" />
            <span>Move {selectedGroupsList.length} to Archive</span>
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. Collections Review List (Scrollable middle container)                  */}
      {/* ========================================================================= */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar scroll-fade-bottom space-y-2.5 pr-1">
        {displayedGroups.length === 0 ? (
          <Card className="rounded-xl border border-dashed border-border/80 bg-muted/15 p-8 text-center">
            <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-2.5">
              <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shadow-xs">
                <Check className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Your Workspace is Up to Date!</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {searchQuery
                  ? `No collections match "${searchQuery}". Try clearing your search filter.`
                  : `You have no collections older than ${
                      selectedHorizon === 30
                        ? '1 month'
                        : selectedHorizon === 90
                        ? '3 months'
                        : selectedHorizon === 180
                        ? '6 months'
                        : '1 year'
                    }. Everything in your active library is recent.`}
              </p>
              {selectedHorizon > 30 && !searchQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedHorizon(30)}
                  className="mt-2 text-xs h-7 gap-1"
                >
                  <span>Check collections older than 1 month</span>
                </Button>
              )}
            </div>
          </Card>
        ) : (
          displayedGroups.map((group) => {
            const isExpanded = !!expandedGroups[group.id];
            const isSelected = selectedGroupIds.has(group.id);
            const colorHue = GROUP_COLOR_MAP[group.color] || GROUP_COLOR_MAP.blue;

            return (
              <Card
                key={group.id}
                className={`overflow-hidden rounded-xl border transition-all ${
                  isSelected
                    ? 'border-border/90 bg-card shadow-xs'
                    : 'border-border/50 bg-card/60 opacity-85'
                }`}
              >
                {/* Header Row: Checkbox, Expand arrow, Title, Saved date, Tab count, Clean Actions */}
                <div className="flex items-center justify-between gap-3 p-3 bg-muted/20 border-b border-border/40 select-none">
                  {/* Left: Checkbox + Expand + Info */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectGroup(group.id)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer shrink-0"
                      title={isSelected ? 'Included in Move to Archive' : 'Excluded from Move to Archive'}
                    />

                    {/* Expand arrow */}
                    <button
                      onClick={() => toggleGroupExpand(group.id)}
                      className="w-5 h-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      aria-label={isExpanded ? 'Collapse collection' : 'Expand collection'}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Collection Title & Color dot */}
                    <div className="flex items-center gap-2 min-w-0 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs ring-1 ring-black/10"
                        style={{ backgroundColor: colorHue }}
                        title={`Tagged: ${group.color}`}
                      />
                      <span className="text-xs font-semibold text-foreground truncate" title={group.name}>
                        {group.name}
                      </span>
                    </div>

                    {/* Human relative age & saved date */}
                    <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">
                      Saved {formattedDate(group.date)} ({group.ageLabel})
                    </span>

                    {/* Tab count pill */}
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-normal">
                      {group.tabCount} {group.tabCount === 1 ? 'tab' : 'tabs'}
                    </Badge>

                    {/* Small collection pill if tabCount <= 2 */}
                    {group.tabCount <= 2 && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 h-4 text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10 font-medium shrink-0 hidden md:inline-flex"
                      >
                        Small (1–2 tabs)
                      </Badge>
                    )}

                    {/* Top Domains Pills */}
                    <div className="hidden lg:flex items-center gap-1 min-w-0 truncate">
                      {group.topDomains.map((d) => (
                        <span
                          key={d.domain}
                          className="text-[10px] text-muted-foreground/80 bg-muted/40 px-1.5 py-0.5 rounded border border-border/40 truncate max-w-[100px]"
                          title={`${d.count} tabs from ${d.domain}`}
                        >
                          {d.domain}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Right Actions: Keep active toggle, Single Archive, Delete */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Keep in Active Button (unchecks it) */}
                    {isSelected ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleSelectGroup(group.id)}
                        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                        title="Keep this collection on your active dashboard"
                      >
                        Keep Active
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleSelectGroup(group.id)}
                        className="h-6 px-2 text-[11px] text-primary hover:text-primary font-medium"
                        title="Include in Move to Archive"
                      >
                        Mark to Archive
                      </Button>
                    )}

                    {/* 1-Click Move Single Collection to Archive */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setArchiveModalTarget([group])}
                      className="h-6 px-2 text-[11px] gap-1 text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/10"
                      title="Move this collection to Archive"
                    >
                      <Archive className="w-3 h-3" />
                      <span>Archive</span>
                    </Button>

                    {/* Quiet Delete Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteModalTarget([group])}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors"
                      title="Permanently delete collection (Safety backup taken)"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Expanded Content: Tabs list */}
                {isExpanded && (
                  <CardContent className="p-3 bg-card/60 divide-y divide-border/40">
                    <div className="space-y-1 max-h-[240px] overflow-y-auto custom-scrollbar pr-1">
                      {group.tabs.map((tab, idx) => {
                        const domain = tab.url ? new URL(tab.url).hostname.replace(/^www\./, '') : '';
                        const isCopied = copiedUrl === tab.url;

                        return (
                          <div
                            key={`${group.id}_tab_${idx}`}
                            className="flex items-center justify-between gap-2.5 py-1.5 px-2 rounded-md hover:bg-muted/40 text-xs transition-colors group"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <Globe className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                              <span
                                className="font-medium text-foreground truncate"
                                title={tab.title || tab.url}
                              >
                                {tab.title || tab.url}
                              </span>
                              {domain && (
                                <span className="text-[10px] text-muted-foreground font-mono shrink-0 px-1 py-0.2 rounded bg-muted/50 border border-border/40">
                                  {domain}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0 transition-opacity">
                              <button
                                onClick={() => copyUrl(tab.url)}
                                className="w-5 h-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                                title="Copy URL"
                              >
                                {isCopied ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>

                              <a
                                href={tab.url}
                                target="_blank"
                                rel="noreferrer"
                                className="w-5 h-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                                title="Open tab in browser"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>

                              <button
                                onClick={() => handleDeleteSingleTab(group.id, idx)}
                                className="w-5 h-5 rounded hover:bg-destructive/20 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                                title="Remove tab"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* 6. Plain-English Confirmation Modals                                      */}
      {/* ========================================================================= */}

      {/* Modal 1: Move to Archive Confirmation Modal */}
      <Dialog
        open={!!archiveModalTarget}
        onOpenChange={(open) => !open && setArchiveModalTarget(null)}
      >
        <DialogContent className="sm:max-w-[450px] bg-card border border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Archive className="w-4 h-4 text-orange-500" />
              <span>
                Move {archiveModalTarget?.length}{' '}
                {archiveModalTarget?.length === 1 ? 'Collection' : 'Collections'} to Archive?
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Safely declutter your active dashboard without losing anything.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-2.5 text-xs text-muted-foreground">
            <div className="rounded-lg bg-muted/40 border border-border/80 p-3 space-y-2">
              <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>What will happen:</span>
              </div>
              <ul className="space-y-1.5 text-[11px] text-muted-foreground pl-5 list-disc">
                <li>
                  <strong className="text-foreground">
                    {archiveModalTarget?.length}{' '}
                    {archiveModalTarget?.length === 1 ? 'collection' : 'collections'} (
                    {archiveModalTarget?.reduce((acc, g) => acc + g.tabCount, 0)} tabs)
                  </strong>{' '}
                  will be moved out of your daily dashboard.
                </li>
                <li>
                  All tabs will be safely stored in your{' '}
                  <strong className="text-foreground">Archive tab</strong> on the left sidebar.
                </li>
                <li>You can restore or open any of them at any time with 1 click.</li>
                <li>A safety backup snapshot will be recorded automatically before moving.</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setArchiveModalTarget(null)}
              disabled={isPerformingAction}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleArchiveConfirm}
              disabled={isPerformingAction}
              className="text-xs h-8 bg-orange-600 hover:bg-orange-700 text-white font-medium"
            >
              {isPerformingAction ? 'Moving...' : 'Confirm & Move to Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Bundle Small Groups Modal */}
      <Dialog open={bundleModalOpen} onOpenChange={(open) => !open && setBundleModalOpen(false)}>
        <DialogContent className="sm:max-w-[450px] bg-card border border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="w-4 h-4 text-purple-500" />
              <span>Bundle Small Collections into One</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Combine your scattered 1–2 tab older collections into a single organized archive.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-foreground text-[11px]">Consolidated Collection Name</label>
              <Input
                value={bundleCustomName}
                onChange={(e) => setBundleCustomName(e.target.value)}
                placeholder="e.g., Cold Storage Archive (Q1 2026)"
                className="h-8 text-xs bg-muted/20"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-foreground text-[11px]">Collection Color Tag</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setBundleCustomColor(c.id)}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                      bundleCustomColor === c.id
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-card scale-110'
                        : 'hover:scale-105 opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.color }}
                    title={c.label}
                  >
                    {bundleCustomColor === c.id && <Check className="w-3 h-3 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2.5 text-[11px] text-muted-foreground space-y-1">
              <p className="font-medium text-purple-700 dark:text-purple-300">
                Safe consolidation guarantee:
              </p>
              <p>
                • All tabs from the {impactSummary.scatteredSmallGroupsCount} small collections will be
                preserved in the new group.
                <br />
                • The scattered empty source cards will be cleanly removed.
                <br />• A safety backup snapshot will be recorded first.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBundleModalOpen(false)}
              disabled={isPerformingAction}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleBundleConfirm}
              disabled={isPerformingAction}
              className="text-xs h-8 bg-purple-600 hover:bg-purple-700 text-white font-medium"
            >
              {isPerformingAction ? 'Bundling...' : 'Bundle into 1 Collection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 3: Permanent Delete Modal */}
      <Dialog
        open={!!deleteModalTarget}
        onOpenChange={(open) => !open && setDeleteModalTarget(null)}
      >
        <DialogContent className="sm:max-w-[420px] bg-card border border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <Trash2 className="w-4 h-4 text-destructive" />
              <span>Confirm Permanent Deletion</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to permanently delete{' '}
              <strong className="text-foreground">
                {deleteModalTarget?.length}{' '}
                {deleteModalTarget?.length === 1 ? 'collection' : 'collections'}
              </strong>{' '}
              (
              {deleteModalTarget?.reduce((acc, g) => acc + g.tabCount, 0)}{' '}
              {deleteModalTarget?.reduce((acc, g) => acc + g.tabCount, 0) === 1 ? 'tab' : 'tabs'}
              )?
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive space-y-1">
              <p className="font-semibold">Guarded by Automatic Rolling Backup</p>
              <p className="text-[11px] text-muted-foreground">
                TwoTab will automatically record a snapshot in your Backup History before deleting these
                tabs. You can revert this action in Settings &gt; Backups if needed.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteModalTarget(null)}
              disabled={isPerformingAction}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={isPerformingAction}
              className="text-xs h-8 font-medium"
            >
              {isPerformingAction ? 'Deleting...' : 'Delete Collections'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
