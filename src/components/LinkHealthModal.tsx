import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  type TabGroup,
  type Tab,
} from '@/lib/storage';
import {
  type LinkHealthResult,
  type HealthScanProgress,
  type LinkHealthStatus,
  type LinkHealthScanState,
  getLinkHealthCache,
  getLinkHealthScanState,
  clearLinkHealthCache,
  applyBatchRedirects,
  quarantineBrokenLinks,
  purgeBrokenLinks,
  getWaybackUrl,
  isCheckableUrl,
  LINK_HEALTH_CACHE_KEY,
  LINK_HEALTH_SCAN_STATE_KEY,
} from '@/lib/linkHealth';
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
  Activity,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Play,
  Pause,
  RotateCcw,
  ExternalLink,
  Archive,
  Trash2,
  Search,
  Check,
  Loader2,
  History,
  Zap,
  WifiOff,
  Wifi,
} from 'lucide-react';

interface LinkHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  tabGroups: TabGroup[];
  onDataMutated?: () => void;
}

export function LinkHealthModal({
  isOpen,
  onClose,
  tabGroups,
  onDataMutated,
}: LinkHealthModalProps) {
  // Scan State
  const [results, setResults] = useState<Record<string, LinkHealthResult>>({});
  const [progress, setProgress] = useState<HealthScanProgress>({
    total: 0,
    checked: 0,
    healthy: 0,
    redirected: 0,
    protected: 0,
    broken: 0,
    unreachable: 0,
    isScanning: false,
    isPaused: false,
    isWaitingForNetwork: false,
    velocity: 0,
  });

  const [isLoadingInitialState, setIsLoadingInitialState] = useState(true);
  const [offlineAlert, setOfflineAlert] = useState<string | null>(null);

  // Filters & Search
  const [activeFilter, setActiveFilter] = useState<'all' | LinkHealthStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Action / Confirmation States
  const [confirmAction, setConfirmAction] = useState<'update_redirects' | 'quarantine_broken' | 'purge_broken' | null>(null);
  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Collect all unique checkable tabs with their metadata
  const allLibraryTabs = useMemo(() => {
    const list: Array<{ url: string; title: string; groupId: number; groupName: string }> = [];
    const seen = new Set<string>();
    for (const group of tabGroups) {
      for (const t of group.tabs || []) {
        if (t && t.url && isCheckableUrl(t.url) && !seen.has(t.url)) {
          seen.add(t.url);
          list.push({
            url: t.url,
            title: t.title || t.url,
            groupId: group.id,
            groupName: group.name || 'Untitled Group',
          });
        }
      }
    }
    return list;
  }, [tabGroups]);

  // Load persistent cache and live scan state from background service worker
  const loadStoredState = async () => {
    try {
      const [cachedResults, scanState] = await Promise.all([
        getLinkHealthCache(),
        getLinkHealthScanState(),
      ]);

      setResults(cachedResults || {});

      const checkedCount = Object.keys(cachedResults || {}).length;
      const totalCount = scanState.total > 0 ? scanState.total : allLibraryTabs.length;

      let healthy = 0;
      let redirected = 0;
      let protectedCount = 0;
      let broken = 0;
      let unreachable = 0;

      for (const item of Object.values(cachedResults || {})) {
        if (item.status === 'healthy') healthy++;
        else if (item.status === 'redirected') redirected++;
        else if (item.status === 'protected') protectedCount++;
        else if (item.status === 'broken') broken++;
        else if (item.status === 'unreachable') unreachable++;
      }

      setProgress({
        total: totalCount,
        checked: checkedCount,
        healthy,
        redirected,
        protected: protectedCount,
        broken,
        unreachable,
        isScanning: scanState.isScanning,
        isPaused: scanState.isPaused,
        isWaitingForNetwork: scanState.isWaitingForNetwork || false,
        velocity: scanState.velocity || 0,
      });
    } catch (e) {
      console.warn('[TwoTab LinkHealth] Failed to load initial state:', e);
    } finally {
      setIsLoadingInitialState(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStoredState();
      setOfflineAlert(null);

      // Listen to live background progress events
      const handleMessage = (msg: any) => {
        if (!msg) return;
        if (msg.action === 'linkHealthProgress') {
          if (msg.progress) {
            setProgress((prev) => ({
              ...prev,
              ...msg.progress,
            }));
          }
          if (msg.results) {
            setResults(msg.results);
          } else if (msg.currentResult) {
            setResults((prev) => ({
              ...prev,
              [msg.currentResult.url]: msg.currentResult,
            }));
          }
        } else if (msg.action === 'linkHealthCompleted') {
          if (msg.progress) {
            setProgress((prev) => ({
              ...prev,
              ...msg.progress,
              isScanning: false,
              isWaitingForNetwork: false,
            }));
          }
          if (msg.results) {
            setResults(msg.results);
          }
        }
      };

      chrome.runtime.onMessage.addListener(handleMessage);

      // Listen to storage changes
      const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName === 'local') {
          if (changes[LINK_HEALTH_CACHE_KEY]?.newValue) {
            setResults(changes[LINK_HEALTH_CACHE_KEY].newValue);
          }
          if (changes[LINK_HEALTH_SCAN_STATE_KEY]?.newValue) {
            const newState: LinkHealthScanState = changes[LINK_HEALTH_SCAN_STATE_KEY].newValue;
            setProgress((prev) => ({
              ...prev,
              ...newState,
            }));
          }
        }
      };

      chrome.storage.onChanged.addListener(handleStorageChange);

      return () => {
        chrome.runtime.onMessage.removeListener(handleMessage);
        chrome.storage.onChanged.removeListener(handleStorageChange);
      };
    } else {
      setConfirmAction(null);
      setActionSuccessMessage(null);
      setOfflineAlert(null);
    }
  }, [isOpen, allLibraryTabs.length]);

  // Background Control Actions via Service Worker
  const handleStartScan = (forceRefresh = false) => {
    setOfflineAlert(null);
    chrome.runtime.sendMessage(
      { action: 'startLinkHealthScan', forceRefresh },
      (response) => {
        if (response && response.status === 'offline') {
          setOfflineAlert(response.message || 'No internet connection detected. Please check your network.');
          return;
        }
        if (response && response.status === 'started') {
          setProgress((prev) => ({
            ...prev,
            isScanning: true,
            isPaused: false,
            isWaitingForNetwork: false,
            total: response.total || allLibraryTabs.length,
          }));
        }
      }
    );
  };

  const handleTogglePause = () => {
    const nextPaused = !progress.isPaused;
    // 0ms instant optimistic UI state update
    setProgress((prev) => ({ ...prev, isPaused: nextPaused }));
    const action = nextPaused ? 'pauseLinkHealthScan' : 'resumeLinkHealthScan';
    chrome.runtime.sendMessage({ action }, (response) => {
      if (response && response.state) {
        setProgress((prev) => ({ ...prev, isPaused: response.state.isPaused }));
      }
    });
  };

  const handleStopScan = () => {
    chrome.runtime.sendMessage({ action: 'stopLinkHealthScan' }, () => {
      setProgress((prev) => ({ ...prev, isScanning: false, isPaused: false, isWaitingForNetwork: false }));
    });
  };

  const handleRescanAll = async () => {
    await clearLinkHealthCache();
    setResults({});
    handleStartScan(true);
  };

  // Group and count categorized items
  const {
    redirectItems,
    brokenItems,
    protectedItems,
    healthyItems,
    unreachableItems,
  } = useMemo(() => {
    const redirects: LinkHealthResult[] = [];
    const broken: LinkHealthResult[] = [];
    const protectedList: LinkHealthResult[] = [];
    const healthy: LinkHealthResult[] = [];
    const unreachable: LinkHealthResult[] = [];

    for (const res of Object.values(results)) {
      if (res.status === 'redirected') redirects.push(res);
      else if (res.status === 'broken') broken.push(res);
      else if (res.status === 'protected') protectedList.push(res);
      else if (res.status === 'healthy') healthy.push(res);
      else if (res.status === 'unreachable') unreachable.push(res);
    }

    return {
      redirectItems: redirects,
      brokenItems: broken,
      protectedItems: protectedList,
      healthyItems: healthy,
      unreachableItems: unreachable,
    };
  }, [results]);

  // Filtered and searched result list
  const displayItems = useMemo(() => {
    let list = Object.values(results);

    if (activeFilter !== 'all') {
      list = list.filter((item) => item.status === activeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.url.toLowerCase().includes(q) ||
          (item.finalUrl && item.finalUrl.toLowerCase().includes(q)) ||
          (item.error && item.error.toLowerCase().includes(q))
      );
    }

    // Sort order: Broken -> Redirects -> Unreachable -> Protected -> Healthy
    const priority: Record<LinkHealthStatus, number> = {
      broken: 1,
      redirected: 2,
      unreachable: 3,
      protected: 4,
      healthy: 5,
    };

    return list.sort((a, b) => (priority[a.status] || 99) - (priority[b.status] || 99));
  }, [results, activeFilter, searchQuery]);

  // Execute Batch Resolution Actions
  const executeUpdateRedirects = async () => {
    if (redirectItems.length === 0) return;
    setIsPerformingAction(true);
    try {
      const payload = redirectItems
        .filter((r) => r.finalUrl)
        .map((r) => ({ oldUrl: r.url, newUrl: r.finalUrl! }));

      const res = await applyBatchRedirects(payload);
      setActionSuccessMessage(`Successfully updated ${res.updatedCount} URLs to their target destinations across ${res.affectedGroupsCount} groups.`);
      setConfirmAction(null);
      if (onDataMutated) onDataMutated();
      handleStartScan(false);
    } catch (e: any) {
      console.error('[TwoTab] Error updating batch redirects:', e);
    } finally {
      setIsPerformingAction(false);
    }
  };

  const executeQuarantineBroken = async () => {
    if (brokenItems.length === 0) return;
    setIsPerformingAction(true);
    try {
      const brokenUrls = brokenItems.map((r) => r.url);
      const res = await quarantineBrokenLinks(brokenUrls);
      setActionSuccessMessage(`Quarantined ${res.quarantinedCount} broken links into a dedicated archive group.`);
      setConfirmAction(null);
      if (onDataMutated) onDataMutated();
      handleStartScan(false);
    } catch (e: any) {
      console.error('[TwoTab] Error quarantining broken links:', e);
    } finally {
      setIsPerformingAction(false);
    }
  };

  const executePurgeBroken = async () => {
    if (brokenItems.length === 0) return;
    setIsPerformingAction(true);
    try {
      const brokenUrls = brokenItems.map((r) => r.url);
      const res = await purgeBrokenLinks(brokenUrls);
      setActionSuccessMessage(`Permanently deleted ${res.purgedCount} dead links across ${res.affectedGroupsCount} groups.`);
      setConfirmAction(null);
      if (onDataMutated) onDataMutated();
      handleStartScan(false);
    } catch (e: any) {
      console.error('[TwoTab] Error purging broken links:', e);
    } finally {
      setIsPerformingAction(false);
    }
  };

  const percentComplete = progress.total > 0
    ? Math.min(100, Math.round((progress.checked / progress.total) * 100))
    : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="flex flex-col w-full max-w-5xl h-[90vh] bg-card text-card-foreground border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Tier 1: Fixed Header */}
        <div className="shrink-0 p-5 sm:p-6 border-b border-border bg-muted/20 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-sm">
                <Activity className={`w-5 h-5 ${progress.isScanning && !progress.isPaused && !progress.isWaitingForNetwork ? 'animate-pulse' : ''}`} />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  Link Health & Dead Link Inspector
                  <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/10">
                    Pro
                  </Badge>
                </h2>
                <p className="text-xs text-muted-foreground">
                  Background network evaluation, dead link detection (404), and 1-click redirect optimizer.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!progress.isScanning && (
                <Button
                  size="sm"
                  onClick={() => handleStartScan(false)}
                  className="text-xs h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                >
                  <Play className="w-3 h-3 fill-current" />
                  {progress.checked > 0 ? 'Resume / Check Unscanned' : 'Start Full Scan'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRescanAll}
                disabled={progress.isScanning}
                className="text-xs h-8 gap-1.5"
                title="Wipe local cache and perform a full fresh network health scan"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Re-scan All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-xs h-8 text-muted-foreground hover:text-foreground"
              >
                Close
              </Button>
            </div>
          </div>

          {/* Offline Warning Banner if Pre-flight fails */}
          {offlineAlert && (
            <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium">
                <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
                {offlineAlert}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStartScan(false)}
                className="h-6 text-[11px] border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
              >
                Retry Connection
              </Button>
            </div>
          )}

          {/* Progress Bar & Velocity Controller */}
          <div className="space-y-2 bg-background/60 p-3.5 rounded-xl border border-border/70">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-medium">
                {progress.isWaitingForNetwork ? (
                  <span className="flex items-center gap-1.5 text-amber-400 font-semibold animate-pulse">
                    <WifiOff className="w-3.5 h-3.5" />
                    Network interrupted. Waiting for internet connection to auto-resume...
                  </span>
                ) : progress.isPaused ? (
                  <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                    <Pause className="w-3.5 h-3.5 fill-amber-400" />
                    Scan paused at {progress.checked} of {progress.total} links ({percentComplete}%)
                  </span>
                ) : progress.isScanning ? (
                  <span className="flex items-center gap-1.5 text-primary font-medium">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Background scanning {progress.checked} of {progress.total} unique links ({percentComplete}%)
                  </span>
                ) : progress.checked > 0 && progress.checked >= progress.total ? (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    All {progress.checked} links evaluated & verified
                  </span>
                ) : progress.checked > 0 ? (
                  <span className="flex items-center gap-1.5 text-foreground font-medium">
                    <History className="w-3.5 h-3.5 text-primary" />
                    {progress.checked} of {progress.total} links evaluated ({percentComplete}%)
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Ready to scan {allLibraryTabs.length} unique links in the background
                  </span>
                )}

                {progress.velocity > 0 && progress.isScanning && !progress.isPaused && !progress.isWaitingForNetwork && (
                  <span className="text-muted-foreground text-[11px]">
                    • {progress.velocity} links/sec
                  </span>
                )}
              </div>

              {/* Scan Control Buttons */}
              {progress.isScanning && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleTogglePause}
                    className="h-6 px-2 text-[11px] gap-1"
                  >
                    {progress.isPaused ? (
                      <>
                        <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" /> Resume
                      </>
                    ) : (
                      <>
                        <Pause className="w-3 h-3 text-amber-400 fill-amber-400" /> Pause
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleStopScan}
                    className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/15"
                  >
                    Stop
                  </Button>
                </div>
              )}
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden border border-border/30">
              <div
                className={`h-full transition-all duration-300 ease-out ${
                  progress.isWaitingForNetwork ? 'bg-amber-400 animate-pulse' : 'bg-primary'
                }`}
                style={{ width: `${percentComplete}%` }}
              />
            </div>
          </div>

          {/* Metric Filter Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {/* Healthy */}
            <button
              onClick={() => setActiveFilter(activeFilter === 'healthy' ? 'all' : 'healthy')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                activeFilter === 'healthy'
                  ? 'border-emerald-500/50 bg-emerald-500/15 shadow-sm'
                  : 'border-border/60 bg-muted/20 hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Healthy
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-bold">
                  {healthyItems.length}
                </Badge>
              </div>
              <p className="text-lg font-bold text-foreground mt-1">{healthyItems.length}</p>
            </button>

            {/* Redirected */}
            <button
              onClick={() => setActiveFilter(activeFilter === 'redirected' ? 'all' : 'redirected')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                activeFilter === 'redirected'
                  ? 'border-blue-500/50 bg-blue-500/15 shadow-sm'
                  : 'border-border/60 bg-muted/20 hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5 text-blue-400" /> Redirects
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-blue-500/30 text-blue-400 bg-blue-500/10 font-bold">
                  {redirectItems.length}
                </Badge>
              </div>
              <p className="text-lg font-bold text-foreground mt-1">{redirectItems.length}</p>
            </button>

            {/* Protected */}
            <button
              onClick={() => setActiveFilter(activeFilter === 'protected' ? 'all' : 'protected')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                activeFilter === 'protected'
                  ? 'border-amber-500/50 bg-amber-500/15 shadow-sm'
                  : 'border-border/60 bg-muted/20 hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Protected
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/30 text-amber-400 bg-amber-500/10 font-bold">
                  {protectedItems.length}
                </Badge>
              </div>
              <p className="text-lg font-bold text-foreground mt-1">{protectedItems.length}</p>
            </button>

            {/* Broken */}
            <button
              onClick={() => setActiveFilter(activeFilter === 'broken' ? 'all' : 'broken')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                activeFilter === 'broken'
                  ? 'border-rose-500/50 bg-rose-500/15 shadow-sm'
                  : 'border-border/60 bg-muted/20 hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-rose-400" /> Broken 404
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-rose-500/30 text-rose-400 bg-rose-500/10 font-bold">
                  {brokenItems.length}
                </Badge>
              </div>
              <p className="text-lg font-bold text-foreground mt-1">{brokenItems.length}</p>
            </button>

            {/* Unreachable */}
            <button
              onClick={() => setActiveFilter(activeFilter === 'unreachable' ? 'all' : 'unreachable')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                activeFilter === 'unreachable'
                  ? 'border-purple-500/50 bg-purple-500/15 shadow-sm'
                  : 'border-border/60 bg-muted/20 hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-purple-400" /> Unreachable
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-purple-500/30 text-purple-400 bg-purple-500/10 font-bold">
                  {unreachableItems.length}
                </Badge>
              </div>
              <p className="text-lg font-bold text-foreground mt-1">{unreachableItems.length}</p>
            </button>
          </div>
        </div>

        {/* Tier 2: Search & Quick Resolution Toolbar */}
        <div className="shrink-0 px-6 py-3 border-b border-border/80 bg-background/50 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search evaluated links, target URLs, or errors..."
              className="pl-9 h-8.5 text-xs bg-muted/30 border-border"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Action: Batch Update Redirects */}
            {redirectItems.length > 0 && (
              <Button
                size="sm"
                onClick={() => setConfirmAction('update_redirects')}
                className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-500 text-white shadow-sm font-medium"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Update {redirectItems.length} Redirects
              </Button>
            )}

            {/* Quick Action: Quarantine Dead Links */}
            {brokenItems.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmAction('quarantine_broken')}
                className="h-8 text-xs gap-1.5 border-rose-500/30 text-rose-400 hover:bg-rose-500/15 font-medium"
              >
                <Archive className="w-3.5 h-3.5" />
                Quarantine {brokenItems.length} Dead
              </Button>
            )}

            {/* Quick Action: Purge Dead Links */}
            {brokenItems.length > 0 && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmAction('purge_broken')}
                className="h-8 text-xs gap-1.5 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Purge {brokenItems.length} Dead
              </Button>
            )}
          </div>
        </div>

        {/* Action Success Alert Banner */}
        {actionSuccessMessage && (
          <div className="shrink-0 px-6 py-2.5 bg-emerald-500/15 border-b border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
            <span className="flex items-center gap-2 font-medium">
              <Check className="w-4 h-4 text-emerald-400" />
              {actionSuccessMessage}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActionSuccessMessage(null)}
              className="h-6 px-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20"
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Tier 3: Scrollable Evaluation Results List */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-2.5">
          {isLoadingInitialState ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs">Loading health inspection state...</p>
            </div>
          ) : displayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 text-center text-muted-foreground space-y-3">
              <ShieldCheck className="w-12 h-12 opacity-30 text-primary" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {Object.keys(results).length === 0 ? 'No links have been scanned yet' : 'No links matching the selected filter'}
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  {Object.keys(results).length === 0
                    ? `Click 'Start Full Scan' to begin background health evaluation across ${allLibraryTabs.length} tabs.`
                    : searchQuery ? 'Try clearing your search term.' : 'All evaluated links in this category are clear.'}
                </p>
              </div>
              {Object.keys(results).length === 0 && !progress.isScanning && (
                <Button
                  size="sm"
                  onClick={() => handleStartScan(false)}
                  className="text-xs h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 mt-1 font-medium"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Start Full Scan ({allLibraryTabs.length} tabs)
                </Button>
              )}
            </div>
          ) : (
            displayItems.map((item) => {
              const waybackUrl = getWaybackUrl(item.url);

              return (
                <div
                  key={item.url}
                  className="p-3 rounded-xl border border-border/80 bg-card/60 hover:bg-muted/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Status Badge Icon */}
                    <div className="mt-0.5 shrink-0">
                      {item.status === 'healthy' && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      )}
                      {item.status === 'redirected' && (
                        <ArrowRight className="w-4 h-4 text-blue-400" />
                      )}
                      {item.status === 'protected' && (
                        <ShieldCheck className="w-4 h-4 text-amber-400" />
                      )}
                      {item.status === 'broken' && (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                      {item.status === 'unreachable' && (
                        <AlertTriangle className="w-4 h-4 text-purple-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      {/* URL Display */}
                      <div className="flex items-center gap-2">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-foreground hover:underline truncate max-w-[450px]"
                          title={item.url}
                        >
                          {item.url}
                        </a>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      {/* Redirect Diff / Target URL */}
                      {item.status === 'redirected' && item.finalUrl && (
                        <div className="flex items-center gap-1.5 text-blue-400 font-mono text-[11px] truncate">
                          <span>Target:</span>
                          <a
                            href={item.finalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline truncate max-w-[420px]"
                            title={item.finalUrl}
                          >
                            {item.finalUrl}
                          </a>
                        </div>
                      )}

                      {/* Error or Status message */}
                      {item.error && (
                        <p className="text-[11px] text-muted-foreground">
                          {item.error}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions & Status Pill */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {/* Status Code */}
                    {item.statusCode && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 font-mono ${
                          item.status === 'healthy'
                            ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                            : item.status === 'redirected'
                            ? 'border-blue-500/30 text-blue-400 bg-blue-500/10'
                            : item.status === 'protected'
                            ? 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                            : 'border-rose-500/30 text-rose-400 bg-rose-500/10'
                        }`}
                      >
                        {item.statusCode}
                      </Badge>
                    )}

                    {/* Wayback Machine Button (for broken links) */}
                    {item.status === 'broken' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => chrome.tabs.create({ url: waybackUrl })}
                        className="h-7 px-2 text-[11px] gap-1 border-muted-foreground/30 hover:bg-muted"
                        title="Search for historical cached snapshot on Internet Archive"
                      >
                        <History className="w-3 h-3 text-primary" />
                        Wayback
                      </Button>
                    )}

                    {/* Single Redirect Apply Button */}
                    {item.status === 'redirected' && item.finalUrl && (
                      <Button
                        size="sm"
                        onClick={() =>
                          applyBatchRedirects([{ oldUrl: item.url, newUrl: item.finalUrl! }]).then(
                            () => {
                              if (onDataMutated) onDataMutated();
                              handleStartScan(false);
                            }
                          )
                        }
                        className="h-7 px-2 text-[11px] gap-1 bg-blue-600 hover:bg-blue-500 text-white font-medium"
                      >
                        Update
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Tier 4: Fixed Action Footer */}
        <div className="shrink-0 p-4 border-t border-border bg-card flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Showing {displayItems.length} of {Object.keys(results).length} evaluated links</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onClose}
              className="text-xs h-8"
            >
              Done
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog for Batch Actions */}
      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              {confirmAction === 'update_redirects' && <ArrowRight className="w-5 h-5 text-blue-400" />}
              {confirmAction === 'quarantine_broken' && <Archive className="w-5 h-5 text-rose-400" />}
              {confirmAction === 'purge_broken' && <Trash2 className="w-5 h-5 text-destructive" />}
              {confirmAction === 'update_redirects' && 'Update Redirected URLs?'}
              {confirmAction === 'quarantine_broken' && 'Quarantine Dead Links?'}
              {confirmAction === 'purge_broken' && 'Permanently Delete Dead Links?'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-2">
              {confirmAction === 'update_redirects' &&
                `This will replace ${redirectItems.length} old URLs with their new destination targets across all your saved tab groups.`}
              {confirmAction === 'quarantine_broken' &&
                `This will move ${brokenItems.length} broken (404/410) tabs out of their current groups and gather them into a new 'Broken Links Archive' collection.`}
              {confirmAction === 'purge_broken' &&
                `This will permanently delete ${brokenItems.length} broken tabs from your TwoTab library.`}
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-muted/40 rounded-xl border border-border/80 text-xs text-muted-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>An automatic rolling backup snapshot will be recorded before this action.</span>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmAction(null)}
              disabled={isPerformingAction}
              className="text-xs"
            >
              Cancel
            </Button>
            {confirmAction === 'update_redirects' && (
              <Button
                size="sm"
                onClick={executeUpdateRedirects}
                disabled={isPerformingAction}
                className="text-xs bg-blue-600 hover:bg-blue-500 text-white gap-1.5"
              >
                {isPerformingAction && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Update ({redirectItems.length})
              </Button>
            )}
            {confirmAction === 'quarantine_broken' && (
              <Button
                size="sm"
                onClick={executeQuarantineBroken}
                disabled={isPerformingAction}
                className="text-xs bg-rose-600 hover:bg-rose-500 text-white gap-1.5"
              >
                {isPerformingAction && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Quarantine ({brokenItems.length})
              </Button>
            )}
            {confirmAction === 'purge_broken' && (
              <Button
                size="sm"
                variant="destructive"
                onClick={executePurgeBroken}
                disabled={isPerformingAction}
                className="text-xs gap-1.5"
              >
                {isPerformingAction && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Purge ({brokenItems.length})
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
