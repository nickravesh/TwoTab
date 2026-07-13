/**
 * Shared utility functions for TwoTab Chrome Extension
 * Storage management, file parsing, and background messaging wrappers.
 */

// --- Storage Management Helpers ---

function getGroups(callback) {
  chrome.storage.local.get('tabGroups', (data) => {
    callback(data.tabGroups || []);
  });
}

function saveGroups(groups, callback) {
  chrome.storage.local.set({ tabGroups: groups }, () => {
    if (callback) callback();
  });
}

function deleteGroup(id, showConfirm, callback) {
  if (showConfirm && !confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
    return;
  }
  getGroups((groups) => {
    const updated = groups.filter(g => g.id !== id);
    saveGroups(updated, callback);
  });
}

function restoreGroup(group) {
  try {
    group.tabs.forEach(tab => chrome.tabs.create({ url: tab.url, active: false }));
  } catch (error) {
    console.error('Error restoring group:', error);
  }
}

function clearAll(showConfirm, callback) {
  if (showConfirm && !confirm('Are you sure you want to delete ALL saved groups? This action cannot be undone.')) {
    return;
  }
  saveGroups([], callback);
}

// --- Background Action Wrappers ---

function saveTabsAction(btnElement, callback) {
  try {
    if (btnElement) {
      btnElement.classList.add('loading');
      btnElement.disabled = true;
    }
    chrome.runtime.sendMessage({ action: 'saveTabs' }, (response) => {
      if (btnElement) {
        btnElement.classList.remove('loading');
        btnElement.disabled = false;
      }
      if (response && response.status === 'success') {
        if (callback) callback(null);
      } else {
        const errMsg = response ? response.message || response.error : 'No response from background';
        console.error('Error saving tabs:', errMsg);
        if (callback) callback(new Error(errMsg));
      }
    });
  } catch (error) {
    console.error('Error sending saveTabs message:', error);
    if (btnElement) {
      btnElement.classList.remove('loading');
      btnElement.disabled = false;
    }
    if (callback) callback(error);
  }
}

// --- File Parsers & Exporters ---

/**
 * Standard CSV Line Parser respecting double quotes and escaped quotes
 */
function parseCSV(content) {
  const lines = content.split(/\r?\n/);
  const results = [];
  
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }
  
  lines.forEach(line => {
    if (!line.trim()) return;
    results.push(parseCSVLine(line));
  });
  
  return results;
}

/**
 * Parses CSV text content into TabGroup structure
 */
function parseCSVToGroups(content) {
  const rows = parseCSV(content);
  if (rows.length === 0) return [];
  
  const header = rows[0].map(cell => cell.toLowerCase().trim().replace(/\s+/g, ''));
  let hasGroups = false;
  let urlIdx = -1;
  let titleIdx = -1;
  let idIdx = -1;
  let dateIdx = -1;
  let nameIdx = -1;
  
  if (header.includes('url') || header.includes('urlid')) {
    urlIdx = header.indexOf('url');
    titleIdx = header.indexOf('title');
    idIdx = header.includes('groupid') ? header.indexOf('groupid') : (header.includes('group_id') ? header.indexOf('group_id') : -1);
    dateIdx = header.indexOf('date');
    nameIdx = header.includes('groupname') ? header.indexOf('groupname') : (header.includes('group_name') ? header.indexOf('group_name') : -1);
    hasGroups = idIdx !== -1;
    rows.shift(); // remove header
  } else {
    // No header found, default to simple format
    urlIdx = 1;
    titleIdx = 0;
  }
  
  if (hasGroups) {
    const groupsMap = {};
    rows.forEach(row => {
      const idVal = row[idIdx] ? row[idIdx].trim() : '';
      if (!idVal) return;
      const id = parseInt(idVal) || Date.now();
      const date = row[dateIdx] ? row[dateIdx].trim() : new Date().toISOString();
      const name = nameIdx !== -1 && row[nameIdx] ? row[nameIdx].trim() : '';
      const url = row[urlIdx] ? row[urlIdx].trim() : '';
      const title = row[titleIdx] ? row[titleIdx].trim() : url;
      
      if (url && url.startsWith('http')) {
        if (!groupsMap[id]) {
          groupsMap[id] = {
            id: id,
            date: date,
            name: name || undefined,
            tabs: []
          };
        }
        groupsMap[id].tabs.push({ title, url });
      }
    });
    return Object.values(groupsMap);
  } else {
    // Single group fallback
    const tabs = [];
    rows.forEach(row => {
      const url = row[urlIdx] ? row[urlIdx].trim() : (row[0] ? row[0].trim() : '');
      const title = row[titleIdx] ? row[titleIdx].trim() : url;
      if (url && url.startsWith('http')) {
        tabs.push({ title, url });
      }
    });
    if (tabs.length === 0) return [];
    return [{
      id: Date.now(),
      date: new Date().toISOString(),
      tabs: tabs
    }];
  }
}

/**
 * Parses JSON text content into TabGroup structure
 */
function parseJSONToGroups(content) {
  try {
    const data = JSON.parse(content);
    let rawGroups = [];
    if (Array.isArray(data)) {
      rawGroups = data;
    } else if (data && Array.isArray(data.tabGroups)) {
      rawGroups = data.tabGroups;
    } else {
      throw new Error("JSON structure must be an array of groups or contain a 'tabGroups' array.");
    }
    
    const validatedGroups = [];
    rawGroups.forEach((g, idx) => {
      if (g && Array.isArray(g.tabs)) {
        const tabs = g.tabs
          .filter(t => t && t.url && t.url.trim().startsWith('http'))
          .map(t => ({ title: (t.title || t.url).trim(), url: t.url.trim() }));
        if (tabs.length > 0) {
          validatedGroups.push({
            id: g.id && typeof g.id === 'number' ? g.id : Date.now() + idx,
            date: g.date && typeof g.date === 'string' ? g.date : new Date().toISOString(),
            name: g.name && typeof g.name === 'string' ? g.name.trim() : undefined,
            tabs: tabs
          });
        }
      }
    });
    return validatedGroups;
  } catch (e) {
    console.error("JSON parsing error:", e);
    return null;
  }
}

/**
 * Parses TXT text content (one URL per line) into TabGroup structure
 */
function parseTXTToGroups(content) {
  const urls = content.split(/\r?\n/).map(line => line.trim()).filter(line => line && line.startsWith('http'));
  if (urls.length === 0) return [];
  const tabs = urls.map(url => ({ title: url, url }));
  return [{
    id: Date.now(),
    date: new Date().toISOString(),
    tabs: tabs
  }];
}

/**
 * Formats TabGroups to a standard RFC 4180-compliant CSV string
 */
function exportToCSV(tabGroups) {
  const csvContent = ['Group ID,Group Name,Date,Title,URL'];
  tabGroups.forEach(group => {
    const groupName = group.name || '';
    group.tabs.forEach(tab => {
      const row = [
        group.id,
        `"${groupName.replace(/"/g, '""')}"`,
        group.date,
        `"${(tab.title || tab.url).replace(/"/g, '""')}"`,
        `"${tab.url.replace(/"/g, '""')}"`
      ];
      csvContent.push(row.join(','));
    });
  });
  return csvContent.join('\n');
}
