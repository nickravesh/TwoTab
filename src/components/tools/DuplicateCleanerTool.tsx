import React, { useState, useMemo } from 'react';
import { type TabGroup } from '@/lib/storage';
import {
  findDuplicateClusters,
  findDuplicateGroups,
  getDeduplicationSummary,
  cleanAllDuplicates,
  removeSpecificInstances,
  mergeGroups,
  type DuplicateCluster,
  type DuplicateGroupPair,
  type DeduplicationStrategy,
} from '@/lib/deduplication';
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
  Copy,
  Sparkles,
  Search,
  CheckCircle2,
  Trash2,
  GitMerge,
  ShieldCheck,
  ExternalLink,
  ChevronDown,
  ChevronsUpDown,
  RotateCcw,
  Clock,
  Check,
  ArrowRight,
} from 'lucide-react';

interface DuplicateCleanerToolProps {
  tabGroups: TabGroup[];
  onDataMutated?: () => void;
}

type ActiveMode = 'duplicates' | 'similar-groups';
type FilterTab = 'all' | 'exact' | 'canonical' | 'fuzzy_title';

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

export function DuplicateCleanerTool({ tabGroups, onDataMutated }: DuplicateCleanerToolProps) {
  const [activeMode, setActiveMode] = useState<ActiveMode>('duplicates');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [strategy, setStrategy] = useState<DeduplicationStrategy>('keep_oldest');
  const [isCleaning, setIsCleaning] = useState(false);
  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({});
  const [expandedGroupPairs, setExpandedGroupPairs] = useState<Record<number, boolean>>({});
  const [confirmCleanAllModalOpen, setConfirmCleanAllModalOpen] = useState(false);
  const [confirmMergePair, setConfirmMergePair] = useState<DuplicateGroupPair | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  // Run duplicate analysis
  const clusters = useMemo(() => {
    return findDuplicateClusters(tabGroups);
  }, [tabGroups]);

  const groupPairs = useMemo(() => {
    return findDuplicateGroups(tabGroups, 0.7);
  }, [tabGroups]);

  const summary = useMemo(() => {
    return getDeduplicationSummary(tabGroups, clusters, groupPairs);
  }, [tabGroups, clusters, groupPairs]);

  // Group size lookup for 'keep_largest' strategy & UI tab counts
  const groupSizeMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const g of tabGroups) {
      map.set(g.id, g.tabs?.length || 0);
    }
    return map;
  }, [tabGroups]);

  // Filter clusters based on search query and active filter
  const filteredClusters = useMemo(() => {
    let list = clusters;

    if (activeFilter === 'exact') {
      list = list.filter((c) => c.matchType === 'exact');
    } else if (activeFilter === 'canonical') {
      list = list.filter((c) => c.matchType === 'canonical');
    } else if (activeFilter === 'fuzzy_title') {
      list = list.filter((c) => c.matchType === 'fuzzy_title');
    }

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase().trim();
    return list.filter((c) => {
      return (
        c.representativeTitle.toLowerCase().includes(q) ||
        c.canonicalUrl.toLowerCase().includes(q) ||
        c.instances.some((inst) => inst.groupName.toLowerCase().includes(q))
      );
    });
  }, [clusters, activeFilter, searchQuery]);

  const toggleClusterExpanded = (id: string) => {
    setExpandedClusters((prev) => {
      const isCurrentlyExpanded = prev[id] !== false; // default true: open
      return {
        ...prev,
        [id]: !isCurrentlyExpanded,
      };
    });
  };

  const allClustersCollapsed = useMemo(() => {
    if (filteredClusters.length === 0) return false;
    return filteredClusters.every((c) => expandedClusters[c.id] === false);
  }, [filteredClusters, expandedClusters]);

  const toggleAllClusters = () => {
    if (allClustersCollapsed) {
      // Expand all
      setExpandedClusters({});
    } else {
      // Collapse all
      const next: Record<string, boolean> = {};
      for (const c of filteredClusters) {
        next[c.id] = false;
      }
      setExpandedClusters(next);
    }
  };

  const handleCleanAll = async () => {
    setConfirmCleanAllModalOpen(false);
    setIsCleaning(true);
    try {
      const result = await cleanAllDuplicates(strategy, clusters, tabGroups);
      setStatusMessage({
        text: `Cleaned ${result.removedCount} duplicate ${result.removedCount === 1 ? 'tab' : 'tabs'}${
          result.cleanedGroupsCount > 0 ? ` (pruned ${result.cleanedGroupsCount} empty groups)` : ''
        }`,
        type: 'success',
      });
      if (onDataMutated) onDataMutated();
    } catch (err) {
      console.error('Failed to clean duplicates:', err);
    } finally {
      setIsCleaning(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleKeepInstanceOnly = async (cluster: DuplicateCluster, instanceToKeep: any) => {
    const toRemove = cluster.instances
      .filter((inst) => inst !== instanceToKeep)
      .map((inst) => ({ groupId: inst.groupId, tabIndex: inst.tabIndex, url: inst.originalUrl }));

    try {
      await removeSpecificInstances(toRemove, tabGroups);
      setStatusMessage({
        text: `Kept 1 copy in "${instanceToKeep.groupName}", removed ${toRemove.length} others`,
        type: 'success',
      });
      if (onDataMutated) onDataMutated();
    } catch (err) {
      console.error('Failed to keep specific instance:', err);
    } finally {
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleRemoveSingleInstance = async (instance: any) => {
    try {
      await removeSpecificInstances([{ groupId: instance.groupId, tabIndex: instance.tabIndex, url: instance.originalUrl }], tabGroups);
      setStatusMessage({
        text: `Removed 1 copy from "${instance.groupName}"`,
        type: 'success',
      });
      if (onDataMutated) onDataMutated();
    } catch (err) {
      console.error('Failed to remove instance:', err);
    } finally {
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleMergeGroupPair = async () => {
    if (!confirmMergePair) return;
    const pair = confirmMergePair;
    setConfirmMergePair(null);
    try {
      await mergeGroups(pair.groupA.id, pair.groupB.id, tabGroups);
      setStatusMessage({
        text: `Merged "${pair.groupA.name}" into "${pair.groupB.name}" seamlessly`,
        type: 'success',
      });
      if (onDataMutated) onDataMutated();
    } catch (err) {
      console.error('Failed to merge groups:', err);
    } finally {
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Toast Notification */}
      {statusMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-2xl bg-card border border-primary/40 text-foreground flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <Sparkles className="w-3 h-3" />
          </div>
          <span className="text-xs font-semibold">{statusMessage.text}</span>
        </div>
      )}

      {/* Overview & Quick Clean Card */}
      <Card className="shrink-0 border border-border bg-card/90 shadow-sm overflow-hidden rounded-xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-sm shrink-0">
                <Copy className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
                  Smart Duplicate & Mirror Cleaner
                </h3>
                <p className="text-xs text-muted-foreground">
                  4-tier URL normalizer and intelligent tab cleaner. Review and remove redundant links across your groups while keeping originals safe.
                </p>
              </div>
            </div>

            {summary.totalDuplicateTabs > 0 && (
              <div className="flex flex-col sm:items-end gap-1 shrink-0">
                <Button
                  variant="default"
                  size="sm"
                  disabled={isCleaning}
                  onClick={() => setConfirmCleanAllModalOpen(true)}
                  className="h-8 gap-1.5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Clean All {summary.totalDuplicateTabs} {summary.totalDuplicateTabs === 1 ? 'Duplicate' : 'Duplicates'}
                </Button>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  Automatic rolling backup snapshot created
                </span>
              </div>
            )}
          </div>

          {/* Metric Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/30 p-3 rounded-xl border border-border/60">
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-muted-foreground">Redundant Tabs</span>
              <span className="text-lg font-bold text-foreground tracking-tight">
                {summary.totalDuplicateTabs}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-muted-foreground">Distinct Web Pages</span>
              <span className="text-lg font-bold text-foreground tracking-tight">
                {summary.uniqueClustersCount}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-muted-foreground">Est. Memory Saved</span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
                {formatBytes(summary.estimatedMemorySavedBytes)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-muted-foreground">Similar Groups</span>
              <span className="text-lg font-bold text-foreground tracking-tight">
                {summary.duplicateGroupsCount}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Mode Tabs & Secondary Controls */}
      <div className="shrink-0 space-y-3">
        {/* Mode Selector */}
        <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveMode('duplicates')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeMode === 'duplicates'
                  ? 'bg-card text-foreground shadow-xs font-semibold ring-1 ring-border/80'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Copy className="w-3.5 h-3.5 text-primary" />
              <span>Duplicate Tabs</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-bold">
                {clusters.length}
              </Badge>
            </button>

            <button
              onClick={() => setActiveMode('similar-groups')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeMode === 'similar-groups'
                  ? 'bg-card text-foreground shadow-xs font-semibold ring-1 ring-border/80'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <GitMerge className="w-3.5 h-3.5 text-primary" />
              <span>Similar Groups</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-bold">
                {groupPairs.length}
              </Badge>
            </button>
          </div>
        </div>

        {/* Duplicate Tabs Filter Toolbar */}
        {activeMode === 'duplicates' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card/60 p-3 rounded-xl border border-border/60">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
                  activeFilter === 'all'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                All ({clusters.length})
              </button>
              <button
                onClick={() => setActiveFilter('exact')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
                  activeFilter === 'exact'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
                title="Identical web address URLs"
              >
                Exact URLs ({summary.exactMatchesCount})
              </button>
              <button
                onClick={() => setActiveFilter('canonical')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
                  activeFilter === 'canonical'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
                title="Same URL with marketing/tracking query parameters stripped"
              >
                Cleaned Links ({summary.canonicalMatchesCount})
              </button>
              <button
                onClick={() => setActiveFilter('fuzzy_title')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
                  activeFilter === 'fuzzy_title'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
                title="Same article or page title on the same website"
              >
                Similar Titles ({summary.fuzzyTitleMatchesCount})
              </button>
            </div>

            {/* Strategy & Search */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-muted/40 px-2.5 py-1 rounded-lg border border-border/60 text-xs">
                <span className="text-muted-foreground font-medium hidden md:inline">Keep:</span>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as DeduplicationStrategy)}
                  aria-label="Deduplication Strategy"
                  className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer"
                >
                  <option value="keep_oldest" className="bg-card text-foreground">First Saved (Original)</option>
                  <option value="keep_newest" className="bg-card text-foreground">Most Recently Saved</option>
                  <option value="keep_largest" className="bg-card text-foreground">In Largest Group</option>
                </select>
              </div>

              {filteredClusters.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAllClusters}
                  className="h-8 px-2.5 text-xs font-medium gap-1.5 border-border/70 bg-background/80 hover:bg-muted shrink-0"
                  title={allClustersCollapsed ? 'Expand all clusters' : 'Collapse all clusters'}
                >
                  <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="hidden sm:inline">{allClustersCollapsed ? 'Expand All' : 'Collapse All'}</span>
                </Button>
              )}

              <div className="relative w-44 sm:w-52">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter duplicates..."
                  className="h-8 pl-8 text-xs bg-background/80"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Workspace */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 custom-scrollbar pr-1">
        {/* Zero Duplicates State */}
        {summary.totalDuplicateTabs === 0 && activeMode === 'duplicates' && (
          <div className="h-72 flex flex-col items-center justify-center text-center p-6 bg-card/40 rounded-2xl border border-dashed border-border/80 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shadow-inner">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-foreground">Zero Duplicate Tabs Found</h4>
              <p className="text-xs text-muted-foreground max-w-sm">
                Your library of {summary.totalTabsScanned} {summary.totalTabsScanned === 1 ? 'tab' : 'tabs'} is completely clean with no duplicate or mirror links detected.
              </p>
            </div>
          </div>
        )}

        {/* Zero Search/Filter Results State */}
        {summary.totalDuplicateTabs > 0 && filteredClusters.length === 0 && activeMode === 'duplicates' && (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-card/40 rounded-2xl border border-dashed border-border/80 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
              <Search className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-foreground">No matching duplicate tabs found</h4>
              <p className="text-xs text-muted-foreground max-w-sm">
                {searchQuery.trim()
                  ? `No duplicates match "${searchQuery}". Try a different keyword.`
                  : `No duplicate clusters found in the selected filter.`}
              </p>
            </div>
            {(searchQuery.trim() || activeFilter !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setActiveFilter('all');
                }}
                className="h-7 text-xs font-medium gap-1.5"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Filters
              </Button>
            )}
          </div>
        )}

        {/* Similar Groups View */}
        {activeMode === 'similar-groups' && (
          <div className="space-y-3">
            {groupPairs.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-card/40 rounded-2xl border border-dashed border-border/80 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
                  <GitMerge className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-foreground">No Overlapping Groups Found</h4>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    None of your tab collections share 70% or more identical links. Your collections are cleanly separated!
                  </p>
                </div>
              </div>
            ) : (
              groupPairs.map((pair, idx) => {
                const isPairExpanded = expandedGroupPairs[idx] ?? false;

                return (
                  <Card key={idx} className="border border-border bg-card shadow-sm overflow-hidden rounded-xl">
                    <div className="p-4 border-b border-border/70 bg-muted/20 flex flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                          {Math.round(pair.similarityScore * 100)}%
                        </div>
                        <div>
                          <div className="text-sm font-bold text-foreground flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1.5">
                              {pair.groupA.color && GROUP_COLOR_MAP[pair.groupA.color] && (
                                <span className="w-2 h-2 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: GROUP_COLOR_MAP[pair.groupA.color] }} />
                              )}
                              "{pair.groupA.name}"
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="flex items-center gap-1.5">
                              {pair.groupB.color && GROUP_COLOR_MAP[pair.groupB.color] && (
                                <span className="w-2 h-2 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: GROUP_COLOR_MAP[pair.groupB.color] }} />
                              )}
                              "{pair.groupB.name}"
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {pair.sharedTabsCount} shared {pair.sharedTabsCount === 1 ? 'tab' : 'tabs'} out of {pair.totalUniqueTabsCount} total unique URLs
                          </p>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmMergePair(pair)}
                        className="h-7 text-xs font-semibold gap-1.5 border-border hover:bg-primary hover:text-primary-foreground shrink-0 cursor-pointer"
                      >
                        <GitMerge className="w-3.5 h-3.5" />
                        Merge Groups
                      </Button>
                    </div>

                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-muted-foreground">Shared Tabs:</span>
                        {pair.sharedTabs.length > 3 && (
                          <button
                            onClick={() => setExpandedGroupPairs((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                            className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                          >
                            {isPairExpanded ? 'Show fewer' : `View all ${pair.sharedTabs.length} shared links`}
                          </button>
                        )}
                      </div>
                      <div className="space-y-1">
                        {(isPairExpanded ? pair.sharedTabs : pair.sharedTabs.slice(0, 3)).map((tab, tIdx) => (
                          <div key={tIdx} className="text-xs text-foreground flex items-center justify-between gap-2 py-0.5 group">
                            <div className="flex items-center gap-2 truncate min-w-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                              <span className="truncate">{tab.title}</span>
                            </div>
                            <a
                              href={tab.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity p-0.5 shrink-0"
                              title="Open Link"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* Duplicate Clusters List */}
        {activeMode === 'duplicates' && filteredClusters.map((cluster) => {
          const isExpanded = expandedClusters[cluster.id] !== false; // Default: expanded

          // Determine which instance is recommended according to current strategy
          let recommendedInstance = cluster.instances[0]; // Default: oldest
          if (strategy === 'keep_newest') {
            recommendedInstance = cluster.instances[cluster.instances.length - 1];
          } else if (strategy === 'keep_largest') {
            recommendedInstance = [...cluster.instances].sort((a, b) => {
              const sizeA = groupSizeMap.get(a.groupId) || 0;
              const sizeB = groupSizeMap.get(b.groupId) || 0;
              return sizeB - sizeA;
            })[0];
          }

          return (
            <Card key={cluster.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-shadow hover:shadow-md">
              {/* Accessible Header as full-width interactive collapse trigger */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => toggleClusterExpanded(cluster.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleClusterExpanded(cluster.id);
                  }
                }}
                className={`w-full p-3.5 sm:p-4 bg-muted/20 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors hover:bg-muted/30 ${
                  isExpanded ? 'border-b border-border/70' : ''
                }`}
                title={isExpanded ? 'Click to collapse' : 'Click to expand'}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Copy className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground truncate max-w-sm sm:max-w-md">
                        {cluster.representativeTitle}
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-3.5 shrink-0 border-border text-muted-foreground font-medium">
                        {cluster.matchType === 'exact' ? 'Exact URL' : cluster.matchType === 'canonical' ? 'Cleaned Link' : 'Same Title'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                      <span className="font-mono truncate max-w-xs">{cluster.canonicalUrl}</span>
                      <span className="text-muted-foreground/40 hidden sm:inline">•</span>
                      <span className="truncate hidden sm:inline">Saved in {cluster.instances.length} {cluster.instances.length === 1 ? 'group' : 'groups'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <Badge variant="secondary" className="text-xs font-semibold px-2 py-0.5">
                    {cluster.totalCopies} copies ({cluster.totalCopies - 1} redundant)
                  </Badge>
                  <div
                    className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    title={isExpanded ? 'Collapse instances' : 'Expand instances'}
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>
              </div>

              {/* Instances List (rendered when expanded) */}
              {isExpanded && (
                <CardContent className="p-3.5 sm:p-4 space-y-2 bg-background/20 animate-in fade-in-50 duration-150">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-0.5">
                    <span>Saved copies across your groups:</span>
                    <span className="text-[10px]">
                      Rule: <strong className="text-foreground">{strategy === 'keep_oldest' ? 'Keep First Saved' : strategy === 'keep_newest' ? 'Keep Most Recent' : 'Keep in Largest Group'}</strong>
                    </span>
                  </div>

                  <div className="space-y-2">
                    {cluster.instances.map((instance, instIdx) => {
                      const isRecommendedKeep = instance === recommendedInstance;
                      const groupTabCount = groupSizeMap.get(instance.groupId) || 0;

                      return (
                        <div
                          key={instIdx}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                            isRecommendedKeep
                              ? 'bg-emerald-500/5 border-emerald-500/30 ring-1 ring-emerald-500/20'
                              : 'bg-card border-border/80 hover:border-border'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="pt-0.5 shrink-0">
                              {isRecommendedKeep ? (
                                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-1.5 py-0.5 gap-1">
                                  <Check className="w-3 h-3" />
                                  KEEP
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground border-border text-[10px] font-medium px-1.5 py-0.5">
                                  WILL REMOVE
                                </Badge>
                              )}
                            </div>

                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                {instance.groupColor && GROUP_COLOR_MAP[instance.groupColor] && (
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                                    style={{ backgroundColor: GROUP_COLOR_MAP[instance.groupColor] }}
                                    title={`Group color: ${instance.groupColor}`}
                                  />
                                )}
                                <span className="text-xs font-semibold text-foreground truncate max-w-[200px] sm:max-w-xs">
                                  {instance.groupName}
                                </span>
                                <span className="text-[10px] text-muted-foreground/70">
                                  ({groupTabCount} {groupTabCount === 1 ? 'tab' : 'tabs'})
                                </span>
                                {instance.isOldest && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-medium">
                                    First Saved (Original)
                                  </Badge>
                                )}
                                {instance.isNewest && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-primary/40 text-primary font-medium">
                                    Most Recent
                                  </Badge>
                                )}
                                {strategy === 'keep_largest' && isRecommendedKeep && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-purple-500/40 text-purple-600 dark:text-purple-400 font-medium">
                                    Largest Group
                                  </Badge>
                                )}
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {new Date(instance.groupDate).toLocaleDateString()}
                                </span>
                              </div>

                              {instance.originalUrl !== cluster.canonicalUrl && (
                                <span className="text-[10px] text-muted-foreground/80 font-mono truncate block max-w-sm sm:max-w-md">
                                  Full URL: {instance.originalUrl}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Individual Actions */}
                          <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                            {!isRecommendedKeep ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleKeepInstanceOnly(cluster, instance);
                                }}
                                className="h-6 text-[11px] font-medium px-2 border-border/80 hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-500/30 gap-1 cursor-pointer"
                                title="Keep this copy and remove all other duplicate copies"
                              >
                                <Check className="w-3 h-3 text-emerald-500" />
                                Keep this instead
                              </Button>
                            ) : (
                              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold px-2">
                                Selected to Keep
                              </span>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveSingleInstance(instance);
                              }}
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                              title="Delete only this tab copy immediately"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>

                            <a
                              href={instance.originalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-muted"
                              title="Open Link"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Confirmation Modal: Clean All Duplicates */}
      <Dialog open={confirmCleanAllModalOpen} onOpenChange={setConfirmCleanAllModalOpen}>
        <DialogContent className="border-border bg-card shadow-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2 text-base font-bold">
              <Sparkles className="w-4 h-4 text-primary" />
              Clean All Duplicates
            </DialogTitle>
            <DialogDescription asChild className="text-muted-foreground text-xs leading-relaxed pt-2 space-y-2">
              <div>
                <p>
                  You are about to remove <strong className="text-foreground">{summary.totalDuplicateTabs} redundant tabs</strong> across {summary.uniqueClustersCount} web pages using the <strong className="text-foreground">{strategy.replace('_', ' ')}</strong> rule.
                </p>
                <div className="p-3 bg-muted/40 rounded-xl border border-border/70 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    Automatic Rolling Backup Snapshot
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    A timestamped restore snapshot is automatically created before any deletions occur. You can restore your data at any time in Settings.
                  </p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmCleanAllModalOpen(false)} className="text-xs cursor-pointer">
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={handleCleanAll} className="text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer">
              Proceed & Clean
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal: Merge Groups */}
      <Dialog open={!!confirmMergePair} onOpenChange={(open) => !open && setConfirmMergePair(null)}>
        <DialogContent className="border-border bg-card shadow-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2 text-base font-bold">
              <GitMerge className="w-4 h-4 text-primary" />
              Merge Overlapping Tab Groups
            </DialogTitle>
            <DialogDescription asChild className="text-muted-foreground text-xs leading-relaxed pt-2 space-y-2">
              <div>
                {confirmMergePair && (
                  <>
                    <p>
                      Merge <strong className="text-foreground">"{confirmMergePair.groupA.name}"</strong> into <strong className="text-foreground">"{confirmMergePair.groupB.name}"</strong>?
                    </p>
                    <p>
                      All non-duplicate tabs will be consolidated into a single group, and the duplicate source group container will be cleanly deleted.
                    </p>
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmMergePair(null)} className="text-xs cursor-pointer">
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={handleMergeGroupPair} className="text-xs font-semibold bg-primary text-primary-foreground cursor-pointer">
              Confirm & Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
