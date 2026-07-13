/**
 * TwoTab Popup Script
 * Leverages utils.js for core actions and manages the compact UI.
 */

document.addEventListener('DOMContentLoaded', () => {
  const renameModal = document.getElementById('rename-modal');
  const renameInput = document.getElementById('rename-input');
  const renameSaveBtn = document.getElementById('rename-save-btn');

  try {
    loadGroups();
    document.getElementById('search').addEventListener('input', loadGroups);
    document.getElementById('saveTabs').addEventListener('click', saveTabs);
    document.getElementById('viewAll').addEventListener('click', viewAll);
    document.getElementById('import').addEventListener('click', importTabs);
    document.getElementById('exportAll').addEventListener('click', exportAll);
    document.getElementById('clearAll').addEventListener('click', () => clearAll(true, loadGroups));

    // Handle modal save button
    renameSaveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const groupId = parseInt(renameModal.dataset.groupId);
      const newName = renameInput.value.trim();

      if (!groupId || !newName) {
        renameModal.close();
        return;
      }

      getGroups((groups) => {
        const groupToUpdate = groups.find(g => g.id === groupId);
        if (groupToUpdate) {
          groupToUpdate.name = newName;
          saveGroups(groups, () => {
            loadGroups();
            renameModal.close();
          });
        }
      });
    });
  } catch (error) {
    console.error('Error initializing popup:', error);
    document.getElementById('groups').innerHTML = '<p class="text-error text-center text-sm p-4">Error loading.</p>';
  }
});

function loadGroups() {
  try {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    getGroups((tabGroups) => {
      const groupsDiv = document.getElementById('groups');
      groupsDiv.innerHTML = '';
      
      // Update warning footer if total groups count exceeds the 10-item display limit
      const limitWarning = document.getElementById('popup-limit-warning');
      if (tabGroups.length > 10) {
        limitWarning.classList.remove('hidden');
      } else {
        limitWarning.classList.add('hidden');
      }

      if (tabGroups.length === 0) {
        groupsDiv.innerHTML = '<p class="text-base-content text-opacity-60 text-center text-sm py-4">No saved groups.</p>';
        return;
      }

      const sortedGroups = tabGroups.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      // Show only 10 most recent groups in the popup to conserve screen space
      sortedGroups.slice(0, 10).forEach((group) => {
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
        
        const date = new Date(group.date);
        const formattedDate = date.toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        
        titleText.textContent = `${group.name || 'Saved Group'} (${filteredTabs.length} tabs) - ${formattedDate}`;
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
        btnDiv.className = 'flex gap-2 mt-4 justify-end border-t border-base-200 pt-2';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-error btn-xs btn-outline';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => deleteGroup(group.id, true, loadGroups);
        btnDiv.appendChild(deleteBtn);
        
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn btn-ghost btn-xs';
        renameBtn.textContent = 'Rename';
        renameBtn.onclick = () => openRenameModal(group);
        btnDiv.appendChild(renameBtn);

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

function openRenameModal(group) {
  const renameModal = document.getElementById('rename-modal');
  const renameInput = document.getElementById('rename-input');
  renameInput.value = group.name || '';
  renameModal.dataset.groupId = group.id;
  renameModal.showModal();
  renameInput.focus();
}

function saveTabs() {
  saveTabsAction(document.getElementById('saveTabs'), (err) => {
    if (!err) {
      loadGroups();
    }
  });
}

function viewAll() {
  try {
    chrome.tabs.create({ url: chrome.runtime.getURL('tabs.html') });
  } catch (error) {
    console.error('Error opening tabs page:', error);
  }
}

function importTabs() {
  chrome.tabs.create({ url: chrome.runtime.getURL('tabs.html') }, () => {
    // Send message to trigger import action on newly opened dashboard tab
    setTimeout(() => {
      chrome.tabs.query({ url: chrome.runtime.getURL('tabs.html') }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "triggerImport" });
        }
      });
    }, 500);
  });
}

function exportAll() {
  chrome.tabs.create({ url: chrome.runtime.getURL('tabs.html') });
}