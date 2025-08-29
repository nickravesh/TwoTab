// Note: This file shares many functions with tabs.js. In a larger project,
// this shared logic would be abstracted into a separate utility file.

document.addEventListener('DOMContentLoaded', () => {
  try {
    loadGroups();
    document.getElementById('search').addEventListener('input', loadGroups);
    document.getElementById('saveTabs').addEventListener('click', saveTabs);
    document.getElementById('viewAll').addEventListener('click', viewAll);
    document.getElementById('import').addEventListener('click', importTabs);
    document.getElementById('exportAll').addEventListener('click', exportAll);
    document.getElementById('clearAll').addEventListener('click', clearAll);
  } catch (error) {
    console.error('Error initializing popup:', error);
    document.getElementById('groups').innerHTML = '<p class="text-error text-center text-sm p-4">Error loading.</p>';
  }
});

function loadGroups() {
  try {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    chrome.storage.local.get('tabGroups', (data) => {
      const groupsDiv = document.getElementById('groups');
      groupsDiv.innerHTML = '';
      const tabGroups = data.tabGroups || [];
      
      if (tabGroups.length === 0) {
        groupsDiv.innerHTML = '<p class="text-base-content text-opacity-60 text-center text-sm py-4">No saved groups.</p>';
        return;
      }

      const sortedGroups = tabGroups.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      sortedGroups.slice(0, 10).forEach((group) => { // Show 10 most recent groups in popup
        const filteredTabs = searchTerm
          ? group.tabs.filter(tab => 
              tab.title?.toLowerCase().includes(searchTerm) || 
              tab.url?.toLowerCase().includes(searchTerm))
          : group.tabs;
        
        if (searchTerm && filteredTabs.length === 0) return;
        
        const groupDiv = document.createElement('div');
        groupDiv.className = 'collapse collapse-arrow bg-base-100 shadow-sm border border-base-300';
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        groupDiv.appendChild(input);
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'collapse-title text-sm font-medium flex justify-between items-center gap-2';
        
        const titleText = document.createElement('span');
        titleText.className = 'flex-1 truncate';
        titleText.textContent = `${group.name || 'Saved Group'} (${filteredTabs.length} tabs)`;
        titleDiv.appendChild(titleText);
        groupDiv.appendChild(titleDiv);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'collapse-content';
        
        const ul = document.createElement('ul');
        ul.className = 'menu menu-sm p-0 -mx-4';
        filteredTabs.forEach(tab => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = tab.url;
          a.onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: tab.url }); };

          const favicon = document.createElement('img');
          favicon.src = `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=16`;
          favicon.className = 'w-4 h-4';
          favicon.alt = "Favicon";

          const linkText = document.createElement('span');
          linkText.textContent = tab.title || tab.url;
          linkText.className = "flex-1 truncate";

          a.appendChild(favicon);
          a.appendChild(linkText);
          li.appendChild(a);
          ul.appendChild(li);
        });
        contentDiv.appendChild(ul);
        
        const btnDiv = document.createElement('div');
        btnDiv.className = 'flex gap-2 mt-4 justify-end';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-error btn-xs';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => deleteGroup(group.id);
        btnDiv.appendChild(deleteBtn);
        
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'btn btn-secondary btn-xs';
        restoreBtn.textContent = 'Restore';
        restoreBtn.onclick = () => restoreGroup(group);
        btnDiv.appendChild(restoreBtn);

        contentDiv.appendChild(btnDiv);
        groupDiv.appendChild(contentDiv);
        groupsDiv.appendChild(groupDiv);
      });
    });
  } catch (error) {
    console.error('Error loading groups:', error);
    document.getElementById('groups').innerHTML = '<p class="text-error text-center text-sm p-4">Error loading.</p>';
  }
}

function restoreGroup(group) {
  try {
    group.tabs.forEach(tab => chrome.tabs.create({ url: tab.url, active: false }));
  } catch (error) {
    console.error('Error restoring group:', error);
  }
}

function deleteGroup(id) {
  try {
    chrome.storage.local.get('tabGroups', (data) => {
      const tabGroups = data.tabGroups.filter(g => g.id !== id);
      chrome.storage.local.set({ tabGroups }, loadGroups);
    });
  } catch (error) {
    console.error('Error deleting group:', error);
  }
}

function saveTabs() {
  const btn = document.getElementById('saveTabs');
  try {
    btn.classList.add('loading');
    btn.disabled = true;
    chrome.runtime.sendMessage({ action: 'saveTabs' }, (response) => {
      btn.classList.remove('loading');
      btn.disabled = false;
      if (response && response.status === 'success') {
        loadGroups();
      } else {
        console.error('Error saving tabs:', response ? response.error : 'No response');
      }
    });
  } catch (error) {
    console.error('Error saving tabs:', error);
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function viewAll() {
  try {
    chrome.tabs.create({ url: chrome.runtime.getURL('tabs.html') });
  } catch (error) {
    console.error('Error opening tabs page:', error);
  }
}

// These functions are duplicates from tabs.js.
// In a real-world scenario, they would be in a shared file.
function importTabs() {
  chrome.tabs.create({ url: chrome.runtime.getURL('tabs.html') }, () => {
    // A bit of a hack to trigger the import on the newly opened page.
    // A more robust solution would use messaging between the popup and the tab.
    setTimeout(() => {
        chrome.tabs.query({url: chrome.runtime.getURL('tabs.html')}, (tabs) => {
            if(tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {action: "triggerImport"});
            }
        });
    }, 500);
  });
}

function exportAll() {
  chrome.tabs.create({ url: chrome.runtime.getURL('tabs.html') });
}

function clearAll() {
  try {
    if (confirm('Are you sure you want to delete ALL saved groups?')) {
      chrome.storage.local.set({ tabGroups: [] }, loadGroups);
    }
  } catch (error) {
    console.error('Error clearing groups:', error);
  }
}