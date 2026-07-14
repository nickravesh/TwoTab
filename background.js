chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveTabs') {
    saveTabs()
      .then(() => sendResponse({ status: 'success' }))
      .catch((error) => sendResponse({ status: 'error', message: error }));
    return true; // Keep message channel open for async response
  }
});

async function saveTabs() {
  // Query all tabs in the current window
  const tabs = await chrome.tabs.query({ currentWindow: true });
  
  // Filter out the TwoTab popup and pinned tabs
  const tabData = tabs
    .filter(tab => !tab.url.startsWith('chrome-extension://') && !tab.pinned)
    .map(tab => ({ title: tab.title, url: tab.url }));

  if (tabData.length === 0) return;

  // Get the window ID from the first tab (all tabs in query share the same window)
  const windowId = tabs[0].windowId;

  // Get existing saved groups from storage
  const data = await chrome.storage.local.get('tabGroups');
  const tabGroups = data.tabGroups || [];
  const newGroup = {
    id: Date.now(),
    date: new Date().toISOString(),
    tabs: tabData
  };
  tabGroups.push(newGroup);
  
  // Save to local storage
  await chrome.storage.local.set({ tabGroups });
  
  // Open a new blank tab in the current window first
  await chrome.tabs.create({ url: 'chrome://newtab', windowId });
  
  // Close only non-pinned tabs
  const tabIds = tabs
    .filter(tab => !tab.pinned)
    .map(tab => tab.id)
    .filter(id => id !== chrome.tabs.TAB_ID_NONE);
  await chrome.tabs.remove(tabIds);
  
  // Removed automatic backup generation here. Backups should be explicit via "Export All CSV"
}

// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   if (request.action === 'saveTabs') {
//     try {
//       chrome.tabs.query({}, (tabs) => {
//         const newGroup = {
//           id: Date.now(),
//           date: new Date().toISOString(),
//           tabs: tabs.map(tab => ({ title: tab.title, url: tab.url }))
//         };
//         chrome.storage.local.get('tabGroups', (data) => {
//           const tabGroups = data.tabGroups || [];
//           tabGroups.push(newGroup);
//           chrome.storage.local.set({ tabGroups }, () => {
//             sendResponse({ status: 'success' });
//           });
//         });
//       });
//     } catch (error) {
//       console.error('Error saving tabs in background:', error);
//       sendResponse({ status: 'error', error: error.message });
//     }
//     return true; // Keep message channel open for async response
//   }
// });