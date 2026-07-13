# TwoTab - Simple Tab Saver with Backups

TwoTab is a privacy-first, lightweight Google Chrome browser extension designed to replace OneTab. It allows users to quickly save all open tabs in a window, store them locally, search and organize them, and export/import them anytime.

---

## 🛠️ File Structure

The project is structured as follows:

- [manifest.json](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/manifest.json) — Extension manifest (Manifest V3) declaring metadata, permissions, background scripts, UI pages, and accessible resources.
- [background.js](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/background.js) — The extension service worker that executes in the background to handle tab capture, closing, and automatic backups.
- [popup.html](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/popup.html) & [popup.js](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/popup.js) — The toolbar popup panel (compact UI) showing the 10 most recent saved groups.
- [tabs.html](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/tabs.html) & [tabs.js](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/tabs.js) — The full-page dashboard (options page) displaying all saved groups, allowing search, renames, imports, and exports.
- [daisyui.css](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/daisyui.css) — Stylings from DaisyUI and Tailwind CSS utilized by the extension popups and options dashboard.
- `icon16.png`, `icon48.png`, `icon100.png` — Logo assets in various dimensions.

---

## 📚 Detailed Documentation

We have established a comprehensive set of documentation files to serve as the authoritative source of truth for the codebase:

1. 🏛️ **[System Architecture](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/docs/architecture.md)**
   - Sandbox environments, component hierarchy, messaging flowcharts, and external API usage details.
2. 💾 **[Data Schema & Backups](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/docs/data_schema.md)**
   - Local storage JSON specification, CSV layout structures, and export formats.
3. 🌟 **[Feature & User Guide](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/docs/features.md)**
   - Step-by-step functionality breakdowns for saving, searching, restoring, renaming, and backing up tabs.
4. ⚠️ **[Known Issues & Gaps](file:///Users/ali/Documents/Programming/MyGitHub/TwoTab/docs/known_issues.md)**
   - Critical developer notes on bugs (such as the unimplemented `triggerImport` receiver), naive parsing behaviors, and code duplications that should be prioritized in upcoming development sprints.

---

## 🚀 Getting Started

### Installation in Developer Mode
1. Clone or download this repository.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the root folder of this project (`TwoTab`).

### Usage Overview
- Click the TwoTab icon in your extension bar to open the popup.
- Click **Save Tabs** to save your current open tabs into a group.
- Click **View All** to open the full dashboard page where you can search, rename, import/export, and clear saved groups.
