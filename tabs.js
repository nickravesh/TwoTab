/**
 * TwoTab Full-Page Dashboard Script
 * Handles showing, searching, renaming, exporting, and importing all tab groups.
 */

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
    document.getElementById('clearAll').addEventListener('click', () => clearAll(true, loadGroups));

    // Listen for import trigger from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'triggerImport') {
        importTabs();
      }
    });

    // Add event listener for the modal's save button
    renameSaveBtn.addEventListener('click', (e) => {
      e.preventDefault(); // Stop the form from closing the modal immediately
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
    getGroups((tabGroups) => {
      const groupsDiv = document.getElementById('groups');
      groupsDiv.innerHTML = '';
      
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
        
        renameBtn.onclick = (e) => {
          e.stopPropagation(); // Stop the click from expanding the collapse
          e.preventDefault();
          const renameModal = document.getElementById('rename-modal');
          const renameInput = document.getElementById('rename-input');
          
          renameInput.value = group.name || '';
          renameModal.dataset.groupId = group.id; // Store the group ID on the modal
          renameModal.showModal();
          renameInput.focus();
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
          a.className = "flex items-start gap-3";
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
        deleteBtn.onclick = () => deleteGroup(group.id, true, loadGroups);
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

function saveTabs() {
  saveTabsAction(document.getElementById('saveTabs'), (err) => {
    if (!err) {
      loadGroups();
    } else {
      alert('Failed to save tabs. Please see the console for details.');
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
          // If single group and doesn't have custom name, prompt for one
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
    alert('An error occurred during import. Please check the console.');
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
    alert('Error exporting tabs. Check console for details.');
  }
}