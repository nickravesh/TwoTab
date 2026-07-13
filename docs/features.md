# TwoTab Features & User Guide

This document describes the user-facing features of **TwoTab** and explains how they are implemented under the hood.

---

## 1. Save Current Tabs
- **Description**: Captures all open, non-pinned, non-extension tabs in the current window, saves them as a group, opens a new tab page, and closes the saved tabs.
- **UI Element**:
  - Popup: `Save Tabs` button (`#saveTabs` in [popup.html](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/popup.html))
  - Full Page: `Save Current Tabs` button (`#saveTabs` in [tabs.html](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/tabs.html))
- **Implementation**:
  - Calls `saveTabs()` in UI script, which sends `{ action: 'saveTabs' }` to [background.js](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/background.js).
  - Background queries current window tabs, filters out pinned tabs and pages starting with `chrome-extension://`.
  - Appends to `tabGroups` in local storage.
  - Automatically triggers backup downloads (`TwoTab_newgroup_*.txt` and `TwoTab_fullbackup_*.csv`).
  - Opens `chrome://newtab` in the window and closes the original non-pinned tabs.

---

## 2. View Saved Groups & Search
- **Description**: Displays saved tab groups in descending chronological order. Users can search for specific tabs by typing in the search bar.
- **UI Element**:
  - Popup: Lists up to 10 most recent groups in a scrollable container (`#groups`). Search input (`#search`).
  - Full Page: Lists all groups in a large list. Search input (`#search`).
- **Implementation**:
  - Handled by `loadGroups()` in [popup.js](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/popup.js) and [tabs.js](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/tabs.js).
  - Filter logic checks if the search string is present in either the tab's `title` or `url` (case-insensitive).
  - Rendered using DaisyUI collapsible elements.

---

## 3. Rename Group
- **Description**: Allows naming a tab group to make it easier to find and organize.
- **UI Element**:
  - Full Page: "Rename" button on the collapsible title bar which opens a DaisyUI modal (`#rename-modal`).
- **Implementation**:
  - Handled in [tabs.js](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/tabs.js) (lines 93–108). Clicking the button sets the group ID on the modal dataset (`renameModal.dataset.groupId = group.id`) and opens the modal via `renameModal.showModal()`.
  - Clicking "Save" in the modal updates the `name` field of the group in `chrome.storage.local` and reloads.
- **Note**: The Popup UI does not currently support renaming groups, but displays custom names if they have been set on the Full Page.

---

## 4. Restore Group
- **Description**: Opens all tabs in a group in the background.
- **UI Element**:
  - Popup & Full Page: "Restore" / "Restore All" button inside each group's collapsed container.
- **Implementation**:
  - Iterates through the group's tabs array:
    ```javascript
    group.tabs.forEach(tab => chrome.tabs.create({ url: tab.url, active: false }));
    ```

---

## 5. Delete Group
- **Description**: Deletes a specific tab group from local storage.
- **UI Element**:
  - Popup & Full Page: "Delete" button inside each group's collapsed container.
- **Implementation**:
  - Handled by `deleteGroup(id)` in UI scripts.
  - Filters out the group with matching `id` from the array and updates local storage.
  - On the Full Page, a native confirmation prompt (`confirm(...)`) is displayed to prevent accidental deletion.

---

## 6. Import Tabs
- **Description**: Imports tab groups from a local `.txt` or `.csv` backup file.
- **UI Element**:
  - Popup & Full Page: "Import" button.
- **Implementation**:
  - Opens options page `tabs.html` (if clicked from popup) and allows selecting a file.
  - Uses `FileReader` to read the text contents.
  - Parses the file based on its extension (`.txt` or `.csv`).
  - Prompts the user for a group name, then pushes the new group to `chrome.storage.local` and updates the UI.

---

## 7. Export All Tabs
- **Description**: Downloads a `.csv` backup of all currently saved groups.
- **UI Element**:
  - Popup & Full Page: "Export" / "Export All" button.
- **Implementation**:
  - Opens options page `tabs.html` (if clicked from popup).
  - Collects all tab groups from local storage and formats them into a single CSV string with fields: `Group ID,Group Name,Date,Title,URL`.
  - Triggers a file download with naming format `twotab_export_YYYY-MM-DD.csv`.

---

## 8. Clear All Saved Tabs
- **Description**: Deletes all saved groups from local storage.
- **UI Element**:
  - Popup & Full Page: "Clear All" button.
- **Implementation**:
  - Asks for user confirmation via `confirm(...)`.
  - Sets the storage key `tabGroups` to an empty array `[]` and refreshes the view.
