// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   if (request.action === 'saveTabs') {
//     saveTabs()
//       .then(() => sendResponse({ status: 'success' }))
//       .catch((error) => sendResponse({ status: 'error', message: error }));
//     return true; // Keep message channel open for async response
//   }
// });

// async function saveTabs() {
//   // Query all tabs in the current window
//   const tabs = await chrome.tabs.query({ currentWindow: true });
  
//   // Filter out the TwoTab popup and pinned tabs
//   const tabData = tabs
//     .filter(tab => !tab.url.startsWith('chrome-extension://') && !tab.pinned)
//     .map(tab => ({ title: tab.title, url: tab.url }));

//   if (tabData.length === 0) return;

//   // Get the window ID from the first tab (all tabs in query share the same window)
//   const windowId = tabs[0].windowId;

//   // Get existing saved groups from storage
//   const data = await chrome.storage.local.get('tabGroups');
//   const tabGroups = data.tabGroups || [];
//   const newGroup = {
//     id: Date.now(),
//     date: new Date().toISOString(),
//     tabs: tabData
//   };
//   tabGroups.push(newGroup);
  
//   // Save to local storage
//   await chrome.storage.local.set({ tabGroups });
  
//   // Open a new blank tab in the current window first
//   await chrome.tabs.create({ url: 'chrome://newtab', windowId });
  
//   // Close only non-pinned tabs
//   const tabIds = tabs
//     .filter(tab => !tab.pinned)
//     .map(tab => tab.id)
//     .filter(id => id !== chrome.tabs.TAB_ID_NONE);
//   await chrome.tabs.remove(tabIds);
  
//   // Create and download backups
//   createBackups(newGroup, tabGroups);
// }

// function createBackups(newGroup, allGroups) {
//   const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
//   // TXT: One URL per line for the new group
//   const txtContent = newGroup.tabs.map(tab => tab.url).join('\n');
//   const txtBlob = new Blob([txtContent], { type: 'text/plain' });
//   chrome.downloads.download({
//     url: URL.createObjectURL(txtBlob),
//     filename: `TwoTab_newgroup_${timestamp}.txt`,
//     saveAs: false
//   });
  
//   // CSV: All groups, with columns for group ID, date, title, URL
//   let csvContent = 'GroupID,Date,Title,URL\n';
//   allGroups.forEach(group => {
//     group.tabs.forEach(tab => {
//       csvContent += `${group.id},${group.date},"${tab.title.replace(/"/g, '""')}",${tab.url}\n`;
//     });
//   });
//   const csvBlob = new Blob([csvContent], { type: 'text/csv' });
//   chrome.downloads.download({
//     url: URL.createObjectURL(csvBlob),
//     filename: `TwoTab_fullbackup_${timestamp}.csv`,
//     saveAs: false
//   });
// }



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveTabs') {
    try {
      chrome.tabs.query({}, (tabs) => {
        const newGroup = {
          id: Date.now(),
          date: new Date().toISOString(),
          tabs: tabs.map(tab => ({ title: tab.title, url: tab.url }))
        };
        chrome.storage.local.get('tabGroups', (data) => {
          const tabGroups = data.tabGroups || [];
          tabGroups.push(newGroup);
          chrome.storage.local.set({ tabGroups }, () => {
            sendResponse({ status: 'success' });
          });
        });
      });
    } catch (error) {
      console.error('Error saving tabs in background:', error);
      sendResponse({ status: 'error', error: error.message });
    }
    return true; // Keep message channel open for async response
  }
});