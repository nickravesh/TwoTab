# TwoTab Features & User Guide

This document describes the complete feature suite of **TwoTab** (v1.10.0+) and explains how operations are designed and executed.

---

## 1. 1-Click Window & Tab Capture
- **Description**: Instantly captures open browser tabs into clean, organized collections while saving up to 95% of system memory.
- **Capture Modes**:
  - **Save Window** (`⌘S` / `Ctrl+S`): Saves all active tabs in the current window.
  - **Save All Windows** (`⌘⇧S` / `Ctrl+Shift+S`): Captures tabs across every open browser window into separate collections.
  - **Save Active Tab Only** (`⌘⌥S` / `Ctrl+Alt+S`): Stashes just the current tab into a saved collection.
- **Implementation**:
  - Background service worker filters out pinned tabs (if protected in Settings), internal chrome extensions, and blank pages.
  - Saves groups atomically to Chrome's local storage engine with automatic mutex queuing.

---

## 2. Tab Group Inspector & Modal Workspace
- **Description**: A full-featured workspace for inspecting, organizing, and modifying specific tab collections with Apple-grade spatial FLIP animations.
- **Capabilities**:
  - **Spatial FLIP Morphing**: Cards seamlessly expand into centered modal workspaces directly from their bounding boxes on the dashboard grid.
  - **Domain Filter Pills**: Scrollable domain chips with edge-dissolve masks and live counters isolate tabs belonging to specific websites (e.g. `github.com`, `youtube.com`).
  - **Tab Drag & Drop Reordering**: Reorder tabs smoothly within the group.
  - **Inline URL Adding**: Add new links directly to a collection without leaving the modal.
  - **Batch Selection & Extraction**: Use checkboxes to select multiple tabs for bulk deletion or atomic extraction into a brand-new tab group.
  - **Single-Group Exporters**: Export specific collections as formatted Markdown outlines or OneTab plain text.
  - **In-Modal Confirmation Dialogs**: Nested deletion dialogues prevent abrupt modal dismissals.

---

## 3. Color Tagging & Multi-Filter Engine
- **Description**: Tag collections with distinct color accents and filter collections dynamically.
- **Color Hues**: Slate (`grey`), Blue, Purple, Pink, Red, Orange, Amber (`yellow`), Emerald (`green`), Cyan, and Untagged (`none`).
- **Dashboard Multi-Filter**:
  - Multi-select dropdown in the top bar action cluster allowing users to check one or multiple color tags simultaneously.
  - Live collection count badges for each color tag.
  - Quick "Clear all" filter shortcut.

---

## 4. 7-Mode Sorting Suite
- **Description**: Sort collections across multiple dimensions right from the top bar:
  1. **Newest First** (`date-desc`) [Default]
  2. **Oldest First** (`date-asc`)
  3. **Most Tabs** (`tabs-desc`)
  4. **Fewest Tabs** (`tabs-asc`)
  5. **Alphabetical Name (A → Z)** (`title-asc`)
  6. **Reverse Alphabetical Name (Z → A)** (`title-desc`)
  7. **Color Tag Spectrum Order** (`color`)
- **Typography**: High-contrast, dynamic hover and focus styling compliant with WCAG accessibility guidelines.

---

## 5. Native Chrome Tab Group Restoration
- **Description**: Reopen saved collections directly as native colored Chrome Tab Groups.
- **Usage**:
  - Click the dropdown arrow next to **Restore** on any card or inspector workspace, and choose **"Restore as Chrome Tab Group"**.
  - Chrome will automatically recreate the tab strip group with your custom group title and color tag.

---

## 6. Multi-Format Data Hub (Export & Import)
- **Exporters**:
  - **JSON Backup**: Complete full-fidelity backup of groups, archives, recently closed tabs, and settings.
  - **Markdown Outline (`.md`)**: Structured hierarchical outlines with clickable links for Obsidian, Notion, and Bear.
  - **HTML Bookmarks (`.html`)**: Standard Netscape bookmark file format importable into Chrome, Firefox, Safari, and Edge.
  - **CSV Spreadsheet (`.csv`)**: Tabular exports for Excel, Google Sheets, or data analytics.
  - **OneTab Plain Text (`.txt`)**: URL | Title list compatible with OneTab.
- **Importers**:
  - Smart JSON file importer with automatic schema migration and duplicate group ID deduplication.
  - OneTab text parser supporting both **Merge** and **Replace** modes with markdown link parsing.

---

## 7. Automated Rolling Backups & Emergency Safeguards
- **6-Hour Snapshot Alarm**: Background alarm automatically captures rolling snapshots every 6 hours (retaining the 5 most recent unique snapshots).
- **Emergency Wipe Snapshot**: Right before executing "Clear All Data", TwoTab automatically captures an internal emergency snapshot so accidental data wipes can always be recovered.

---

## 8. Curated Theme System & View Transitions
- **7 Hand-Tuned Themes**:
  - Dark: Studio Indigo, Midnight Obsidian, Cyber Emerald.
  - Light: Paper Linen, Glacier Frost, Porcelain Rosé, Sunset Amber.
- **Circular Ripple View Transitions**: Smooth circular clip-path wave reveals when switching palettes, tuned with balanced easing curves and storage event guarding.

---

## 9. 100% Offline Local Privacy
- Operates entirely within your local browser storage (`chrome.storage.local`).
- Zero external network requests, zero telemetry, zero trackers, and zero cloud dependencies.
