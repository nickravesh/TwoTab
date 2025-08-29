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
    document.getElementById('groups').innerHTML = '<p class="error">Error loading tabs. Please try again.</p>';
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
        groupsDiv.innerHTML = '<p class="empty">No saved groups.</p>';
        return;
      }
      
      tabGroups.forEach((group, index) => {
        const filteredTabs = searchTerm
          ? group.tabs.filter(tab => 
              tab.title?.toLowerCase().includes(searchTerm) || 
              tab.url?.toLowerCase().includes(searchTerm))
          : group.tabs;
        
        if (searchTerm && filteredTabs.length === 0) return;
        
        const groupDiv = document.createElement('div');
        groupDiv.className = 'collapse';
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = `group-${group.id}`;
        input.setAttribute('aria-label', `Toggle group ${group.name || `Group ${index + 1}`}`);
        groupDiv.appendChild(input);
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'collapse-title';
        
        const titleContent = document.createElement('div');
        titleContent.style.display = 'flex';
        titleContent.style.alignItems = 'center';
        titleContent.style.justifyContent = 'space-between';
        titleContent.style.width = '100%';
        
        const titleLabel = document.createElement('label');
        titleLabel.setAttribute('for', `group-${group.id}`);
        titleLabel.style.cursor = 'pointer';
        titleLabel.style.flex = '1';
        
        const date = new Date(group.date);
        const formattedDate = date.toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).replace(/,/, '').replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2');
        
        titleLabel.textContent = `${group.name || `Group ${index + 1}`} - ${formattedDate} (${filteredTabs.length} tabs)`;
        
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.marginLeft = '0.5rem';
        renameBtn.innerHTML = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg> Rename';
        renameBtn.setAttribute('aria-label', `Rename group ${group.name || `Group ${index + 1}`}`);
        renameBtn.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          renameGroup(group.id);
        };
        
        titleContent.appendChild(titleLabel);
        titleContent.appendChild(renameBtn);
        titleDiv.appendChild(titleContent);
        groupDiv.appendChild(titleDiv);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'collapse-content';
        
        const ul = document.createElement('ul');
        ul.className = 'tab-list';
        filteredTabs.forEach(tab => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = tab.url;
          a.textContent = tab.title || tab.url;
          a.onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: tab.url }); };
          li.appendChild(a);
          ul.appendChild(li);
        });
        contentDiv.appendChild(ul);
        
        const btnDiv = document.createElement('div');
        btnDiv.className = 'group-actions';
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'btn';
        restoreBtn.innerHTML = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9H9m4 5H9m1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l2.586-2.586z"></path></svg> Restore All';
        restoreBtn.setAttribute('aria-label', `Restore all tabs in group ${group.name || `Group ${index + 1}`}`);
        restoreBtn.onclick = () => restoreGroup(group);
        btnDiv.appendChild(restoreBtn);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn danger';
        deleteBtn.innerHTML = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg> Delete';
        deleteBtn.setAttribute('aria-label', `Delete group ${group.name || `Group ${index + 1}`}`);
        deleteBtn.onclick = () => deleteGroup(group.id);
        btnDiv.appendChild(deleteBtn);
        
        contentDiv.appendChild(btnDiv);
        groupDiv.appendChild(contentDiv);
        
        groupsDiv.appendChild(groupDiv);
      });
    });
  } catch (error) {
    console.error('Error loading groups:', error);
    document.getElementById('groups').innerHTML = '<p class="error">Error loading tabs. Please try again.</p>';
  }
}

function restoreGroup(group) {
  try {
    group.tabs.forEach(tab => chrome.tabs.create({ url: tab.url }));
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

function renameGroup(id) {
  try {
    const newName = prompt('Enter new group name:');
    if (newName) {
      chrome.storage.local.get('tabGroups', (data) => {
        const tabGroups = data.tabGroups || [];
        const group = tabGroups.find(g => g.id === id);
        if (group) {
          group.name = newName.trim();
          chrome.storage.local.set({ tabGroups }, loadGroups);
        }
      });
    }
  } catch (error) {
    console.error('Error renaming group:', error);
  }
}

function saveTabs() {
  try {
    const btn = document.getElementById('saveTabs');
    btn.classList.add('loading');
    chrome.runtime.sendMessage({ action: 'saveTabs' }, (response) => {
      btn.classList.remove('loading');
      if (response.status === 'success') {
        loadGroups();
      } else {
        console.error('Error saving tabs:', response.error);
      }
    });
  } catch (error) {
    console.error('Error saving tabs:', error);
  }
}

function viewAll() {
  try {
    chrome.tabs.create({ url: chrome.runtime.getURL('tabs.html') });
  } catch (error) {
    console.error('Error opening tabs page:', error);
  }
}

function importTabs() {
  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.csv';
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target.result;
        let newTabs = [];
        
        if (file.name.endsWith('.txt')) {
          newTabs = content.split('\n').filter(url => url.trim()).map(url => ({ title: url, url }));
        } else if (file.name.endsWith('.csv')) {
          const lines = content.split('\n').slice(1);
          lines.forEach(line => {
            const [groupId, date, title, url] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
            if (url) newTabs.push({ title, url });
          });
        }
        
        if (newTabs.length > 0) {
          chrome.storage.local.get('tabGroups', (data) => {
            const tabGroups = data.tabGroups || [];
            tabGroups.push({
              id: Date.now(),
              date: new Date().toISOString(),
              tabs: newTabs
            });
            chrome.storage.local.set({ tabGroups }, loadGroups);
          });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  } catch (error) {
    console.error('Error importing tabs:', error);
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
      const csvContent = ['Group ID,Date,Title,URL'];
      tabGroups.forEach(group => {
        group.tabs.forEach(tab => {
          const row = [
            group.id,
            group.date,
            `"${(tab.title || tab.url).replace(/"/g, '""')}"`,
            `"${tab.url.replace(/"/g, '""')}"`
          ];
          csvContent.push(row.join(','));
        });
      });
      const blob = new Blob([csvContent.join('\n')], { type: 'text/csv' });
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
    if (confirm('Clear all saved groups?')) {
      chrome.storage.local.set({ tabGroups: [] }, loadGroups);
    }
  } catch (error) {
    console.error('Error clearing groups:', error);
  }
}