import React, { useEffect, useState, useRef, useMemo, useDeferredValue, useCallback, useLayoutEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  getGroups, 
  deleteGroup, 
  deleteTabFromGroup, 
  getRelativeTime, 
  type TabGroup, 
  getArchivedGroups, 
  archiveGroup, 
  unarchiveGroup, 
  deleteArchivedGroup, 
  renameGroup, 
  exportData,
  exportAsJson,
  exportAsMarkdown,
  exportAsPlainText,
  exportAsHtmlBookmarks,
  exportAsCsv,
  importData,
  importOneTabOrPlainText,
  clearAllData,
  getSafeDomain,
  getRecentlyClosedItems,
  removeRecentlyClosedItem,
  clearRecentlyClosedItems,
  formatDisplayUrl,
  type ClosedTabItem,
  type UserPreferences,
  DEFAULT_USER_PREFERENCES,
  getUserPreferences,
  setUserPreferences,
  restoreTabGroup,
  restoreAllTabGroups,
  createRollingBackup,
  getRollingBackupSnapshots,
  restoreFromRollingBackup,
  type BackupSnapshot,
  copyToClipboardSafe,
  runHealthCheck,
  type HealthCheckResult,
  PREFERENCES_STORAGE_KEY,
} from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  Search, 
  Trash2, 
  Archive, 
  LayoutDashboard, 
  Settings, 
  HelpCircle, 
  Plus, 
  RotateCcw, 
  Download, 
  Upload, 
  Edit2, 
  Check, 
  X, 
  History, 
  Sparkles, 
  Info, 
  Layers, 
  ChevronDown, 
  BookOpen, 
  ShieldAlert, 
  Globe, 
  Sun, 
  Moon, 
  Monitor, 
  Copy, 
  Bookmark, 
  Palette,
  Pin,
  PinOff,
  Sliders,
  ExternalLink,
  Zap,
  Folder,
  Database,
  FileText,
  Code,
  FileSpreadsheet,
  Keyboard,
  MousePointerClick,
  RefreshCw,
  Cpu,
  Lock,
  CheckCircle2,
  AlertCircle,
  Activity,
  HardDrive,
  ShieldCheck,
  LayoutGrid,
  List,
  Type,
  SunMedium,
  Maximize2,
  Grid
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { THEME_PALETTES, type ThemePalette } from '@/lib/theme';

interface DeleteConfirmState {
  type: 'group' | 'tab' | 'all';
  id?: number;
  groupId?: number;
  url?: string;
  title?: string;
}

// =============================================================================
// Virtualized Card Grid — renders only visible rows for 60 FPS at 10,000+ tabs
// =============================================================================

const CARD_HEIGHT = 220;
const CARD_GAP = 20; // gap-5 = 20px
const MIN_CARD_WIDTH = 280;
const ROW_HEIGHT = CARD_HEIGHT + CARD_GAP;
const GRID_PADDING = 32; // p-8 = 32px

function useContainerColumnCount(containerRef: React.RefObject<HTMLDivElement | null>, minCardWidth: number = 280, gap: number = 20) {
  const [cols, setCols] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const approxWidth = Math.max(0, window.innerWidth - 256 - GRID_PADDING * 2);
      return Math.max(1, Math.floor((approxWidth + gap) / (minCardWidth + gap)));
    }
    return 1;
  });

  const updateCols = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const width = el.clientWidth || el.getBoundingClientRect().width;
    if (width > 0) {
      const netWidth = Math.max(0, width - GRID_PADDING * 2);
      const calculatedCols = Math.max(
        1,
        Math.floor((netWidth + gap) / (minCardWidth + gap))
      );
      setCols(prev => (prev !== calculatedCols ? calculatedCols : prev));
    }
  }, [containerRef, minCardWidth, gap]);

  useLayoutEffect(() => {
    updateCols();
    const rafId = requestAnimationFrame(updateCols);

    const el = containerRef.current;
    if (!el) return () => cancelAnimationFrame(rafId);

    const observer = new ResizeObserver(() => {
      updateCols();
    });

    observer.observe(el);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [containerRef, updateCols]);

  return cols;
}

interface VirtualizedCardGridProps {
  activeTab: string;
  filteredGroups: TabGroup[];
  isSaving: boolean;
  editingGroupId: number | null;
  editingName: string;
  setEditingName: (name: string) => void;
  handleSaveCurrentWindow: () => void;
  handleSaveAllWindows: () => void;
  handleSaveRename: (id: number) => void;
  handleStartRename: (group: TabGroup) => void;
  setEditingGroupId: (id: number | null) => void;
  handleArchiveGroup: (id: number) => void;
  handleUnarchiveGroup: (id: number) => void;
  handleRestoreGroup: (group: TabGroup) => void;
  handleCopyGroupUrls: (group: TabGroup) => void;
  setDeleteConfirm: (state: DeleteConfirmState | null) => void;
  cardDensity?: 'comfortable' | 'compact' | 'list';
  faviconStyle?: 'color' | 'monochrome' | 'hidden';
  search?: string;
  setSearch?: (val: string) => void;
  isInitialLoading?: boolean;
}

function VirtualizedCardGrid({
  activeTab,
  filteredGroups,
  isSaving,
  editingGroupId,
  editingName,
  setEditingName,
  handleSaveCurrentWindow,
  handleSaveAllWindows,
  handleSaveRename,
  handleStartRename,
  setEditingGroupId,
  handleArchiveGroup,
  handleUnarchiveGroup,
  handleRestoreGroup,
  handleCopyGroupUrls,
  setDeleteConfirm,
  cardDensity = 'comfortable',
  faviconStyle = 'color',
  search = '',
  setSearch,
  isInitialLoading = false,
}: VirtualizedCardGridProps) {
  const isCompact = cardDensity === 'compact';
  const minCardWidth = isCompact ? 240 : 280;
  const currentCardHeight = isCompact ? 165 : 220;
  const currentCardGap = isCompact ? 16 : 20;
  const currentRowHeight = currentCardHeight + currentCardGap;

  const parentRef = useRef<HTMLDivElement>(null);
  const cols = useContainerColumnCount(parentRef, minCardWidth, currentCardGap);

  const rowCount = Math.ceil(filteredGroups.length / cols);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => currentRowHeight,
    overscan: 2,
  });

  const virtualItems = virtualizer.getVirtualItems();

  if (isInitialLoading) {
    return <div className="flex-1 min-h-[380px]" />;
  }

  if (filteredGroups.length === 0) {
    const isSearching = !!(search && search.trim() !== '');
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[380px]">
        <div className="w-16 h-16 rounded-2xl bg-muted/60 border border-border flex items-center justify-center mb-4 text-primary shadow-sm animate-float">
          {isSearching ? (
            <Search className="w-8 h-8 opacity-70 text-primary" />
          ) : activeTab === 'archive' ? (
            <Archive className="w-8 h-8 opacity-70 text-primary" />
          ) : (
            <Layers className="w-8 h-8 opacity-70 text-primary" />
          )}
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1.5">
          {isSearching 
            ? `No Matching ${activeTab === 'dashboard' ? 'Tab Groups' : 'Archived Groups'}`
            : activeTab === 'dashboard' ? 'No Saved Tabs Yet' : 'No Archived Groups'}
        </h3>
        <p className="text-xs text-muted-foreground max-w-sm mb-6 leading-relaxed">
          {isSearching
            ? `No tab collections match "${search}".`
            : activeTab === 'dashboard' 
              ? 'Click "+ Save Window" in the top bar to save all open tabs from this window into a clean collection.'
              : 'Archived tab collections will appear here for long-term safekeeping.'}
        </p>
        {isSearching && setSearch ? (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setSearch('')}
            className="btn-spring text-xs font-medium"
          >
            Clear Search
          </Button>
        ) : activeTab === 'dashboard' ? (
          <Button 
            onClick={handleSaveCurrentWindow} 
            disabled={isSaving}
            className="btn-spring shadow-sm bg-primary hover:bg-primary/90 text-primary-foreground text-xs px-4 h-9 font-medium rounded-lg"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Save Current Window
          </Button>
        ) : null}
      </div>
    );
  }

  // 1. List View layout (Full-Width stacked cards)
  if (cardDensity === 'list') {
    return (
      <div 
        ref={parentRef} 
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 max-w-5xl mx-auto w-full space-y-3"
      >
        {filteredGroups.map((group, groupIdx) => {
          const staggerIndex = Math.min(groupIdx, 12);
          return (
            <Card 
              key={group.id} 
              style={{ '--stagger-index': staggerIndex } as React.CSSProperties}
              className="animate-card-cascade card-interactive border border-border/80 hover:border-primary/40 bg-card text-card-foreground shadow-apple-card rounded-xl overflow-hidden"
            >
              <div className="p-3 bg-muted/30 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {editingGroupId === group.id ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-1">
                      <Input 
                        value={editingName} 
                        onChange={e => setEditingName(e.target.value)} 
                        className="h-7 text-xs bg-background border-input text-foreground focus-visible:ring-1 focus-visible:ring-primary"
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleSaveRename(group.id)}
                      />
                      <Button size="icon" variant="ghost" className="btn-spring h-7 w-7 text-primary hover:bg-primary/20 shrink-0" onClick={() => handleSaveRename(group.id)} title="Save name">
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="btn-spring h-7 w-7 text-muted-foreground hover:text-foreground shrink-0" onClick={() => setEditingGroupId(null)} title="Cancel">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group/title min-w-0 cursor-pointer" onClick={() => handleStartRename(group)} title="Click to rename">
                      <span className="truncate font-semibold text-sm text-foreground group-hover/title:text-primary transition-colors">{group.name || 'Saved Group'}</span>
                      <Edit2 className="w-3 h-3 opacity-0 group-hover/title:opacity-70 transition-opacity text-muted-foreground shrink-0" />
                    </div>
                  )}
                  <Badge variant="outline" className="text-[11px] font-medium border-border/70 bg-background/80 text-muted-foreground shrink-0 whitespace-nowrap">
                    {group.tabs.length} {group.tabs.length === 1 ? 'tab' : 'tabs'} • {getRelativeTime(group.date)}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 shrink-0 justify-end">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="btn-spring h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md" 
                    onClick={() => setDeleteConfirm({ type: 'group', id: group.id, title: group.name || 'Saved Group' })}
                    title="Delete group"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="btn-spring h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md" 
                    onClick={() => handleCopyGroupUrls(group)}
                    title="Copy URLs"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                  {activeTab === 'dashboard' ? (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="btn-spring h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md" 
                      onClick={() => handleArchiveGroup(group.id)}
                      title="Archive"
                    >
                      <Archive className="h-3.5 w-3.5 mr-1" /> Archive
                    </Button>
                  ) : (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="btn-spring h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md" 
                      onClick={() => handleUnarchiveGroup(group.id)}
                      title="Unarchive"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Unarchive
                    </Button>
                  )}
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="btn-spring h-7 px-3 text-xs font-medium bg-primary/15 hover:bg-primary/25 text-primary border border-primary/20 rounded-lg shadow-xs flex items-center gap-1.5" 
                    onClick={() => handleRestoreGroup(group)}
                  >
                    <RotateCcw className="h-3 w-3 text-primary" /> Restore Group
                  </Button>
                </div>
              </div>
              <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 bg-card/60">
                {group.tabs.map((tab, i) => {
                  const domain = getSafeDomain(tab.url);
                  return (
                    <div key={i} className="tab-row-hover flex items-center justify-between p-1.5 rounded-lg hover:bg-primary/10 group transition-all">
                      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                        {faviconStyle !== 'hidden' ? (
                          <div className="w-4 h-4 rounded flex items-center justify-center shrink-0">
                            {domain ? (
                              <img 
                                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} 
                                alt="" 
                                className={`w-4 h-4 opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-transform ${faviconStyle === 'monochrome' ? 'favicon-monochrome' : ''}`} 
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }} 
                              />
                            ) : (
                              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                          </div>
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary shrink-0" />
                        )}
                        <a href={tab.url} target="_blank" rel="noreferrer" className="truncate text-xs text-muted-foreground group-hover:text-foreground font-normal hover:underline transition-colors">
                          {tab.title || tab.url}
                        </a>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="btn-spring h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0" 
                        onClick={() => setDeleteConfirm({ type: 'tab', groupId: group.id, url: tab.url, title: tab.title || tab.url })}
                        title="Remove tab"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    );
  }

  // 2. Virtualized Grid View (Comfortable & Compact Deck)
  return (
    <div 
      ref={parentRef} 
      className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-8"
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const startIndex = virtualRow.index * cols;
          const rowGroups = filteredGroups.slice(startIndex, startIndex + cols);

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gap: `${currentCardGap}px`,
                }}
              >
                {rowGroups.map((group, colIdx) => {
                  const staggerIndex = Math.min(virtualRow.index * cols + colIdx, 12);
                  return (
                    <Card 
                      key={group.id} 
                      style={{ 
                        '--stagger-index': staggerIndex,
                        height: `${currentCardHeight}px`
                      } as React.CSSProperties}
                      className="animate-card-cascade card-interactive flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 hover:border-primary/50 bg-card text-card-foreground shadow-apple-card hover:shadow-apple-card-hover"
                    >
                      {/* Card Header (flex-shrink-0) */}
                      <CardHeader className={`${isCompact ? 'p-2.5 pb-1.5' : 'p-3.5 pb-2'} border-b border-border/60 bg-muted/30 flex items-center justify-between shrink-0`}>
                        <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                          {editingGroupId === group.id ? (
                            <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-1">
                              <Input 
                                value={editingName} 
                                onChange={e => setEditingName(e.target.value)} 
                                className="h-7 text-xs bg-background border-input text-foreground focus-visible:ring-1 focus-visible:ring-primary"
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleSaveRename(group.id)}
                              />
                              <Button size="icon" variant="ghost" className="btn-spring h-7 w-7 text-primary hover:bg-primary/20 shrink-0" onClick={() => handleSaveRename(group.id)} title="Save name">
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="btn-spring h-7 w-7 text-muted-foreground hover:text-foreground shrink-0" onClick={() => setEditingGroupId(null)} title="Cancel">
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group/title min-w-0 flex-1 cursor-pointer" onClick={() => handleStartRename(group)} title="Click to rename">
                              <span className="truncate font-semibold text-sm text-foreground group-hover/title:text-primary transition-colors">{group.name || 'Saved Group'}</span>
                              <Edit2 className="w-3 h-3 opacity-0 group-hover/title:opacity-70 transition-opacity text-muted-foreground shrink-0" />
                            </div>
                          )}
                          <span className="shrink-0 text-xs bg-muted/70 text-muted-foreground border border-border/60 px-2 py-0.5 rounded-full font-normal whitespace-nowrap">
                            {group.tabs.length} {group.tabs.length === 1 ? 'tab' : 'tabs'} • {getRelativeTime(group.date)}
                          </span>
                        </div>
                      </CardHeader>

                      {/* Card Body (flex-1 overflow-y-auto custom-scrollbar scroll-fade-bottom space-y-1) */}
                      <CardContent className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar scroll-fade-bottom ${isCompact ? 'p-2.5 space-y-0.5' : 'p-3.5 space-y-1'}`}>
                        {group.tabs.map((tab, i) => {
                          const domain = getSafeDomain(tab.url);
                          return (
                            <div key={i} className={`tab-row-hover flex items-center justify-between ${isCompact ? 'p-1' : 'p-1.5'} rounded-lg hover:bg-primary/10 group transition-all`}>
                              <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                {faviconStyle !== 'hidden' ? (
                                  <div className="w-4 h-4 rounded flex items-center justify-center shrink-0">
                                    {domain ? (
                                      <img 
                                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} 
                                        alt="" 
                                        className={`w-4 h-4 opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-transform ${faviconStyle === 'monochrome' ? 'favicon-monochrome' : ''}`} 
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                        }} 
                                      />
                                    ) : (
                                      <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                                    )}
                                  </div>
                                ) : (
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary shrink-0" />
                                )}
                                <a href={tab.url} target="_blank" rel="noreferrer" className="truncate text-xs text-muted-foreground group-hover:text-foreground font-normal hover:underline transition-colors">
                                  {tab.title || tab.url}
                                </a>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="btn-spring h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0" 
                                onClick={() => setDeleteConfirm({ type: 'tab', groupId: group.id, url: tab.url, title: tab.title || tab.url })}
                                title="Remove tab"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        })}
                      </CardContent>

                      {/* Card Footer */}
                      <CardFooter className={`shrink-0 border-t border-border/60 bg-muted/20 ${isCompact ? 'p-2 pt-1.5' : 'p-2.5 pt-2'} flex items-center justify-between rounded-b-2xl relative z-10`}>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="btn-spring h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors" 
                            onClick={() => setDeleteConfirm({ type: 'group', id: group.id, title: group.name || 'Saved Group' })}
                            title="Delete group"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="btn-spring h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors" 
                            onClick={() => handleCopyGroupUrls(group)}
                            title="Copy all URLs in group"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          {activeTab === 'dashboard' ? (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="btn-spring h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors" 
                              onClick={() => handleArchiveGroup(group.id)}
                              title="Archive group"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="btn-spring h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors" 
                              onClick={() => handleUnarchiveGroup(group.id)}
                              title="Unarchive group"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="btn-spring h-7 px-3 text-xs font-medium bg-primary/15 hover:bg-primary/25 text-primary border border-primary/20 rounded-lg shadow-xs transition-colors flex items-center gap-1.5" 
                          onClick={() => handleRestoreGroup(group)}
                        >
                          <RotateCcw className="h-3 w-3 text-primary" /> Restore
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Error Boundary Component
// =============================================================================

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[TwoTab] UI Exception caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <Card className="max-w-md w-full border-border bg-card shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-destructive/15 border border-destructive/30 text-destructive flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-foreground">Something went wrong</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {this.state.error?.message || 'An unexpected error occurred while rendering.'}
              </p>
            </div>
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="bg-primary text-primary-foreground font-semibold text-xs px-4"
            >
              Reload TwoTab
            </Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

// =============================================================================
// Main App Component
// =============================================================================

function AppContent() {
  const { themeMode, resolvedTheme, setThemeMode } = useTheme();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'archive' | 'closed' | 'settings' | 'help'>('dashboard');
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [allDashboardGroups, setAllDashboardGroups] = useState<TabGroup[]>([]);
  const [archivedGroups, setArchivedGroups] = useState<TabGroup[]>([]);
  const [userPreferences, setUserPreferencesState] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
  const [recentlyClosed, setRecentlyClosed] = useState<ClosedTabItem[]>([]);
  const [backupSnapshots, setBackupSnapshots] = useState<BackupSnapshot[]>([]);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [restoreAllConfirm, setRestoreAllConfirm] = useState(false);
  const [showAdvancedAppearance, setShowAdvancedAppearance] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync OLED true black & UI scaling with HTML root
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (userPreferences.oledBlack) {
        document.documentElement.classList.add('oled-true-black');
      } else {
        document.documentElement.classList.remove('oled-true-black');
      }
      document.documentElement.setAttribute('data-ui-scale', userPreferences.uiScale || 'standard');
    }
  }, [userPreferences.oledBlack, userPreferences.uiScale]);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleUpdatePreference = async <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    try {
      const updated = await setUserPreferences({ [key]: value });
      setUserPreferencesState(updated);
      showMessage('Setting updated');
    } catch (e) {
      console.error('Error saving preference:', e);
      showMessage('Failed to save setting', 'error');
    }
  };

  const loadData = async () => {
    try {
      // Also refresh preferences & rolling snapshots
      getUserPreferences().then(setUserPreferencesState);
      getRollingBackupSnapshots().then(setBackupSnapshots);

      const [dashboardData, archiveData, closedData] = await Promise.all([
        getGroups(),
        getArchivedGroups(),
        getRecentlyClosedItems(),
      ]);

      const sortedDashboard = (dashboardData || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const sortedArchive = (archiveData || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const sortedClosed = closedData || [];

      setAllDashboardGroups(sortedDashboard);
      setArchivedGroups(sortedArchive);
      setRecentlyClosed(sortedClosed);

      if (activeTab === 'dashboard') {
        setGroups(sortedDashboard);
      } else if (activeTab === 'archive') {
        setGroups(sortedArchive);
      } else if (activeTab === 'settings') {
        runHealthCheck().then(setHealthStatus).catch(console.error);
      }
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setIsInitialLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      const created = await createRollingBackup(false);
      const snapshots = await getRollingBackupSnapshots();
      setBackupSnapshots(snapshots);
      if (created) {
        showMessage('Rolling snapshot created successfully!');
      } else {
        showMessage('Snapshot up to date (no new changes detected)');
      }
    } catch (e) {
      console.error('Error creating rolling backup:', e);
      showMessage('Failed to create snapshot', 'error');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestoreSnapshot = async (snapshot: BackupSnapshot) => {
    try {
      const success = await restoreFromRollingBackup(snapshot.timestamp);
      if (success) {
        showMessage('Snapshot restored successfully!');
        await loadData();
      } else {
        showMessage('Failed to restore snapshot', 'error');
      }
    } catch (e) {
      console.error('Error restoring snapshot:', e);
      showMessage('Failed to restore snapshot', 'error');
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local') {
        if (changes.tabGroups || changes.archivedTabGroups || changes.recentlyClosed) {
          loadData();
        }
        if (changes._backupSnapshots) {
          getRollingBackupSnapshots().then(setBackupSnapshots);
        }
        if (changes[PREFERENCES_STORAGE_KEY]) {
          setUserPreferencesState(changes[PREFERENCES_STORAGE_KEY].newValue || DEFAULT_USER_PREFERENCES);
        }
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [activeTab]);

  const [healthStatus, setHealthStatus] = useState<HealthCheckResult | null>(null);
  const [isRunningHealthCheck, setIsRunningHealthCheck] = useState(false);

  const handleRunHealthCheck = async () => {
    setIsRunningHealthCheck(true);
    try {
      const result = await runHealthCheck();
      setHealthStatus(result);
      if (result.valid) {
        showMessage('Storage integrity 100% healthy! Zero issues found.');
      } else {
        showMessage(`Diagnostic alert: ${result.errors.length} issues detected`, 'error');
      }
    } catch (e) {
      console.error('Error running health check:', e);
      showMessage('Failed to run diagnostics', 'error');
    } finally {
      setIsRunningHealthCheck(false);
    }
  };

  const handleSaveCurrentWindow = async () => {
    setIsSaving(true);
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'saveTabs' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response && response.status === 'success') {
            showMessage(`Saved ${response.count} ${response.count === 1 ? 'tab' : 'tabs'}!`);
            resolve();
          } else if (response && response.status === 'no_tabs') {
            showMessage(response.reason || 'No eligible tabs to save in this window', 'error');
            resolve();
          } else {
            reject(new Error(response?.message || 'Failed to save current window tabs'));
          }
        });
      });
      loadData();
    } catch (e: any) {
      showMessage(e.message || 'Error saving tabs', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAllWindows = async () => {
    setIsSaving(true);
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'saveAllWindows' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response && response.status === 'success') {
            showMessage(`Saved ${response.count} ${response.count === 1 ? 'tab' : 'tabs'} across all windows!`);
            resolve();
          } else if (response && response.status === 'no_tabs') {
            showMessage(response.reason || 'No eligible tabs to save across windows', 'error');
            resolve();
          } else {
            reject(new Error(response?.message || 'Failed to save all windows'));
          }
        });
      });
      loadData();
    } catch (e: any) {
      showMessage(e.message || 'Error saving all windows', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveActiveTab = async () => {
    setIsSaving(true);
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'saveActiveTab' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response && response.status === 'success') {
            showMessage('Active tab saved!');
            resolve();
          } else if (response && response.status === 'no_tabs') {
            showMessage(response.reason || 'Active tab could not be saved', 'error');
            resolve();
          } else {
            reject(new Error(response?.message || 'Failed to save active tab'));
          }
        });
      });
      loadData();
    } catch (e: any) {
      showMessage(e.message || 'Error saving active tab', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyGroupUrls = async (group: TabGroup) => {
    try {
      const urls = group.tabs.map((t) => t.url).filter(Boolean).join('\n');
      const success = await copyToClipboardSafe(urls);
      if (success) {
        showMessage(`Copied ${group.tabs.length} URLs to clipboard`);
      } else {
        showMessage('Failed to copy URLs to clipboard', 'error');
      }
    } catch (e) {
      showMessage('Failed to copy URLs', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;

    if (deleteConfirm.type === 'group' && deleteConfirm.id) {
      if (activeTab === 'archive') {
        await deleteArchivedGroup(deleteConfirm.id);
      } else {
        await deleteGroup(deleteConfirm.id);
      }
      showMessage('Group deleted');
    } else if (deleteConfirm.type === 'tab' && deleteConfirm.groupId && deleteConfirm.url) {
      await deleteTabFromGroup(deleteConfirm.groupId, deleteConfirm.url);
      showMessage('Tab removed');
    } else if (deleteConfirm.type === 'all') {
      await clearAllData();
      showMessage('All data cleared');
    }

    setDeleteConfirm(null);
    loadData();
  };

  const handleArchiveGroup = async (id: number) => {
    await archiveGroup(id);
    showMessage('Group archived');
    loadData();
  };

  const handleUnarchiveGroup = async (id: number) => {
    await unarchiveGroup(id);
    showMessage('Group unarchived');
    loadData();
  };

  const handleRestoreGroup = async (group: TabGroup) => {
    try {
      const result = await restoreTabGroup(group, userPreferences);
      if (result.removed) {
        showMessage(`Restored ${result.count} tabs & removed collection`);
        loadData();
      } else {
        showMessage(`Restored ${result.count} tabs`);
      }
    } catch (e) {
      console.error('Error restoring group:', e);
      showMessage('Failed to restore group', 'error');
    }
  };

  const handleRestoreAllGroups = async () => {
    try {
      const result = await restoreAllTabGroups(groups, userPreferences);
      if (result.removed) {
        showMessage(`Restored ${result.count} tabs & cleared all collections`);
        loadData();
      } else {
        showMessage(`Restored ${result.count} tabs across ${result.groupsCount} groups`);
      }
    } catch (e) {
      console.error('Error restoring all groups:', e);
      showMessage('Failed to restore groups', 'error');
    }
  };

  const handleStartRename = (group: TabGroup) => {
    setEditingGroupId(group.id);
    setEditingName(group.name || '');
  };

  const handleSaveRename = async (id: number) => {
    if (editingName.trim()) {
      await renameGroup(id, editingName.trim());
      showMessage('Group renamed');
    }
    setEditingGroupId(null);
    loadData();
  };

  const handleRemoveClosedItem = async (id: string) => {
    await removeRecentlyClosedItem(id);
    showMessage('Removed item');
    loadData();
  };

  const handleClearClosedItems = async () => {
    await clearRecentlyClosedItems();
    setRecentlyClosed([]);
    showMessage('Cleared recently closed history');
  };

  const handleReopenClosedItem = (item: ClosedTabItem) => {
    if (getSafeDomain(item.url)) {
      chrome.tabs.create({ url: item.url, active: true });
      removeRecentlyClosedItem(item.id);
      loadData();
    }
  };

  const [exportFormat, setExportFormat] = useState<'json' | 'markdown' | 'onetab' | 'html' | 'csv'>('json');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importText, setImportText] = useState<string>('');
  const [isImportingText, setIsImportingText] = useState<boolean>(false);

  const handleExportFormatted = async (format: 'json' | 'markdown' | 'onetab' | 'html' | 'csv') => {
    let content = '';
    let mimeType = 'text/plain';
    let ext = 'txt';

    switch (format) {
      case 'json':
        content = await exportAsJson();
        mimeType = 'application/json';
        ext = 'json';
        break;
      case 'markdown':
        content = await exportAsMarkdown();
        mimeType = 'text/markdown';
        ext = 'md';
        break;
      case 'onetab':
        content = await exportAsPlainText();
        mimeType = 'text/plain';
        ext = 'txt';
        break;
      case 'html':
        content = await exportAsHtmlBookmarks();
        mimeType = 'text/html';
        ext = 'html';
        break;
      case 'csv':
        content = await exportAsCsv();
        mimeType = 'text/csv';
        ext = 'csv';
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twotab-export-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    showMessage(`Exported as ${format.toUpperCase()} successfully!`);
  };

  const handleCopyExportToClipboard = async (format: 'json' | 'markdown' | 'onetab' | 'html' | 'csv') => {
    let content = '';
    switch (format) {
      case 'json': content = await exportAsJson(); break;
      case 'markdown': content = await exportAsMarkdown(); break;
      case 'onetab': content = await exportAsPlainText(); break;
      case 'html': content = await exportAsHtmlBookmarks(); break;
      case 'csv': content = await exportAsCsv(); break;
    }
    const success = await copyToClipboardSafe(content);
    if (success) {
      showMessage(`Copied ${format.toUpperCase()} export to clipboard!`);
    } else {
      showMessage(`Failed to copy ${format.toUpperCase()} export`, 'error');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isJson = file.name.toLowerCase().endsWith('.json');
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (isJson) {
        const success = await importData(content, importMode);
        if (success) {
          showMessage(`JSON backup imported (${importMode === 'merge' ? 'Merged' : 'Replaced'})!`);
          loadData();
        } else {
          showMessage('Invalid JSON backup file format', 'error');
        }
      } else {
        const res = await importOneTabOrPlainText(content, importMode);
        if (res.success) {
          showMessage(`Imported ${res.importedTabsCount} tabs across ${res.importedGroupsCount} groups (${importMode === 'merge' ? 'Merged' : 'Replaced'})!`);
          loadData();
        } else {
          showMessage('Could not find valid URLs in imported file', 'error');
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleImportPastedText = async () => {
    if (!importText.trim()) return;
    setIsImportingText(true);
    try {
      if (importText.trim().startsWith('{') || importText.trim().startsWith('[')) {
        const success = await importData(importText, importMode);
        if (success) {
          showMessage(`JSON imported (${importMode === 'merge' ? 'Merged' : 'Replaced'})!`);
          setImportText('');
          loadData();
          setIsImportingText(false);
          return;
        }
      }
      const res = await importOneTabOrPlainText(importText, importMode);
      if (res.success) {
        showMessage(`Imported ${res.importedTabsCount} tabs across ${res.importedGroupsCount} groups (${importMode === 'merge' ? 'Merged' : 'Replaced'})!`);
        setImportText('');
        loadData();
      } else {
        showMessage('No valid URLs found to import', 'error');
      }
    } finally {
      setIsImportingText(false);
    }
  };

  const deferredSearch = useDeferredValue(search);

  const currentTabGroups = useMemo(() => {
    return activeTab === 'dashboard' ? allDashboardGroups : activeTab === 'archive' ? archivedGroups : [];
  }, [activeTab, allDashboardGroups, archivedGroups]);

  const filteredGroups = useMemo(() => {
    if (!deferredSearch) return currentTabGroups;
    const lower = deferredSearch.toLowerCase();
    return currentTabGroups
      .map(g => {
        const tabs = g.tabs.filter(t =>
          t.title.toLowerCase().includes(lower) ||
          t.url.toLowerCase().includes(lower)
        );
        if (tabs.length === 0 && !g.name?.toLowerCase().includes(lower)) return null;
        return { ...g, tabs };
      })
      .filter(Boolean) as TabGroup[];
  }, [currentTabGroups, deferredSearch]);

  const filteredRecentlyClosed = useMemo(() => {
    if (!deferredSearch) return recentlyClosed;
    const lower = deferredSearch.toLowerCase();
    return recentlyClosed.filter(item =>
      (item.title && item.title.toLowerCase().includes(lower)) ||
      (item.url && item.url.toLowerCase().includes(lower))
    );
  }, [recentlyClosed, deferredSearch]);

  const totalSavedTabs = useMemo(() => {
    return allDashboardGroups.reduce((acc, g) => acc + (g.tabs?.length || 0), 0);
  }, [allDashboardGroups]);

  const estRamSaved = useMemo(() => {
    if (totalSavedTabs === 0) return '0 MB';
    const mb = totalSavedTabs * 95;
    if (mb < 1000) return `${mb} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  }, [totalSavedTabs]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'archive', label: 'Archive', icon: Archive },
    { id: 'closed', label: 'Recently Closed', icon: History },
  ] as const;

  const prefItems = [
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'help', label: 'Help', icon: HelpCircle },
  ] as const;

  const getHeaderContext = () => {
    switch (activeTab) {
      case 'dashboard':
        return {
          title: 'Dashboard',
          icon: LayoutDashboard,
          badge: null,
          badgeVariant: 'outline' as const,
        };
      case 'archive':
        return {
          title: 'Archive',
          icon: Archive,
          badge: null,
          badgeVariant: 'outline' as const,
        };
      case 'closed':
        return {
          title: 'Recently Closed',
          icon: History,
          badge: null,
          badgeVariant: 'outline' as const,
        };
      case 'settings':
        return {
          title: 'Preferences & Diagnostics',
          icon: Settings,
          badge: null,
          badgeVariant: 'outline' as const,
        };
      case 'help':
        return {
          title: 'Help & Shortcuts Guide',
          icon: HelpCircle,
          badge: null,
          badgeVariant: 'outline' as const,
        };
      default:
        return {
          title: activeTab,
          icon: LayoutDashboard,
          badge: null,
          badgeVariant: 'outline' as const,
        };
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans relative text-foreground p-3 gap-3">
      {/* Atmospheric Studio Lighting Halo */}
      {userPreferences.ambientGlow !== 'none' && (
        <div 
          className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-300"
          style={{
            background: userPreferences.ambientGlow === 'vibrant'
              ? 'radial-gradient(circle 1000px at 50% -100px, hsl(var(--primary) / 0.30), transparent 70%), radial-gradient(circle 800px at 85% 95%, hsl(var(--accent) / 0.18), transparent 60%)'
              : 'radial-gradient(circle 900px at 50% -100px, hsl(var(--primary) / 0.16), transparent 75%), radial-gradient(circle 700px at 85% 95%, hsl(var(--accent) / 0.08), transparent 65%)',
          }}
        />
      )}

      {/* Tactile Matte Micro-Grain (Hardware-Cached Seamless GPU Tile covering entire window) */}
      {userPreferences.enableFilmGrain !== false && (
        <div className="bg-noise-grain" aria-hidden="true" />
      )}

      {/* Toast Notification */}
      {message && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-2xl border animate-toast flex items-center gap-2.5 ${message.type === 'success' ? 'bg-card/95 border-primary/40 text-foreground shadow-primary/10' : 'bg-card/95 border-destructive/40 text-destructive shadow-destructive/10'}`}>
          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${message.type === 'success' ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'}`}>
            {message.type === 'success' ? <Sparkles className="w-3 h-3" /> : <Info className="w-3 h-3" />}
          </div>
          <p className="text-xs font-semibold tracking-wide">
            {message.text}
          </p>
        </div>
      )}

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent className="border-border bg-card shadow-apple-popover max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2 text-base font-semibold">
              <Trash2 className="w-4 h-4 text-destructive" />
              Confirm Deletion
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground pt-1.5 text-sm leading-relaxed">
              {deleteConfirm?.type === 'group' && (
                <>Are you sure you want to delete <strong className="text-foreground font-medium">"{deleteConfirm.title}"</strong>? This action cannot be undone.</>
              )}
              {deleteConfirm?.type === 'tab' && (
                <>Are you sure you want to remove <strong className="text-foreground font-medium">"{deleteConfirm.title}"</strong> from this group?</>
              )}
              {deleteConfirm?.type === 'all' && (
                <>Are you sure you want to clear <strong className="text-destructive font-semibold">ALL saved data</strong>? This will permanently delete all saved tab groups and settings.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0 pt-4">
            <AlertDialogCancel onClick={() => setDeleteConfirm(null)} className="btn-spring h-8 text-xs font-medium border-border text-foreground hover:bg-muted">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="btn-spring h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 font-medium shadow-sm">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore All Confirmation Alert Dialog */}
      <AlertDialog open={restoreAllConfirm} onOpenChange={setRestoreAllConfirm}>
        <AlertDialogContent className="border-border bg-card shadow-apple-popover max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2 text-base font-semibold">
              <RotateCcw className="w-4 h-4 text-primary" />
              Restore All Saved Tabs?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground pt-1.5 text-sm leading-relaxed">
              This will open <strong className="text-foreground font-semibold">{groups.reduce((acc, g) => acc + g.tabs.length, 0)} {groups.reduce((acc, g) => acc + g.tabs.length, 0) === 1 ? 'tab' : 'tabs'}</strong> across <strong className="text-foreground font-semibold">{groups.length} {groups.length === 1 ? 'group' : 'groups'}</strong>. Do you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0 pt-4">
            <AlertDialogCancel onClick={() => setRestoreAllConfirm(false)} className="btn-spring h-8 text-xs font-medium border-border text-foreground hover:bg-muted">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setRestoreAllConfirm(false);
                handleRestoreAllGroups();
              }} 
              className="btn-spring h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm"
            >
              Restore All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sidebar (Floating Glass Pane) */}
      <aside className="w-64 h-full rounded-2xl glass-macos-sidebar p-5 flex flex-col justify-between z-20 shrink-0 relative overflow-hidden">
        {/* Top-Left Sidebar Ambient Glow */}
        <div 
          className="absolute -top-10 -left-10 w-60 h-60 pointer-events-none rounded-full blur-3xl opacity-50 dark:opacity-40" 
          style={{ background: 'hsl(var(--primary) / 0.18)' }} 
        />
        
        {/* Top: Logo & Navigation */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2.5 mb-8">
            <img 
              src="/icons/logo.png" 
              alt="TwoTab" 
              className="w-7 h-7 object-contain shrink-0 drop-shadow-sm"
            />
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent tracking-tight">
              TwoTab
            </span>
          </div>
          
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`btn-spring w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-medium ${
                    isActive 
                      ? 'bg-primary/15 text-primary font-semibold border border-primary/25 shadow-xs' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <div className="pt-5 pb-1.5 px-3.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Preferences</p>
            </div>

            {prefItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`btn-spring w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-medium ${
                    isActive 
                      ? 'bg-primary/15 text-primary font-semibold border border-primary/25 shadow-xs' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Pinned: Workspace Stats & GitHub Repository Card */}
        <div className="pt-6 space-y-2.5">
          {/* Workspace Stats Card */}
          <div className="p-2.5 rounded-xl border border-border bg-muted/60 dark:bg-muted/40 shadow-xs">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary ring-2 ring-primary/25 inline-block shrink-0" />
                Workspace Stats
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {/* Stat 1: Saved Tabs */}
              <div className="bg-background/80 dark:bg-background/60 border border-border/60 rounded-lg p-2 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{totalSavedTabs}</span>
                  <Bookmark className="w-3 h-3 text-primary/80" />
                </div>
                <span className="text-[9px] text-muted-foreground font-medium mt-0.5">Saved Tabs</span>
              </div>

              {/* Stat 2: RAM Saved */}
              <div className="bg-background/80 dark:bg-background/60 border border-border/60 rounded-lg p-2 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{estRamSaved}</span>
                  <Zap className="w-3 h-3 text-amber-500/90 dark:text-amber-400" />
                </div>
                <span className="text-[9px] text-muted-foreground font-medium mt-0.5">Est. RAM Saved</span>
              </div>

              {/* Stat 3: Active Groups */}
              <div className="bg-background/80 dark:bg-background/60 border border-border/60 rounded-lg p-2 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{allDashboardGroups.length}</span>
                  <Folder className="w-3 h-3 text-primary/80" />
                </div>
                <span className="text-[9px] text-muted-foreground font-medium mt-0.5">Active Groups</span>
              </div>

              {/* Stat 4: Archived Groups */}
              <div className="bg-background/80 dark:bg-background/60 border border-border/60 rounded-lg p-2 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{archivedGroups.length}</span>
                  <Archive className="w-3 h-3 text-primary/80" />
                </div>
                <span className="text-[9px] text-muted-foreground font-medium mt-0.5">Archived</span>
              </div>
            </div>
          </div>

          {/* GitHub Repository Card */}
          <a
            href="https://github.com/nickravesh/TwoTab"
            target="_blank"
            rel="noreferrer noopener"
            className="block p-3 rounded-xl border border-border bg-muted/60 dark:bg-muted/40 hover:bg-muted/90 dark:hover:bg-muted/70 hover:border-primary/30 shadow-xs transition-all group"
            title="View TwoTab source code on GitHub"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-foreground font-semibold text-xs">
                <svg className="w-3.5 h-3.5 fill-current text-foreground shrink-0" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <span>TwoTab</span>
              </div>
              <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 h-4 border-border/80 bg-background/80 text-muted-foreground shadow-xs">
                {typeof chrome !== 'undefined' && chrome?.runtime?.getManifest?.()?.version ? `v${chrome.runtime.getManifest().version}` : 'v1.8.0'}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
              <span>Open Source on GitHub</span>
              <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </a>
        </div>
      </aside>

      {/* Main Content Deck (Floating Glass Pane) */}
      <div className="flex-1 min-w-0 h-full rounded-2xl glass-macos-deck flex flex-col z-10 relative overflow-hidden animate-dashboard-in">
        {/* Header with macOS Chrome Tone & Optical Ledge Shadow */}
        <header className="h-14 glass-macos-header flex items-center justify-between px-5 shrink-0 z-20 transition-colors">
          {/* Title & Context Badge (Left) */}
          {(() => {
            const ctx = getHeaderContext();
            const Icon = ctx.icon;
            return (
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-background/80 dark:bg-background/60 border border-border/80 flex items-center justify-center text-primary shadow-2xs shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-2.5 min-w-0">
                  <h2 className="text-base font-bold tracking-tight text-foreground truncate">{ctx.title}</h2>
                  {ctx.badge && (
                    <Badge
                      variant={ctx.badgeVariant}
                      className="hidden sm:inline-flex text-[11px] font-medium px-2 py-0.5 h-5 bg-background/80 dark:bg-background/60 border-border/80 text-muted-foreground shadow-2xs"
                    >
                      {ctx.badge}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })()}
          
          {/* Action Cluster (Right) */}
          <div className="flex items-center gap-2">
            {/* 1. Search input */}
            {(activeTab === 'dashboard' || activeTab === 'archive' || activeTab === 'closed') && (
              <div className="relative max-w-xs w-60 group">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary pointer-events-none" />
                <Input 
                  placeholder={activeTab === 'closed' ? "Search closed tabs..." : "Search saved tabs..."} 
                  className="pl-9 pr-11 bg-background/80 dark:bg-background/60 border-border/80 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary focus:border-primary h-9 text-xs shadow-2xs rounded-lg transition-all" 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  onKeyDown={e => e.key === 'Escape' && setSearch('')}
                />
                {search ? (
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="absolute right-1.5 top-1.5 h-6 w-6 text-muted-foreground hover:text-foreground" 
                    onClick={() => setSearch('')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                ) : (
                  <kbd className="absolute right-2.5 top-2.5 text-[10px] text-muted-foreground/60 bg-muted/60 dark:bg-muted/40 border border-border/40 px-1 py-0.2 rounded font-mono pointer-events-none hidden md:inline-block">
                    ⌘K
                  </kbd>
                )}
              </div>
            )}

            {/* 2. Restore All Action */}
            {activeTab === 'dashboard' && groups.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setRestoreAllConfirm(true)} 
                className="btn-spring h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground border-border/80 bg-background/80 dark:bg-background/60 hover:bg-background shadow-2xs rounded-lg font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restore All
              </Button>
            )}

            {/* 3. Visual Swatch Theme Toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="btn-spring h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-background border border-border/80 bg-background/80 dark:bg-background/60 shadow-2xs rounded-lg transition-colors group"
                  title={`Theme: ${themeMode} (${resolvedTheme})`}
                >
                  <Palette className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-1.5 bg-popover border-border shadow-apple-popover rounded-xl text-popover-foreground">
                <DropdownMenuItem
                  onClick={(e) => setThemeMode('system', e)}
                  className="cursor-pointer text-xs font-medium py-2 px-2.5 rounded-lg flex items-center justify-between hover:bg-muted focus:bg-muted"
                >
                  <div className="flex items-center gap-2.5">
                    <Monitor className="w-4 h-4 text-muted-foreground" />
                    <div className="flex flex-col text-left">
                      <span>System Preference</span>
                      <span className="text-[10px] text-muted-foreground font-normal">Auto match OS theme</span>
                    </div>
                  </div>
                  {themeMode === 'system' && <span className="text-xs text-primary">✓</span>}
                </DropdownMenuItem>

                <Separator className="my-1.5 bg-border/60" />

                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-left">
                  Dark Themes
                </div>
                {THEME_PALETTES.filter(p => p.category === 'dark').map((palette) => (
                  <DropdownMenuItem
                    key={palette.id}
                    onClick={(e) => setThemeMode(palette.id, e)}
                    className={`cursor-pointer text-xs font-medium py-1.5 px-2.5 rounded-lg flex items-center justify-between hover:bg-muted focus:bg-muted ${
                      themeMode === palette.id ? 'text-primary font-semibold bg-primary/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 text-left">
                      <div 
                        className="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center shrink-0 shadow-xs"
                        style={{ backgroundColor: palette.bgHex }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: palette.accentHex }} />
                      </div>
                      <div className="flex flex-col min-w-0 text-left">
                        <span className="truncate">{palette.name}</span>
                        <span className="text-[10px] text-muted-foreground font-normal truncate">{palette.description}</span>
                      </div>
                    </div>
                    {themeMode === palette.id && <span className="text-xs text-primary shrink-0 ml-1">✓</span>}
                  </DropdownMenuItem>
                ))}

                <Separator className="my-1.5 bg-border/60" />

                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-left">
                  Light Themes
                </div>
                {THEME_PALETTES.filter(p => p.category === 'light').map((palette) => (
                  <DropdownMenuItem
                    key={palette.id}
                    onClick={(e) => setThemeMode(palette.id, e)}
                    className={`cursor-pointer text-xs font-medium py-1.5 px-2.5 rounded-lg flex items-center justify-between hover:bg-muted focus:bg-muted ${
                      themeMode === palette.id ? 'text-primary font-semibold bg-primary/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 text-left">
                      <div 
                        className="w-4 h-4 rounded-full border border-black/10 flex items-center justify-center shrink-0 shadow-xs"
                        style={{ backgroundColor: palette.bgHex }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: palette.accentHex }} />
                      </div>
                      <div className="flex flex-col min-w-0 text-left">
                        <span className="truncate">{palette.name}</span>
                        <span className="text-[10px] text-muted-foreground font-normal truncate">{palette.description}</span>
                      </div>
                    </div>
                    {themeMode === palette.id && <span className="text-xs text-primary shrink-0 ml-1">✓</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 4. Split Button: Save Window Actions Only */}
            <div className="flex items-center shadow-xs rounded-lg overflow-hidden">
              <Button 
                onClick={handleSaveCurrentWindow} 
                disabled={isSaving} 
                variant="default"
                group="splitLeft"
                className="btn-spring h-9 px-3.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-l-lg transition-colors"
                title="Save all open tabs in current window (⌘S)"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> {isSaving ? 'Saving...' : 'Save Window'}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="default" 
                    size="icon" 
                    group="splitRight" 
                    disabled={isSaving}
                    className="btn-spring h-9 w-7 bg-primary hover:bg-primary/90 text-primary-foreground rounded-r-lg border-l border-primary-foreground/20 transition-colors"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 p-1.5 bg-popover border-border shadow-apple-popover rounded-xl text-popover-foreground">
                  <DropdownMenuItem onClick={handleSaveCurrentWindow} className="cursor-pointer py-2 px-2.5 rounded-lg flex items-center justify-between hover:bg-muted focus:bg-muted">
                    <div className="flex items-center gap-2">
                      <LayoutDashboard className="w-4 h-4 text-primary" />
                      <span className="text-xs font-medium">Save Current Window</span>
                    </div>
                    <kbd className="text-[10px] bg-muted/70 px-1.5 py-0.5 rounded font-mono text-muted-foreground">⌘S</kbd>
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={handleSaveAllWindows} className="cursor-pointer py-2 px-2.5 rounded-lg flex items-center justify-between hover:bg-muted focus:bg-muted">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" />
                      <span className="text-xs font-medium">Save All Windows</span>
                    </div>
                    <kbd className="text-[10px] bg-muted/70 px-1.5 py-0.5 rounded font-mono text-muted-foreground">⌘⇧S</kbd>
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={handleSaveActiveTab} className="cursor-pointer py-2 px-2.5 rounded-lg flex items-center justify-between hover:bg-muted focus:bg-muted">
                    <div className="flex items-center gap-2">
                      <Bookmark className="w-4 h-4 text-primary" />
                      <span className="text-xs font-medium">Save Active Tab Only</span>
                    </div>
                    <kbd className="text-[10px] bg-muted/70 px-1.5 py-0.5 rounded font-mono text-muted-foreground">⌘⌥S</kbd>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
        
        {/* Main Body — Dashboard/Archive use virtualized grid, other views use ScrollArea */}
        {(activeTab === 'dashboard' || activeTab === 'archive') ? (
          <VirtualizedCardGrid
            activeTab={activeTab}
            filteredGroups={filteredGroups}
            isSaving={isSaving}
            editingGroupId={editingGroupId}
            editingName={editingName}
            setEditingName={setEditingName}
            handleSaveCurrentWindow={handleSaveCurrentWindow}
            handleSaveAllWindows={handleSaveAllWindows}
            handleSaveRename={handleSaveRename}
            handleStartRename={handleStartRename}
            setEditingGroupId={setEditingGroupId}
            handleArchiveGroup={handleArchiveGroup}
            handleUnarchiveGroup={handleUnarchiveGroup}
            handleRestoreGroup={handleRestoreGroup}
            handleCopyGroupUrls={handleCopyGroupUrls}
            setDeleteConfirm={setDeleteConfirm}
            cardDensity={userPreferences.cardDensity}
            faviconStyle={userPreferences.faviconStyle}
            search={search}
            setSearch={setSearch}
            isInitialLoading={isInitialLoading}
          />
        ) : (
        <>
          {/* Recently Closed View */}
          {activeTab === 'closed' && (
            isInitialLoading ? (
              <div className="flex-1 min-h-[380px]" />
            ) : (recentlyClosed.length === 0 || filteredRecentlyClosed.length === 0) ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[380px]">
                <div className="w-16 h-16 rounded-2xl bg-muted/60 border border-border flex items-center justify-center mb-4 text-primary shadow-sm animate-float">
                  {recentlyClosed.length === 0 ? (
                    <History className="w-8 h-8 opacity-70 text-primary" />
                  ) : (
                    <Search className="w-8 h-8 opacity-70 text-primary" />
                  )}
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1.5">
                  {recentlyClosed.length === 0 ? 'No Recently Closed Tabs' : 'No Matching Closed Tabs'}
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-6 leading-relaxed">
                  {recentlyClosed.length === 0
                    ? 'Tabs and browser windows you close will automatically appear here so you can reopen them anytime.'
                    : `No recently closed tabs match "${search}".`}
                </p>
                {recentlyClosed.length > 0 && filteredRecentlyClosed.length === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearch('')}
                    className="btn-spring text-xs font-medium"
                  >
                    Clear Search
                  </Button>
                )}
              </div>
            ) : (
              <ScrollArea className="flex-1 p-10">
                <div className="max-w-4xl mx-auto space-y-4">
                  <div className="flex justify-between items-center px-1 mb-2">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {deferredSearch
                        ? `${filteredRecentlyClosed.length} of ${recentlyClosed.length} Closed Tabs`
                        : `${recentlyClosed.length} ${recentlyClosed.length === 1 ? 'Closed Tab' : 'Closed Tabs'}`}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleClearClosedItems} 
                      className="btn-spring text-xs border-border hover:bg-destructive/10 hover:text-destructive transition-colors shadow-sm font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear History
                    </Button>
                  </div>
                  {filteredRecentlyClosed.map((item, idx) => {
                    const domain = getSafeDomain(item.url);
                    const staggerIndex = Math.min(idx, 12);
                    return (
                      <Card 
                        key={item.id} 
                        style={{ '--stagger-index': staggerIndex } as React.CSSProperties}
                        className="animate-card-cascade card-interactive p-3 rounded-xl flex items-center justify-between border-border bg-card shadow-sm group"
                      >
                        <div className="flex items-center gap-3 truncate min-w-0 flex-1 mr-4">
                          <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0 border border-border">
                            {domain ? (
                              <img 
                                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} 
                                alt="" 
                                className="w-3.5 h-3.5 opacity-90 group-hover:scale-110 transition-transform" 
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="truncate flex-1 min-w-0">
                            <a href={item.url} target="_blank" rel="noreferrer" className="font-medium text-foreground truncate block hover:text-primary transition-colors text-sm">
                              {item.title || formatDisplayUrl(item.url)}
                            </a>
                            <span className="text-xs text-muted-foreground truncate block">{formatDisplayUrl(item.url)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground font-medium hidden sm:inline mr-2">{getRelativeTime(item.timestamp)}</span>
                          <Button size="sm" variant="secondary" onClick={() => handleReopenClosedItem(item)} className="btn-spring border border-border/60 font-medium text-xs h-7">
                            Reopen Tab
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleRemoveClosedItem(item.id)} className="btn-spring h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            )
          )}

          {/* Settings & Help Views */}
          {(activeTab === 'settings' || activeTab === 'help') && (
            <ScrollArea className="flex-1 p-10">
              {/* Settings View */}
              {activeTab === 'settings' && (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Appearance & Theme Settings */}
              <Card style={{ '--stagger-index': 0 } as React.CSSProperties} className="animate-card-cascade card-interactive border-border bg-card shadow-lg">
                <CardHeader>
                  <CardTitle className="text-foreground text-xl flex items-center gap-2">
                    <Palette className="w-5 h-5 text-primary" />
                    Appearance & Curated Themes
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Choose how TwoTab looks on your device. Every theme dynamically harmonizes surfaces, accents, and borders in real time.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2 space-y-4">
                  {/* System Preference */}
                  <button
                    type="button"
                    onClick={(e) => setThemeMode('system', e)}
                    className={`btn-spring w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                      themeMode === 'system'
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm font-semibold text-foreground'
                        : 'border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-xs">
                        <Monitor className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <div className="text-xs font-semibold">System Preference</div>
                        <div className="text-[11px] text-muted-foreground font-normal">Automatically adapt to OS theme (Currently: {resolvedTheme})</div>
                      </div>
                    </div>
                    {themeMode === 'system' && <span className="text-sm text-primary font-bold mr-2">✓ Active</span>}
                  </button>

                  {/* 9 Curated Theme Palettes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {THEME_PALETTES.map((palette) => {
                      const isSelected = themeMode === palette.id;
                      return (
                        <button
                          key={palette.id}
                          type="button"
                          onClick={(e) => setThemeMode(palette.id, e)}
                          className={`btn-spring flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                            isSelected
                              ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm font-semibold text-foreground'
                              : 'border-border bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground font-medium'
                          }`}
                        >
                          <div 
                            className="w-7 h-7 rounded-full border border-black/15 dark:border-white/20 flex items-center justify-center shrink-0 shadow-xs"
                            style={{ backgroundColor: palette.bgHex }}
                          >
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: palette.accentHex }} />
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-foreground truncate">{palette.name}</span>
                              {isSelected && <span className="text-xs text-primary font-bold">✓</span>}
                            </div>
                            <span className="text-[10px] text-muted-foreground font-normal truncate">{palette.description}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Progressive Disclosure: Advanced Display & Interface Customization */}
                  <div className="pt-2 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedAppearance(prev => !prev)}
                      className="btn-spring w-full flex items-center justify-between p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/40 text-foreground transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                          <Sliders className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                            Advanced Display & Interface Settings
                            <Badge variant="outline" className="text-[10px] font-normal border-border bg-background/80 text-muted-foreground">
                              {showAdvancedAppearance ? 'Expanded' : 'Custom'}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Card density, ambient glow, favicons, typography scaling, OLED mode & film grain
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium pr-1">
                        <span>{showAdvancedAppearance ? 'Hide' : 'Configure'}</span>
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showAdvancedAppearance ? 'rotate-180 text-primary' : ''}`} />
                      </div>
                    </button>

                    {showAdvancedAppearance && (
                      <div className="mt-3 space-y-4 pt-1 border-t border-border/40">
                        {/* 2. Card Layout & View Density */}
                        <div className="pt-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                            <div>
                              <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <LayoutGrid className="w-4 h-4 text-primary" />
                                Card View Density & Layout
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Choose between spacious decks, dense multi-card grid, or classic stacked list.
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {[
                              { id: 'comfortable' as const, name: 'Comfortable', desc: 'Spacious 220px decks (Default)', icon: LayoutGrid },
                              { id: 'compact' as const, name: 'Compact Grid', desc: 'Condensed 165px cards (2x more)', icon: Maximize2 },
                              { id: 'list' as const, name: 'List View', desc: 'Full-width stacked rows', icon: List },
                            ].map((item) => {
                              const isSelected = (userPreferences.cardDensity || 'comfortable') === item.id;
                              const ItemIcon = item.icon;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => handleUpdatePreference('cardDensity', item.id)}
                                  className={`btn-spring flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                                    isSelected
                                      ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-xs font-semibold text-foreground'
                                      : 'border-border bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground font-medium'
                                  }`}
                                >
                                  <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-xs">
                                    <ItemIcon className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                                      {item.name}
                                      {isSelected && <span className="text-xs text-primary font-bold">✓</span>}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate">{item.desc}</div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 3. Ambient Studio Lighting Glow */}
                        <div className="pt-3 border-t border-border/60">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                            <div>
                              <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <SunMedium className="w-4 h-4 text-primary" />
                                Ambient Studio Lighting
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Control the atmospheric radial aura glowing behind your glass deck.
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {[
                              { id: 'subtle' as const, name: 'Subtle Aura', desc: 'Soft & balanced (Default)' },
                              { id: 'vibrant' as const, name: 'Vibrant Glow', desc: 'High luminosity accent halos' },
                              { id: 'none' as const, name: 'Off (Matte)', desc: 'Pure flat canvas' },
                            ].map((item) => {
                              const isSelected = (userPreferences.ambientGlow || 'subtle') === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => handleUpdatePreference('ambientGlow', item.id)}
                                  className={`btn-spring flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                                    isSelected
                                      ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-xs font-semibold text-foreground'
                                      : 'border-border bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground font-medium'
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                                      {item.name}
                                      {isSelected && <span className="text-xs text-primary font-bold">✓</span>}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate">{item.desc}</div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 4. Favicon Display Styling */}
                        <div className="pt-3 border-t border-border/60">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                            <div>
                              <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <Globe className="w-4 h-4 text-primary" />
                                Website Favicon Style
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Choose how website icons render inside your saved tab collections.
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {[
                              { id: 'color' as const, name: 'Full Color', desc: 'Original brand logos (Default)' },
                              { id: 'monochrome' as const, name: 'Monochrome', desc: 'Theme tinted harmony' },
                              { id: 'hidden' as const, name: 'Hidden', desc: 'Clean bullet points' },
                            ].map((item) => {
                              const isSelected = (userPreferences.faviconStyle || 'color') === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => handleUpdatePreference('faviconStyle', item.id)}
                                  className={`btn-spring flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                                    isSelected
                                      ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-xs font-semibold text-foreground'
                                      : 'border-border bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground font-medium'
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                                      {item.name}
                                      {isSelected && <span className="text-xs text-primary font-bold">✓</span>}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate">{item.desc}</div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 5. UI Typography Scale */}
                        <div className="pt-3 border-t border-border/60">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                            <div>
                              <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <Type className="w-4 h-4 text-primary" />
                                UI Typography Scale
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Adjust text size and interface spacing for smaller laptops or 4K/5K displays.
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {[
                              { id: 'compact' as const, name: 'Compact (90%)', desc: '13px high density' },
                              { id: 'standard' as const, name: 'Standard (100%)', desc: '14px balanced (Default)' },
                              { id: 'large' as const, name: 'Large (110%)', desc: '15.5px high legibility' },
                            ].map((item) => {
                              const isSelected = (userPreferences.uiScale || 'standard') === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => handleUpdatePreference('uiScale', item.id)}
                                  className={`btn-spring flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                                    isSelected
                                      ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-xs font-semibold text-foreground'
                                      : 'border-border bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground font-medium'
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                                      {item.name}
                                      {isSelected && <span className="text-xs text-primary font-bold">✓</span>}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate">{item.desc}</div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 6. OLED True Black Mode Toggle */}
                        <div className="pt-3 border-t border-border/60">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-muted/20">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0 mt-0.5 shadow-xs">
                                <Moon className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                                  OLED Pure Black Mode
                                  <Badge variant="outline" className={`text-[10px] font-medium border ${userPreferences.oledBlack ? 'text-primary border-primary/30 bg-primary/10' : 'text-muted-foreground border-border'}`}>
                                    {userPreferences.oledBlack ? 'Active' : 'Disabled'}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                                  Overrides dark theme backgrounds to pure <span className="font-mono text-foreground font-medium">#000000</span> for OLED/mini-LED infinite contrast and battery savings.
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant={userPreferences.oledBlack ? 'default' : 'outline'}
                              onClick={() => handleUpdatePreference('oledBlack', !userPreferences.oledBlack)}
                              className={`btn-spring text-xs h-8 px-3.5 font-medium shrink-0 ${
                                userPreferences.oledBlack 
                                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm' 
                                  : 'border-border text-foreground hover:bg-muted'
                              }`}
                            >
                              {userPreferences.oledBlack ? 'Enabled' : 'Disabled'}
                            </Button>
                          </div>
                        </div>

                        {/* 7. Tactile Matte Film Grain Toggle */}
                        <div className="pt-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-muted/20">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0 mt-0.5 shadow-xs">
                                <Sparkles className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                                  Tactile Matte Film Grain
                                  <Badge variant="outline" className={`text-[10px] font-medium border ${userPreferences.enableFilmGrain !== false ? 'text-primary border-primary/30 bg-primary/10' : 'text-muted-foreground border-border'}`}>
                                    {userPreferences.enableFilmGrain !== false ? 'Active' : 'Disabled'}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                                  Applies an ultra-fine, hardware-accelerated matte paper texture across all surfaces and theme palettes (0% CPU).
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant={userPreferences.enableFilmGrain !== false ? 'default' : 'outline'}
                              onClick={() => handleUpdatePreference('enableFilmGrain', userPreferences.enableFilmGrain === false ? true : false)}
                              className={`btn-spring text-xs h-8 px-3.5 font-medium shrink-0 ${
                                userPreferences.enableFilmGrain !== false 
                                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm' 
                                  : 'border-border text-foreground hover:bg-muted'
                              }`}
                            >
                              {userPreferences.enableFilmGrain !== false ? 'Enabled' : 'Disabled'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Tab Workflow & Restoration Settings */}
              <Card style={{ '--stagger-index': 1 } as React.CSSProperties} className="animate-card-cascade card-interactive border-border bg-card shadow-lg">
                <CardHeader>
                  <CardTitle className="text-foreground text-xl flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-primary" />
                    Tab Workflow & Restoration Rules
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Customize how TwoTab captures active tabs and where collections are restored.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2 space-y-6">
                  {/* 1. Protect Pinned Tabs */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-muted/20">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0 mt-0.5 shadow-xs">
                        {userPreferences.protectPinnedTabs ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4 text-muted-foreground" />}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                          Protect Pinned Tabs
                          <Badge variant="outline" className={`text-[10px] font-medium border ${userPreferences.protectPinnedTabs ? 'text-primary border-primary/30 bg-primary/10' : 'text-muted-foreground border-border'}`}>
                            {userPreferences.protectPinnedTabs ? 'Enabled (Recommended)' : 'Disabled'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                          Never close or stash pinned tabs when saving windows or stashing active tabs. Keeps your pinned email, chat, and music tabs uninterrupted.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant={userPreferences.protectPinnedTabs ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleUpdatePreference('protectPinnedTabs', !userPreferences.protectPinnedTabs)}
                      className={`btn-spring shrink-0 text-xs font-semibold px-4 transition-all shadow-sm ${
                        userPreferences.protectPinnedTabs ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border-border text-foreground hover:bg-muted'
                      }`}
                    >
                      {userPreferences.protectPinnedTabs ? 'Protected' : 'Unprotected'}
                    </Button>
                  </div>

                  {/* 2. Restore Destination */}
                  <div className="space-y-2.5">
                    <div>
                      <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Layers className="w-4 h-4 text-primary" />
                        Restore Destination
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Choose where tab collections open when clicking Restore Group.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => handleUpdatePreference('restoreDestination', 'new_window')}
                        className={`btn-spring flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                          userPreferences.restoreDestination === 'new_window'
                            ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm font-semibold text-foreground'
                            : 'border-border bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground font-medium'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0 mt-0.5 shadow-xs">
                          <ExternalLink className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">Dedicated New Window</span>
                            {userPreferences.restoreDestination === 'new_window' && <span className="text-xs text-primary font-bold">✓</span>}
                          </div>
                          <p className="text-[11px] text-muted-foreground font-normal mt-0.5 leading-snug">
                            Opens the collection cleanly in its own new browser window (Default).
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdatePreference('restoreDestination', 'current_window')}
                        className={`btn-spring flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                          userPreferences.restoreDestination === 'current_window'
                            ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm font-semibold text-foreground'
                            : 'border-border bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground font-medium'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0 mt-0.5 shadow-xs">
                          <LayoutDashboard className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">Current Active Window</span>
                            {userPreferences.restoreDestination === 'current_window' && <span className="text-xs text-primary font-bold">✓</span>}
                          </div>
                          <p className="text-[11px] text-muted-foreground font-normal mt-0.5 leading-snug">
                            Appends the restored tabs directly alongside your current open tabs.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* 3. Collection Lifecycle on Restore */}
                  <div className="space-y-2.5">
                    <div>
                      <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <History className="w-4 h-4 text-primary" />
                        After Restoring Collection
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Decide whether saved tab groups remain stored in TwoTab after opening.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => handleUpdatePreference('restoreBehavior', 'keep')}
                        className={`btn-spring flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                          userPreferences.restoreBehavior === 'keep'
                            ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm font-semibold text-foreground'
                            : 'border-border bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground font-medium'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0 mt-0.5 shadow-xs">
                          <Bookmark className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">Keep in TwoTab</span>
                            {userPreferences.restoreBehavior === 'keep' && <span className="text-xs text-primary font-bold">✓</span>}
                          </div>
                          <p className="text-[11px] text-muted-foreground font-normal mt-0.5 leading-snug">
                            Preserves the group in your dashboard so you can restore it repeatedly (Bookmark style).
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdatePreference('restoreBehavior', 'remove')}
                        className={`btn-spring flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                          userPreferences.restoreBehavior === 'remove'
                            ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm font-semibold text-foreground'
                            : 'border-border bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground font-medium'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0 mt-0.5 shadow-xs">
                          <Trash2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">Remove from TwoTab</span>
                            {userPreferences.restoreBehavior === 'remove' && <span className="text-xs text-primary font-bold">✓</span>}
                          </div>
                          <p className="text-[11px] text-muted-foreground font-normal mt-0.5 leading-snug">
                            Automatically removes the collection once restored (Clean-slate style).
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* 4. Recently Closed Retention Limit */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <History className="w-4 h-4 text-primary" />
                          Recently Closed Retention Limit
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Maximum number of closed tabs preserved in your history timeline.
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs font-semibold text-primary border-primary/30 bg-primary/10">
                        {userPreferences.recentlyClosedLimit || 50} Tabs
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {[10, 25, 50, 100, 250, 500].map((limit) => {
                        const isSelected = (userPreferences.recentlyClosedLimit || 50) === limit;
                        return (
                          <button
                            key={limit}
                            type="button"
                            onClick={() => handleUpdatePreference('recentlyClosedLimit', limit)}
                            className={`btn-spring py-2 px-3 rounded-xl border text-center transition-all ${
                              isSelected
                                ? 'border-primary bg-primary/15 ring-2 ring-primary/30 font-bold text-foreground shadow-xs'
                                : 'border-border bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground font-medium text-xs'
                            }`}
                          >
                            <span className="text-xs">{limit}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Data Export Studio & Import Hub */}
              <Card style={{ '--stagger-index': 2 } as React.CSSProperties} className="animate-card-cascade card-interactive border-border bg-card shadow-lg">
                <CardHeader>
                  <CardTitle className="text-foreground text-xl flex items-center gap-2">
                    <Download className="w-5 h-5 text-primary" /> Multi-Format Data Hub & Backup
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Export your collections in versatile formats (Markdown, OneTab Text, Bookmarks, CSV, JSON) or seamlessly import tab files.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2 space-y-6">
                  {/* Export Studio */}
                  <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Download className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold text-foreground">Export Workspace</span>
                      </div>
                      <span className="text-xs text-muted-foreground">Choose export format:</span>
                    </div>

                    {/* Format Selector Pills */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        { id: 'json', label: 'JSON Backup', icon: Database, desc: 'Full structured data' },
                        { id: 'markdown', label: 'Markdown (.md)', icon: FileText, desc: 'Obsidian / Notion' },
                        { id: 'onetab', label: 'OneTab (.txt)', icon: Code, desc: 'OneTab text list' },
                        { id: 'html', label: 'HTML Bookmarks', icon: Globe, desc: 'Browser bookmarks' },
                        { id: 'csv', label: 'CSV Spreadsheet', icon: FileSpreadsheet, desc: 'Excel / Sheets' },
                      ].map((fmt) => {
                        const isSelected = exportFormat === fmt.id;
                        const Icon = fmt.icon;
                        return (
                          <button
                            key={fmt.id}
                            type="button"
                            onClick={() => setExportFormat(fmt.id as any)}
                            className={`btn-spring p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 ${
                              isSelected
                                ? 'border-primary bg-primary/15 ring-2 ring-primary/30 text-foreground font-semibold shadow-xs'
                                : 'border-border bg-card/60 hover:bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <Icon className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                              {isSelected && <span className="text-[10px] text-primary font-bold">✓</span>}
                            </div>
                            <div>
                              <div className="text-xs font-semibold">{fmt.label}</div>
                              <div className="text-[10px] text-muted-foreground line-clamp-1">{fmt.desc}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Export Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <Button
                        onClick={() => handleExportFormatted(exportFormat)}
                        variant="default"
                        className="btn-spring bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm text-xs h-9 px-4"
                      >
                        <Download className="w-4 h-4 mr-1.5" /> Download {exportFormat.toUpperCase()} File
                      </Button>
                      <Button
                        onClick={() => handleCopyExportToClipboard(exportFormat)}
                        variant="outline"
                        className="btn-spring border-border hover:bg-muted text-foreground font-medium text-xs h-9 px-4"
                      >
                        <Copy className="w-3.5 h-3.5 mr-1.5 text-primary" /> Copy to Clipboard
                      </Button>
                    </div>
                  </div>

                  {/* Import Hub */}
                  <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Upload className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold text-foreground">Import & Migration Hub</span>
                      </div>
                      
                      {/* Merge vs Replace Mode Toggle */}
                      <div className="flex items-center gap-1 bg-card p-1 rounded-lg border border-border text-xs">
                        <button
                          type="button"
                          onClick={() => setImportMode('merge')}
                          className={`btn-spring px-2.5 py-1 rounded-md transition-all font-medium ${
                            importMode === 'merge'
                              ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Merge (Safe)
                        </button>
                        <button
                          type="button"
                          onClick={() => setImportMode('replace')}
                          className={`btn-spring px-2.5 py-1 rounded-md transition-all font-medium ${
                            importMode === 'replace'
                              ? 'bg-destructive text-destructive-foreground font-bold shadow-xs'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Replace All
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* File Upload Box */}
                      <div className="p-4 rounded-xl border border-dashed border-border bg-card/50 flex flex-col items-center justify-center text-center gap-2.5">
                        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-foreground">Upload Backup / OneTab File</div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Supports .json, .txt, .md, .html</p>
                        </div>
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleImportFile}
                          accept=".json,.txt,.md,.html,.csv"
                          className="hidden"
                        />
                        <Button
                          onClick={() => fileInputRef.current?.click()}
                          variant="outline"
                          size="sm"
                          className="btn-spring border-border hover:bg-muted text-foreground text-xs font-semibold shadow-xs"
                        >
                          Choose File
                        </Button>
                      </div>

                      {/* Quick Paste / OneTab Migration Box */}
                      <div className="p-3.5 rounded-xl border border-border bg-card/50 flex flex-col justify-between gap-2.5">
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                            <span>Paste OneTab / URL List</span>
                            <span className="text-[10px] text-muted-foreground font-normal">url | title or plain URLs</span>
                          </div>
                          <textarea
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                            placeholder="Paste OneTab text export here...&#10;https://example.com | Example Title&#10;https://github.com | GitHub"
                            className="w-full h-20 text-[11px] font-mono p-2 rounded-lg bg-muted/40 border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none custom-scrollbar"
                          />
                        </div>
                        <Button
                          onClick={handleImportPastedText}
                          disabled={!importText.trim() || isImportingText}
                          variant="default"
                          size="sm"
                          className="btn-spring bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs self-end"
                        >
                          {isImportingText ? 'Importing...' : 'Parse & Import'}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Automated Rolling Backups & Snapshot Timeline */}
                  <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 text-primary" />
                          <span className="text-sm font-semibold text-foreground">Automated Rolling Backups</span>
                          <Badge variant="outline" className="text-[10px] font-semibold text-emerald-500 border-emerald-500/30 bg-emerald-500/10 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/25 inline-block shrink-0" /> Active (Every 6h)
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Background scheduler captures automatic snapshots of all tab groups into local storage (keeping the 5 most recent).
                        </p>
                      </div>
                      <Button
                        onClick={handleCreateBackup}
                        disabled={isCreatingBackup}
                        variant="outline"
                        size="sm"
                        className="btn-spring border-border hover:bg-muted text-foreground font-semibold text-xs h-8 px-3 shadow-xs shrink-0 self-start sm:self-auto"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-primary ${isCreatingBackup ? 'animate-spin' : ''}`} />
                        {isCreatingBackup ? 'Creating Snapshot...' : 'Backup Now'}
                      </Button>
                    </div>

                    {/* Snapshot Timeline List */}
                    {backupSnapshots.length === 0 ? (
                      <div className="text-xs text-muted-foreground bg-card/40 p-3 rounded-lg border border-border/50 text-center">
                        No snapshots recorded yet. Click "Backup Now" or wait for the automatic 6-hour scheduler.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                          <span>Stored Rolling Snapshots:</span>
                          <span className="text-[10px] text-muted-foreground">{backupSnapshots.length} of 5 preserved</span>
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                          {backupSnapshots.map((snap) => {
                            const groupCount = (snap.data.tabGroups?.length || 0) + (snap.data.archivedGroups?.length || 0);
                            const totalTabs = (snap.data.tabGroups || []).reduce((acc, g) => acc + g.tabs.length, 0) +
                                              (snap.data.archivedGroups || []).reduce((acc, g) => acc + g.tabs.length, 0);
                            return (
                              <div
                                key={snap.timestamp}
                                className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-card/60 text-xs"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <Database className="w-4 h-4 text-primary shrink-0" />
                                  <div>
                                    <div className="font-semibold text-foreground">
                                      {new Date(snap.timestamp).toLocaleString()}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">
                                      {groupCount} {groupCount === 1 ? 'group' : 'groups'} • {totalTabs} {totalTabs === 1 ? 'tab' : 'tabs'}
                                    </div>
                                  </div>
                                </div>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      className="btn-spring h-7 px-2.5 text-xs font-semibold bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25 shadow-2xs"
                                    >
                                      <RotateCcw className="w-3 h-3 mr-1" /> Restore
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="border-border bg-card">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle className="text-foreground flex items-center gap-2">
                                        <RotateCcw className="w-5 h-5 text-primary" />
                                        Restore Rolling Snapshot?
                                      </AlertDialogTitle>
                                      <AlertDialogDescription className="text-muted-foreground pt-2 text-xs leading-relaxed">
                                        This will restore your workspace with the snapshot captured on <strong className="text-foreground">{new Date(snap.timestamp).toLocaleString()}</strong> ({groupCount} groups, {totalTabs} tabs).
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="pt-4">
                                      <AlertDialogCancel className="btn-spring font-semibold text-xs">Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleRestoreSnapshot(snap)}
                                        className="btn-spring bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs"
                                      >
                                        Yes, Restore Snapshot
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* System & Storage Health Diagnostics */}
              <Card style={{ '--stagger-index': 3 } as React.CSSProperties} className="animate-card-cascade card-interactive border-border bg-card shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-foreground text-xl flex items-center gap-2">
                      <Activity className="w-5 h-5 text-primary" />
                      System & Storage Diagnostics
                    </CardTitle>
                    <Badge variant={healthStatus && !healthStatus.valid ? "destructive" : "emerald"} className="text-xs font-semibold px-2.5 py-0.5">
                      {healthStatus ? (healthStatus.valid ? '✓ Storage Healthy' : `⚠ ${healthStatus.errors.length} Issues`) : 'Ready'}
                    </Badge>
                  </div>
                  <CardDescription className="text-muted-foreground">
                    Inspect schema integrity, storage quota consumption, and real-time database health.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Storage Engine
                      </div>
                      <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-primary" />
                        <span>MV3 Local Storage</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Unlimited quota enabled</div>
                    </div>

                    <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Space Utilized
                      </div>
                      <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                        <HardDrive className="w-4 h-4 text-primary" />
                        <span>{healthStatus ? `${(healthStatus.bytesUsed / 1024).toFixed(1)} KB` : 'Checking...'}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Safe & within local limits</div>
                    </div>

                    <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Data Integrity
                      </div>
                      <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        <span>{healthStatus?.valid !== false ? '100% Verified' : 'Attention Needed'}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Schema v1 synchronized</div>
                    </div>
                  </div>

                  {healthStatus && healthStatus.errors.length > 0 && (
                    <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4" /> Detected Issues:
                      </div>
                      <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                        {healthStatus.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRunHealthCheck}
                      disabled={isRunningHealthCheck}
                      className="btn-spring text-xs font-semibold border-border gap-1.5"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${isRunningHealthCheck ? 'animate-spin' : ''}`} />
                      {isRunningHealthCheck ? 'Checking Storage...' : 'Run Diagnostic Check'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Danger Zone */}
              <Card style={{ '--stagger-index': 4 } as React.CSSProperties} className="animate-card-cascade card-interactive border-destructive/30 bg-destructive/10 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-destructive text-xl flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-destructive" /> Danger Zone
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Permanently delete all saved tab collections, archived groups, and user settings from local storage.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="btn-spring font-bold shadow-lg shadow-destructive/20">
                        <Trash2 className="w-4 h-4 mr-2" /> Clear All Saved Data
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="border-border bg-card">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground flex items-center gap-2">
                          <ShieldAlert className="w-5 h-5 text-destructive" />
                          Are you absolutely sure?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground pt-2">
                          This action will permanently delete <strong className="text-destructive font-semibold">ALL saved tab collections, archives, and extension preferences</strong> from this browser. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="pt-4">
                        <AlertDialogCancel className="btn-spring font-semibold">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={async () => {
                            await clearAllData();
                            showMessage('All data cleared');
                            loadData();
                          }} 
                          className="btn-spring bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold shadow-md shadow-destructive/20"
                        >
                          Yes, Clear All Data
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Help & Knowledge Hub View */}
          {activeTab === 'help' && (
            <div className="max-w-4xl mx-auto space-y-8 pb-8">
              {/* Header Hero Banner */}
              <Card style={{ '--stagger-index': 0 } as React.CSSProperties} className="animate-card-cascade card-interactive border-border bg-card shadow-lg p-6 relative overflow-hidden">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
                  <div className="flex items-center gap-3.5">
                    <div className="p-3 rounded-2xl bg-primary/15 text-primary border border-primary/25 shadow-xs">
                      <BookOpen className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-2xl font-bold text-foreground">TwoTab Knowledge Center</h3>
                        <Badge variant="outline" className="text-xs text-primary border-primary/30 bg-primary/10 font-semibold">
                          v{typeof chrome !== 'undefined' && chrome?.runtime?.getManifest?.()?.version ? chrome.runtime.getManifest().version : '1.8.0'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">The complete manual for tabs management, keyboard shortcuts, context menus, and local privacy.</p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* 1. Quick-Start Essentials (4 Cards Grid) */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Zap className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">Quick-Start Essentials</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <Card style={{ '--stagger-index': 1 } as React.CSSProperties} className="animate-card-cascade card-interactive p-4 border-border bg-card shadow-xs flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <Plus className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h5 className="text-xs font-bold text-foreground">1-Click Window Capture</h5>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Click <strong>"Save Window"</strong> (or press <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">⌘S</kbd>) in the header or popup to stash all active tabs into a clean collection. Use the split dropdown for <strong>"Save All Windows"</strong>.
                      </p>
                    </div>
                  </Card>

                  <Card style={{ '--stagger-index': 2 } as React.CSSProperties} className="animate-card-cascade card-interactive p-4 border-border bg-card shadow-xs flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h5 className="text-xs font-bold text-foreground">Instant Tab Restoration</h5>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Click <strong>"Restore Group"</strong> on any card to reopen all tabs in a dedicated window, or click individual tab links to launch specific pages independently.
                      </p>
                    </div>
                  </Card>

                  <Card style={{ '--stagger-index': 3 } as React.CSSProperties} className="animate-card-cascade card-interactive p-4 border-border bg-card shadow-xs flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <MousePointerClick className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h5 className="text-xs font-bold text-foreground">Right-Click Context Menu</h5>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Right-click anywhere on a webpage, highlighted tabs, or any link, and select <strong>"TwoTab"</strong> to quickly save tabs without even opening the dashboard.
                      </p>
                    </div>
                  </Card>

                  <Card style={{ '--stagger-index': 4 } as React.CSSProperties} className="animate-card-cascade card-interactive p-4 border-border bg-card shadow-xs flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <Search className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h5 className="text-xs font-bold text-foreground">Smart Search & Rename</h5>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Filter collections instantly by title or domain. Click any group's title directly on its card to customize its name (e.g. <em>"Research Sprint"</em> or <em>"Design Inspiration"</em>).
                      </p>
                    </div>
                  </Card>
                </div>
              </div>

              {/* 2. Keyboard Shortcuts Cheatsheet */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Keyboard className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">Keyboard Shortcuts</h4>
                </div>
                <Card style={{ '--stagger-index': 5 } as React.CSSProperties} className="animate-card-cascade card-interactive border-border bg-card shadow-xs overflow-hidden">
                  <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Save Current Window</span>
                        <kbd className="px-2 py-1 rounded-md bg-muted text-foreground font-mono font-semibold text-xs border border-border shadow-2xs">⌘S / Ctrl+S</kbd>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Save All Windows</span>
                        <kbd className="px-2 py-1 rounded-md bg-muted text-foreground font-mono font-semibold text-xs border border-border shadow-2xs">⌘⇧S / Ctrl+Shift+S</kbd>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Save Active Tab Only</span>
                        <kbd className="px-2 py-1 rounded-md bg-muted text-foreground font-mono font-semibold text-xs border border-border shadow-2xs">⌘⌥S / Ctrl+Alt+S</kbd>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Clear Search / Dismiss Dialog</span>
                        <kbd className="px-2 py-1 rounded-md bg-muted text-foreground font-mono font-semibold text-xs border border-border shadow-2xs">Esc</kbd>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Save Group Rename</span>
                        <kbd className="px-2 py-1 rounded-md bg-muted text-foreground font-mono font-semibold text-xs border border-border shadow-2xs">Enter</kbd>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Cancel Group Rename</span>
                        <kbd className="px-2 py-1 rounded-md bg-muted text-foreground font-mono font-semibold text-xs border border-border shadow-2xs">Esc</kbd>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* 3. Power Features & Privacy Pillars */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Cpu className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">Power Features & Architecture</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <Card style={{ '--stagger-index': 6 } as React.CSSProperties} className="animate-card-cascade card-interactive p-4 border-border bg-card shadow-xs space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <Lock className="w-4 h-4 text-primary" />
                      100% Local-First Offline Privacy
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      TwoTab operates entirely within your browser using Chrome's local storage engine. Your tabs and history are never sent to external servers, cloud databases, or analytics trackers.
                    </p>
                  </Card>

                  <Card style={{ '--stagger-index': 7 } as React.CSSProperties} className="animate-card-cascade card-interactive p-4 border-border bg-card shadow-xs space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <RefreshCw className="w-4 h-4 text-primary" />
                      Automatic Rolling Backups
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      A background alarm automatically captures rolling snapshots of your tab collections every 6 hours, ensuring zero data loss even in unexpected browser crashes.
                    </p>
                  </Card>

                  <Card style={{ '--stagger-index': 8 } as React.CSSProperties} className="animate-card-cascade card-interactive p-4 border-border bg-card shadow-xs space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <FileText className="w-4 h-4 text-primary" />
                      Multi-Format Export & OneTab Import
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Export your collections as Markdown outlines for Obsidian/Notion, HTML bookmarks for browser sync, or plain text lists. OneTab users can paste or upload exports seamlessly.
                    </p>
                  </Card>

                  <Card style={{ '--stagger-index': 9 } as React.CSSProperties} className="animate-card-cascade card-interactive p-4 border-border bg-card shadow-xs space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <Palette className="w-4 h-4 text-primary" />
                      Curated Themes & View Transitions
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Switch between 7 meticulously tuned palettes (Studio Indigo, Paper Linen, Glacier Frost, Porcelain Rosé, Sunset Amber, Midnight Obsidian, Cyber Emerald) with fluid circular ripple transitions.
                    </p>
                  </Card>
                </div>
              </div>

              {/* 4. Comprehensive FAQ Accordion */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <HelpCircle className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">Frequently Asked Questions</h4>
                </div>
                <Card style={{ '--stagger-index': 10 } as React.CSSProperties} className="animate-card-cascade card-interactive border-border bg-card shadow-lg p-6">
                  <Accordion type="single" collapsible className="w-full space-y-2">
                    <AccordionItem value="faq-1" className="border-border">
                      <AccordionTrigger className="text-foreground font-semibold hover:text-primary transition-colors text-sm text-left">
                        How is TwoTab different from OneTab?
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed text-xs">
                        TwoTab is built on Manifest V3 with a modern design system, virtualized grid rendering, multi-window support, tab group archiving, configurable recently closed history, multi-format exports (Markdown, HTML Bookmarks, CSV, OneTab Text), and 100% offline local data security.
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="faq-2" className="border-border">
                      <AccordionTrigger className="text-foreground font-semibold hover:text-primary transition-colors text-sm text-left">
                        How do I migrate my tabs from OneTab into TwoTab?
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed text-xs">
                        In OneTab, click "Export / Import URLs" and copy the text. In TwoTab, go to <strong>Settings $\rightarrow$ Multi-Format Data Hub</strong>, paste the text into the OneTab migration box, choose <strong>Merge</strong>, and click <strong>Parse & Import</strong>. All groups will be created instantly.
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="faq-3" className="border-border">
                      <AccordionTrigger className="text-foreground font-semibold hover:text-primary transition-colors text-sm text-left">
                        How do I save multiple selected tabs with right-click?
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed text-xs">
                        Hold <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Shift</kbd> or <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Cmd/Ctrl</kbd> to select multiple tabs in your browser's tab strip, right-click on any webpage, and select <strong>TwoTab $\rightarrow$ Save Selected Tabs</strong>.
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="faq-4" className="border-border">
                      <AccordionTrigger className="text-foreground font-semibold hover:text-primary transition-colors text-sm text-left">
                        Are pinned tabs protected when saving a window?
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed text-xs">
                        Yes! By default, <strong>Protect Pinned Tabs</strong> is enabled in Settings, ensuring pinned tabs (email, music, communication) remain open and are never closed or disrupted when saving windows.
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="faq-5" className="border-border">
                      <AccordionTrigger className="text-foreground font-semibold hover:text-primary transition-colors text-sm text-left">
                        How can I export my tabs to Obsidian, Notion, or browser bookmarks?
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed text-xs">
                        Go to <strong>Settings $\rightarrow$ Multi-Format Data Hub</strong>. Select <strong>Markdown (.md)</strong> for an outline with clickable links for Obsidian/Notion, or <strong>HTML Bookmarks</strong> to import directly into Chrome, Firefox, Safari, or Edge bookmarks.
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="faq-6" className="border-border">
                      <AccordionTrigger className="text-foreground font-semibold hover:text-primary transition-colors text-sm text-left">
                        How does the "Recently Closed" tab tracker work?
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed text-xs">
                        TwoTab automatically caches tabs as they close in an FIFO queue. You can view, search, restore, or clear closed tabs in the <strong>Recently Closed</strong> tab. You can customize the retention limit (10 to 500 tabs) anytime in Settings.
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="faq-7" className="border-border">
                      <AccordionTrigger className="text-foreground font-semibold hover:text-primary transition-colors text-sm text-left">
                        How does TwoTab save RAM and system memory?
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed text-xs">
                        Modern browser tabs consume roughly 95 MB to 300 MB of RAM each. By saving inactive tab groups into TwoTab, your browser releases GPU memory, background CPU timers, and active processes, dramatically improving battery life and system responsiveness.
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="faq-8" className="border-border">
                      <AccordionTrigger className="text-foreground font-semibold hover:text-primary transition-colors text-sm text-left">
                        What happens if I accidentally click "Clear All Data"?
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed text-xs">
                        TwoTab automatically takes an internal emergency snapshot right before clearing. In addition, rolling backups are captured every 6 hours, allowing emergency recovery if needed.
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </Card>
              </div>
            </div>
          )}
        </ScrollArea>
      )}
    </>
    )}
  </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
