/**
 * TwoTab Full-Page Dashboard Script
 * Implements the card-grid visual dashboard: left sidebar, right sidebar, summary cards,
 * card grids of website icons, inline close buttons, and group action dropdowns.
 */

const selectedGroupIds = new Set();
let selectModeActive = false;

document.addEventListener('DOMContentLoaded', () => {
  const renameModal = document.getElementById('rename-modal');
  const renameInput = document.getElementById('rename-input');
  const renameSaveBtn = document.getElementById('rename-save-btn');

  try {
    loadGroups();
    document.getElementById('search').addEventListener('input', loadGroups);
    document.getElementById('saveTabs').addEventListener('click', saveTabs);
    if (document.getElementById('saveTabsBottom')) {
      document.getElementById('saveTabsBottom').addEventListener('click', saveTabs);
    }
    document.getElementById('import').addEventListener('click', importTabs);
    document.getElementById('exportAll').addEventListener('click', exportAll);
    document.getElementById('clearAll').addEventListener('click', () => clearAll(true, () => {
      selectedGroupIds.clear();
      updateBulkActionsBar();
      loadGroups();
    }));

    // Select & Merge toggle button in right sidebar
    document.getElementById('bulkToggleBtn').addEventListener('click', toggleSelectMode);

    // Check for import trigger from popup URL params
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'import') {
      setTimeout(() => importTabs(), 100);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Event listener for the rename modal's save button
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

    // Initialize Bulk Actions Handlers
    document.getElementById('bulk-restore').addEventListener('click', bulkRestore);
    document.getElementById('bulk-merge').addEventListener('click', bulkMerge);
    document.getElementById('bulk-delete').addEventListener('click', bulkDelete);
    document.getElementById('bulk-cancel').addEventListener('click', bulkCancel);

    // Initialize Settings
    const deleteOnRestoreToggle = document.getElementById('setting-delete-on-restore');
    if (deleteOnRestoreToggle) {
      chrome.storage.local.get('settings', (data) => {
        const settings = data.settings || { deleteOnRestore: false };
        deleteOnRestoreToggle.checked = settings.deleteOnRestore;
      });
      deleteOnRestoreToggle.addEventListener('change', (e) => {
        chrome.storage.local.get('settings', (data) => {
          const settings = data.settings || {};
          settings.deleteOnRestore = e.target.checked;
          chrome.storage.local.set({ settings });
        });
      });
    }

  } catch (error) {
    console.error('Error initializing tabs page:', error);
    document.getElementById('groups').innerHTML = '<p class="text-error text-center">Error loading dashboard. Please try again.</p>';
  }
});

function loadGroups() {
  try {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    getGroups((tabGroups) => {
      // Re-verify that checked IDs still exist in storage (e.g. if deleted externally)
      const groupIdsInStorage = new Set(tabGroups.map(g => g.id));
      selectedGroupIds.forEach(id => {
        if (!groupIdsInStorage.has(id)) selectedGroupIds.delete(id);
      });
      updateBulkActionsBar();

      // Render Dashboard Analytics
      let totalTabs = 0;
      tabGroups.forEach(g => totalTabs += g.tabs.length);
      
      const ramString = getRAMSaved(totalTabs);
      const topDomain = getTopDomain(tabGroups);

      // Header stats strip
      document.getElementById('stat-header-groups').textContent = tabGroups.length;
      document.getElementById('stat-header-tabs').textContent = totalTabs;
      document.getElementById('stat-header-ram').textContent = ramString;

      // Summary block panels
      document.getElementById('summary-active-groups').textContent = tabGroups.length;
      document.getElementById('summary-active-tabs').textContent = totalTabs;
      
      // Secondary mock metrics for visual alignment (Archive/Closed groups)
      document.getElementById('summary-archive-groups').textContent = Math.round(tabGroups.length * 1.5);
      document.getElementById('summary-archive-tabs').textContent = Math.round(totalTabs * 1.5);
      document.getElementById('summary-closed-groups').textContent = Math.round(tabGroups.length * 0.7);
      document.getElementById('summary-closed-tabs').textContent = Math.round(totalTabs * 0.7);

      const groupsDiv = document.getElementById('groups');
      groupsDiv.innerHTML = '';
      
      if (tabGroups.length === 0) {
        groupsDiv.innerHTML = '<div class="col-span-full text-slate-400 text-opacity-80 text-center py-12">No saved tab groups yet. Click "Save Current Tabs" to start.</div>';
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
        
        // Group Card Wrapper
        const card = document.createElement('div');
        card.className = 'glass-card flex flex-col p-5 relative overflow-visible';
        
        // Checkbox Overlay for Merge/Bulk selection
        if (selectModeActive) {
          const bulkCheck = document.createElement('input');
          bulkCheck.type = 'checkbox';
          bulkCheck.className = 'checkbox checkbox-primary checkbox-sm border-slate-500 rounded-md card-select-checkbox';
          bulkCheck.checked = selectedGroupIds.has(group.id);
          bulkCheck.onchange = (e) => {
            if (bulkCheck.checked) {
              selectedGroupIds.add(group.id);
            } else {
              selectedGroupIds.delete(group.id);
            }
            updateBulkActionsBar();
          };
          card.appendChild(bulkCheck);
        }

        // Header Panel (Title + Count + 3 dots menu)
        const header = document.createElement('div');
        header.className = 'flex justify-between items-start mb-4 select-none';
        if (selectModeActive) {
          header.classList.add('pl-7'); // Make room for select check mark
        }

        const titleWrapper = document.createElement('div');
        titleWrapper.className = 'flex flex-col truncate flex-1';
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'text-xs uppercase font-bold text-slate-300 tracking-wider truncate';
        titleSpan.innerHTML = highlightText(group.name || 'Saved Group', searchTerm);
        
        const subSpan = document.createElement('span');
        subSpan.className = 'text-[10px] text-slate-500 font-semibold mt-0.5';
        const formattedRelativeDate = getRelativeTime(group.date);
        subSpan.textContent = `${filteredTabs.length} tabs • ${formattedRelativeDate}`;
        
        titleWrapper.appendChild(titleSpan);
        titleWrapper.appendChild(subSpan);
        header.appendChild(titleWrapper);

        // Actions Context Dropdown Menu
        const dropdown = document.createElement('div');
        dropdown.className = 'dropdown dropdown-end flex-shrink-0';
        
        const dropTrigger = document.createElement('label');
        dropTrigger.tabIndex = 0;
        dropTrigger.className = 'btn btn-ghost btn-xs p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer';
        dropTrigger.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>';
        dropdown.appendChild(dropTrigger);

        const dropMenu = document.createElement('ul');
        dropMenu.tabIndex = 0;
        dropMenu.className = 'dropdown-content menu p-2 shadow-2xl bg-slate-900 border border-slate-800 rounded-lg w-36 text-xs gap-1 z-30';
        
        const restoreLi = document.createElement('li');
        restoreLi.innerHTML = '<a class="py-1.5 hover:text-indigo-400">Restore All</a>';
        restoreLi.onclick = () => restoreGroup(group, loadGroups);
        
        const renameLi = document.createElement('li');
        renameLi.innerHTML = '<a class="py-1.5 hover:text-indigo-400">Rename</a>';
        renameLi.onclick = () => {
          const renameModal = document.getElementById('rename-modal');
          const renameInput = document.getElementById('rename-input');
          renameInput.value = group.name || '';
          renameModal.dataset.groupId = group.id;
          renameModal.showModal();
          renameInput.focus();
        };

        const deleteLi = document.createElement('li');
        deleteLi.className = 'text-red-400 hover:text-red-300';
        deleteLi.innerHTML = '<a class="py-1.5 hover:bg-red-500/10">Delete Group</a>';
        deleteLi.onclick = () => deleteGroup(group.id, true, loadGroups);

        dropMenu.appendChild(restoreLi);
        dropMenu.appendChild(renameLi);
        dropMenu.appendChild(deleteLi);
        dropdown.appendChild(dropMenu);
        header.appendChild(dropdown);

        card.appendChild(header);

        card.onclick = (e) => {
          // Ignore clicks on controls to avoid conflicting actions
          if (e.target.closest('.dropdown') || e.target.closest('input[type="checkbox"]') || e.target.closest('button') || e.target.closest('.tab-grid-item')) {
            return; 
          }
          openDetailModal(group);
        };

        // Body Grid Layout of website favicon icon-blocks
        const gridContainer = document.createElement('div');
        gridContainer.className = 'tab-grid-container mt-auto';
        
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-4 gap-2.5';

        filteredTabs.forEach((tab) => {
          const tabBlock = document.createElement('div');
          tabBlock.className = 'tab-grid-item custom-tooltip-wrapper';
          
          let hostname = 'N/A';
          try { hostname = new URL(tab.url).hostname; } catch(e){}
          
          tabBlock.dataset.fullTitle = tab.title || hostname;
          tabBlock.onclick = () => chrome.tabs.create({ url: tab.url });

          const favicon = document.createElement('img');
          favicon.src = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`; // Request larger 32px favicons for clean icons
          favicon.alt = '';
          favicon.onerror = () => {
            favicon.src = 'icon16.png'; // Fallback if domain favicon fails
          };
          tabBlock.appendChild(favicon);

          const titleLabel = document.createElement('span');
          titleLabel.className = 'tab-title-text';
          
          // Try to clean/shorten names to match icons grid preview (e.g. Figma, GitHub, Stack Overflow)
          let displayName = tab.title || hostname;
          if (displayName.includes('-')) displayName = displayName.split('-')[0].trim();
          if (displayName.includes('|')) displayName = displayName.split('|')[0].trim();
          
          titleLabel.innerHTML = highlightText(displayName, searchTerm);
          tabBlock.appendChild(titleLabel);

          // Absolute overlay 'x' close button to delete single tab on hover
          const closeOverlay = document.createElement('button');
          closeOverlay.className = 'tab-item-delete-btn';
          closeOverlay.innerHTML = '&times;';
          closeOverlay.title = 'Delete Tab';
          closeOverlay.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (confirm(`Delete this tab? \n"${tab.title || tab.url}"`)) {
              deleteTabFromGroup(group.id, tab.url, loadGroups);
            }
          };
          tabBlock.appendChild(closeOverlay);

          grid.appendChild(tabBlock);
        });

        gridContainer.appendChild(grid);
        card.appendChild(gridContainer);
        groupsDiv.appendChild(card);
      });
    });
  } catch (error) {
    console.error('Error loading groups:', error);
    document.getElementById('groups').innerHTML = '<p class="text-error text-center col-span-full">Error loading groups dashboard.</p>';
  }
}

function highlightText(text, search) {
  if (!search) return text;
  const escapedSearch = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(${escapedSearch})`, 'gi');
  return text.replace(regex, '<span class="search-highlight">$1</span>');
}

// --- Selection & Merge Toggles ---

function toggleSelectMode() {
  selectModeActive = !selectModeActive;
  
  const btn = document.getElementById('bulkToggleBtn');
  if (selectModeActive) {
    btn.classList.add('btn-active', 'bg-indigo-600', 'text-white');
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg> Exit Selection';
  } else {
    btn.classList.remove('btn-active', 'bg-indigo-600', 'text-white');
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> Select & Merge';
    selectedGroupIds.clear();
    updateBulkActionsBar();
  }
  loadGroups();
}

function updateBulkActionsBar() {
  const bar = document.getElementById('bulk-actions-bar');
  const countSpan = document.getElementById('bulk-selected-count');
  const count = selectedGroupIds.size;
  
  countSpan.textContent = count;
  if (count > 0 && selectModeActive) {
    bar.classList.add('visible');
  } else {
    bar.classList.remove('visible');
  }
}

function bulkRestore() {
  const ids = Array.from(selectedGroupIds);
  getGroups((groups) => {
    const toRestore = groups.filter(g => ids.includes(g.id));
    toRestore.forEach(g => {
      try {
        g.tabs.forEach(tab => chrome.tabs.create({ url: tab.url, active: false }));
      } catch(e) { console.error('Error restoring tab:', e); }
    });
    
    chrome.storage.local.get('settings', (data) => {
      const settings = data.settings || {};
      if (settings.deleteOnRestore) {
        const updated = groups.filter(g => !ids.includes(g.id));
        saveGroups(updated, () => {
          selectedGroupIds.clear();
          updateBulkActionsBar();
          toggleSelectMode();
        });
      } else {
        selectedGroupIds.clear();
        updateBulkActionsBar();
        toggleSelectMode();
      }
    });
  });
}

function bulkMerge() {
  const ids = Array.from(selectedGroupIds);
  if (confirm(`Merge these ${ids.length} selected groups into one combined group?`)) {
    mergeGroups(ids, () => {
      selectedGroupIds.clear();
      updateBulkActionsBar();
      toggleSelectMode();
    });
  }
}

function bulkDelete() {
  const ids = Array.from(selectedGroupIds);
  if (confirm(`Are you sure you want to delete all ${ids.length} selected groups? This action cannot be undone.`)) {
    getGroups((groups) => {
      const updated = groups.filter(g => !ids.includes(g.id));
      saveGroups(updated, () => {
        selectedGroupIds.clear();
        updateBulkActionsBar();
        toggleSelectMode();
      });
    });
  }
}

function bulkCancel() {
  selectedGroupIds.clear();
  updateBulkActionsBar();
  toggleSelectMode();
}

// --- Quick Actions Implementation ---

function saveTabs() {
  const btn = document.getElementById('saveTabs');
  saveTabsAction(btn, (err) => {
    if (!err) {
      loadGroups();
    } else {
      alert('Failed to save tabs. Please see console.');
    }
  });
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
        let importedGroups = [];
        
        if (file.name.endsWith('.txt')) {
          importedGroups = parseTXTToGroups(content);
        } else if (file.name.endsWith('.csv')) {
          importedGroups = parseCSVToGroups(content);
        } else if (file.name.endsWith('.json')) {
          importedGroups = parseJSONToGroups(content);
        }
        
        if (importedGroups && importedGroups.length > 0) {
          let namePrompt = null;
          if (importedGroups.length === 1 && !importedGroups[0].name) {
            namePrompt = prompt('Enter a name for the imported group:', file.name.replace(/\.[^/.]+$/, ""));
          }
          
          getGroups((existingGroups) => {
            const updatedGroups = [...existingGroups];
            importedGroups.forEach((newGroup, idx) => {
              updatedGroups.push({
                id: newGroup.id || (Date.now() + idx),
                date: newGroup.date || new Date().toISOString(),
                name: newGroup.name || namePrompt || 'Imported Group',
                tabs: newGroup.tabs
              });
            });
            saveGroups(updatedGroups, loadGroups);
          });
        } else {
          alert('No valid tabs found in the selected file or invalid format.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  } catch (error) {
    console.error('Error importing tabs:', error);
    alert('An error occurred during import. Please check console.');
  }
}

function exportAll() {
  try {
    getGroups((tabGroups) => {
      if (tabGroups.length === 0) {
        alert('No groups to export.');
        return;
      }
      const csvString = exportToCSV(tabGroups);
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url,
        filename: `twotab_export_${new Date().toISOString().split('T')[0]}.csv`,
        saveAs: true
      });
    });
  } catch (error) {
    console.error('Error exporting tabs:', error);
    alert('Error exporting tabs. Check console.');
  }
}

// --- Detail Modal Implementation ---

function openDetailModal(group) {
  const modal = document.getElementById('detail-modal');
  const title = document.getElementById('detail-modal-title');
  const subtitle = document.getElementById('detail-modal-subtitle');
  const list = document.getElementById('detail-modal-list');
  const btnDeleteGroup = document.getElementById('detail-modal-delete-group');
  const btnOpenNew = document.getElementById('detail-modal-open-new');
  const btnOpenCurrent = document.getElementById('detail-modal-open-current');

  title.textContent = group.name || 'Saved Group';
  subtitle.textContent = `${group.tabs.length} tabs • ${getRelativeTime(group.date)}`;
  
  // Render tabs
  list.innerHTML = '';
  group.tabs.forEach((tab) => {
    const li = document.createElement('li');
    li.className = 'group flex items-center justify-between rounded-lg hover:bg-slate-800/60 p-2 transition-colors';
    
    let hostname = 'N/A';
    try { hostname = new URL(tab.url).hostname; } catch(e){}

    const a = document.createElement('a');
    a.href = tab.url;
    a.className = "flex items-center gap-3 flex-1 overflow-hidden cursor-pointer";
    a.onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: tab.url }); };

    const favicon = document.createElement('img');
    favicon.src = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    favicon.className = 'w-6 h-6 flex-shrink-0 bg-slate-900 rounded p-0.5';
    favicon.alt = "";
    favicon.onerror = () => { favicon.src = 'icon16.png'; };

    const textDiv = document.createElement('div');
    textDiv.className = 'flex flex-col flex-1 min-w-0 pr-2';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'text-sm text-slate-200 font-medium truncate';
    titleSpan.textContent = tab.title || hostname;
    
    const urlSpan = document.createElement('span');
    urlSpan.className = 'text-xs text-slate-500 truncate mt-0.5';
    urlSpan.textContent = tab.url;
    
    textDiv.appendChild(titleSpan);
    textDiv.appendChild(urlSpan);
    a.appendChild(favicon);
    a.appendChild(textDiv);
    
    // Delete individual tab
    const trashBtn = document.createElement('button');
    trashBtn.className = 'btn btn-ghost btn-sm text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0';
    trashBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>';
    trashBtn.title = "Delete Tab";
    trashBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete this tab? \n"${tab.title || tab.url}"`)) {
        deleteTabFromGroup(group.id, tab.url, () => {
          // Re-fetch group to update modal without closing
          getGroups((groups) => {
            const updatedGroup = groups.find(g => g.id === group.id);
            if (updatedGroup) {
              openDetailModal(updatedGroup); // Refresh modal
              loadGroups(); // Refresh background dashboard
            } else {
              modal.close();
              loadGroups();
            }
          });
        });
      }
    };
    
    li.appendChild(a);
    li.appendChild(trashBtn);
    list.appendChild(li);
  });

  // Actions
  btnDeleteGroup.onclick = () => {
    if (confirm(`Are you sure you want to delete this group?`)) {
      deleteGroup(group.id, false, () => {
        modal.close();
        loadGroups();
      });
    }
  };

  btnOpenNew.onclick = () => {
    chrome.windows.create({ url: group.tabs.map(t => t.url) }, () => {
      chrome.storage.local.get('settings', (data) => {
        if ((data.settings || {}).deleteOnRestore) {
          deleteGroup(group.id, false, () => {
            modal.close();
            loadGroups();
          });
        } else {
          modal.close();
        }
      });
    });
  };

  btnOpenCurrent.onclick = () => {
    restoreGroup(group, () => {
      modal.close();
      loadGroups();
    });
  };

  modal.showModal();
}