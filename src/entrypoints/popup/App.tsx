import React, { useEffect, useState } from 'react';
import {
  getGroups,
  saveGroups,
  deleteGroup,
  getRelativeTime,
  type TabGroup,
  getSafeDomain,
  formatDisplayUrl,
} from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Plus,
  Layers,
  ExternalLink,
  RotateCcw,
  Trash2,
  Globe,
  ChevronDown,
  ArrowRight,
  Clock,
  Sparkles,
  Bookmark,
  Sun,
  Moon,
  Monitor,
  Palette,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { THEME_PALETTES } from '@/lib/theme';
import { Separator } from '@/components/ui/separator';

interface DeleteConfirmState {
  id: number;
  title: string;
}

export default function App() {
  const { themeMode, resolvedTheme, setThemeMode } = useTheme();
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);

  const loadGroups = async () => {
    try {
      const data = await getGroups();
      setGroups(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (e) {
      console.error('Error loading groups:', e);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const handleOpenDashboard = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('tabs.html') });
  };

  const handleSaveCurrentTab = async () => {
    setIsSaving(true);
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.url) return;

      const domain = getSafeDomain(activeTab.url);
      if (!domain) {
        // Restricted system page (chrome://, chrome-extension://, etc.)
        return;
      }

      const currentGroups = await getGroups();
      const newGroup: TabGroup = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        date: new Date().toISOString(),
        name: activeTab.title ? activeTab.title.slice(0, 32) : 'Single Tab',
        tabs: [{ title: activeTab.title || activeTab.url, url: activeTab.url }],
      };

      await saveGroups([newGroup, ...currentGroups]);

      // If active tab exists, close it after saving (open newtab if single tab in window)
      if (activeTab.id !== undefined) {
        const windowTabs = await chrome.tabs.query({ currentWindow: true });
        if (windowTabs.length <= 1) {
          await chrome.tabs.create({ url: 'chrome://newtab' });
        }
        await chrome.tabs.remove(activeTab.id);
      }

      await loadGroups();
    } catch (e) {
      console.error('Error saving current tab:', e);
    } finally {
      setIsSaving(false);
    }
  };

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
            reject(new Error('Failed to save window tabs'));
          }
        });
      });
      await loadGroups();
    } catch (e) {
      console.error('Error saving window:', e);
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
      await loadGroups();
    } catch (e) {
      console.error('Error saving all windows:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteGroup(deleteConfirm.id);
      setDeleteConfirm(null);
      await loadGroups();
    } catch (e) {
      console.error('Error deleting group:', e);
    }
  };

  const handleRestoreGroup = (group: TabGroup) => {
    group.tabs.forEach((tab) => {
      if (getSafeDomain(tab.url)) {
        chrome.tabs.create({ url: tab.url, active: false });
      }
    });
  };

  return (
    <div className="relative w-[360px] max-w-[360px] min-h-[440px] max-h-[580px] bg-background text-foreground flex flex-col font-sans select-none overflow-hidden">
      {/* Decorative ambient background glows */}
      <div className="absolute -top-10 -right-10 w-28 h-28 bg-primary/15 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-28 h-28 bg-accent/15 rounded-full blur-2xl pointer-events-none" />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="border-border bg-card max-w-[320px] p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-destructive" />
              Delete Stash
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-relaxed">
              Are you sure you want to delete <strong className="text-foreground">"{deleteConfirm?.title}"</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row justify-end gap-2 pt-3">
            <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)} className="h-7 text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleConfirmDelete}
              className="h-7 text-xs font-bold shadow-sm shadow-destructive/20"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 1. Header (Compact Top Bar) */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/80 backdrop-blur-md shrink-0 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center shadow-sm text-primary-foreground">
            <Layers className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="font-extrabold text-sm bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent tracking-tight">
            TwoTab
          </span>
        </div>

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors"
                title={`Theme: ${themeMode} (${resolvedTheme})`}
              >
                <Palette className="w-3.5 h-3.5 text-primary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1.5 bg-popover border-border shadow-apple-popover text-popover-foreground rounded-xl">
              <DropdownMenuItem
                onClick={(e) => setThemeMode('system', e)}
                className={`cursor-pointer text-xs font-medium py-1.5 px-2 rounded-lg flex items-center justify-between hover:bg-muted focus:bg-muted ${
                  themeMode === 'system' ? 'text-primary font-semibold bg-primary/10' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>System Preference</span>
                </div>
                {themeMode === 'system' && <span className="text-xs text-primary font-bold">✓</span>}
              </DropdownMenuItem>

              <Separator className="my-1 bg-border/60" />

              <div className="px-2 py-0.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                Dark Palettes
              </div>
              {THEME_PALETTES.filter(p => p.category === 'dark').map((palette) => (
                <DropdownMenuItem
                  key={palette.id}
                  onClick={(e) => setThemeMode(palette.id, e)}
                  className={`cursor-pointer text-xs font-medium py-1 px-2 rounded-lg flex items-center justify-between hover:bg-muted focus:bg-muted ${
                    themeMode === palette.id ? 'text-primary font-semibold bg-primary/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div 
                      className="w-3.5 h-3.5 rounded-full border border-white/20 flex items-center justify-center shrink-0 shadow-xs"
                      style={{ backgroundColor: palette.bgHex }}
                    >
                      <div className="w-1 h-1 rounded-full" style={{ backgroundColor: palette.accentHex }} />
                    </div>
                    <span className="truncate">{palette.name}</span>
                  </div>
                  {themeMode === palette.id && <span className="text-xs text-primary font-bold shrink-0">✓</span>}
                </DropdownMenuItem>
              ))}

              <Separator className="my-1 bg-border/60" />

              <div className="px-2 py-0.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                Light Palettes
              </div>
              {THEME_PALETTES.filter(p => p.category === 'light').map((palette) => (
                <DropdownMenuItem
                  key={palette.id}
                  onClick={(e) => setThemeMode(palette.id, e)}
                  className={`cursor-pointer text-xs font-medium py-1 px-2 rounded-lg flex items-center justify-between hover:bg-muted focus:bg-muted ${
                    themeMode === palette.id ? 'text-primary font-semibold bg-primary/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div 
                      className="w-3.5 h-3.5 rounded-full border border-black/10 flex items-center justify-center shrink-0 shadow-xs"
                      style={{ backgroundColor: palette.bgHex }}
                    >
                      <div className="w-1 h-1 rounded-full" style={{ backgroundColor: palette.accentHex }} />
                    </div>
                    <span className="truncate">{palette.name}</span>
                  </div>
                  {themeMode === palette.id && <span className="text-xs text-primary font-bold shrink-0">✓</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenDashboard}
            className="h-7 px-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center gap-1.5 rounded-md transition-colors"
            title="Open Full Dashboard in new tab"
          >
            <span className="text-[11px]">Dashboard</span>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>
      </header>

      {/* 2. Primary Quick-Action Controls */}
      <section className="p-3.5 pb-2 shrink-0 relative z-10">
        <div className="flex items-center gap-2">
          {/* Action 1: Save Current Tab (Secondary/Outline) */}
          <Button
            onClick={handleSaveCurrentTab}
            disabled={isSaving}
            variant="outline"
            className="flex-1 h-9 text-xs font-semibold border-border/80 bg-card/50 hover:bg-muted/70 text-foreground shadow-sm transition-all active:scale-[0.98]"
            title="Save only the active tab in this window"
          >
            <Plus className="w-3.5 h-3.5 mr-1 text-primary shrink-0" />
            <span className="truncate">Save Tab</span>
          </Button>

          {/* Action 2: Save Window (Primary Brand Fill) with Dropdown */}
          <div className="flex flex-1">
            <Button
              onClick={handleSaveCurrentWindow}
              disabled={isSaving}
              variant="default"
              group="splitLeft"
              className="flex-1 h-9 text-xs font-bold shadow-md shadow-primary/20 hover:opacity-95 active:scale-[0.98] transition-all bg-primary text-primary-foreground"
              title="Save all tabs in current window"
            >
              <Bookmark className="w-3.5 h-3.5 mr-1 shrink-0" />
              <span className="truncate">{isSaving ? 'Saving...' : 'Save Window'}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  group="splitRight"
                  disabled={isSaving}
                  className="h-9 px-2 shadow-md shadow-primary/20 bg-primary text-primary-foreground hover:opacity-95"
                  title="More save options"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                <DropdownMenuItem onClick={handleSaveAllWindows} className="cursor-pointer text-xs font-medium py-1.5">
                  <Layers className="w-3.5 h-3.5 mr-2 text-primary" />
                  Save All Windows
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>

      {/* 3. Recent Stashes Feed */}
      <section className="px-3.5 py-1.5 flex-1 min-h-0 flex flex-col overflow-y-auto custom-scrollbar relative z-10 space-y-2">
        <div className="flex items-center justify-between px-0.5 pt-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-primary/80" /> Recent Stashes
          </span>
          {groups.length > 0 && (
            <span className="text-[10px] font-semibold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md border border-border/40">
              {groups.length} {groups.length === 1 ? 'stash' : 'stashes'}
            </span>
          )}
        </div>

        {groups.length === 0 ? (
          <div className="p-5 my-auto text-center border border-dashed border-border/70 rounded-xl bg-card/20 flex flex-col items-center justify-center animate-fade-in-up">
            <Sparkles className="w-7 h-7 text-primary/60 mb-2" />
            <p className="text-xs font-semibold text-foreground mb-0.5">No recent stashes</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Save your active tab or window above to clear clutter.
            </p>
          </div>
        ) : (
          <div className="space-y-2 pb-1">
            {groups.slice(0, 3).map((group, idx) => (
              <div
                key={group.id}
                className="border border-border/60 rounded-xl bg-card/60 hover:bg-card hover:border-border transition-all duration-200 p-2.5 space-y-2 shadow-sm animate-fade-in-up"
                style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}
              >
                {/* Stash Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="font-semibold text-xs text-foreground truncate" title={group.name}>
                      {group.name || 'Window Stash'}
                    </span>
                    <span className="text-[10px] text-muted-foreground/70 shrink-0">
                      • {getRelativeTime(group.date)}
                    </span>
                  </div>
                  <Badge variant="indigo" className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-medium">
                    {group.tabs.length} {group.tabs.length === 1 ? 'tab' : 'tabs'}
                  </Badge>
                </div>

                {/* Tab Previews (1–2 tabs) */}
                <div className="space-y-1 bg-muted/30 p-1.5 rounded-lg border border-border/30">
                  {group.tabs.slice(0, 2).map((tab, i) => {
                    const domain = getSafeDomain(tab.url);
                    return (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group/tablink">
                        <div className="w-3.5 h-3.5 rounded bg-muted/80 flex items-center justify-center shrink-0">
                          {domain ? (
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                              alt=""
                              className="w-3 h-3 opacity-90 group-hover/tablink:opacity-100 shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                          )}
                        </div>
                        <a
                          href={tab.url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate flex-1 text-[11px] font-medium hover:text-primary transition-colors"
                        >
                          {tab.title || formatDisplayUrl(tab.url)}
                        </a>
                      </div>
                    );
                  })}
                  {group.tabs.length > 2 && (
                    <div className="text-[10px] text-muted-foreground/70 font-medium pl-5 pt-0.5">
                      +{group.tabs.length - 2} more {group.tabs.length - 2 === 1 ? 'tab' : 'tabs'}
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirm({ id: group.id, title: group.name || 'Window Stash' })}
                    className="h-6 px-2 text-[11px] text-muted-foreground/80 hover:text-destructive hover:bg-destructive/15 rounded transition-colors flex items-center gap-1"
                    title="Delete stash"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRestoreGroup(group)}
                    className="h-6 px-2.5 text-[11px] font-semibold bg-primary/20 text-primary-foreground hover:bg-primary/30 border border-primary/30 rounded-md transition-colors flex items-center gap-1 shadow-sm"
                    title="Restore tabs in browser"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. Footer & Navigation Link */}
      <footer className="p-3 border-t border-border/50 bg-card/40 backdrop-blur-md shrink-0 relative z-10">
        <Button
          variant="outline"
          onClick={handleOpenDashboard}
          className="w-full h-8 text-xs font-semibold text-foreground/90 hover:text-primary hover:border-primary/40 bg-muted/20 hover:bg-primary/10 border-border/60 transition-all flex items-center justify-center gap-1.5 shadow-sm group"
        >
          <span>View All Saved Tabs in Dashboard</span>
          <ArrowRight className="w-3.5 h-3.5 text-primary transition-transform group-hover:translate-x-0.5" />
        </Button>
      </footer>
    </div>
  );
}
