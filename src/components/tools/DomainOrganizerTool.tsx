import React, { useState, useMemo } from 'react';
import { type TabGroup, type TabGroupColor } from '@/lib/storage';
import {
  extractDomainInfo,
  getLibraryDomainClusters,
  getDomainOrganizerSummary,
  consolidateDomain,
  autoOrganizeLibraryByDomain,
  deleteDomainTabs,
  deleteSingleTabInstance,
  type DomainCluster,
  type DomainTabInstance,
} from '@/lib/domainOrganizer';
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
  FolderTree,
  Sparkles,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronsUpDown,
  RotateCcw,
  Clock,
  Check,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Trash2,
  Layers,
  ArrowRight,
  Globe,
  Plus,
  Copy,
  FolderPlus,
} from 'lucide-react';

interface DomainOrganizerToolProps {
  tabGroups: TabGroup[];
  onDataMutated?: () => void;
}

type FilterTab = 'all' | 'scattered' | 'organized' | 'high_volume';
type SortOption = 'tabs_desc' | 'scattered_desc' | 'alpha_asc';

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
  { id: 'blue', label: 'Blue', color: 'hsl(217 91% 60%)' },
  { id: 'purple', label: 'Purple', color: 'hsl(271 91% 65%)' },
  { id: 'cyan', label: 'Cyan', color: 'hsl(188 86% 45%)' },
  { id: 'green', label: 'Green', color: 'hsl(152 76% 40%)' },
  { id: 'orange', label: 'Orange', color: 'hsl(25 95% 53%)' },
  { id: 'red', label: 'Red', color: 'hsl(0 84% 60%)' },
  { id: 'yellow', label: 'Yellow', color: 'hsl(45 93% 47%)' },
  { id: 'pink', label: 'Pink', color: 'hsl(330 85% 65%)' },
  { id: 'grey', label: 'Grey', color: 'hsl(220 10% 55%)' },
];

export function DomainOrganizerTool({ tabGroups, onDataMutated }: DomainOrganizerToolProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [sortBy, setSortBy] = useState<SortOption>('tabs_desc');
  const [groupBySubdomain, setGroupBySubdomain] = useState(false);
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({});

  // Modals state
  const [confirmConsolidateCluster, setConfirmConsolidateCluster] = useState<DomainCluster | null>(null);
  const [destinationType, setDestinationType] = useState<'new' | 'existing'>('new');
  const [selectedExistingGroupId, setSelectedExistingGroupId] = useState<number>(0);
  const [consolidateMode, setConsolidateMode] = useState<'move' | 'copy'>('move');
  const [customGroupName, setCustomGroupName] = useState('');
  const [customGroupColor, setCustomGroupColor] = useState<TabGroupColor>('blue');

  const [confirmAutoOrganizeModalOpen, setConfirmAutoOrganizeModalOpen] = useState(false);
  const [minThreshold, setMinThreshold] = useState(3);

  const [confirmDeleteCluster, setConfirmDeleteCluster] = useState<DomainCluster | null>(null);

  const [justConsolidatedDomain, setJustConsolidatedDomain] = useState<string | null>(null);
  const [copiedTabUrl, setCopiedTabUrl] = useState<string | null>(null);

  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  // Compute domain clusters
  const clusters = useMemo(() => {
    return getLibraryDomainClusters(tabGroups, { groupBySubdomain });
  }, [tabGroups, groupBySubdomain]);

  const totalTabsCount = useMemo(() => {
    return tabGroups.reduce((acc, g) => acc + (g.tabs?.length || 0), 0);
  }, [tabGroups]);

  const summary = useMemo(() => {
    return getDomainOrganizerSummary(clusters, totalTabsCount);
  }, [clusters, totalTabsCount]);

  const highVolumeCount = useMemo(() => {
    return clusters.filter((c) => c.totalTabs >= 5).length;
  }, [clusters]);

  const organizedCount = useMemo(() => {
    return clusters.filter((c) => c.groupsCount === 1).length;
  }, [clusters]);

  // Filter & sort clusters
  const filteredClusters = useMemo(() => {
    let list = clusters;

    if (activeFilter === 'scattered') {
      list = list.filter((c) => c.groupsCount >= 2);
    } else if (activeFilter === 'organized') {
      list = list.filter((c) => c.groupsCount === 1);
    } else if (activeFilter === 'high_volume') {
      list = list.filter((c) => c.totalTabs >= 5);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((c) => {
        return (
          c.rootDomain.toLowerCase().includes(q) ||
          c.displayName.toLowerCase().includes(q) ||
          c.instances.some((inst) => inst.title.toLowerCase().includes(q) || inst.url.toLowerCase().includes(q))
        );
      });
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'scattered_desc') {
        if (b.groupsCount !== a.groupsCount) {
          return b.groupsCount - a.groupsCount;
        }
        return b.totalTabs - a.totalTabs;
      }
      if (sortBy === 'alpha_asc') {
        return a.displayName.localeCompare(b.displayName);
      }
      return b.totalTabs - a.totalTabs;
    });
  }, [clusters, activeFilter, searchQuery, sortBy]);

  const toggleDomainExpanded = (id: string) => {
    setExpandedDomains((prev) => {
      const isCurrentlyExpanded = prev[id] !== false; // Default: expanded
      return {
        ...prev,
        [id]: !isCurrentlyExpanded,
      };
    });
  };

  const allDomainsCollapsed = useMemo(() => {
    if (filteredClusters.length === 0) return false;
    return filteredClusters.every((c) => expandedDomains[c.id] === false);
  }, [filteredClusters, expandedDomains]);

  const toggleAllDomains = () => {
    if (allDomainsCollapsed) {
      setExpandedDomains({});
    } else {
      const next: Record<string, boolean> = {};
      for (const c of filteredClusters) {
        next[c.id] = false;
      }
      setExpandedDomains(next);
    }
  };

  const handleOpenConsolidate = (cluster: DomainCluster) => {
    setConfirmConsolidateCluster(cluster);
    setDestinationType('new');
    setCustomGroupName(`${cluster.displayName} (${cluster.rootDomain})`);
    setCustomGroupColor(cluster.suggestedColor);
    setConsolidateMode('move');
    if (tabGroups.length > 0) {
      setSelectedExistingGroupId(tabGroups[0].id);
    }
  };

  const copyUrl = (url: string) => {
    try {
      navigator.clipboard.writeText(url);
      setCopiedTabUrl(url);
      setTimeout(() => setCopiedTabUrl(null), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const autoOrganizePreview = useMemo(() => {
    if (!confirmAutoOrganizeModalOpen) return null;

    const domainTabsMap = new Map<
      string,
      { rootDomain: string; displayName: string; suggestedColor: TabGroupColor; count: number }
    >();
    let totalTabs = 0;

    for (const g of tabGroups) {
      for (const t of g.tabs || []) {
        if (!t?.url) continue;
        totalTabs++;
        const info = extractDomainInfo(t.url);
        const rootDomain = info?.rootDomain || 'other';

        const existing = domainTabsMap.get(rootDomain);
        if (existing) {
          existing.count++;
        } else {
          domainTabsMap.set(rootDomain, {
            rootDomain,
            displayName: info?.displayName || 'Web Pages',
            suggestedColor: info?.suggestedColor || 'blue',
            count: 1,
          });
        }
      }
    }

    const qualified = Array.from(domainTabsMap.values())
      .filter((d) => d.count >= minThreshold && d.rootDomain !== 'other')
      .sort((a, b) => b.count - a.count);

    const qualifiedTabsCount = qualified.reduce((acc, d) => acc + d.count, 0);
    const miscTabsCount = totalTabs - qualifiedTabsCount;

    return {
      totalTabs,
      qualified,
      miscTabsCount,
      hasMisc: miscTabsCount > 0,
      totalGroups: qualified.length + (miscTabsCount > 0 ? 1 : 0),
    };
  }, [tabGroups, minThreshold, confirmAutoOrganizeModalOpen]);

  const handleDeleteSingleTab = async (instance: DomainTabInstance) => {
    if (isPerformingAction) return;
    setIsPerformingAction(true);
    try {
      await deleteSingleTabInstance(instance.groupId, instance.tabIndex, tabGroups);
      setStatusMessage({
        text: `Removed "${instance.title}"`,
        type: 'success',
      });
      if (onDataMutated) onDataMutated();
    } catch (err) {
      console.error('Failed to delete tab:', err);
    } finally {
      setIsPerformingAction(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const executeConsolidate = async () => {
    if (!confirmConsolidateCluster) return;
    setIsPerformingAction(true);
    const cluster = confirmConsolidateCluster;
    setConfirmConsolidateCluster(null);

    const isExisting = destinationType === 'existing';
    const targetGroup = isExisting ? tabGroups.find((g) => g.id === selectedExistingGroupId) : null;
    const finalName = isExisting && targetGroup ? targetGroup.name || 'Existing Collection' : customGroupName;

    try {
      const result = await consolidateDomain(cluster.rootDomain, cluster.instances, tabGroups, {
        mode: consolidateMode,
        targetGroupId: isExisting ? selectedExistingGroupId : undefined,
        targetGroupName: isExisting ? undefined : customGroupName,
        targetGroupColor: isExisting ? undefined : customGroupColor,
      });

      setJustConsolidatedDomain(cluster.rootDomain);
      setTimeout(() => setJustConsolidatedDomain(null), 8000);

      setStatusMessage({
        text: `Consolidated ${result.consolidatedCount} ${cluster.displayName} ${
          result.consolidatedCount === 1 ? 'tab' : 'tabs'
        } into "${finalName}"${result.prunedGroupsCount > 0 ? ` (pruned ${result.prunedGroupsCount} empty groups)` : ''}`,
        type: 'success',
      });

      if (onDataMutated) onDataMutated();
    } catch (err) {
      console.error('Failed to consolidate domain:', err);
    } finally {
      setIsPerformingAction(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const executeAutoOrganize = async () => {
    setConfirmAutoOrganizeModalOpen(false);
    setIsPerformingAction(true);
    try {
      const result = await autoOrganizeLibraryByDomain(tabGroups, {
        minTabsThreshold: minThreshold,
      });

      setStatusMessage({
        text: `Organized library into ${result.createdGroupsCount} domain collections (${result.organizedTabsCount} total tabs)`,
        type: 'success',
      });

      if (onDataMutated) onDataMutated();
    } catch (err) {
      console.error('Failed to auto-organize library:', err);
    } finally {
      setIsPerformingAction(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const executeDeleteDomain = async () => {
    if (!confirmDeleteCluster) return;
    setIsPerformingAction(true);
    const cluster = confirmDeleteCluster;
    setConfirmDeleteCluster(null);

    try {
      const result = await deleteDomainTabs(cluster.rootDomain, cluster.instances, tabGroups);
      setStatusMessage({
        text: `Removed all ${result.deletedCount} tabs from "${cluster.displayName}"`,
        type: 'success',
      });
      if (onDataMutated) onDataMutated();
    } catch (err) {
      console.error('Failed to delete domain tabs:', err);
    } finally {
      setIsPerformingAction(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
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

      {/* Sleek, Non-Overwhelming Header */}
      <div className="shrink-0 bg-card border border-border/70 p-4 rounded-xl space-y-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-2xs shrink-0">
              <FolderTree className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
                Domain Sorter & Organizer
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/30 text-primary bg-primary/10 font-bold">
                  Pro
                </Badge>
              </h3>
              <p className="text-xs text-muted-foreground">
                Cluster, analyze, and consolidate tabs across your library by website.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {summary.totalDomains > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={isPerformingAction}
                onClick={() => setConfirmAutoOrganizeModalOpen(true)}
                className="h-8 gap-1.5 text-xs font-semibold border-border hover:bg-muted cursor-pointer shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Auto-Organize Library</span>
              </Button>
            )}
          </div>
        </div>

        {/* Clean, Non-Crowded Metric Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/50 text-xs">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                : 'bg-muted/20 border-border/60 hover:bg-muted/40 text-muted-foreground'
            }`}
            title="Click to view all domains"
          >
            <span className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-primary" />
              <span>Unique Domains</span>
            </span>
            <strong className="text-foreground">{summary.totalDomains}</strong>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('scattered')}
            className={`flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer ${
              activeFilter === 'scattered'
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300 font-semibold'
                : 'bg-muted/20 border-border/60 hover:bg-muted/40 text-muted-foreground'
            }`}
            title="Click to filter to websites saved across 2 or more different groups"
          >
            <span className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>Scattered Domains</span>
            </span>
            <strong className={summary.scatteredDomainsCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}>
              {summary.scatteredDomainsCount}
            </strong>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('organized')}
            className={`flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer ${
              activeFilter === 'organized'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-semibold'
                : 'bg-muted/20 border-border/60 hover:bg-muted/40 text-muted-foreground'
            }`}
            title="Click to filter to domains already organized in a single collection"
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Already Organized</span>
            </span>
            <strong className="text-emerald-600 dark:text-emerald-400">{organizedCount}</strong>
          </button>

          <div className="flex items-center justify-between p-2 rounded-lg border border-border/60 bg-muted/20 text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>Total Tabs</span>
            </span>
            <strong className="text-foreground">{summary.totalTabs}</strong>
          </div>
        </div>
      </div>

      {/* Controls & Filter Toolbar */}
      <div className="shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-card/60 p-2.5 rounded-xl border border-border/60">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            All Domains ({clusters.length})
          </button>
          <button
            onClick={() => setActiveFilter('scattered')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              activeFilter === 'scattered'
                ? 'bg-amber-600 text-white font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title="Domains scattered across 2 or more groups"
          >
            {summary.scatteredDomainsCount > 0 && (
              <span className={`w-1.5 h-1.5 rounded-full ${activeFilter === 'scattered' ? 'bg-white' : 'bg-amber-500'}`} />
            )}
            <span>Scattered Across Groups ({summary.scatteredDomainsCount})</span>
          </button>
          <button
            onClick={() => setActiveFilter('organized')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              activeFilter === 'organized'
                ? 'bg-emerald-600 text-white font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title="Domains already consolidated into a single dedicated group"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>Already Organized ({organizedCount})</span>
          </button>
          <button
            onClick={() => setActiveFilter('high_volume')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
              activeFilter === 'high_volume'
                ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title="Domains with 5 or more tabs"
          >
            High Volume ({highVolumeCount})
          </button>
        </div>

        {/* Right Controls: Subdomain toggle, Sort, Collapse/Expand, Search */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setGroupBySubdomain(!groupBySubdomain)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              groupBySubdomain
                ? 'bg-primary/10 text-primary border-primary/30 font-semibold'
                : 'bg-muted/40 text-muted-foreground border-border/60 hover:text-foreground'
            }`}
            title="Toggle between grouping by root domain vs separate subdomains"
          >
            {groupBySubdomain ? 'Subdomains' : 'Root Domains'}
          </button>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort Domains"
            className="h-7 px-2 rounded-lg border border-border/70 bg-background text-xs font-medium text-foreground focus:outline-none cursor-pointer"
          >
            <option value="tabs_desc">Most Tabs</option>
            <option value="scattered_desc">Most Scattered</option>
            <option value="alpha_asc">Name (A → Z)</option>
          </select>

          {filteredClusters.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAllDomains}
              className="h-7 px-2 text-xs font-medium gap-1 border-border/70 bg-background hover:bg-muted shrink-0 cursor-pointer"
              title={allDomainsCollapsed ? 'Expand all domains' : 'Collapse all domains'}
            >
              <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">{allDomainsCollapsed ? 'Expand All' : 'Collapse All'}</span>
            </Button>
          )}

          <div className="relative w-36 sm:w-44">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search domains or URLs..."
              className="h-7 pl-8 text-xs bg-background"
            />
          </div>
        </div>
      </div>

      {/* Main Content Workspace */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 custom-scrollbar pr-1">
        {/* Zero Tabs State */}
        {summary.totalDomains === 0 && (
          <div className="h-72 flex flex-col items-center justify-center text-center p-6 bg-card/40 rounded-2xl border border-dashed border-border/80 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center">
              <Globe className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-foreground">No Domains Found</h4>
              <p className="text-xs text-muted-foreground max-w-sm">
                Save some open tabs to inspect their domains and organize your library.
              </p>
            </div>
          </div>
        )}

        {/* Specific Empty State: Scattered domains all organized */}
        {summary.totalDomains > 0 && activeFilter === 'scattered' && filteredClusters.length === 0 && (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-card/40 rounded-2xl border border-dashed border-emerald-500/40 space-y-3 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-foreground">All Domains are Organized!</h4>
              <p className="text-xs text-muted-foreground max-w-sm">
                Every website in your library is neatly consolidated into single collections. No scattered tabs remaining.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveFilter('all')}
              className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
            >
              View All Domains ({clusters.length})
            </Button>
          </div>
        )}

        {/* Specific Empty State: No organized domains yet */}
        {summary.totalDomains > 0 && activeFilter === 'organized' && filteredClusters.length === 0 && (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-card/40 rounded-2xl border border-dashed border-border/80 space-y-3 animate-in fade-in duration-200">
            <div className="w-10 h-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-foreground">No Consolidated Domains Yet</h4>
              <p className="text-xs text-muted-foreground max-w-sm">
                All your websites are currently scattered across multiple collections. Switch to scattered domains to organize them.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveFilter('scattered')}
              className="h-7 text-xs font-medium cursor-pointer"
            >
              Show Scattered Domains ({summary.scatteredDomainsCount})
            </Button>
          </div>
        )}

        {/* General Zero Matches State */}
        {summary.totalDomains > 0 &&
          activeFilter !== 'scattered' &&
          activeFilter !== 'organized' &&
          filteredClusters.length === 0 && (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-card/40 rounded-2xl border border-dashed border-border/80 space-y-3 animate-in fade-in duration-200">
              <div className="w-10 h-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
                <Search className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-foreground">No matching domains found</h4>
                <p className="text-xs text-muted-foreground max-w-sm">
                  {searchQuery.trim()
                    ? `No domains match "${searchQuery}". Try a different keyword.`
                    : `No domains found in the selected filter.`}
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
                  className="h-7 text-xs font-medium gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Filters
                </Button>
              )}
            </div>
          )}

        {/* Domain Cards List */}
        {filteredClusters.map((cluster) => {
          const isExpanded = searchQuery.trim() ? true : expandedDomains[cluster.id] !== false;
          const isJustConsolidated = justConsolidatedDomain === cluster.rootDomain;
          const isOrganized = cluster.groupsCount === 1;

          return (
            <Card
              key={cluster.id}
              className={`flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-all duration-300 hover:shadow-md ${
                isJustConsolidated
                  ? 'border-emerald-500/60 ring-2 ring-emerald-500/30 bg-emerald-500/5'
                  : 'border-border'
              }`}
            >
              {/* Header as interactive accordion trigger */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => toggleDomainExpanded(cluster.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleDomainExpanded(cluster.id);
                  }
                }}
                className={`w-full p-3.5 sm:p-4 bg-muted/20 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors hover:bg-muted/30 ${
                  isExpanded ? 'border-b border-border/70' : ''
                }`}
                title={isExpanded ? 'Click to collapse' : 'Click to expand'}
              >
                {/* Left Side: Favicon + Titles */}
                <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-card border border-border/80 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                    <img
                      src={cluster.faviconUrl}
                      alt=""
                      className="w-4 h-4 object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {cluster.displayName}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono truncate hidden sm:inline">
                        {cluster.rootDomain}
                      </span>
                      {cluster.groupsCount >= 2 ? (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-medium shrink-0">
                          Scattered in {cluster.groupsCount} groups
                        </Badge>
                      ) : isJustConsolidated ? (
                        <Badge variant="outline" className="text-[9px] px-2 py-0 h-4 border-emerald-500/60 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-bold gap-1 animate-pulse shrink-0">
                          <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                          Just Consolidated!
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-medium gap-1 shrink-0">
                          <Check className="w-2.5 h-2.5 text-emerald-500" />
                          Organized (1 group)
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground truncate">
                      <span>{cluster.totalTabs} {cluster.totalTabs === 1 ? 'tab' : 'tabs'}</span>
                      <span className="text-muted-foreground/40">•</span>
                      <span>Saved across {cluster.groupsCount} {cluster.groupsCount === 1 ? 'group' : 'groups'}</span>
                      {cluster.subdomains.length > 1 && (
                        <>
                          <span className="text-muted-foreground/40 hidden md:inline">•</span>
                          <span className="hidden md:inline text-muted-foreground/80">{cluster.subdomains.length} subdomains</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Side: Clean, non-colliding action controls */}
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {cluster.groupsCount >= 2 ? (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenConsolidate(cluster);
                      }}
                      className="h-7 text-xs font-semibold px-2.5 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs cursor-pointer shrink-0"
                      title="Gather all tabs of this domain into a single dedicated group"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Consolidate</span>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenConsolidate(cluster);
                      }}
                      className="h-7 px-2.5 text-xs font-medium border-border/80 hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                      title="Move tabs of this domain into another group"
                    >
                      Move
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteCluster(cluster);
                    }}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer shrink-0"
                    title="Delete all tabs of this domain across the library"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>

                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground shrink-0"
                    title={isExpanded ? 'Collapse domain tabs' : 'Expand domain tabs'}
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>
              </div>

              {/* Instances List (rendered when expanded) */}
              {isExpanded && (
                <CardContent className="p-3.5 sm:p-4 space-y-3 bg-background/20 animate-in fade-in-50 duration-150">
                  {/* Subdomain Breakdown Chips */}
                  {cluster.subdomains.length > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap pb-1 border-b border-border/50 text-[11px]">
                      <span className="text-muted-foreground font-medium">Subdomains:</span>
                      {cluster.subdomains.map((sub, sIdx) => (
                        <span
                          key={sIdx}
                          className="px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/60 text-[10px] font-mono"
                        >
                          {sub.subdomain} <strong className="text-foreground">({sub.count})</strong>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Tabs List */}
                  <div className="space-y-1.5">
                    {cluster.instances.map((instance, instIdx) => (
                      <div
                        key={instIdx}
                        className="flex items-center justify-between gap-3 p-2 rounded-lg bg-card border border-border/60 hover:border-border text-xs transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <span className="font-medium text-foreground truncate block">
                              {instance.title}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono truncate block">
                              {instance.url}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {/* Source Group Tag */}
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-md border border-border/50 max-w-[120px] sm:max-w-[160px]">
                            {instance.groupColor && GROUP_COLOR_MAP[instance.groupColor] && (
                              <span
                                className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
                                style={{ backgroundColor: GROUP_COLOR_MAP[instance.groupColor] }}
                              />
                            )}
                            <span className="truncate font-medium text-foreground">
                              {instance.groupName}
                            </span>
                          </div>

                          {/* Quick Actions (subtle hover state) */}
                          <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyUrl(instance.url);
                              }}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                              title="Copy URL"
                            >
                              {copiedTabUrl === instance.url ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <a
                              href={instance.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              title="Open Link in New Tab"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>

                            <button
                              type="button"
                              disabled={isPerformingAction}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSingleTab(instance);
                              }}
                              className={`p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer ${
                                isPerformingAction ? 'opacity-40 cursor-not-allowed' : ''
                              }`}
                              title="Remove tab from collection"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Confirmation Modal: Consolidate Domain */}
      <Dialog open={!!confirmConsolidateCluster} onOpenChange={(open) => !open && setConfirmConsolidateCluster(null)}>
        <DialogContent className="border-border bg-card shadow-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2 text-base font-bold">
              <Layers className="w-4 h-4 text-primary" />
              Consolidate Domain Tabs
            </DialogTitle>
            <DialogDescription asChild className="text-muted-foreground text-xs leading-relaxed pt-2 space-y-2">
              <div>
                {confirmConsolidateCluster && (
                  <>
                    <p>
                      Gather all <strong className="text-foreground">{confirmConsolidateCluster.totalTabs} tabs</strong> from <strong className="text-foreground">{confirmConsolidateCluster.displayName}</strong> into a dedicated collection.
                    </p>

                    {/* Mode Radio Choice */}
                    <div className="p-3 bg-muted/30 rounded-xl border border-border/70 space-y-2 text-xs">
                      <span className="font-semibold text-foreground block">Consolidation Mode:</span>
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="consolidateMode"
                          checked={consolidateMode === 'move'}
                          onChange={() => setConsolidateMode('move')}
                          className="mt-0.5 text-primary focus:ring-primary cursor-pointer"
                        />
                        <div>
                          <strong className="text-foreground font-semibold">Move tabs to new group</strong>
                          <span className="text-[11px] text-muted-foreground block">
                            Extracts tabs from old groups and automatically removes empty groups. (Recommended)
                          </span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="consolidateMode"
                          checked={consolidateMode === 'copy'}
                          onChange={() => setConsolidateMode('copy')}
                          className="mt-0.5 text-primary focus:ring-primary cursor-pointer"
                        />
                        <div>
                          <strong className="text-foreground font-semibold">Copy tabs to new group</strong>
                          <span className="text-[11px] text-muted-foreground block">
                            Copies tabs into the new collection, leaving original groups untouched.
                          </span>
                        </div>
                      </label>
                    </div>

                    {/* Destination Selection */}
                    <div className="space-y-1.5 pt-1">
                      <span className="font-semibold text-foreground block text-xs">Destination:</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setDestinationType('new')}
                          className={`p-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            destinationType === 'new'
                              ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                              : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground'
                          }`}
                        >
                          <FolderPlus className="w-3.5 h-3.5" />
                          New Collection
                        </button>
                        <button
                          type="button"
                          onClick={() => setDestinationType('existing')}
                          disabled={tabGroups.length === 0}
                          className={`p-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            destinationType === 'existing'
                              ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                              : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground'
                          } ${tabGroups.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <FolderTree className="w-3.5 h-3.5" />
                          Existing Collection
                        </button>
                      </div>
                    </div>

                    {/* Collection Customization */}
                    {destinationType === 'new' ? (
                      <div className="space-y-2 pt-1">
                        <label className="text-xs font-semibold text-foreground block">
                          Collection Name:
                        </label>
                        <Input
                          value={customGroupName}
                          onChange={(e) => setCustomGroupName(e.target.value)}
                          placeholder="e.g. GitHub Collection"
                          className="h-8 text-xs bg-background"
                        />

                        <label className="text-xs font-semibold text-foreground block pt-1">
                          Color Tag:
                        </label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {COLOR_OPTIONS.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setCustomGroupColor(c.id)}
                              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                customGroupColor === c.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-card scale-110' : 'opacity-80 hover:opacity-100'
                              }`}
                              style={{ backgroundColor: c.color }}
                              title={c.label}
                            >
                              {customGroupColor === c.id && <Check className="w-3 h-3 text-white" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <label className="text-xs font-semibold text-foreground block">
                          Target Existing Collection:
                        </label>
                        <select
                          value={selectedExistingGroupId}
                          onChange={(e) => setSelectedExistingGroupId(Number(e.target.value))}
                          aria-label="Select Target Collection"
                          className="w-full h-8 px-2.5 rounded-lg border border-border bg-background text-xs font-medium text-foreground focus:outline-none cursor-pointer"
                        >
                          {tabGroups.map((g) => {
                            const containsTabs = confirmConsolidateCluster?.instances.some(
                              (inst) => inst.groupId === g.id
                            );
                            return (
                              <option key={g.id} value={g.id}>
                                {g.name || 'Untitled Collection'} ({g.tabs?.length || 0} tabs){containsTabs ? ' • (contains tabs)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}

                    <div className="p-2.5 bg-muted/40 rounded-xl border border-border/70 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        Rolling Backup Protection
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        An automatic restore snapshot is captured before modifying storage. You can revert anytime in Settings.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmConsolidateCluster(null)} className="text-xs cursor-pointer">
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={isPerformingAction || (destinationType === 'new' && !customGroupName.trim())}
              onClick={executeConsolidate}
              className="text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            >
              Consolidate Tabs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal: Auto-Organize Entire Library */}
      <Dialog open={confirmAutoOrganizeModalOpen} onOpenChange={setConfirmAutoOrganizeModalOpen}>
        <DialogContent className="border-border bg-card shadow-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2 text-base font-bold">
              <Sparkles className="w-4 h-4 text-primary" />
              Auto-Organize Entire Library by Domain
            </DialogTitle>
            <DialogDescription asChild className="text-muted-foreground text-xs leading-relaxed pt-2 space-y-2">
              <div>
                <p>
                  TwoTab will scan your entire active library of <strong className="text-foreground">{summary.totalTabs} tabs</strong> and automatically group them into clean, domain-based collections.
                </p>

                <div className="p-3 bg-muted/30 rounded-xl border border-border/70 space-y-2 text-xs">
                  <span className="font-semibold text-foreground block">Grouping Threshold:</span>
                  <div className="flex items-center gap-2">
                    {[3, 5, 10].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMinThreshold(t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          minThreshold === t
                            ? 'bg-primary text-primary-foreground border-primary font-bold'
                            : 'bg-background text-muted-foreground border-border hover:text-foreground'
                        }`}
                      >
                        At least {t} tabs
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Websites with at least {minThreshold} tabs will get their own dedicated collection. Smaller, single-link sites will be neatly stored in a <em>"Miscellaneous & Single Links"</em> collection.
                  </p>
                </div>

                {autoOrganizePreview && (
                  <div className="p-3 bg-muted/40 rounded-xl border border-border/70 space-y-2 text-xs animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                      <span>Organization Preview:</span>
                      <span className="text-[11px] text-primary font-bold">
                        {autoOrganizePreview.totalGroups} new {autoOrganizePreview.totalGroups === 1 ? 'collection' : 'collections'}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Creates <strong>{autoOrganizePreview.qualified.length} dedicated {autoOrganizePreview.qualified.length === 1 ? 'collection' : 'collections'}</strong> ({autoOrganizePreview.qualified.reduce((a, b) => a + b.count, 0)} tabs)
                      {autoOrganizePreview.hasMisc ? ` and 1 miscellaneous collection (${autoOrganizePreview.miscTabsCount} tabs).` : '.'}
                    </p>
                    {autoOrganizePreview.qualified.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        {autoOrganizePreview.qualified.slice(0, 5).map((q) => (
                          <span
                            key={q.rootDomain}
                            className="px-2 py-0.5 rounded-md bg-card border border-border/80 text-[10px] font-medium text-foreground flex items-center gap-1 shadow-xs"
                          >
                            <span>{q.displayName}</span>
                            <span className="text-muted-foreground font-mono">({q.count})</span>
                          </span>
                        ))}
                        {autoOrganizePreview.qualified.length > 5 && (
                          <span className="text-[10px] text-muted-foreground font-medium">
                            +{autoOrganizePreview.qualified.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="p-2.5 bg-muted/40 rounded-xl border border-border/70 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    Automatic Rolling Backup Snapshot
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    A timestamped restore snapshot is automatically created before any changes. You can restore your previous structure anytime in Settings.
                  </p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmAutoOrganizeModalOpen(false)} className="text-xs cursor-pointer">
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={executeAutoOrganize} className="text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer">
              Proceed & Organize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal: Delete Domain Tabs */}
      <Dialog open={!!confirmDeleteCluster} onOpenChange={(open) => !open && setConfirmDeleteCluster(null)}>
        <DialogContent className="border-border bg-card shadow-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2 text-base font-bold text-destructive">
              <Trash2 className="w-4 h-4 text-destructive" />
              Delete All {confirmDeleteCluster?.displayName} Tabs
            </DialogTitle>
            <DialogDescription asChild className="text-muted-foreground text-xs leading-relaxed pt-2 space-y-2">
              <div>
                {confirmDeleteCluster && (
                  <p>
                    Are you sure you want to permanently delete all <strong className="text-foreground">{confirmDeleteCluster.totalTabs} tabs</strong> from <strong className="text-foreground">{confirmDeleteCluster.displayName}</strong> ({confirmDeleteCluster.rootDomain}) across all {confirmDeleteCluster.groupsCount} groups?
                  </p>
                )}
                <div className="p-2.5 bg-muted/40 rounded-xl border border-border/70 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    Automatic Rolling Backup
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    A snapshot will be created before deletion, allowing you to undo this in Settings.
                  </p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteCluster(null)} className="text-xs cursor-pointer">
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={executeDeleteDomain} className="text-xs font-semibold cursor-pointer">
              Permanently Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
