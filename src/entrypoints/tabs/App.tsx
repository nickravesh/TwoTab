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
  importData, 
  clearAllData,
  getSafeDomain,
  getRecentlyClosedItems,
  removeRecentlyClosedItem,
  clearRecentlyClosedItems,
  formatDisplayUrl,
  type ClosedTabItem
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
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

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

const CARD_HEIGHT = 360;
const CARD_GAP = 24; // gap-6 = 1.5rem = 24px
const MIN_CARD_WIDTH = 280;
const ROW_HEIGHT = CARD_HEIGHT + CARD_GAP;
const GRID_PADDING = 40; // p-10 = 2.5rem = 40px

function useContainerColumnCount(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [cols, setCols] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const approxWidth = Math.max(0, window.innerWidth - 256 - GRID_PADDING * 2);
      return Math.max(1, Math.floor((approxWidth + CARD_GAP) / (MIN_CARD_WIDTH + CARD_GAP)));
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
        Math.floor((netWidth + CARD_GAP) / (MIN_CARD_WIDTH + CARD_GAP))
      );
      console.log('[Grid ResizeObserver] Measured width:', width, 'netWidth:', netWidth, 'Calculated Cols:', calculatedCols);
      setCols(prev => (prev !== calculatedCols ? calculatedCols : prev));
    }
  }, [containerRef]);

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
  setDeleteConfirm: (state: DeleteConfirmState | null) => void;
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
  setDeleteConfirm,
}: VirtualizedCardGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const cols = useContainerColumnCount(parentRef);

  const rowCount = Math.ceil(filteredGroups.length / cols);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 2,
  });

  // Empty state
  if (filteredGroups.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-10 w-full">
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in-up">
          <Card className="p-8 border-border max-w-md text-center flex flex-col items-center shadow-sm bg-card">
            <Sparkles className="w-10 h-10 mb-4 text-primary opacity-90" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No {activeTab} groups found</h3>
            <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
              {activeTab === 'dashboard' 
                ? 'Save your open browser tabs to free up RAM memory and organize your workspace.' 
                : 'Archived tab groups will appear here.'}
            </p>
            {activeTab === 'dashboard' && (
              <div className="flex flex-col gap-3 w-full">
                <div className="flex w-full">
                  <Button onClick={handleSaveCurrentWindow} disabled={isSaving} group="splitLeft" className="flex-1 font-semibold shadow-sm hover:bg-primary/90 transition-colors">
                    <Plus className="w-4 h-4 mr-1.5" /> {isSaving ? 'Saving...' : 'Save Current Window'}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button disabled={isSaving} group="splitRight" className="shadow-sm px-2.5 hover:bg-primary/90">
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52 bg-card border-border">
                      <DropdownMenuItem onClick={handleSaveAllWindows} className="cursor-pointer">
                        <Layers className="w-4 h-4 mr-2 text-primary" />
                        Save All Windows
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-auto w-full" style={{ padding: GRID_PADDING }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const rowStartIdx = virtualRow.index * cols;
          const rowGroups = filteredGroups.slice(rowStartIdx, rowStartIdx + cols);

          return (
            <div
              key={virtualRow.key}
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
                  gap: `${CARD_GAP}px`,
                }}
              >
                {rowGroups.map((group) => (
                  <Card key={group.id} className="flex flex-col h-[360px] overflow-hidden rounded-xl border-border bg-card shadow-sm hover:shadow-md hover:border-border/80 transition-all duration-200">
                    <CardHeader className="pb-2.5 border-b border-border bg-muted/20 shrink-0">
                      <CardTitle className="text-sm font-semibold flex justify-between items-center mb-1">
                        {editingGroupId === group.id ? (
                          <div className="flex items-center gap-1.5 flex-1 mr-2">
                            <Input 
                              value={editingName} 
                              onChange={e => setEditingName(e.target.value)} 
                              className="h-7 text-xs bg-background border-input text-foreground"
                              autoFocus
                              onKeyDown={e => e.key === 'Enter' && handleSaveRename(group.id)}
                            />
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-primary hover:bg-primary/20" onClick={() => handleSaveRename(group.id)}>
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setEditingGroupId(null)}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group/title min-w-0 flex-1 mr-2 cursor-pointer" onClick={() => handleStartRename(group)}>
                            <span className="truncate font-semibold text-foreground">{group.name || 'Saved Group'}</span>
                            <Edit2 className="w-3.5 h-3.5 opacity-0 group-hover/title:opacity-70 transition-opacity text-muted-foreground shrink-0" />
                          </div>
                        )}
                        <Badge variant="secondary" className="shrink-0 text-[11px] font-normal border border-border/50">
                          {group.tabs.length} {group.tabs.length === 1 ? 'tab' : 'tabs'}
                        </Badge>
                      </CardTitle>
                      <div className="text-xs text-muted-foreground font-normal">{getRelativeTime(group.date)}</div>
                    </CardHeader>

                    <CardContent className="flex-1 min-h-0 overflow-y-auto custom-scrollbar scroll-fade-bottom p-3 space-y-1.5">
                      {group.tabs.map((tab, i) => {
                        const domain = getSafeDomain(tab.url);
                        return (
                          <div key={i} className="flex items-center gap-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors group/link p-1.5 rounded-md hover:bg-muted/60">
                            <div className="w-5 h-5 rounded bg-muted/80 flex items-center justify-center shrink-0 border border-border/60">
                              {domain ? (
                                <img 
                                  src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} 
                                  alt="" 
                                  className="w-3.5 h-3.5 opacity-90 group-hover/link:opacity-100" 
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }} 
                                />
                              ) : (
                                <Globe className="w-3 h-3 text-muted-foreground" />
                              )}
                            </div>
                            <a href={tab.url} target="_blank" rel="noreferrer" className="truncate flex-1 font-medium hover:text-primary transition-colors">
                              {tab.title || tab.url}
                            </a>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-5 w-5 opacity-0 group-hover/link:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10" 
                              onClick={() => setDeleteConfirm({ type: 'tab', groupId: group.id, url: tab.url, title: tab.title || tab.url })}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </CardContent>

                    <CardFooter className="p-2.5 border-t border-border bg-card shrink-0 flex justify-end gap-1.5 relative z-10">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 font-normal transition-colors" 
                        onClick={() => setDeleteConfirm({ type: 'group', id: group.id, title: group.name || 'Saved Group' })}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                      </Button>
                      {activeTab === 'dashboard' ? (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-muted font-normal transition-colors" 
                          onClick={() => handleArchiveGroup(group.id)}
                        >
                          <Archive className="w-3.5 h-3.5 mr-1" /> Archive
                        </Button>
                      ) : (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-muted font-normal transition-colors" 
                          onClick={() => handleUnarchiveGroup(group.id)}
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Unarchive
                        </Button>
                      )}
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="h-7 text-xs border border-border/60 font-medium transition-colors" 
                        onClick={() => handleRestoreGroup(group)}
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1 text-primary" /> Restore Group
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Main App Component
// =============================================================================

export default function App() {
  const { themeMode, resolvedTheme, setThemeMode } = useTheme();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'archive' | 'closed' | 'settings' | 'help'>('dashboard');
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [recentlyClosed, setRecentlyClosed] = useState<ClosedTabItem[]>([]);
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const loadData = async () => {
    if (activeTab === 'dashboard') {
      const data = await getGroups();
      setGroups(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } else if (activeTab === 'archive') {
      const data = await getArchivedGroups();
      setGroups(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } else if (activeTab === 'closed') {
      const items = await getRecentlyClosedItems();
      if (items.length > 0) {
        setRecentlyClosed(items);
      } else if (chrome?.sessions?.getRecentlyClosed) {
        chrome.sessions.getRecentlyClosed({ maxResults: 25 }, (sessions) => {
          const mapped: ClosedTabItem[] = (sessions || [])
            .map((s, idx) => {
              const title = s.tab?.title || (s.window?.tabs ? `Window (${s.window.tabs.length} tabs)` : 'Closed Item');
              const url = s.tab?.url || (s.window?.tabs?.[0]?.url || '');
              const timestampMs = s.lastModified ? s.lastModified * 1000 : Date.now();
              return {
                id: `session_${idx}_${Date.now()}`,
                title,
                url,
                timestamp: new Date(timestampMs).toISOString(),
              };
            })
            .filter(item => item.url && getSafeDomain(item.url));
          setRecentlyClosed(mapped);
        });
      } else {
        setRecentlyClosed([]);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local' && changes.recentlyClosed && activeTab === 'closed') {
        loadData();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [activeTab]);

  const handleSaveCurrentWindow = async () => {
    setIsSaving(true);
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'saveTabs' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response && response.status === 'success') {
            resolve(true);
          } else {
            reject(new Error('Failed to save current window tabs'));
          }
        });
      });
      showMessage('Current window tabs saved!');
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
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'saveAllWindows' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response && response.status === 'success') {
            resolve(true);
          } else {
            reject(new Error('Failed to save all windows'));
          }
        });
      });
      showMessage('Tabs saved across all windows!');
      loadData();
    } catch (e: any) {
      showMessage(e.message || 'Error saving all windows', 'error');
    } finally {
      setIsSaving(false);
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

  const handleRestoreGroup = (group: TabGroup) => {
    let count = 0;
    group.tabs.forEach(tab => {
      if (getSafeDomain(tab.url)) {
        chrome.tabs.create({ url: tab.url, active: false });
        count++;
      }
    });
    showMessage(`Restored ${count} tabs`);
  };

  const handleRestoreAllGroups = () => {
    let count = 0;
    groups.forEach(group => {
      group.tabs.forEach(tab => {
        if (getSafeDomain(tab.url)) {
          chrome.tabs.create({ url: tab.url, active: false });
          count++;
        }
      });
    });
    showMessage(`Restoring ${count} tabs across ${groups.length} groups`);
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

  const handleRestoreSession = (session: chrome.sessions.Session) => {
    if (session.tab && session.tab.url && getSafeDomain(session.tab.url)) {
      chrome.tabs.create({ url: session.tab.url });
    } else if (session.window && session.window.tabs) {
      session.window.tabs.forEach(tab => {
        if (tab.url && getSafeDomain(tab.url)) chrome.tabs.create({ url: tab.url, active: false });
      });
    }
    showMessage('Session restored');
  };

  const handleExport = async () => {
    const json = await exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twotab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showMessage('Backup downloaded!');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const success = await importData(content);
      if (success) {
        showMessage('Data imported successfully!');
        loadData();
      } else {
        showMessage('Invalid backup file format', 'error');
      }
    };
    reader.readAsText(file);
  };

  const deferredSearch = useDeferredValue(search);

  const filteredGroups = useMemo(() => {
    if (!deferredSearch) return groups;
    const lower = deferredSearch.toLowerCase();
    return groups
      .map(g => {
        const tabs = g.tabs.filter(t =>
          t.title.toLowerCase().includes(lower) ||
          t.url.toLowerCase().includes(lower)
        );
        if (tabs.length === 0 && !g.name?.toLowerCase().includes(lower)) return null;
        return { ...g, tabs };
      })
      .filter(Boolean) as TabGroup[];
  }, [groups, deferredSearch]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'archive', label: 'Archive', icon: Archive },
    { id: 'closed', label: 'Recently Closed', icon: History },
  ] as const;

  const prefItems = [
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'help', label: 'Help', icon: HelpCircle },
  ] as const;

  const getHeaderTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Dashboard';
      case 'archive': return 'Archive';
      case 'closed': return 'Recently Closed';
      case 'settings': return 'Settings';
      case 'help': return 'Help & Guide';
      default: return activeTab;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans relative text-foreground">
      {/* Toast Notification */}
      {message && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-xl border transition-all animate-fade-in-up ${message.type === 'success' ? 'bg-primary/20 border-primary/40 text-foreground' : 'bg-destructive/20 border-destructive/40 text-destructive-foreground'}`}>
          <p className="text-sm font-medium flex items-center gap-2">
            {message.type === 'success' ? <Sparkles className="w-4 h-4 text-primary" /> : <Info className="w-4 h-4 text-destructive" />}
            {message.text}
          </p>
        </div>
      )}

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent className="border-border bg-card max-w-md">
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
            <AlertDialogCancel onClick={() => setDeleteConfirm(null)} className="h-8 text-xs font-medium">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold shadow-sm">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-card p-6 flex flex-col z-20">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary via-purple-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <Layers className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary via-purple-400 to-accent tracking-tight">
            TwoTab
          </span>
        </div>
        
        <nav className="space-y-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs transition-colors font-medium ${
                  isActive 
                    ? 'bg-muted text-foreground font-semibold border-l-2 border-primary pl-3' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                {item.label}
              </button>
            );
          })}

          <Separator className="my-4 bg-border" />

          <div className="pb-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider px-3.5">Preferences</p>
          </div>

          {prefItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs transition-colors font-medium ${
                  isActive 
                    ? 'bg-muted text-foreground font-semibold border-l-2 border-primary pl-3' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 w-full flex flex-col z-10 relative">
        {/* Header */}
        <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-card/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold tracking-tight text-foreground">{getHeaderTitle()}</h2>
            {activeTab === 'dashboard' && groups.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRestoreAllGroups} 
                className="h-8 text-xs border-border bg-muted/40 hover:bg-muted text-foreground font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-primary" /> Restore All ({groups.reduce((acc, g) => acc + g.tabs.length, 0)} tabs)
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {(activeTab === 'dashboard' || activeTab === 'archive') && (
              <div className="relative w-72 group">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input 
                  placeholder="Search saved tabs..." 
                  className="pl-9 pr-8 bg-muted/50 border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary h-9 text-xs shadow-none" 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  onKeyDown={e => e.key === 'Escape' && setSearch('')}
                />
                {search && (
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="absolute right-1.5 top-1.5 h-6 w-6 text-muted-foreground hover:text-foreground" 
                    onClick={() => setSearch('')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            )}

            {/* Theme Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="border-border bg-card hover:bg-muted text-foreground h-9 w-9 shadow-sm"
                  title={`Theme: ${themeMode} (${resolvedTheme})`}
                >
                  {themeMode === 'system' ? (
                    <Monitor className="w-4 h-4 text-primary" />
                  ) : themeMode === 'light' ? (
                    <Sun className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Moon className="w-4 h-4 text-indigo-400" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36 bg-card border-border">
                <DropdownMenuItem
                  onClick={() => setThemeMode('light')}
                  className={`cursor-pointer text-xs font-medium py-2 flex items-center justify-between ${
                    themeMode === 'light' ? 'text-primary font-bold bg-primary/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span>Light</span>
                  </div>
                  {themeMode === 'light' && <span className="text-xs text-primary">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setThemeMode('dark')}
                  className={`cursor-pointer text-xs font-medium py-2 flex items-center justify-between ${
                    themeMode === 'dark' ? 'text-primary font-bold bg-primary/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Moon className="w-4 h-4 text-indigo-400" />
                    <span>Dark</span>
                  </div>
                  {themeMode === 'dark' && <span className="text-xs text-primary">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setThemeMode('system')}
                  className={`cursor-pointer text-xs font-medium py-2 flex items-center justify-between ${
                    themeMode === 'system' ? 'text-primary font-bold bg-primary/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-primary" />
                    <span>System</span>
                  </div>
                  {themeMode === 'system' && <span className="text-xs text-primary">✓</span>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Split Button: Save Current Window + Save All Windows */}
            <div className="flex items-center">
              <Button 
                onClick={handleSaveCurrentWindow} 
                disabled={isSaving} 
                variant="default"
                group="splitLeft"
                className="h-9 font-semibold shadow-sm hover:bg-primary/90 transition-colors text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> {isSaving ? 'Saving...' : 'Save Current Window'}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="default" 
                    size="icon" 
                    group="splitRight" 
                    disabled={isSaving}
                    className="shadow-sm h-9 w-8 hover:bg-primary/90"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 bg-card border-border">
                  <DropdownMenuItem onClick={handleSaveAllWindows} className="cursor-pointer">
                    <Layers className="w-4 h-4 mr-2 text-primary" />
                    Save All Windows
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
            setDeleteConfirm={setDeleteConfirm}
          />
        ) : (
        <ScrollArea className="flex-1 p-10">

          {/* Recently Closed View */}
          {activeTab === 'closed' && (
            <div className="max-w-4xl mx-auto space-y-4 animate-fade-in-up">
              {recentlyClosed.length > 0 && (
                <div className="flex justify-between items-center px-1 mb-2">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    {recentlyClosed.length} {recentlyClosed.length === 1 ? 'Closed Tab' : 'Closed Tabs'}
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleClearClosedItems} 
                    className="text-xs border-border hover:bg-destructive/10 hover:text-destructive transition-colors shadow-sm font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear History
                  </Button>
                </div>
              )}
              {recentlyClosed.length === 0 ? (
                <Card className="p-16 border-border max-w-md mx-auto text-center flex flex-col items-center shadow-2xl bg-card/75 backdrop-blur-xl">
                  <History className="w-12 h-12 mb-4 text-primary opacity-80" />
                  <h3 className="text-xl font-bold text-foreground mb-2">No Recently Closed Tabs</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Tabs and browser windows you close will automatically appear here so you can reopen them anytime.
                  </p>
                </Card>
              ) : (
                recentlyClosed.map((item) => {
                  const domain = getSafeDomain(item.url);
                  return (
                    <Card key={item.id} className="p-3 rounded-xl flex items-center justify-between hover:bg-muted/40 transition-colors border-border bg-card shadow-sm group">
                      <div className="flex items-center gap-3 truncate min-w-0 flex-1 mr-4">
                        <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0 border border-border">
                          {domain ? (
                            <img 
                              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} 
                              alt="" 
                              className="w-3.5 h-3.5 opacity-90" 
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="truncate flex-1 min-w-0">
                          <a href={item.url} target="_blank" rel="noreferrer" className="font-semibold text-foreground truncate block hover:text-primary transition-colors text-sm">
                            {item.title || formatDisplayUrl(item.url)}
                          </a>
                          <span className="text-xs text-muted-foreground truncate block">{formatDisplayUrl(item.url)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground font-medium hidden sm:inline mr-2">{getRelativeTime(item.timestamp)}</span>
                        <Button size="sm" variant="secondary" onClick={() => handleReopenClosedItem(item)} className="border border-border/60 font-medium text-xs h-7">
                          Reopen Tab
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleRemoveClosedItem(item.id)} className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {/* Settings View */}
          {activeTab === 'settings' && (
            <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-up">
              {/* Appearance & Theme Settings */}
              <Card className="border-border bg-card shadow-lg">
                <CardHeader>
                  <CardTitle className="text-foreground text-xl flex items-center gap-2">
                    {themeMode === 'system' ? (
                      <Monitor className="w-5 h-5 text-primary" />
                    ) : themeMode === 'light' ? (
                      <Sun className="w-5 h-5 text-amber-500" />
                    ) : (
                      <Moon className="w-5 h-5 text-indigo-400" />
                    )}
                    Appearance & Theme
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Choose how TwoTab looks on your device. Changes synchronize across all extension windows in real time.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="grid grid-cols-3 gap-3">
                    {/* Light option */}
                    <button
                      type="button"
                      onClick={() => setThemeMode('light')}
                      className={`flex flex-col items-center justify-center p-3.5 rounded-xl border transition-all text-center gap-2 ${
                        themeMode === 'light'
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-md font-bold text-foreground'
                          : 'border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground font-medium'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-sm">
                        <Sun className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">Light</div>
                        <div className="text-[11px] text-muted-foreground font-normal">Clean bright canvas</div>
                      </div>
                    </button>

                    {/* Dark option */}
                    <button
                      type="button"
                      onClick={() => setThemeMode('dark')}
                      className={`flex flex-col items-center justify-center p-3.5 rounded-xl border transition-all text-center gap-2 ${
                        themeMode === 'dark'
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-md font-bold text-foreground'
                          : 'border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground font-medium'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-sm">
                        <Moon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">Dark</div>
                        <div className="text-[11px] text-muted-foreground font-normal">Deep dark palette</div>
                      </div>
                    </button>

                    {/* System option */}
                    <button
                      type="button"
                      onClick={() => setThemeMode('system')}
                      className={`flex flex-col items-center justify-center p-3.5 rounded-xl border transition-all text-center gap-2 ${
                        themeMode === 'system'
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-md font-bold text-foreground'
                          : 'border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground font-medium'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-sm">
                        <Monitor className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">System</div>
                        <div className="text-[11px] text-muted-foreground font-normal">Auto ({resolvedTheme})</div>
                      </div>
                    </button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card shadow-lg">
                <CardHeader>
                  <CardTitle className="text-foreground text-xl flex items-center gap-2">
                    <Download className="w-5 h-5 text-primary" /> Data Backup & Synchronization
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Export a local JSON copy of your saved tab groups or restore your workspace from a backup file.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex gap-4">
                    <Button onClick={handleExport} variant="outline" className="border-border hover:bg-muted text-foreground font-semibold shadow-sm">
                      <Download className="w-4 h-4 mr-2 text-primary" /> Export Backup (JSON)
                    </Button>
                    <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".json" className="hidden" />
                    <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="border-border hover:bg-muted text-foreground font-semibold shadow-sm">
                      <Upload className="w-4 h-4 mr-2 text-primary" /> Import Backup (JSON)
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-destructive/30 bg-destructive/10 shadow-lg">
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
                      <Button variant="destructive" className="font-bold shadow-lg shadow-destructive/20">
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
                        <AlertDialogCancel className="font-semibold">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={async () => {
                            await clearAllData();
                            showMessage('All data cleared');
                            loadData();
                          }} 
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold shadow-md shadow-destructive/20"
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

          {/* Help View */}
          {activeTab === 'help' && (
            <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-up">
              <Card className="border-border bg-card shadow-xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 rounded-xl bg-primary/20 text-primary border border-primary/30">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-foreground">TwoTab User Guide & FAQ</h3>
                    <p className="text-sm text-muted-foreground">Everything you need to know about managing, restoring, and exporting tab collections.</p>
                  </div>
                </div>

                <Accordion type="single" collapsible className="w-full space-y-2">
                  <AccordionItem value="item-1" className="border-border">
                    <AccordionTrigger className="text-foreground font-semibold hover:text-primary transition-colors text-base">
                      How do I save active browser tabs?
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed text-sm">
                      Click the <strong className="text-foreground">"Save Current Window"</strong> button in the top header (or popup) to capture all tabs in your active window into a organized group. Click the dropdown chevron arrow next to it to select <strong className="text-foreground">"Save All Windows"</strong> to save your entire multi-window workspace at once.
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-2" className="border-border">
                    <AccordionTrigger className="text-foreground font-semibold hover:text-primary transition-colors text-base">
                      How do I restore saved tab groups?
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed text-sm">
                      Click <strong className="text-foreground">"Restore Group"</strong> on any saved card to reopen all tabs in that collection into your browser. You can also click individual tab links inside a card to open specific pages independently.
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-3" className="border-border">
                    <AccordionTrigger className="text-foreground font-semibold hover:text-primary transition-colors text-base">
                      Can I search or rename tab collections?
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed text-sm">
                      Yes! Use the search bar in the header to filter saved tabs instantly by title or URL. To rename a group, click directly on the group name on any card, type your desired title, and press Enter or click the checkmark button.
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-4" className="border-border">
                    <AccordionTrigger className="text-foreground font-semibold hover:text-primary transition-colors text-base">
                      How do data backups and privacy work?
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed text-sm">
                      TwoTab operates 100% locally inside your Chrome browser—your data is never sent to external servers or third parties. Visit <strong className="text-foreground">Settings</strong> anytime to export a JSON backup file or import existing backups onto new devices.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </Card>
            </div>
          )}
        </ScrollArea>
        )}
      </div>
    </div>
  );
}
