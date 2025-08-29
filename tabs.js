document.addEventListener('DOMContentLoaded', () => {
  const renameModal = document.getElementById('rename-modal');
  const renameInput = document.getElementById('rename-input');
  const renameSaveBtn = document.getElementById('rename-save-btn');

  try {
    loadGroups();
    document.getElementById('search').addEventListener('input', loadGroups);
    document.getElementById('saveTabs').addEventListener('click', saveTabs);
    document.getElementById('import').addEventListener('click', importTabs);
    document.getElementById('exportAll').addEventListener('click', exportAll);
    document.getElementById('clearAll').addEventListener('click', clearAll);

    // Add event listener for the modal's save button
    renameSaveBtn.addEventListener('click', (e) => {
      e.preventDefault(); // Stop the form from closing the modal immediately
      const groupId = parseInt(renameModal.dataset.groupId);
      const newName = renameInput.value.trim();

      if (!groupId || !newName) {
        renameModal.close();
        return;
      }

      chrome.storage.local.get('tabGroups', (data) => {
        const tabGroups = data.tabGroups || [];
        const groupToUpdate = tabGroups.find(g => g.id === groupId);
        if (groupToUpdate) {
          groupToUpdate.name = newName;
          chrome.storage.local.set({ tabGroups }, () => {
            loadGroups(); // Refresh the list with the new name
            renameModal.close(); // Close the modal
          });
        }
      });
    });

  } catch (error) {
    console.error('Error initializing tabs page:', error);
    document.getElementById('groups').innerHTML = '<p class="text-error text-center">Error loading tabs. Please try again.</p>';
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
        groupsDiv.innerHTML = '<p class="text-base-content text-opacity-60 text-center py-10">No saved tab groups.</p>';
        return;
      }
      
      const sortedGroups = tabGroups.sort((a, b) => new Date(b.date) - new Date(a.date));

      sortedGroups.forEach((group) => {
        const filteredTabs = searchTerm
          ? group.tabs.filter(tab => 
              tab.title?.toLowerCase().includes(searchTerm) || 
              tab.url?.toLowerCase().includes(searchTerm))
          : group.tabs;
        
        if (searchTerm && filteredTabs.length === 0) return;
        
        const groupDiv = document.createElement('div');
        groupDiv.className = 'collapse collapse-arrow bg-base-100 shadow-md border border-base-300 w-full max-w-5xl';
        
        const checkboxId = `collapse-${group.id}`;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = checkboxId;
        input.className = 'hidden';
        groupDiv.appendChild(input);
        
        const titleDiv = document.createElement('label');
        titleDiv.htmlFor = checkboxId;
        titleDiv.className = 'collapse-title text-lg font-medium flex justify-between items-center gap-4';
        
        const titleText = document.createElement('span');
        titleText.className = 'flex-1 truncate';
        
        const date = new Date(group.date);
        const formattedDate = date.toLocaleString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
        });
        
        titleText.textContent = `${group.name || 'Saved Group'} (${filteredTabs.length}) - ${formattedDate}`;
        titleText.title = `${group.name || 'Saved Group'} - ${formattedDate}`;
        
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn btn-ghost btn-sm';
        renameBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg> Rename';
        
        // This now opens the modal
        renameBtn.onclick = (e) => {
          e.stopPropagation(); // Stop the click from expanding the collapse
          e.preventDefault();
          const renameModal = document.getElementById('rename-modal');
          const renameInput = document.getElementById('rename-input');
          
          renameInput.value = group.name || '';
          renameInput.focus();
          renameModal.dataset.groupId = group.id; // Store the group ID on the modal
          renameModal.showModal();
        };
        
        titleDiv.appendChild(titleText);
        titleDiv.appendChild(renameBtn);
        groupDiv.appendChild(titleDiv);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'collapse-content';
        
        const ul = document.createElement('ul');
        ul.className = 'menu p-0';
        filteredTabs.forEach(tab => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = tab.url;
          a.className = "flex items-start gap-3"
          a.onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: tab.url }); };
          const favicon = document.createElement('img');
          favicon.src = `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=16`;
          favicon.className = 'w-4 h-4 mt-1';
          favicon.alt = "Tab Favicon";
          const linkText = document.createElement('span');
          linkText.textContent = tab.title || tab.url;
          linkText.className = "flex-1 break-all";
          a.appendChild(favicon);
          a.appendChild(linkText);
          li.appendChild(a);
          ul.appendChild(li);
        });
        contentDiv.appendChild(ul);
        
        const btnDiv = document.createElement('div');
        btnDiv.className = 'flex gap-4 mt-6 justify-end border-t border-base-200 pt-4';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-error btn-sm btn-outline';
        deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Delete';
        deleteBtn.onclick = () => deleteGroup(group.id);
        btnDiv.appendChild(deleteBtn);

        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'btn btn-secondary btn-sm';
        restoreBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg> Restore All';
        restoreBtn.onclick = () => restoreGroup(group);
        btnDiv.appendChild(restoreBtn);
        
        contentDiv.appendChild(btnDiv);
        groupDiv.appendChild(contentDiv);
        
        groupsDiv.appendChild(groupDiv);
      });
    });
  } catch (error) {
    console.error('Error loading groups:', error);
    document.getElementById('groups').innerHTML = '<p class="text-error text-center">Error loading groups. Please try again.</p>';
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
    if (confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
      chrome.storage.local.get('tabGroups', (data) => {
        const tabGroups = data.tabGroups.filter(g => g.id !== id);
        chrome.storage.local.set({ tabGroups }, loadGroups);
      });
    }
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
        alert('Failed to save tabs. Please see the console for details.');
      }
    });
  } catch (error) {
    console.error('Error sending saveTabs message:', error);
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function importTabs() {
  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.csv,.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target.result;
        let newTabs = [];
        
        if (file.name.endsWith('.txt')) {
          newTabs = content.split('\n').filter(url => url.trim()).map(url => ({ title: url, url }));
        } else if (file.name.endsWith('.csv')) {
          const lines = content.split('\n');
          lines.forEach(line => {
             const parts = line.split(',');
             const url = parts.length > 1 ? parts[1] : parts[0];
             const title = parts.length > 1 ? parts[0] : url;
             if (url && url.trim().startsWith('http')) {
               newTabs.push({ title: title.trim().replace(/^"|"$/g, ''), url: url.trim().replace(/^"|"$/g, '') });
             }
          });
        }
        
        if (newTabs.length > 0) {
          const newGroupName = prompt('Enter a name for the imported group:', file.name);
          chrome.storage.local.get('tabGroups', (data) => {
            const tabGroups = data.tabGroups || [];
            tabGroups.push({
              id: Date.now(),
              date: new Date().toISOString(),
              name: newGroupName || 'Imported Group',
              tabs: newTabs
            });
            chrome.storage.local.set({ tabGroups }, loadGroups);
          });
        } else {
          alert('No valid tabs found in the selected file.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  } catch (error) {
    console.error('Error importing tabs:', error);
    alert('An error occurred during import. Please check the console.');
  }
}

function exportAll() {
  try {
    chrome.storage.local.get('tabGroups', (data) => {
      const tabGroups = data.tabGroups || [];
      if (tabGroups.length === 0) {
        alert('No groups to export.');
        return;
      }
      const csvContent = ['Group ID,Group Name,Date,Title,URL'];
      tabGroups.forEach(group => {
        group.tabs.forEach(tab => {
          const row = [
            group.id,
            `"${(group.name || '').replace(/"/g, '""')}"`,
            group.date,
            `"${(tab.title || tab.url).replace(/"/g, '""')}"`,
            `"${tab.url.replace(/"/g, '""')}"`
          ];
          csvContent.push(row.join(','));
        });
      });
      const blob = new Blob([csvContent.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url,
        filename: `twotab_export_${new Date().toISOString().split('T')[0]}.csv`,
        saveAs: true
      });
    });
  } catch (error) {
    console.error('Error exporting tabs:', error);
    alert('Error exporting tabs. Check console for details.');
  }
}

function clearAll() {
  try {
    if (confirm('Are you sure you want to delete ALL saved groups? This action cannot be undone.')) {
      chrome.storage.local.set({ tabGroups: [] }, loadGroups);
    }
  } catch (error) {
    console.error('Error clearing groups:', error);
  }
}