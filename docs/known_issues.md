# TwoTab Changelog & Resolved Gaps

This document tracks resolved architectural improvements, bug fixes, and feature integrations. All major issues and gaps identified during the initial code review have been fully addressed.

---

## ✅ Resolved Gaps & Improvements

### 1. Messaging Bridge: `triggerImport` (Fixed)
- **Problem**: Clicking "Import" in the popup would open the dashboard page but fail to launch the file picker because the messaging channel was not set up in the dashboard script.
- **Resolution**: Implemented a `chrome.runtime.onMessage` listener in [tabs.js](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/tabs.js) to catch the `{ action: "triggerImport" }` event and automatically invoke the file selection window.

### 2. Naive CSV Parsing (Fixed)
- **Problem**: Commas in page titles would break the tab restoration process due to simple `.split(',')` behavior.
- **Resolution**: Created a quote-respecting CSV line parser (`parseCSV`) in [utils.js](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/utils.js) that handles quoted strings and escaped double quotes (`""`). It also automatically maps groups, dates, names, titles, and URLs if a header is present.

### 3. Missing JSON Import (Fixed)
- **Problem**: Although `.json` was in the file filter, selecting it would fail silently with no operations run.
- **Resolution**: Added a JSON validator and parser (`parseJSONToGroups`) in [utils.js](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/utils.js) that safely handles raw group arrays, parses them, validates titles and URLs, and imports them.

### 4. Code Duplication & Storage Architecture (Fixed)
- **Problem**: Redundant operations (`restoreGroup`, `saveTabs`, `deleteGroup`, storage getters/setters) were duplicated across `popup.js` and `tabs.js`.
- **Resolution**: Extracted all data management, storage operations, and file parsing algorithms into a unified [utils.js](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/utils.js) shared library. Both [popup.html](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/popup.html) and [tabs.html](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/tabs.html) now load `utils.js` before executing their logic.

### 5. UI/UX Renaming & Deletions (Fixed)
- **Problem**: Renaming was not possible from the popup toolbar, and group deletions in the popup occurred immediately without verification.
- **Resolution**: 
  - Added a responsive modal dialogue inside [popup.html](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/popup.html) matching the dashboard style to enable group renaming from the popup script.
  - Linked delete operations in the popup to the shared `deleteGroup` function with delete confirmations enabled (`deleteGroup(id, true, loadGroups)`).

### 6. Popup List Limit warning (Fixed)
- **Problem**: The popup only lists the 10 most recent groups, which could confuse users who have saved more groups.
- **Resolution**: Added a warning notice at the footer of [popup.html](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/popup.html) that appears automatically if the total group count exceeds 10.
