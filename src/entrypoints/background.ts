import { migrateIfNeeded, runHealthCheck, createRollingBackup, getUserPreferences } from '@/lib/storage';

export default defineBackground(() => {
  const getStorageSession = () => chrome.storage.session || chrome.storage.local;

  // ==========================================================================
  // Service Worker Startup: Schema Migration + Health Check + Tab Cache Init
  // ==========================================================================

  const onStartup = async () => {
    // 1. Run schema migrations
    await migrateIfNeeded();

    // 2. Run health check
    const health = await runHealthCheck();
    if (!health.valid) {
      console.warn('[TwoTab] Startup health check found issues:', health.errors);
    }
    console.log(`[TwoTab] Storage usage: ${(health.bytesUsed / 1024).toFixed(1)} KB`);

    // 3. Initialize tab cache in session storage
    await initializeTabCache();

    // 4. Set up context menus
    setupContextMenus();

    // 5. Set up rolling backup alarm (every 6 hours)
    chrome.alarms.create('autoBackup', { periodInMinutes: 360 });
  };

  onStartup();

  chrome.runtime.onInstalled.addListener(() => {
    setupContextMenus();
  });

  // ==========================================================================
  // Context Menu Integration (chrome.contextMenus)
  // ==========================================================================

  function setupContextMenus() {
    if (typeof chrome === 'undefined' || !chrome.contextMenus) return;
    try {
      chrome.contextMenus.removeAll(() => {
        // Parent Root Menu — Active across tab bar, web page, selection, link, and toolbar icon
        chrome.contextMenus.create({
          id: 'twotab_root',
          title: 'TwoTab',
          contexts: ['tab', 'page', 'link', 'selection', 'action'],
        });

        // 1. Save Active / Clicked Tab
        chrome.contextMenus.create({
          id: 'twotab_save_active',
          parentId: 'twotab_root',
          title: 'Save Tab',
          contexts: ['tab', 'page', 'selection', 'action'],
        });

        // 2. Save Highlighted / Selected Tabs
        chrome.contextMenus.create({
          id: 'twotab_save_selected',
          parentId: 'twotab_root',
          title: 'Save Selected Tabs',
          contexts: ['tab', 'page', 'selection', 'action'],
        });

        // 3. Save Link
        chrome.contextMenus.create({
          id: 'twotab_save_link',
          parentId: 'twotab_root',
          title: 'Save Link to TwoTab',
          contexts: ['link'],
        });

        // 4. Save Window
        chrome.contextMenus.create({
          id: 'twotab_save_window',
          parentId: 'twotab_root',
          title: 'Save Current Window',
          contexts: ['tab', 'page', 'selection', 'action'],
        });

        // 5. Open Dashboard
        chrome.contextMenus.create({
          id: 'twotab_open_dashboard',
          parentId: 'twotab_root',
          title: 'Open Dashboard',
          contexts: ['tab', 'page', 'selection', 'link', 'action'],
        });
      });
    } catch (e) {
      console.error('[TwoTab] Error initializing context menus:', e);
    }
  }

  chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
    try {
      if (info.menuItemId === 'twotab_save_active') {
        if (tab) await saveSpecificTabs([tab], true);
      } else if (info.menuItemId === 'twotab_save_selected') {
        const highlighted = await chrome.tabs.query({ currentWindow: true, highlighted: true });
        if (highlighted && highlighted.length > 0) {
          await saveSpecificTabs(highlighted, true);
        } else if (tab) {
          await saveSpecificTabs([tab], true);
        }
      } else if (info.menuItemId === 'twotab_save_link') {
        if (info.linkUrl) {
          const title = info.selectionText || info.linkUrl;
          await saveSpecificTabs([{ url: info.linkUrl, title } as any], false);
        }
      } else if (info.menuItemId === 'twotab_save_window') {
        await saveCurrentWindowTabs();
      } else if (info.menuItemId === 'twotab_open_dashboard') {
        const url = chrome.runtime.getURL('/tabs.html');
        const existing = await chrome.tabs.query({ url });
        if (existing && existing.length > 0 && existing[0].id !== undefined) {
          await chrome.tabs.update(existing[0].id, { active: true });
          if (existing[0].windowId !== undefined) {
            await chrome.windows.update(existing[0].windowId, { focused: true });
          }
        } else {
          await chrome.tabs.create({ url });
        }
      }
    } catch (e) {
      console.error('[TwoTab ContextMenu] Error handling click:', e);
    }
  });

  // ==========================================================================
  // Rolling Backup Alarm Handler
  // ==========================================================================

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'autoBackup') {
      try {
        await createRollingBackup();
      } catch (e) {
        console.error('[TwoTab] Rolling backup failed:', e);
      }
    }
  });

  // ==========================================================================
  // Persistent Tab Metadata Cache (chrome.storage.session)
  // ==========================================================================

  const initializeTabCache = async () => {
    try {
      const tabs = await chrome.tabs.query({});
      const cacheUpdate: Record<string, { title: string; url: string }> = {};
      tabs.forEach(tab => {
        if (tab.id !== undefined && tab.url && tab.title) {
          cacheUpdate[`tab_${tab.id}`] = { title: tab.title, url: tab.url };
        }
      });
      if (Object.keys(cacheUpdate).length > 0) {
        await getStorageSession().set(cacheUpdate);
      }
    } catch (e) {
      console.error('[TwoTab] Error initializing tab cache:', e);
    }
  };

  // Track tab updates and persist metadata to storage.session
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tab.url && tab.title) {
      try {
        await getStorageSession().set({
          [`tab_${tabId}`]: { title: tab.title, url: tab.url }
        });
      } catch (e) {
        console.error('[TwoTab] Error updating tab cache:', e);
      }
    }
  });

  // Track tab creation
  chrome.tabs.onCreated.addListener(async (tab) => {
    if (tab.id !== undefined && tab.url && tab.title) {
      try {
        await getStorageSession().set({
          [`tab_${tab.id}`]: { title: tab.title, url: tab.url }
        });
      } catch (e) {
        console.error('[TwoTab] Error caching created tab:', e);
      }
    }
  });

  // ==========================================================================
  // Tab Closure → Recently Closed Tracking
  // ==========================================================================

  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const key = `tab_${tabId}`;
    try {
      const sessionData = await getStorageSession().get(key);
      const cached = sessionData[key];
      await getStorageSession().remove(key);

      if (!cached || !cached.url) return;

      const lower = cached.url.toLowerCase();
      // Protocol filter: exclude internal system pages ONLY
      if (
        lower.startsWith('chrome-extension://') ||
        lower.startsWith('chrome://') ||
        lower.startsWith('about:') ||
        lower.startsWith('edge:') ||
        lower.startsWith('data:')
      ) {
        return;
      }

      const data = await chrome.storage.local.get('recentlyClosed');
      const recentlyClosed = data.recentlyClosed || [];

      const newItem = {
        id: `closed_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        title: cached.title || cached.url,
        url: cached.url,
        timestamp: new Date().toISOString(),
      };

      const prefs = await getUserPreferences();
      const limit = prefs.recentlyClosedLimit || 50;
      const updated = [newItem, ...recentlyClosed].slice(0, limit);
      await chrome.storage.local.set({ recentlyClosed: updated });
    } catch (e) {
      console.error('[TwoTab] Error saving recently closed tab:', e);
    }
  });

  // ==========================================================================
  // Message Handler: Save Tabs Actions
  // ==========================================================================

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveTabs') {
      (async () => {
        try {
          await saveCurrentWindowTabs();
          sendResponse({ status: 'success' });
        } catch (error: any) {
          sendResponse({ status: 'error', message: error.message || error });
        }
      })();
      return true;
    }

    if (request.action === 'saveAllWindows') {
      (async () => {
        try {
          await saveAllWindowsTabs();
          sendResponse({ status: 'success' });
        } catch (error: any) {
          sendResponse({ status: 'error', message: error.message || error });
        }
      })();
      return true;
    }

    if (request.action === 'saveActiveTab') {
      (async () => {
        try {
          await saveActiveTab();
          sendResponse({ status: 'success' });
        } catch (error: any) {
          sendResponse({ status: 'error', message: error.message || error });
        }
      })();
      return true;
    }
  });

  // ==========================================================================
  // Tab Saving Logic
  // ==========================================================================

  async function saveCurrentWindowTabs() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    await processTabsForWindow(tabs);
  }

  async function saveActiveTab() {
    const prefs = await getUserPreferences();
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.url) return;
    if (activeTab.pinned && prefs.protectPinnedTabs) return;

    const lower = activeTab.url.toLowerCase();
    if (
      lower.startsWith('chrome-extension://') ||
      lower.startsWith('chrome://') ||
      lower.startsWith('about:') ||
      lower.startsWith('edge:') ||
      lower.startsWith('data:')
    ) {
      return;
    }

    const data = await chrome.storage.local.get('tabGroups');
    const tabGroups = data.tabGroups || [];

    const newGroup = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      date: new Date().toISOString(),
      name: activeTab.title ? `${activeTab.title.slice(0, 30)}...` : 'Saved Tab',
      tabs: [{ title: activeTab.title || activeTab.url, url: activeTab.url }]
    };
    tabGroups.push(newGroup);
    await chrome.storage.local.set({ tabGroups });

    if (activeTab.id !== undefined) {
      await chrome.tabs.remove(activeTab.id);
    }
  }

  async function saveAllWindowsTabs() {
    const tabs = await chrome.tabs.query({});

    const tabsByWindow: Record<number, chrome.tabs.Tab[]> = {};
    tabs.forEach(tab => {
      if (tab.windowId !== undefined) {
        if (!tabsByWindow[tab.windowId]) tabsByWindow[tab.windowId] = [];
        tabsByWindow[tab.windowId].push(tab);
      }
    });

    for (const windowId of Object.keys(tabsByWindow)) {
      await processTabsForWindow(tabsByWindow[Number(windowId)]);
    }
  }

  async function processTabsForWindow(tabs: chrome.tabs.Tab[]) {
    const prefs = await getUserPreferences();
    const tabData = tabs
      .filter(tab => {
        if (!tab.url) return false;
        if (tab.pinned && prefs.protectPinnedTabs) return false;
        const lower = tab.url.toLowerCase();
        return !(
          lower.startsWith('chrome-extension://') ||
          lower.startsWith('chrome://') ||
          lower.startsWith('about:') ||
          lower.startsWith('edge:') ||
          lower.startsWith('data:')
        );
      })
      .map(tab => ({ title: tab.title || tab.url || '', url: tab.url || '' }));

    if (tabData.length === 0) return;

    const windowId = tabs[0].windowId;
    const data = await chrome.storage.local.get('tabGroups');
    const tabGroups = data.tabGroups || [];

    const newGroup = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      date: new Date().toISOString(),
      name: `Window Group`,
      tabs: tabData
    };
    tabGroups.push(newGroup);

    await chrome.storage.local.set({ tabGroups });

    // Open a new blank tab in the window first
    await chrome.tabs.create({ url: 'chrome://newtab', windowId });

    // Close tabs (respecting protectPinnedTabs)
    const tabIds = tabs
      .filter(tab => !(tab.pinned && prefs.protectPinnedTabs))
      .map(tab => tab.id)
      .filter(id => id !== undefined && id !== chrome.tabs.TAB_ID_NONE);

    await chrome.tabs.remove(tabIds as number[]);
  }

  async function saveSpecificTabs(tabsToSave: chrome.tabs.Tab[], closeTabs: boolean = true) {
    const prefs = await getUserPreferences();
    const validTabs = tabsToSave
      .filter(tab => {
        if (!tab.url) return false;
        if (tab.pinned && prefs.protectPinnedTabs) return false;
        const lower = tab.url.toLowerCase();
        return !(
          lower.startsWith('chrome-extension://') ||
          lower.startsWith('chrome://') ||
          lower.startsWith('about:') ||
          lower.startsWith('edge:') ||
          lower.startsWith('data:')
        );
      })
      .map(tab => ({ title: tab.title || tab.url || '', url: tab.url || '' }));

    if (validTabs.length === 0) return;

    const data = await chrome.storage.local.get('tabGroups');
    const tabGroups = data.tabGroups || [];

    const groupName = validTabs.length === 1
      ? (validTabs[0].title ? (validTabs[0].title.length > 35 ? `${validTabs[0].title.slice(0, 35)}...` : validTabs[0].title) : 'Saved Tab')
      : `Selected Tabs (${validTabs.length})`;

    const newGroup = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      date: new Date().toISOString(),
      name: groupName,
      tabs: validTabs,
    };

    tabGroups.push(newGroup);
    await chrome.storage.local.set({ tabGroups });

    if (closeTabs) {
      const tabIds = tabsToSave
        .filter(t => t.id !== undefined && !(t.pinned && prefs.protectPinnedTabs))
        .map(t => t.id as number);

      if (tabIds.length > 0) {
        if (tabsToSave[0]?.windowId !== undefined) {
          const windowTabs = await chrome.tabs.query({ windowId: tabsToSave[0].windowId });
          const remaining = windowTabs.filter(t => t.id !== undefined && !tabIds.includes(t.id));
          if (remaining.length === 0) {
            await chrome.tabs.create({ url: 'chrome://newtab', windowId: tabsToSave[0].windowId });
          }
        }
        await chrome.tabs.remove(tabIds);
      }
    }
  }
});
