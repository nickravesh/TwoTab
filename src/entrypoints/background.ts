export default defineBackground(() => {
  // In-memory tab cache to track active tab info prior to closure
  const tabCache = new Map<number, { title: string; url: string }>();

  // Track active tab URL and title updates
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url && tab.title) {
      tabCache.set(tabId, { title: tab.title, url: tab.url });
    }
  });

  // Track closed tabs in real-time
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const cached = tabCache.get(tabId);
    tabCache.delete(tabId);

    if (!cached || !cached.url) return;

    const lower = cached.url.toLowerCase();
    if (
      lower.startsWith('chrome-extension://') ||
      lower.startsWith('chrome://') ||
      lower.startsWith('about:') ||
      lower.startsWith('edge:') ||
      lower.startsWith('data:')
    ) {
      return;
    }

    try {
      const data = await chrome.storage.local.get('recentlyClosed');
      const recentlyClosed = data.recentlyClosed || [];
      
      const newItem = {
        id: `closed_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        title: cached.title || cached.url,
        url: cached.url,
        timestamp: new Date().toISOString(),
      };

      // Prepend closed tab and cap list at 50 items
      const updated = [newItem, ...recentlyClosed].slice(0, 50);
      await chrome.storage.local.set({ recentlyClosed: updated });
    } catch (e) {
      console.error('Error saving recently closed tab:', e);
    }
  });

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
  });

  async function saveCurrentWindowTabs() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    await processTabsForWindow(tabs);
  }

  async function saveAllWindowsTabs() {
    const tabs = await chrome.tabs.query({});
    
    // Group tabs by windowId
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
    const tabData = tabs
      .filter(tab => {
        if (!tab.url || tab.pinned) return false;
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
    
    // Close non-pinned tabs
    const tabIds = tabs
      .filter(tab => !tab.pinned)
      .map(tab => tab.id)
      .filter(id => id !== undefined && id !== chrome.tabs.TAB_ID_NONE);
    
    await chrome.tabs.remove(tabIds as number[]);
  }
});
