export default defineBackground(() => {
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
