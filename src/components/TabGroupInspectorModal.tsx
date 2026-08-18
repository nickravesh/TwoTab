import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  type TabGroup,
  type Tab,
  type TabGroupColor,
  reorderTabsInGroup,
  deleteMultipleTabsFromGroup,
  addTabToGroup,
  setGroupColor,
  extractTabsToNewGroup,
  exportSingleGroupAsMarkdown,
  exportSingleGroupAsPlainText,
  restoreTabsAsChromeGroup,
  copyToClipboardSafe,
  getSafeDomain,
  formatDisplayUrl,
  getRelativeTime,
} from '@/lib/storage';
import {
  Search,
  X,
  Check,
  Edit2,
  Trash2,
  Copy,
  RotateCcw,
  Archive,
  ExternalLink,
  GripVertical,
  Plus,
  Layers,
  FolderPlus,
  FileText,
  Undo2,
  ChevronDown,
  Globe,
  Share2,
} from 'lucide-react';

export interface TabGroupInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: TabGroup | null;
  onGroupUpdated: () => void;
  onDeleteGroup: (groupId: number, groupName: string) => void;
  onArchiveGroup?: (groupId: number) => void;
  onUnarchiveGroup?: (groupId: number) => void;
  isArchived?: boolean;
  faviconStyle?: 'color' | 'monochrome' | 'hidden';
}

const CHROME_COLORS: { id: TabGroupColor; label: string; bgClass: string; ringClass: string }[] = [
  { id: 'grey', label: 'Slate', bgClass: 'bg-zinc-400 dark:bg-zinc-500', ringClass: 'ring-zinc-400' },
  { id: 'blue', label: 'Blue', bgClass: 'bg-blue-500', ringClass: 'ring-blue-500' },
  { id: 'purple', label: 'Purple', bgClass: 'bg-purple-500', ringClass: 'ring-purple-500' },
  { id: 'pink', label: 'Pink', bgClass: 'bg-pink-500', ringClass: 'ring-pink-500' },
  { id: 'red', label: 'Red', bgClass: 'bg-red-500', ringClass: 'ring-red-500' },
  { id: 'orange', label: 'Orange', bgClass: 'bg-orange-500', ringClass: 'ring-orange-500' },
  { id: 'yellow', label: 'Yellow', bgClass: 'bg-amber-400', ringClass: 'ring-amber-400' },
  { id: 'green', label: 'Green', bgClass: 'bg-emerald-500', ringClass: 'ring-emerald-500' },
  { id: 'cyan', label: 'Cyan', bgClass: 'bg-cyan-500', ringClass: 'ring-cyan-500' },
];

export function TabGroupInspectorModal({
  isOpen,
  onClose,
  group,
  onGroupUpdated,
  onDeleteGroup,
  onArchiveGroup,
  onUnarchiveGroup,
  isArchived = false,
  faviconStyle = 'color',
}: TabGroupInspectorModalProps) {
  if (!group) return null;

  // Search & Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDomainFilter, setActiveDomainFilter] = useState<string | null>(null);

  // Renaming State
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(group.name || '');

  // Selection State
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  // Manual Add Tab State
  const [isAddingTab, setIsAddingTab] = useState(false);
  const [newTabUrl, setNewTabUrl] = useState('');
  const [newTabTitle, setNewTabTitle] = useState('');

  // Drag & Drop State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Undo Toast State
  const [undoSnapshot, setUndoSnapshot] = useState<{ tabs: Tab[]; description: string } | null>(null);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Copy Feedback State
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Sync draft title when group changes
  useEffect(() => {
    setTitleDraft(group.name || '');
    setSelectedIndices(new Set());
    setSearchQuery('');
    setActiveDomainFilter(null);
    setIsAddingTab(false);
    setUndoSnapshot(null);
  }, [group.id, isOpen]);

  // Compute Domain Statistics
  const domainStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tab of group.tabs) {
      const domain = getSafeDomain(tab.url);
      if (domain) {
        counts.set(domain, (counts.get(domain) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([domain, count]) => ({ domain, count }));
  }, [group.tabs]);

  // Compute Filtered Tabs with indices relative to original group.tabs
  const filteredIndexedTabs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return group.tabs
      .map((tab, originalIndex) => ({ tab, originalIndex }))
      .filter(({ tab }) => {
        if (activeDomainFilter) {
          const domain = getSafeDomain(tab.url);
          if (domain !== activeDomainFilter) return false;
        }
        if (!q) return true;
        const titleMatch = (tab.title || '').toLowerCase().includes(q);
        const urlMatch = (tab.url || '').toLowerCase().includes(q);
        return titleMatch || urlMatch;
      });
  }, [group.tabs, searchQuery, activeDomainFilter]);

  // Highlight matching text in search
  const highlightMatches = useCallback((text: string, query: string) => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-primary/25 text-primary font-medium rounded-xs px-0.5">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  }, []);

  // Handle Save Title
  const handleSaveTitle = async () => {
    const trimmed = titleDraft.trim();
    if (trimmed !== group.name) {
      const { renameGroup } = await import('@/lib/storage');
      await renameGroup(group.id, trimmed);
      onGroupUpdated();
    }
    setIsEditingTitle(false);
  };

  // Handle Change Group Color
  const handleSelectColor = async (colorId: TabGroupColor) => {
    const newColor = group.color === colorId ? undefined : colorId;
    await setGroupColor(group.id, newColor);
    onGroupUpdated();
  };

  // Toggle selection on a tab index
  const handleToggleSelect = (index: number, e?: React.MouseEvent) => {
    const newSet = new Set(selectedIndices);
    if (e?.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      for (let i = start; i <= end; i++) {
        newSet.add(i);
      }
    } else {
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
    }
    setSelectedIndices(newSet);
    setLastSelectedIndex(index);
  };

  // Select / Deselect All Filtered
  const handleToggleSelectAll = () => {
    if (selectedIndices.size === filteredIndexedTabs.length && filteredIndexedTabs.length > 0) {
      setSelectedIndices(new Set());
    } else {
      const allFiltered = new Set<number>();
      for (const item of filteredIndexedTabs) {
        allFiltered.add(item.originalIndex);
      }
      setSelectedIndices(allFiltered);
    }
  };

  // Trigger non-destructive undo
  const triggerUndoSnapshot = (description: string) => {
    setUndoSnapshot({ tabs: [...group.tabs], description });
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => {
      setUndoSnapshot(null);
    }, 6000);
  };

  const handleRestoreUndo = async () => {
    if (!undoSnapshot) return;
    const { saveGroups, getGroups } = await import('@/lib/storage');
    const groups = await getGroups();
    const updated = groups.map((g) => (g.id === group.id ? { ...g, tabs: undoSnapshot.tabs } : g));
    await saveGroups(updated);
    setUndoSnapshot(null);
    onGroupUpdated();
  };

  // Delete Individual Tab
  const handleDeleteTab = async (originalIndex: number) => {
    triggerUndoSnapshot('Removed 1 tab');
    await deleteMultipleTabsFromGroup(group.id, [originalIndex]);
    const nextSet = new Set(selectedIndices);
    nextSet.delete(originalIndex);
    setSelectedIndices(nextSet);
    onGroupUpdated();
  };

  // Batch Delete Selected Tabs
  const handleDeleteSelected = async () => {
    if (selectedIndices.size === 0) return;
    const count = selectedIndices.size;
    triggerUndoSnapshot(`Removed ${count} ${count === 1 ? 'tab' : 'tabs'}`);
    await deleteMultipleTabsFromGroup(group.id, Array.from(selectedIndices));
    setSelectedIndices(new Set());
    onGroupUpdated();
  };

  // Batch Open Selected Tabs
  const handleOpenSelected = async () => {
    const urlsToOpen = Array.from(selectedIndices)
      .map((idx) => group.tabs[idx]?.url)
      .filter(Boolean);

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      for (const url of urlsToOpen) {
        await chrome.tabs.create({ url, active: false });
      }
    }
  };

  // Batch Extract to New Group
  const handleExtractToNewGroup = async () => {
    if (selectedIndices.size === 0) return;
    triggerUndoSnapshot(`Extracted ${selectedIndices.size} tabs`);
    await extractTabsToNewGroup(group.id, Array.from(selectedIndices));
    setSelectedIndices(new Set());
    onGroupUpdated();
  };

  // Add Single Tab to Group
  const handleAddTab = async (e: React.FormEvent) => {
    e.preventDefault();
    let url = newTabUrl.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.includes('://')) {
      url = `https://${url}`;
    }
    await addTabToGroup(group.id, {
      url,
      title: newTabTitle.trim() || url,
    });
    setNewTabUrl('');
    setNewTabTitle('');
    setIsAddingTab(false);
    onGroupUpdated();
  };

  // Drag & Drop Handlers
  const handleDragStart = (originalIndex: number) => {
    setDraggedIndex(originalIndex);
  };

  const handleDragOver = (e: React.DragEvent, originalIndex: number) => {
    e.preventDefault();
    if (dragOverIndex !== originalIndex) {
      setDragOverIndex(originalIndex);
    }
  };

  const handleDrop = async (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    await reorderTabsInGroup(group.id, draggedIndex, targetIndex);
    setDraggedIndex(null);
    setDragOverIndex(null);
    onGroupUpdated();
  };

  // Copy helpers
  const handleCopyMarkdown = async () => {
    const md = exportSingleGroupAsMarkdown(group);
    await copyToClipboardSafe(md);
    setCopyFeedback('Copied as Markdown!');
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  const handleCopyPlainText = async () => {
    const txt = exportSingleGroupAsPlainText(group);
    await copyToClipboardSafe(txt);
    setCopyFeedback('Copied URLs!');
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  const handleCopySelectedUrls = async () => {
    const selectedTabs = Array.from(selectedIndices)
      .map((idx) => group.tabs[idx])
      .filter(Boolean);
    const txt = selectedTabs.map((t) => t.url).join('\n');
    await copyToClipboardSafe(txt);
    setCopyFeedback(`Copied ${selectedTabs.length} URLs!`);
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  // Restore Handlers
  const handleRestoreCurrent = async () => {
    const { restoreTabGroup } = await import('@/lib/storage');
    await restoreTabGroup(group, {
      protectPinnedTabs: true,
      restoreDestination: 'current_window',
      restoreBehavior: 'keep',
      recentlyClosedLimit: 50,
    });
  };

  const handleRestoreNewWindow = async () => {
    const { restoreTabGroup } = await import('@/lib/storage');
    await restoreTabGroup(group, {
      protectPinnedTabs: true,
      restoreDestination: 'new_window',
      restoreBehavior: 'keep',
      recentlyClosedLimit: 50,
    });
  };

  const handleRestoreChromeTabGroup = async () => {
    await restoreTabsAsChromeGroup(group.name || 'TwoTab Group', group.tabs, group.color, 'current_window');
  };

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, filteredIndexedTabs.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (filteredIndexedTabs[focusedIndex]) {
          handleToggleSelect(filteredIndexedTabs[focusedIndex].originalIndex);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredIndexedTabs[focusedIndex]) {
          window.open(filteredIndexedTabs[focusedIndex].tab.url, '_blank');
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        handleToggleSelectAll();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleRestoreUndo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIndices.size > 0) {
          e.preventDefault();
          handleDeleteSelected();
        } else if (filteredIndexedTabs[focusedIndex]) {
          e.preventDefault();
          handleDeleteTab(filteredIndexedTabs[focusedIndex].originalIndex);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, focusedIndex, filteredIndexedTabs, selectedIndices, undoSnapshot]);

  const activeColorConfig = CHROME_COLORS.find((c) => c.id === group.color);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl w-[94vw] max-h-[86vh] flex flex-col p-0 overflow-hidden rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl text-card-foreground">
        {/* Tier 1: Fixed Modal Header */}
        <DialogHeader className="shrink-0 p-4 pb-3 border-b border-border/60 bg-muted/20 space-y-3">
          <div className="flex items-start justify-between gap-3 min-w-0">
            {/* Title & Color Picker */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {/* Color Accent Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`w-4 h-4 rounded-full transition-all shrink-0 cursor-pointer ${
                      activeColorConfig ? activeColorConfig.bgClass : 'bg-muted-foreground/30 border border-border'
                    } hover:scale-125 focus:outline-none focus:ring-2 focus:ring-primary`}
                    title={`Color tag: ${activeColorConfig ? activeColorConfig.label : 'None'}`}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="p-2 grid grid-cols-5 gap-1.5 min-w-[150px]">
                  {CHROME_COLORS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectColor(c.id)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-115 ${c.bgClass}`}
                      title={c.label}
                    >
                      {group.color === c.id && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Title Renaming */}
              {isEditingTitle ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                    className="h-8 text-sm font-semibold bg-background border-input text-foreground focus-visible:ring-1 focus-visible:ring-primary"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:bg-primary/20 shrink-0" onClick={handleSaveTitle}>
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0" onClick={() => setIsEditingTitle(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div
                  className="flex items-center gap-2 group/title min-w-0 cursor-pointer flex-1"
                  onClick={() => setIsEditingTitle(true)}
                  title="Click to rename group"
                >
                  <DialogTitle className="text-base font-bold tracking-tight text-foreground truncate group-hover/title:text-primary transition-colors">
                    {group.name || 'Saved Group'}
                  </DialogTitle>
                  <Edit2 className="w-3.5 h-3.5 opacity-0 group-hover/title:opacity-70 transition-opacity text-muted-foreground shrink-0" />
                </div>
              )}
            </div>

            {/* Badge Metadata */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs bg-muted/80 text-muted-foreground border border-border/60 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">
                {group.tabs.length} {group.tabs.length === 1 ? 'tab' : 'tabs'} • {getRelativeTime(group.date)}
              </span>
            </div>
          </div>

          {/* Search Bar & Fast Actions */}
          <div className="flex items-center gap-2 pt-0.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter tabs in this group... (⌘F)"
                className="h-8 pl-8 pr-7 text-xs bg-background/80 border-input text-foreground focus-visible:ring-1 focus-visible:ring-primary rounded-lg"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className={`h-8 px-2.5 text-xs gap-1.5 rounded-lg border-border/80 ${isAddingTab ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground hover:text-foreground'}`}
              onClick={() => setIsAddingTab(!isAddingTab)}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Link</span>
            </Button>
          </div>

          {/* Add Tab Inline Panel */}
          {isAddingTab && (
            <form onSubmit={handleAddTab} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/40 border border-border/80 animate-in fade-in-50 slide-in-from-top-1">
              <Input
                value={newTabUrl}
                onChange={(e) => setNewTabUrl(e.target.value)}
                placeholder="https://example.com"
                className="h-7 text-xs bg-background flex-1"
                autoFocus
              />
              <Input
                value={newTabTitle}
                onChange={(e) => setNewTabTitle(e.target.value)}
                placeholder="Title (optional)"
                className="h-7 text-xs bg-background flex-1"
              />
              <Button type="submit" size="sm" className="h-7 px-3 text-xs bg-primary text-primary-foreground">
                Add
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setIsAddingTab(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </form>
          )}

          {/* Tier 2: Domain Filter Pills (rendered only when >= 2 domains exist) */}
          {domainStats.length >= 2 && (
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 text-xs">
              <button
                onClick={() => setActiveDomainFilter(null)}
                className={`px-2.5 py-0.5 rounded-full border transition-all whitespace-nowrap font-medium ${
                  activeDomainFilter === null
                    ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                    : 'bg-muted/50 text-muted-foreground border-border/60 hover:bg-muted'
                }`}
              >
                All ({group.tabs.length})
              </button>
              {domainStats.map(({ domain, count }) => (
                <button
                  key={domain}
                  onClick={() => setActiveDomainFilter(activeDomainFilter === domain ? null : domain)}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border transition-all whitespace-nowrap font-medium ${
                    activeDomainFilter === domain
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-muted/50 text-muted-foreground border-border/60 hover:bg-muted'
                  }`}
                >
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                    alt=""
                    className="w-3 h-3 rounded-xs"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <span>{domain}</span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>
              ))}
            </div>
          )}
        </DialogHeader>

        {/* Tier 3: Scrollable Tab List Body */}
        <div className="flex-1 min-h-[260px] max-h-[460px] overflow-y-auto custom-scrollbar scroll-fade-bottom p-3 space-y-1 relative">
          {filteredIndexedTabs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <Search className="w-8 h-8 mx-auto opacity-40 text-muted-foreground" />
              <p className="text-sm font-medium">No tabs matching your search</p>
              {searchQuery && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSearchQuery('')}>
                  Clear filter
                </Button>
              )}
            </div>
          ) : (
            filteredIndexedTabs.map(({ tab, originalIndex }, idx) => {
              const isSelected = selectedIndices.has(originalIndex);
              const isFocused = focusedIndex === idx;
              const domain = getSafeDomain(tab.url);
              const isDragging = draggedIndex === originalIndex;
              const isDragOver = dragOverIndex === originalIndex;

              return (
                <div
                  key={originalIndex}
                  draggable
                  onDragStart={() => handleDragStart(originalIndex)}
                  onDragOver={(e) => handleDragOver(e, originalIndex)}
                  onDrop={() => handleDrop(originalIndex)}
                  onClick={(e) => handleToggleSelect(originalIndex, e)}
                  className={`group/row relative flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer select-none ${
                    isDragging ? 'opacity-30 border-dashed border-primary' : ''
                  } ${isDragOver ? 'border-t-2 border-t-primary bg-primary/10' : ''} ${
                    isSelected
                      ? 'bg-primary/15 border-primary/40 shadow-xs'
                      : isFocused
                      ? 'bg-muted/60 border-border/80'
                      : 'bg-card hover:bg-muted/40 border-border/40'
                  }`}
                >
                  {/* Left Grip & Checkbox & Content */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                    {/* Drag Handle */}
                    <div
                      className="cursor-grab active:cursor-grabbing text-muted-foreground/40 group-hover/row:text-muted-foreground transition-colors shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>

                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSelect(originalIndex, e);
                      }}
                      className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 shrink-0 cursor-pointer accent-primary"
                    />

                    {/* Favicon */}
                    {faviconStyle !== 'hidden' ? (
                      <div className="w-4 h-4 rounded flex items-center justify-center shrink-0">
                        {domain ? (
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                            alt=""
                            className={`w-4 h-4 opacity-90 group-hover/row:opacity-100 ${
                              faviconStyle === 'monochrome' ? 'favicon-monochrome' : ''
                            }`}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </div>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover/row:bg-primary shrink-0" />
                    )}

                    {/* Title & Domain Typography */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-medium text-foreground truncate">
                        {highlightMatches(tab.title || tab.url, searchQuery)}
                      </span>
                      <span className="text-[11px] text-muted-foreground/75 truncate font-mono">
                        {highlightMatches(formatDisplayUrl(tab.url), searchQuery)}
                      </span>
                    </div>
                  </div>

                  {/* Right Hover Actions */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary/20 rounded-md"
                      onClick={() => window.open(tab.url, '_blank')}
                      title="Open tab"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
                      onClick={async () => {
                        await copyToClipboardSafe(tab.url);
                        setCopyFeedback('URL Copied!');
                        setTimeout(() => setCopyFeedback(null), 2000);
                      }}
                      title="Copy URL"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/20 rounded-md"
                      onClick={() => handleDeleteTab(originalIndex)}
                      title="Delete tab"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Floating Batch Action Bar (Progressive Disclosure) */}
        {selectedIndices.size > 0 && (
          <div className="mx-3 mb-2 p-2 rounded-xl bg-card border border-primary/40 shadow-xl flex items-center justify-between gap-2 animate-in fade-in-50 slide-in-from-bottom-2 z-20">
            <span className="text-xs font-semibold text-primary pl-2">
              {selectedIndices.size} {selectedIndices.size === 1 ? 'tab' : 'tabs'} selected
            </span>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={handleOpenSelected}>
                <ExternalLink className="w-3 h-3" />
                <span>Open ({selectedIndices.size})</span>
              </Button>
              <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={handleExtractToNewGroup}>
                <FolderPlus className="w-3 h-3" />
                <span>Extract</span>
              </Button>
              <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={handleCopySelectedUrls}>
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </Button>
              <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={handleDeleteSelected}>
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setSelectedIndices(new Set())}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Non-Destructive Undo Toast Banner */}
        {undoSnapshot && (
          <div className="mx-3 mb-2 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs flex items-center justify-between animate-in fade-in-50 slide-in-from-bottom-2 shadow-lg z-20">
            <span>{undoSnapshot.description}</span>
            <button
              onClick={handleRestoreUndo}
              className="flex items-center gap-1 font-bold text-primary-foreground hover:underline ml-2 cursor-pointer"
            >
              <Undo2 className="w-3 h-3" /> Undo (⌘Z)
            </button>
          </div>
        )}

        {/* Copy Feedback Notification */}
        {copyFeedback && (
          <div className="mx-3 mb-2 px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold text-center animate-in fade-in-50">
            {copyFeedback}
          </div>
        )}

        {/* Tier 4: Fixed Modal Footer */}
        <div className="shrink-0 p-3.5 border-t border-border/60 bg-muted/20 flex items-center justify-between relative z-10">
          {/* Left Actions */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg gap-1.5"
              onClick={() => {
                onClose();
                onDeleteGroup(group.id, group.name || 'Saved Group');
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Group</span>
            </Button>

            {/* Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground rounded-lg gap-1">
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Export</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onClick={handleCopyMarkdown} className="text-xs cursor-pointer gap-2">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  <span>Copy as Markdown</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyPlainText} className="text-xs cursor-pointer gap-2">
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Copy as Plain URLs</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Archive / Unarchive */}
            {isArchived && onUnarchiveGroup ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground rounded-lg gap-1.5"
                onClick={() => {
                  onUnarchiveGroup(group.id);
                  onClose();
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Unarchive</span>
              </Button>
            ) : onArchiveGroup ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground rounded-lg gap-1.5"
                onClick={() => {
                  onArchiveGroup(group.id);
                  onClose();
                }}
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Archive</span>
              </Button>
            ) : null}
          </div>

          {/* Right Restore Actions (Split Button) */}
          <div className="flex items-center gap-1">
            <Button
              variant="default"
              size="sm"
              className="h-8 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-l-lg rounded-r-none shadow-xs flex items-center gap-1.5"
              onClick={handleRestoreCurrent}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore All</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 px-1.5 bg-primary text-primary-foreground border-l border-primary-foreground/25 rounded-l-none rounded-r-lg"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleRestoreCurrent} className="text-xs cursor-pointer gap-2">
                  <RotateCcw className="w-3.5 h-3.5 text-primary" />
                  <span>Restore in Current Window</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleRestoreNewWindow} className="text-xs cursor-pointer gap-2">
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Restore in New Window</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleRestoreChromeTabGroup} className="text-xs cursor-pointer gap-2">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  <span>Restore as Chrome Tab Group</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
