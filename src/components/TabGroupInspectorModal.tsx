import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  sourceRect?: DOMRect | null;
  onGroupUpdated: () => void;
  onDeleteGroup: (groupId: number, groupName: string) => void;
  onArchiveGroup?: (groupId: number) => void;
  onUnarchiveGroup?: (groupId: number) => void;
  isArchived?: boolean;
  faviconStyle?: 'color' | 'monochrome' | 'hidden';
}

const COLOR_PALETTE: { id: TabGroupColor; label: string; colorStyle: string; borderStyle: string }[] = [
  { id: 'grey', label: 'Slate', colorStyle: 'hsl(220 10% 55%)', borderStyle: 'hsl(220 10% 45%)' },
  { id: 'blue', label: 'Blue', colorStyle: 'hsl(217 91% 60%)', borderStyle: 'hsl(217 91% 50%)' },
  { id: 'purple', label: 'Purple', colorStyle: 'hsl(271 91% 65%)', borderStyle: 'hsl(271 91% 55%)' },
  { id: 'pink', label: 'Pink', colorStyle: 'hsl(330 85% 65%)', borderStyle: 'hsl(330 85% 55%)' },
  { id: 'red', label: 'Red', colorStyle: 'hsl(0 84% 60%)', borderStyle: 'hsl(0 84% 50%)' },
  { id: 'orange', label: 'Orange', colorStyle: 'hsl(25 95% 53%)', borderStyle: 'hsl(25 95% 45%)' },
  { id: 'yellow', label: 'Amber', colorStyle: 'hsl(45 93% 47%)', borderStyle: 'hsl(45 93% 40%)' },
  { id: 'green', label: 'Emerald', colorStyle: 'hsl(152 76% 40%)', borderStyle: 'hsl(152 76% 32%)' },
  { id: 'cyan', label: 'Cyan', colorStyle: 'hsl(188 86% 45%)', borderStyle: 'hsl(188 86% 38%)' },
];

export function TabGroupInspectorModal({
  isOpen,
  onClose,
  group,
  sourceRect,
  onGroupUpdated,
  onDeleteGroup,
  onArchiveGroup,
  onUnarchiveGroup,
  isArchived = false,
  faviconStyle = 'color',
}: TabGroupInspectorModalProps) {
  // Spatial Morph Animation State
  const [animationState, setAnimationState] = useState<'idle' | 'expanding' | 'open' | 'collapsing'>('idle');
  const [currentOrigin, setCurrentOrigin] = useState<{ deltaX: number; deltaY: number; scaleX: number; scaleY: number }>({
    deltaX: 0,
    deltaY: 30,
    scaleX: 0.9,
    scaleY: 0.9,
  });

  // Search & Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDomainFilter, setActiveDomainFilter] = useState<string | null>(null);

  // Renaming State
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

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

  // In-Modal Delete Confirmation State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Compute Spatial Origin Deltas from Source Rect
  const calculateDeltas = useCallback((rect?: DOMRect | null) => {
    if (typeof window === 'undefined') return { deltaX: 0, deltaY: 30, scaleX: 0.9, scaleY: 0.9 };
    const targetWidth = Math.min(window.innerWidth * 0.92, 768);
    const targetHeight = Math.min(window.innerHeight * 0.82, 680);

    if (rect && rect.width > 0 && rect.height > 0) {
      const deltaX = (rect.left + rect.width / 2) - (window.innerWidth / 2);
      const deltaY = (rect.top + rect.height / 2) - (window.innerHeight / 2);
      const scaleX = Math.max(0.15, rect.width / targetWidth);
      const scaleY = Math.max(0.15, rect.height / targetHeight);
      return { deltaX, deltaY, scaleX, scaleY };
    }

    return { deltaX: 0, deltaY: 30, scaleX: 0.9, scaleY: 0.9 };
  }, []);

  // Handle Opening Animation Lifecycle
  useEffect(() => {
    if (isOpen && group) {
      setTitleDraft(group.name || '');
      setSelectedIndices(new Set());
      setSearchQuery('');
      setActiveDomainFilter(null);
      setIsAddingTab(false);
      setUndoSnapshot(null);
      setIsEditingTitle(false);
      setShowDeleteConfirm(false);

      // 1. Calculate Initial Origin from sourceRect
      const initialDeltas = calculateDeltas(sourceRect);
      setCurrentOrigin(initialDeltas);
      setAnimationState('expanding');

      // 2. Animate to Full Expansion on Next Frame
      const frame = requestAnimationFrame(() => {
        setAnimationState('open');
      });

      return () => cancelAnimationFrame(frame);
    } else {
      setAnimationState('idle');
    }
  }, [isOpen, group?.id, sourceRect, calculateDeltas]);

  // Handle Smooth Collapse Dismissal Back to Source Location
  const handleClose = useCallback(() => {
    if (animationState === 'collapsing' || animationState === 'idle') return;

    // Look up live position of source card in case window scrolled
    if (group) {
      const sourceEl = document.querySelector(`[data-group-id="${group.id}"]`) as HTMLElement | null;
      const rect = sourceEl ? sourceEl.getBoundingClientRect() : sourceRect;
      setCurrentOrigin(calculateDeltas(rect));
    }

    setAnimationState('collapsing');
    setTimeout(() => {
      onClose();
    }, 280);
  }, [animationState, group, sourceRect, calculateDeltas, onClose]);

  // Compute Domain Statistics
  const domainStats = useMemo(() => {
    if (!group) return [];
    const counts = new Map<string, number>();
    for (const tab of group.tabs) {
      const rawDomain = getSafeDomain(tab.url);
      if (rawDomain && typeof rawDomain === 'string') {
        const cleanDomain = rawDomain.trim().toLowerCase();
        if (cleanDomain.length > 0 && cleanDomain !== 'null' && cleanDomain !== 'undefined') {
          counts.set(cleanDomain, (counts.get(cleanDomain) || 0) + 1);
        }
      }
    }
    return Array.from(counts.entries())
      .filter(([domain]) => domain && domain.trim().length > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([domain, count]) => ({ domain, count }));
  }, [group?.tabs]);

  // Compute Filtered Tabs with original index mapping
  const filteredIndexedTabs = useMemo(() => {
    if (!group) return [];
    const q = searchQuery.toLowerCase().trim();
    return group.tabs
      .map((tab, originalIndex) => ({ tab, originalIndex }))
      .filter(({ tab }) => {
        if (activeDomainFilter) {
          const domain = getSafeDomain(tab.url)?.trim().toLowerCase();
          if (domain !== activeDomainFilter) return false;
        }
        if (!q) return true;
        const titleMatch = (tab.title || '').toLowerCase().includes(q);
        const urlMatch = (tab.url || '').toLowerCase().includes(q);
        return titleMatch || urlMatch;
      });
  }, [group?.tabs, searchQuery, activeDomainFilter]);

  // Highlight matching text in search
  const highlightMatches = useCallback((text: string, query: string) => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-primary/20 text-primary font-semibold rounded-xs px-0.5">
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
    if (!group) return;
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== group.name) {
      const { renameGroup } = await import('@/lib/storage');
      await renameGroup(group.id, trimmed);
      onGroupUpdated();
    }
    setIsEditingTitle(false);
  };

  // Handle Change Group Color
  const handleSelectColor = async (colorId: TabGroupColor) => {
    if (!group) return;
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

  // Trigger non-destructive undo
  const triggerUndoSnapshot = (description: string) => {
    if (!group) return;
    setUndoSnapshot({ tabs: [...group.tabs], description });
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => {
      setUndoSnapshot(null);
    }, 6000);
  };

  const handleRestoreUndo = async () => {
    if (!undoSnapshot || !group) return;
    const { saveGroups, getGroups } = await import('@/lib/storage');
    const groups = await getGroups();
    const updated = groups.map((g) => (g.id === group.id ? { ...g, tabs: undoSnapshot.tabs } : g));
    await saveGroups(updated);
    setUndoSnapshot(null);
    onGroupUpdated();
  };

  // Delete Individual Tab
  const handleDeleteTab = async (originalIndex: number) => {
    if (!group) return;
    triggerUndoSnapshot('Removed 1 tab');
    await deleteMultipleTabsFromGroup(group.id, [originalIndex]);
    const nextSet = new Set(selectedIndices);
    nextSet.delete(originalIndex);
    setSelectedIndices(nextSet);
    onGroupUpdated();
  };

  // Batch Delete Selected Tabs
  const handleDeleteSelected = async () => {
    if (!group || selectedIndices.size === 0) return;
    const count = selectedIndices.size;
    triggerUndoSnapshot(`Removed ${count} ${count === 1 ? 'tab' : 'tabs'}`);
    await deleteMultipleTabsFromGroup(group.id, Array.from(selectedIndices));
    setSelectedIndices(new Set());
    onGroupUpdated();
  };

  // Batch Open Selected Tabs
  const handleOpenSelected = async () => {
    if (!group) return;
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
    if (!group || selectedIndices.size === 0) return;
    triggerUndoSnapshot(`Extracted ${selectedIndices.size} tabs`);
    await extractTabsToNewGroup(group.id, Array.from(selectedIndices));
    setSelectedIndices(new Set());
    onGroupUpdated();
  };

  // Add Single Tab to Group
  const handleAddTab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group) return;
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
    if (!group || draggedIndex === null || draggedIndex === targetIndex) {
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
    if (!group) return;
    const md = exportSingleGroupAsMarkdown(group);
    await copyToClipboardSafe(md);
    setCopyFeedback('Copied as Markdown!');
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  const handleCopyPlainText = async () => {
    if (!group) return;
    const txt = exportSingleGroupAsPlainText(group);
    await copyToClipboardSafe(txt);
    setCopyFeedback('Copied URLs!');
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  const handleCopySelectedUrls = async () => {
    if (!group) return;
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
    if (!group) return;
    const { restoreTabGroup } = await import('@/lib/storage');
    await restoreTabGroup(group, {
      protectPinnedTabs: true,
      restoreDestination: 'current_window',
      restoreBehavior: 'keep',
      recentlyClosedLimit: 50,
    });
  };

  const handleRestoreNewWindow = async () => {
    if (!group) return;
    const { restoreTabGroup } = await import('@/lib/storage');
    await restoreTabGroup(group, {
      protectPinnedTabs: true,
      restoreDestination: 'new_window',
      restoreBehavior: 'keep',
      recentlyClosedLimit: 50,
    });
  };

  const handleRestoreChromeTabGroup = async () => {
    if (!group) return;
    await restoreTabsAsChromeGroup(group.name || 'TwoTab Group', group.tabs, group.color, 'current_window');
  };

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    if (!isOpen || animationState === 'collapsing') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        handleClose();
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
  }, [isOpen, animationState, focusedIndex, filteredIndexedTabs, selectedIndices, undoSnapshot, handleClose]);

  if (!isOpen && animationState === 'idle') return null;
  if (!group) return null;

  const activeColorConfig = COLOR_PALETTE.find((c) => c.id === group.color);

  const isExpandedOpen = animationState === 'open';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto">
      {/* Refined Apple Floating Backdrop (Subtle 2px blur & transparent frosted dark tint) */}
      <div
        onClick={handleClose}
        className={`fixed inset-0 bg-black/25 dark:bg-black/45 backdrop-blur-[2px] transition-opacity duration-300 ${
          isExpandedOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Spatial Expanding & Collapsing Modal Deck */}
      <div
        ref={modalContainerRef}
        style={{
          transform: isExpandedOpen
            ? 'translate3d(-50%, -50%, 0) scale(1, 1)'
            : `translate3d(calc(-50% + ${currentOrigin.deltaX}px), calc(-50% + ${currentOrigin.deltaY}px), 0) scale(${currentOrigin.scaleX}, ${currentOrigin.scaleY})`,
          opacity: isExpandedOpen ? 1 : 0,
          borderRadius: isExpandedOpen ? '20px' : '16px',
          transformOrigin: 'center center',
          transition: isExpandedOpen
            ? 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 420ms cubic-bezier(0.16, 1, 0.3, 1)'
            : 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease-in, border-radius 280ms ease-in',
          boxShadow: isExpandedOpen
            ? '0 30px 90px -20px rgba(0, 0, 0, 0.45), 0 0 0 1px hsl(var(--border) / 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.25)'
            : 'none',
        }}
        className="fixed left-1/2 top-1/2 z-50 flex flex-col max-w-3xl w-[92vw] h-[82vh] max-h-[700px] min-h-[440px] p-0 overflow-hidden bg-card/90 dark:bg-card/95 backdrop-blur-2xl text-card-foreground border border-white/25 dark:border-white/10 select-none will-change-transform"
      >
        {/* Specular Ambient Top Rim Light */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 dark:via-white/20 to-transparent pointer-events-none z-30" />

        {/* Close Button at top-right */}
        <button
          onClick={handleClose}
          className="absolute right-3.5 top-3.5 z-40 w-7 h-7 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors border border-border/50 cursor-pointer shadow-xs"
          title="Close (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Tier 1: Fixed Modal Header */}
        <div className="shrink-0 p-4 pb-3 border-b border-border/60 bg-muted/20 space-y-3 text-left">
          {/* Line 1: Title & Color Picker & Metadata */}
          <div className="flex items-center justify-between gap-3 min-w-0 pr-10">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {/* Color Accent Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="w-4 h-4 rounded-full transition-all shrink-0 cursor-pointer hover:scale-125 focus:outline-none focus:ring-2 focus:ring-primary shadow-xs"
                    style={{
                      backgroundColor: activeColorConfig ? activeColorConfig.colorStyle : 'hsl(var(--muted-foreground) / 0.3)',
                      border: `1.5px solid ${activeColorConfig ? activeColorConfig.borderStyle : 'hsl(var(--border))'}`,
                    }}
                    title={`Color tag: ${activeColorConfig ? activeColorConfig.label : 'None (Click to choose)'}`}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="p-2 grid grid-cols-5 gap-2 min-w-[160px] bg-card border-border shadow-xl">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectColor(c.id)}
                      className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-115 cursor-pointer shadow-xs"
                      style={{ backgroundColor: c.colorStyle, border: `1.5px solid ${c.borderStyle}` }}
                      title={c.label}
                    >
                      {group.color === c.id && <Check className="w-3.5 h-3.5 text-primary-foreground drop-shadow" />}
                    </button>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Title & Rename */}
              {isEditingTitle ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') setIsEditingTitle(false);
                    }}
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
                  <h2 className="text-base font-bold tracking-tight text-foreground truncate group-hover/title:text-primary transition-colors">
                    {group.name || 'Saved Group'}
                  </h2>
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

          {/* Line 2: Full-Width Search Bar & Add Link Action */}
          <div className="flex items-center gap-2 pt-0.5 w-full">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter tabs in this group... (⌘F)"
                className="h-8 pl-8 pr-7 text-xs bg-background/80 border-input text-foreground focus-visible:ring-1 focus-visible:ring-primary rounded-lg w-full"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className={`h-8 px-2.5 text-xs gap-1.5 rounded-lg border-border/80 transition-colors shrink-0 ${
                isAddingTab ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setIsAddingTab(!isAddingTab)}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Link</span>
            </Button>
          </div>

          {/* Add Tab Inline Panel */}
          {isAddingTab && (
            <form onSubmit={handleAddTab} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/40 border border-border/80 animate-in fade-in-50 slide-in-from-top-1 w-full">
              <Input
                value={newTabUrl}
                onChange={(e) => setNewTabUrl(e.target.value)}
                placeholder="https://example.com"
                className="h-7 text-xs bg-background flex-1 min-w-0"
                autoFocus
              />
              <Input
                value={newTabTitle}
                onChange={(e) => setNewTabTitle(e.target.value)}
                placeholder="Title (optional)"
                className="h-7 text-xs bg-background flex-1 min-w-0"
              />
              <Button type="submit" size="sm" className="h-7 px-3 text-xs bg-primary text-primary-foreground shrink-0">
                Add
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground shrink-0" onClick={() => setIsAddingTab(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </form>
          )}

          {/* Line 3: Full-Width Domain Filter Pills with Edge Fade Mask */}
          {domainStats.length >= 2 && (
            <div 
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 w-full scroll-smooth"
              style={{
                WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent 100%)',
                maskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent 100%)',
              }}
              onWheel={(e) => {
                if (e.deltaY !== 0) {
                  e.currentTarget.scrollLeft += e.deltaY;
                }
              }}
            >
              <button
                onClick={() => setActiveDomainFilter(null)}
                className={`px-2.5 py-0.5 rounded-full border transition-all whitespace-nowrap font-medium cursor-pointer shrink-0 ${
                  activeDomainFilter === null
                    ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                    : 'bg-muted/50 text-muted-foreground border-border/60 hover:bg-muted hover:text-foreground'
                }`}
              >
                All ({group.tabs.length})
              </button>
              {domainStats
                .filter(({ domain }) => Boolean(domain && domain.trim().length > 0))
                .map(({ domain, count }) => (
                  <button
                    key={domain}
                    onClick={() => setActiveDomainFilter(activeDomainFilter === domain ? null : domain)}
                    className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border transition-all whitespace-nowrap font-medium cursor-pointer shrink-0 ${
                      activeDomainFilter === domain
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-muted/50 text-muted-foreground border-border/60 hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                      alt=""
                      className="w-3 h-3 rounded-xs shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <span>{domain}</span>
                    <span className="text-[10px] opacity-75">({count})</span>
                  </button>
                ))}
              {/* Spacer so the last chip can scroll past the fade mask */}
              <div className="w-6 shrink-0 pointer-events-none" />
            </div>
          )}
        </div>

        {/* Tier 2: Scrollable Tab List Body with Enhanced Depth & Spacing */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar scroll-fade-bottom p-3.5 space-y-1.5 relative">
          {filteredIndexedTabs.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <Search className="w-8 h-8 mx-auto opacity-30 text-muted-foreground" />
              <p className="text-sm font-medium">No tabs matching your filter</p>
              {(searchQuery || activeDomainFilter) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs font-medium"
                  onClick={() => {
                    setSearchQuery('');
                    setActiveDomainFilter(null);
                  }}
                >
                  Reset filters
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
                  className={`group/row relative flex items-center justify-between px-3 py-2 rounded-xl border backdrop-blur-md transition-all cursor-pointer select-none shadow-xs ${
                    isDragging ? 'opacity-30 border-dashed border-primary' : ''
                  } ${isDragOver ? 'border-t-2 border-t-primary bg-primary/10' : ''} ${
                    isSelected
                      ? 'bg-primary/12 border-primary/40 shadow-sm'
                      : isFocused
                      ? 'bg-muted/70 border-border'
                      : 'bg-card/70 hover:bg-muted/50 border-border/50 hover:border-primary/40'
                  }`}
                >
                  {/* Left Grip & Checkbox & Content */}
                  <div className="flex items-center gap-3 min-w-0 flex-1 pr-24">
                    {/* Drag Handle */}
                    <div
                      className="cursor-grab active:cursor-grabbing text-muted-foreground/35 group-hover/row:text-muted-foreground transition-colors shrink-0"
                      onClick={(e) => e.stopPropagation()}
                      title="Drag to reorder"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>

                    {/* Apple-style Checkbox */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSelect(originalIndex, e);
                      }}
                      className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border/80 bg-background/80 group-hover/row:border-primary/50'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>

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
                  <div
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity bg-card/95 backdrop-blur-md p-0.5 rounded-lg border border-border/60 shadow-xs z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
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
          {/* Bottom spacing buffer so the last tab item never gets masked by scroll-fade-bottom */}
          <div className="h-8 shrink-0 pointer-events-none" />
        </div>

        {/* Floating Batch Action Bar (Pinned Bottom Glass Pill) */}
        {selectedIndices.size > 0 && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-full bg-card/95 backdrop-blur-xl border border-primary/40 shadow-2xl flex items-center gap-2 animate-in fade-in-50 zoom-in-95">
            <span className="text-xs font-semibold text-primary px-1">
              {selectedIndices.size} {selectedIndices.size === 1 ? 'tab' : 'tabs'} selected
            </span>
            <div className="h-4 w-px bg-border" />
            <Button size="sm" variant="secondary" className="h-7 text-xs gap-1 rounded-full" onClick={handleOpenSelected}>
              <ExternalLink className="w-3 h-3" />
              <span>Open</span>
            </Button>
            <Button size="sm" variant="secondary" className="h-7 text-xs gap-1 rounded-full" onClick={handleExtractToNewGroup}>
              <FolderPlus className="w-3 h-3" />
              <span>Extract</span>
            </Button>
            <Button size="sm" variant="secondary" className="h-7 text-xs gap-1 rounded-full" onClick={handleCopySelectedUrls}>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </Button>
            <Button size="sm" variant="destructive" className="h-7 text-xs gap-1 rounded-full" onClick={handleDeleteSelected}>
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-full" onClick={() => setSelectedIndices(new Set())}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}

        {/* Non-Destructive Undo Toast Banner */}
        {undoSnapshot && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-foreground text-background text-xs flex items-center gap-3 shadow-2xl animate-in fade-in-50 zoom-in-95">
            <span>{undoSnapshot.description}</span>
            <button
              onClick={handleRestoreUndo}
              className="flex items-center gap-1 font-bold text-primary-foreground bg-primary px-2.5 py-0.5 rounded-full hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Undo2 className="w-3 h-3" /> Undo (⌘Z)
            </button>
          </div>
        )}

        {/* Copy Feedback Notification */}
        {copyFeedback && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-2xl animate-in fade-in-50 zoom-in-95">
            {copyFeedback}
          </div>
        )}

        {/* Tier 3: Fixed Modal Footer */}
        <div className="shrink-0 p-3.5 border-t border-border/60 bg-card/90 flex items-center justify-between relative z-10">
          {/* Left Actions */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg gap-1.5"
              onClick={() => setShowDeleteConfirm(true)}
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
              <DropdownMenuContent align="start" className="w-48 bg-card border-border shadow-xl">
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
                  handleClose();
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
                  handleClose();
                }}
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Archive</span>
              </Button>
            ) : null}
          </div>

          {/* Right Restore Actions — Unified Segmented Button with thin crisp divider */}
          <div className="inline-flex rounded-lg overflow-hidden shadow-xs border border-primary/40 bg-primary items-center">
            <button
              type="button"
              className="h-8 px-3.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
              onClick={handleRestoreCurrent}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore All</span>
            </button>
            <div className="w-px h-4 bg-primary-foreground/25 shrink-0" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-8 px-2 bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center transition-colors cursor-pointer focus:outline-none"
                  title="More restore options"
                >
                  <ChevronDown className="w-3.5 h-3.5 opacity-80" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card border-border shadow-xl">
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

        {/* In-Modal Delete Confirmation Nested Dialog */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in-50 duration-200">
            <div className="max-w-sm w-full p-5 rounded-2xl border border-border bg-card shadow-2xl text-card-foreground space-y-4 animate-in zoom-in-95 duration-200">
              <div className="space-y-2 text-left">
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-destructive" />
                  Delete Tab Group?
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Are you sure you want to delete <strong className="text-foreground font-medium">"{group.name || 'Saved Group'}"</strong>? All {group.tabs.length} {group.tabs.length === 1 ? 'tab' : 'tabs'} in this collection will be permanently deleted.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-medium"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    onDeleteGroup(group.id, group.name || 'Saved Group');
                    handleClose();
                  }}
                >
                  Delete Group
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
