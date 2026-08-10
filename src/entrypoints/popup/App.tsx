import React, { useEffect, useState } from 'react';
import { getGroups, deleteGroup, deleteTabFromGroup, getRelativeTime, type TabGroup, getSafeDomain, formatDisplayUrl } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
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
import { Save, List, Search, Trash2, Layers, ChevronDown, X, Globe } from 'lucide-react';

interface DeleteConfirmState {
  type: 'group' | 'tab';
  id?: number;
  groupId?: number;
  url?: string;
  title?: string;
}

export default function App() {
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);

  const loadGroups = async () => {
    const data = await getGroups();
    setGroups(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  useEffect(() => {
    loadGroups();
  }, []);

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
      loadGroups();
    } catch (e) {
      console.error(e);
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
      loadGroups();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleViewAll = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('tabs.html') });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;

    if (deleteConfirm.type === 'group' && deleteConfirm.id) {
      await deleteGroup(deleteConfirm.id);
    } else if (deleteConfirm.type === 'tab' && deleteConfirm.groupId && deleteConfirm.url) {
      await deleteTabFromGroup(deleteConfirm.groupId, deleteConfirm.url);
    }

    setDeleteConfirm(null);
    loadGroups();
  };

  const handleRestoreGroup = (group: TabGroup) => {
    group.tabs.forEach(tab => {
      if (getSafeDomain(tab.url)) {
        chrome.tabs.create({ url: tab.url, active: false });
      }
    });
  };

  const filteredGroups = groups.map(g => {
    const tabs = g.tabs.filter(t => t.title.toLowerCase().includes(search.toLowerCase()) || t.url.toLowerCase().includes(search.toLowerCase()));
    if (search && tabs.length === 0 && !g.name?.toLowerCase().includes(search.toLowerCase())) return null;
    return { ...g, tabs: search ? tabs : g.tabs };
  }).filter(Boolean) as TabGroup[];

  return (
    <div className="relative p-5 min-h-[520px] w-[400px] bg-background overflow-hidden font-sans text-foreground">
      {/* Decorative ambient background glow */}
      <div className="absolute top-[-50px] right-[-50px] w-32 h-32 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-50px] left-[-50px] w-32 h-32 bg-accent/20 rounded-full blur-3xl pointer-events-none" />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="border-border bg-card max-w-[340px] p-5">
          <DialogHeader>
            <DialogTitle className="text-base text-foreground flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-destructive" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5">
              {deleteConfirm?.type === 'group' && (
                <>Are you sure you want to delete <strong className="text-foreground">"{deleteConfirm.title}"</strong>?</>
              )}
              {deleteConfirm?.type === 'tab' && (
                <>Are you sure you want to remove <strong className="text-foreground">"{deleteConfirm.title}"</strong>?</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row justify-end gap-2 pt-3">
            <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={handleConfirmDelete} className="h-8 text-xs font-bold shadow-md shadow-destructive/20">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="relative z-10 animate-fade-in-up">
        <h2 className="text-2xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent mb-5 tracking-tight">TwoTab</h2>
        
        {/* Split Button: Save Window + dropdown for Save All Windows */}
        <div className="flex gap-2.5 mb-3">
          <div className="flex flex-1">
            <Button onClick={handleSaveCurrentWindow} disabled={isSaving} variant="default" group="splitLeft" className="flex-1 font-bold shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all text-xs">
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {isSaving ? 'Saving...' : 'Save Window'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" group="splitRight" disabled={isSaving} className="shadow-lg shadow-primary/20 px-2">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleSaveAllWindows} className="cursor-pointer text-xs">
                  <Layers className="w-3.5 h-3.5 mr-2" />
                  Save All Windows
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Button onClick={handleViewAll} variant="ghost" className="w-full mb-4 text-xs text-muted-foreground hover:text-foreground">
          <List className="w-3.5 h-3.5 mr-1.5 text-primary" />
          Open Full Dashboard
        </Button>

        <div className="relative mb-4 group">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input
            placeholder="Search saved tabs..."
            className="pl-10 pr-9 bg-muted/60 border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-primary shadow-inner"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
          />
          {search && (
            <Button size="icon" variant="ghost" className="absolute right-2 top-2 h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => setSearch('')}>
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        <ScrollArea className="h-72 pr-3 -mr-3">
          <div className="space-y-4">
            {filteredGroups.length === 0 && (
              <div className="text-center text-muted-foreground py-12 flex flex-col items-center">
                <Search className="h-8 w-8 mb-2 opacity-30 text-muted-foreground" />
                <p className="text-sm font-medium">No saved groups found.</p>
              </div>
            )}
            {filteredGroups.slice(0, 10).map((group, idx) => (
              <Card key={group.id} className="flex flex-col h-[300px] overflow-hidden rounded-xl border-border hover:border-muted-foreground/40 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 animate-fade-in-up bg-card" style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}>
                <CardHeader className="p-4 pb-2 border-b border-border bg-muted/20 shrink-0">
                  <CardTitle className="text-sm font-semibold flex justify-between items-center">
                    <span className="truncate flex-1 min-w-0 mr-2 text-foreground">{group.name || 'Saved Group'}</span>
                    <Badge variant="indigo" className="shrink-0">
                      {group.tabs.length} {group.tabs.length === 1 ? 'tab' : 'tabs'} • {getRelativeTime(group.date)}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 overflow-y-auto custom-scrollbar scroll-fade-bottom p-4 space-y-2">
                  <ul className="space-y-2">
                    {group.tabs.map((tab, i) => {
                      const domain = getSafeDomain(tab.url);
                      return (
                        <li key={i} className="flex justify-between items-center group/tab p-1.5 rounded-md hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-2 truncate max-w-[240px]">
                            {domain ? (
                              <img 
                                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} 
                                alt="" 
                                className="w-3.5 h-3.5 opacity-90 group-hover/tab:opacity-100 shrink-0" 
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }} 
                              />
                            ) : (
                              <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            )}
                            <a href={tab.url} className="text-[13px] text-muted-foreground hover:text-primary truncate font-medium transition-colors" target="_blank" rel="noreferrer">
                              {tab.title || formatDisplayUrl(tab.url)}
                            </a>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 opacity-0 group-hover/tab:opacity-100 transition-all text-destructive hover:bg-destructive/20 hover:text-destructive active:scale-95" 
                            onClick={() => setDeleteConfirm({ type: 'tab', groupId: group.id, url: tab.url, title: tab.title || tab.url })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
                <CardFooter className="p-3 border-t border-border bg-card shrink-0 flex justify-end gap-2 relative z-10">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 text-xs font-semibold text-destructive hover:bg-destructive/20 hover:text-destructive active:scale-95 transition-all" 
                    onClick={() => setDeleteConfirm({ type: 'group', id: group.id, title: group.name || 'Saved Group' })}
                  >
                    Delete
                  </Button>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="h-8 text-xs bg-primary/20 text-primary-foreground hover:bg-primary/30 border border-primary/40 font-semibold transition-colors shadow-sm" 
                    onClick={() => handleRestoreGroup(group)}
                  >
                    Restore
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
