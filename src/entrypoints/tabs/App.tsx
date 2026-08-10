import React, { useEffect, useState, useRef } from 'react';
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
  clearAllData 
} from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Info
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'archive' | 'closed' | 'settings' | 'help'>('dashboard');
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [recentlyClosed, setRecentlyClosed] = useState<chrome.sessions.Session[]>([]);
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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
      if (chrome?.sessions?.getRecentlyClosed) {
        chrome.sessions.getRecentlyClosed({ maxResults: 15 }, (sessions) => {
          setRecentlyClosed(sessions || []);
        });
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleSaveCurrentTabs = async () => {
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
      showMessage('Open tabs saved successfully!');
      loadData();
    } catch (e: any) {
      showMessage(e.message || 'Error saving tabs', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGroup = async (id: number) => {
    if (activeTab === 'archive') {
      await deleteArchivedGroup(id);
    } else {
      await deleteGroup(id);
    }
    showMessage('Group deleted');
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
    group.tabs.forEach(tab => chrome.tabs.create({ url: tab.url, active: false }));
    showMessage(`Restored ${group.tabs.length} tabs`);
  };

  const handleRestoreAllGroups = () => {
    let count = 0;
    groups.forEach(group => {
      group.tabs.forEach(tab => {
        chrome.tabs.create({ url: tab.url, active: false });
        count++;
      });
    });
    showMessage(`Restoring ${count} tabs across ${groups.length} groups`);
  };

  const handleDeleteTab = async (groupId: number, url: string) => {
    await deleteTabFromGroup(groupId, url);
    loadData();
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

  const handleRestoreSession = (session: chrome.sessions.Session) => {
    if (session.tab && session.tab.url) {
      chrome.tabs.create({ url: session.tab.url });
    } else if (session.window && session.window.tabs) {
      session.window.tabs.forEach(tab => {
        if (tab.url) chrome.tabs.create({ url: tab.url, active: false });
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

  const handleClearData = async () => {
    if (confirm('Are you sure you want to clear all saved tab groups? This action cannot be undone.')) {
      await clearAllData();
      showMessage('All data cleared');
      loadData();
    }
  };

  const filteredGroups = groups.map(g => {
    const tabs = g.tabs.filter(t => t.title.toLowerCase().includes(search.toLowerCase()) || t.url.toLowerCase().includes(search.toLowerCase()));
    if (search && tabs.length === 0 && !g.name?.toLowerCase().includes(search.toLowerCase())) return null;
    return { ...g, tabs: search ? tabs : g.tabs };
  }).filter(Boolean) as TabGroup[];

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'archive', label: 'Archive', icon: Archive },
    { id: 'closed', label: 'Recently Closed', icon: History },
  ] as const;

  const prefItems = [
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'help', label: 'Help', icon: HelpCircle },
  ] as const;

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

      {/* Decorative ambient background glow */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-64 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-card/60 backdrop-blur-3xl p-6 flex flex-col z-10 shadow-2xl">
        <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent mb-10 tracking-tight">TwoTab</h1>
        
        <nav className="space-y-1.5 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                  isActive 
                    ? 'bg-primary/20 text-foreground font-bold border-l-4 border-primary pl-3 shadow-md' 
                    : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/50 font-medium'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                {item.label}
              </button>
            );
          })}

          <div className="pt-6 pb-2">
            <p className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider px-4">PREFERENCES</p>
          </div>

          {prefItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                  isActive 
                    ? 'bg-primary/20 text-foreground font-bold border-l-4 border-primary pl-3 shadow-md' 
                    : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/50 font-medium'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Secondary Action */}
        <div className="pt-4 border-t border-border">
          <Button 
            onClick={handleSaveCurrentTabs} 
            disabled={isSaving} 
            variant="outline" 
            className="w-full border-border bg-card hover:bg-muted font-medium transition-all"
          >
            <Plus className="w-4 h-4 mr-2 text-primary" /> {isSaving ? 'Saving...' : 'Save Current Tabs'}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col z-10 relative">
        {/* Header */}
        <header className="h-20 border-b border-border flex items-center justify-between px-10 bg-card/40 backdrop-blur-xl sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold tracking-tight text-foreground capitalize">{activeTab}</h2>
            {activeTab === 'dashboard' && groups.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRestoreAllGroups} 
                className="border-border bg-muted/40 hover:bg-muted text-foreground text-xs font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-primary" /> Restore All ({groups.reduce((acc, g) => acc + g.tabs.length, 0)} tabs)
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {(activeTab === 'dashboard' || activeTab === 'archive') && (
              <div className="relative w-80 group">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input 
                  placeholder="Search saved tabs..." 
                  className="pl-10 bg-muted/60 border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-primary h-10 shadow-inner" 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                />
              </div>
            )}
            {/* Primary CTA */}
            <Button 
              onClick={handleSaveCurrentTabs} 
              disabled={isSaving} 
              variant="default"
              className="font-bold shadow-lg shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Plus className="w-4 h-4 mr-2" /> Save Open Tabs
            </Button>
          </div>
        </header>
        
        {/* Main Body Scroll Area */}
        <ScrollArea className="flex-1 p-10">
          {(activeTab === 'dashboard' || activeTab === 'archive') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
              {filteredGroups.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-20 animate-fade-in-up">
                  <Card className="p-8 border-border max-w-md text-center flex flex-col items-center shadow-2xl bg-card">
                    <Sparkles className="w-12 h-12 mb-4 text-primary opacity-90" />
                    <h3 className="text-xl font-bold text-foreground mb-2">No {activeTab} groups found</h3>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                      {activeTab === 'dashboard' 
                        ? 'Save your open browser tabs to free up RAM memory and organize your workspace.' 
                        : 'Archived tab groups will appear here.'}
                    </p>
                    {activeTab === 'dashboard' && (
                      <Button onClick={handleSaveCurrentTabs} disabled={isSaving} className="w-full font-bold shadow-lg shadow-primary/25">
                        <Plus className="w-4 h-4 mr-2" /> Save Open Tabs Now
                      </Button>
                    )}
                  </Card>
                </div>
              ) : (
                filteredGroups.map((group, idx) => (
                  <Card key={group.id} className="flex flex-col border-border hover:border-muted-foreground/40 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 animate-fade-in-up bg-card" style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}>
                    <CardHeader className="pb-3 border-b border-border bg-muted/20">
                      <CardTitle className="text-base flex justify-between items-center mb-1">
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
                          <div className="flex items-center gap-2 group/title truncate max-w-[200px] cursor-pointer" onClick={() => handleStartRename(group)}>
                            <span className="truncate font-semibold text-foreground">{group.name || 'Saved Group'}</span>
                            <Edit2 className="w-3.5 h-3.5 opacity-0 group-hover/title:opacity-70 transition-opacity text-muted-foreground" />
                          </div>
                        )}
                        <Badge variant="indigo">
                          {group.tabs.length} tabs
                        </Badge>
                      </CardTitle>
                      <div className="text-xs text-muted-foreground font-medium">{getRelativeTime(group.date)}</div>
                    </CardHeader>

                    <CardContent className="flex-1 flex flex-col p-5">
                      <div className="flex-1 space-y-2 mb-6">
                        {group.tabs.map((tab, i) => (
                          <div key={i} className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors group/link p-1.5 -mx-1.5 rounded-lg hover:bg-muted/50">
                            <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0 border border-border group-hover/link:border-muted-foreground/30 transition-colors">
                              <img 
                                src={`https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=16`} 
                                alt="" 
                                className="w-3.5 h-3.5 opacity-90 group-hover/link:opacity-100" 
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.parentElement!.innerHTML = `<svg class="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><path stroke-width="2" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`;
                                }} 
                              />
                            </div>
                            <a href={tab.url} target="_blank" rel="noreferrer" className="truncate flex-1 font-medium hover:text-primary transition-colors">
                              {tab.title || tab.url}
                            </a>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 opacity-0 group-hover/link:opacity-100 transition-all text-destructive hover:bg-destructive/20 hover:text-destructive active:scale-95" 
                              onClick={() => handleDeleteTab(group.id, tab.url)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end items-center gap-2 mt-auto pt-4 border-t border-border">
                        {/* Destructive Action with Semantic Variant */}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 text-xs font-semibold text-destructive hover:bg-destructive/20 hover:text-destructive active:scale-95 transition-all" 
                          onClick={() => handleDeleteGroup(group.id)}
                        >
                          Delete
                        </Button>
                        {activeTab === 'dashboard' ? (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 text-xs text-muted-foreground font-semibold hover:text-foreground hover:bg-muted transition-colors" 
                            onClick={() => handleArchiveGroup(group.id)}
                          >
                            Archive
                          </Button>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 text-xs text-primary font-semibold hover:bg-primary/20 transition-colors" 
                            onClick={() => handleUnarchiveGroup(group.id)}
                          >
                            Unarchive
                          </Button>
                        )}
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="h-8 text-xs bg-primary/20 text-primary-foreground hover:bg-primary/30 border border-primary/40 font-semibold transition-colors shadow-sm" 
                          onClick={() => handleRestoreGroup(group)}
                        >
                          Restore Group
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* Recently Closed View */}
          {activeTab === 'closed' && (
            <div className="max-w-4xl space-y-4 animate-fade-in-up">
              <h3 className="text-xl font-bold text-foreground mb-4">Recently Closed Browser Sessions</h3>
              {recentlyClosed.length === 0 ? (
                <Card className="p-12 text-center text-muted-foreground rounded-2xl border-border bg-card">
                  No recently closed sessions found.
                </Card>
              ) : (
                recentlyClosed.map((session, idx) => {
                  const title = session.tab?.title || (session.window?.tabs ? `Window (${session.window.tabs.length} tabs)` : 'Closed Item');
                  const url = session.tab?.url;
                  return (
                    <Card key={idx} className="p-4 rounded-xl flex items-center justify-between hover:bg-muted/50 transition-colors border-border bg-card">
                      <div className="flex items-center gap-3 truncate">
                        <History className="w-5 h-5 text-primary shrink-0" />
                        <span className="font-semibold text-foreground truncate">{title}</span>
                        {url && <span className="text-xs text-muted-foreground truncate max-w-sm">{url}</span>}
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => handleRestoreSession(session)} className="bg-primary/20 text-primary-foreground hover:bg-primary/30 border border-primary/40 shrink-0 font-semibold">
                        Restore
                      </Button>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {/* Settings View */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl space-y-8 animate-fade-in-up">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">Data Backup & Sync</CardTitle>
                  <CardDescription className="text-muted-foreground">Export your saved tab groups to JSON or restore from a backup file.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <Button onClick={handleExport} variant="outline" className="border-border hover:bg-muted text-foreground font-medium">
                      <Download className="w-4 h-4 mr-2 text-primary" /> Export Backup (JSON)
                    </Button>
                    <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".json" className="hidden" />
                    <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="border-border hover:bg-muted text-foreground font-medium">
                      <Upload className="w-4 h-4 mr-2 text-primary" /> Import Backup (JSON)
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-destructive/30 bg-destructive/10">
                <CardHeader>
                  <CardTitle className="text-destructive">Danger Zone</CardTitle>
                  <CardDescription className="text-muted-foreground">Permanently clear all saved tab groups and settings.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={handleClearData} variant="destructive" className="font-bold shadow-lg shadow-destructive/20">
                    <Trash2 className="w-4 h-4 mr-2" /> Clear All Saved Data
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Help View */}
          {activeTab === 'help' && (
            <div className="max-w-3xl space-y-6 animate-fade-in-up">
              <Card className="border-border bg-card p-8">
                <h3 className="text-2xl font-bold text-foreground mb-4">How to use TwoTab</h3>
                <div className="space-y-4 text-muted-foreground leading-relaxed text-sm">
                  <p>
                    <strong className="text-foreground">1. Save Tabs:</strong> Click the extension icon in your browser toolbar or press the <span className="text-primary font-semibold">"Save Open Tabs"</span> button inside the app to save all non-pinned tabs into a group.
                  </p>
                  <p>
                    <strong className="text-foreground">2. Restore Tabs:</strong> Click <span className="text-primary font-semibold">"Restore Group"</span> on any card to reopen that set of tabs into your browser.
                  </p>
                  <p>
                    <strong className="text-foreground">3. Organize & Search:</strong> Use the search bar in the header to find specific links or rename groups by clicking on their title.
                  </p>
                  <p>
                    <strong className="text-foreground">4. Backup:</strong> Visit Settings anytime to export a JSON copy of your tab collections.
                  </p>
                </div>
              </Card>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
