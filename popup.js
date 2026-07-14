/**
 * TwoTab Popup Script
 * Manages the compact popup interface: glassmorphism themes, search highlights, inline tab deletions,
 * and popup-specific modals and triggers.
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
        groupsDiv.innerHTML = '<p class="text-slate-400 text-opacity-80 text-center text-sm py-8">No saved groups.</p>';
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
        groupDiv.className = 'collapse collapse-arrow glass-card w-full mb-2';
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        groupDiv.appendChild(input);
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'collapse-title text-sm font-semibold flex justify-between items-center gap-2 py-3 px-4 select-none';
        
        const titleText = document.createElement('span');
        titleText.className = 'flex-1 truncate text-slate-100';
        
        const formattedRelativeDate = getRelativeTime(group.date);
        titleText.innerHTML = `${highlightText(group.name || 'Saved Group', searchTerm)} <span class="text-xs text-slate-400 font-normal ml-1">(${filteredTabs.length} tabs) • ${formattedRelativeDate}</span>`;
        titleDiv.appendChild(titleText);

        // Favicon strip preview in header
        const previewStrip = document.createElement('div');
        previewStrip.className = 'favicon-preview-strip hidden sm:inline-flex';
        filteredTabs.slice(0, 5).forEach(t => {
          const img = document.createElement('img');
          img.src = `https://www.google.com/s2/favicons?domain=${new URL(t.url).hostname}&sz=16`;
          img.alt = '';
          img.onerror = () => img.remove();
          previewStrip.appendChild(img);
        });
        titleDiv.appendChild(previewStrip);
        groupDiv.appendChild(titleDiv);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'collapse-content px-4 pb-4';
        
        const ul = document.createElement('ul');
        ul.className = 'space-y-1 w-full mt-2';
        filteredTabs.forEach(tab => {
          const li = document.createElement('li');
          li.className = 'group flex items-center justify-between rounded-md hover:bg-slate-800/40 transition-colors w-full';

          const a = document.createElement('a');
          a.href = tab.url;
          a.className = "flex items-center gap-2.5 flex-1 text-slate-300 hover:text-slate-100 py-1.5 px-2 break-all text-xs";
          a.onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: tab.url }); };

          const favicon = document.createElement('img');
          favicon.src = `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=16`;
          favicon.className = 'w-4 h-4 mt-0.5 flex-shrink-0';
          favicon.alt = "";

          const linkText = document.createElement('span');
          linkText.className = "flex-1 truncate";
          linkText.innerHTML = highlightText(tab.title || tab.url, searchTerm);

          a.appendChild(favicon);
          a.appendChild(linkText);
          li.appendChild(a);

          // Inline individual tab deletion button
          const trashBtn = document.createElement('button');
          trashBtn.className = 'btn btn-ghost btn-xs trash-btn px-1.5 flex-shrink-0';
          trashBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>';
          trashBtn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (confirm(`Delete this tab? \n"${tab.title || tab.url}"`)) {
              deleteTabFromGroup(group.id, tab.url, loadGroups);
            }
          };
          li.appendChild(trashBtn);
          ul.appendChild(li);
        });
        contentDiv.appendChild(ul);
        
        const btnDiv = document.createElement('div');
        btnDiv.className = 'flex gap-2 mt-4 justify-end border-t border-slate-800 pt-3';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-error btn-xs btn-outline';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => deleteGroup(group.id, true, loadGroups);
        btnDiv.appendChild(deleteBtn);
        
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn btn-ghost btn-xs text-slate-400 hover:text-indigo-400 border border-transparent hover:border-slate-700';
        renameBtn.textContent = 'Rename';
        renameBtn.onclick = () => openRenameModal(group);
        btnDiv.appendChild(renameBtn);

        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'btn btn-gradient-secondary btn-xs';
        restoreBtn.textContent = 'Restore';
        restoreBtn.onclick = () => restoreGroup(group, loadGroups);
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

function highlightText(text, search) {
  if (!search) return text;
  const escapedSearch = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(${escapedSearch})`, 'gi');
  return text.replace(regex, '<span class="search-highlight">$1</span>');
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
  chrome.tabs.create({ url: chrome.runtime.getURL('tabs.html?action=import') });
}

function exportAll() {
  chrome.tabs.create({ url: chrome.runtime.getURL('tabs.html') });
}