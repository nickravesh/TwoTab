import React, { useEffect, useState } from 'react';
import { getGroups, saveGroups, deleteGroup, deleteTabFromGroup, getRelativeTime, type TabGroup } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, List, Search, Trash2, Edit2, RotateCcw } from 'lucide-react';

export default function App() {
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadGroups = async () => {
    const data = await getGroups();
    setGroups(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const handleSaveTabs = async () => {
    setIsSaving(true);
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'saveTabs' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response && response.status === 'success') {
            resolve(true);
          } else {
            reject(new Error('Failed to save tabs'));
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

  const handleDeleteGroup = async (id: number) => {
    await deleteGroup(id);
    loadGroups();
  };

  const handleRestoreGroup = (group: TabGroup) => {
    group.tabs.forEach(tab => chrome.tabs.create({ url: tab.url, active: false }));
  };

  const handleDeleteTab = async (groupId: number, url: string) => {
    await deleteTabFromGroup(groupId, url);
    loadGroups();
  };

  const filteredGroups = groups.map(g => {
    const tabs = g.tabs.filter(t => t.title.toLowerCase().includes(search.toLowerCase()) || t.url.toLowerCase().includes(search.toLowerCase()));
    if (search && tabs.length === 0 && !g.name?.toLowerCase().includes(search.toLowerCase())) return null;
    return { ...g, tabs: search ? tabs : g.tabs };
  }).filter(Boolean) as TabGroup[];

  return (
    <div className="relative p-5 min-h-[500px] w-[400px] bg-gradient-to-br from-background via-background/95 to-secondary/20 overflow-hidden font-sans">
      {/* Decorative background blur blobs */}
      <div className="absolute top-[-50px] right-[-50px] w-32 h-32 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-50px] left-[-50px] w-32 h-32 bg-accent/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 animate-fade-in-up">
        <h2 className="text-2xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-primary to-indigo-400 mb-6 tracking-tight">TwoTab</h2>
        
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Button onClick={handleSaveTabs} disabled={isSaving} className="w-full shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300">
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Tabs'}
          </Button>
          <Button onClick={handleViewAll} variant="secondary" className="w-full shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 glass border-white/5">
            <List className="w-4 h-4 mr-2" />
            View All
          </Button>
        </div>

        <div className="relative mb-5 group">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input
            placeholder="Search saved tabs..."
            className="pl-9 bg-card/50 backdrop-blur-sm border-white/10 focus-visible:ring-primary/50 transition-all shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ScrollArea className="h-80 pr-3 -mr-3">
          <div className="space-y-4">
            {filteredGroups.length === 0 && (
              <div className="text-center text-muted-foreground/60 py-12 flex flex-col items-center">
                <Search className="h-8 w-8 mb-2 opacity-20" />
                <p>No saved groups found.</p>
              </div>
            )}
            {filteredGroups.slice(0, 10).map((group, idx) => (
              <Card key={group.id} className="glass-card hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 border-white/5 animate-fade-in-up" style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold flex justify-between items-center">
                    <span className="truncate text-foreground/90">{group.name || 'Saved Group'}</span>
                    <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                      {group.tabs.length} tabs • {getRelativeTime(group.date)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <ul className="space-y-2 mb-4">
                    {group.tabs.map((tab, i) => (
                      <li key={i} className="flex justify-between items-center group/tab p-1.5 -mx-1.5 rounded-md hover:bg-white/5 transition-colors">
                        <a href={tab.url} className="text-[13px] text-muted-foreground hover:text-primary truncate max-w-[260px] transition-colors" target="_blank" rel="noreferrer">
                          {tab.title || tab.url}
                        </a>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover/tab:opacity-100 transition-opacity hover:bg-destructive/20 hover:text-destructive text-muted-foreground" onClick={() => handleDeleteTab(group.id, tab.url)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2 justify-end pt-3 border-t border-white/5">
                    <Button variant="ghost" size="sm" className="h-8 text-xs hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors" onClick={() => handleDeleteGroup(group.id)}>Delete</Button>
                    <Button variant="secondary" size="sm" className="h-8 text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors shadow-sm" onClick={() => handleRestoreGroup(group)}>Restore</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
