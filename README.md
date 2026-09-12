<div align="center">

  <img src="public/icons/logo.svg" alt="TwoTab Logo" width="96" height="96" />

  # TwoTab

  **A privacy-first, ultra-lightweight tab manager and OneTab alternative for modern Chromium browsers.**

  [![Version](https://img.shields.io/badge/version-1.11.1-blue.svg)](package.json)
  [![Manifest V3](https://img.shields.io/badge/manifest-v3-success.svg)](wxt.config.ts)
  [![WXT + React](https://img.shields.io/badge/built%20with-WXT%20%2B%20React%2019-61dafb.svg)](https://wxt.dev)
  [![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue.svg)](tsconfig.json)
  [![Tests](https://img.shields.io/badge/tests-132%20passed-brightgreen.svg)](vitest.config.ts)
  [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
  [![Privacy](https://img.shields.io/badge/privacy-100%25%20local%20offline-orange.svg)](#-privacy--offline-guarantee)

</div>

---

## 📖 Overview

**TwoTab** is a high-performance, open-source Google Chrome extension designed to replace legacy tab hoarders. It instantly converts sprawling windows of open tabs into structured, searchable collections—saving up to **95% of system memory** while giving you powerful tools to inspect, organize, verify, and export your tabs.

TwoTab is built on modern web standards with **Manifest V3**, **WXT**, **React 19**, **TypeScript**, **Tailwind CSS**, and **shadcn/ui (Radix primitives)**.

---

## ✨ Key Features

### ⚡ 1-Click Capture & Dormant Tab Restoration
- **Instant Memory Relief**: Condense dozens or hundreds of tabs into clean collections with a single click or keyboard shortcut.
- **Zero-Bandwidth Dormant Restores**: Restore massive tab collections instantly as lightweight placeholder tabs that load zero network resources and consume virtually zero RAM until you activate them.

### 🔍 Link Health & Dead Link Inspector
- **Background Crawler Engine**: Proactively scans saved collections to discover broken URLs (404s, DNS failures, expired hostnames) and redirects.
- **Rate-Limited Scheduler**: Gentle background queue throttles network traffic to prevent server rate limiting.
- **Offline Network Guardian**: Automatically pauses link scanning during network dropouts and seamlessly resumes when connectivity is re-established.
- **Batch Resolution**: One-click actions to automatically update redirected URLs, quarantine broken links into dedicated archive groups, or permanently purge dead tabs.

### 🧹 Intelligent Deduplication Engine
- **Fuzzy URL Normalization**: Strips tracking tokens, anchor fragments, trailing slashes, and protocol differences to detect true duplicate links.
- **Batch Deduplication**: Clear identical tabs across collections in seconds with configurable strategies (*Keep Oldest* vs. *Keep Newest*).
- **Safety Snapshots**: Every deduplication or batch action captures an automated safety snapshot before executing.

### 🏷️ Native Chrome Tab Groups & Organization
- **Native Group Restoration**: Reopen saved collections directly as native colored Chrome Tab Groups.
- **Color Tagging Spectrum**: Categorize collections with 10 distinct color hues (Slate, Blue, Purple, Pink, Red, Orange, Amber, Emerald, Cyan, or Untagged).
- **Multi-Filter & 7-Mode Sorting**: Filter dynamically by one or multiple color tags, or sort collections by Date (Newest/Oldest), Tab Count, Title (A-Z/Z-A), or Color Spectrum.

### 🗂️ Card Workspace & Spatial FLIP Animations
- **Morphing Inspector Modal**: Cards seamlessly expand into centered modal workspaces with Apple-grade spatial FLIP animations.
- **Domain Filter Chips**: Scrollable domain pills with live counters to isolate tabs from specific domains (e.g. `github.com`, `youtube.com`).
- **Drag & Drop Reordering**: Rearrange tabs smoothly within a group.
- **Batch Selection**: Select multiple tabs to delete or extract into a brand-new tab group atomically.

### 📦 Multi-Format Data Hub (Import & Export)
- **Export Formats**:
  - **JSON**: Full-fidelity state backup including groups, archives, recently closed tabs, and settings.
  - **Markdown (`.md`)**: Formatted hierarchical outlines with clickable links ready for Obsidian, Notion, or Bear.
  - **HTML Bookmarks (`.html`)**: Standard Netscape bookmark file format compatible with Chrome, Firefox, Safari, and Edge.
  - **CSV Spreadsheet (`.csv`)**: Tabular exports for Excel or Google Sheets.
  - **OneTab Plain Text (`.txt`)**: URL and title lists compatible with OneTab.
- **Smart Importer**: Schema validation, automatic group ID deduplication, and safe migration handling.

### 🎨 Curated Design System & View Transitions
- **7 Hand-Crafted Themes**:
  - *Dark*: Studio Indigo, Midnight Obsidian, Cyber Emerald.
  - *Light*: Paper Linen, Glacier Frost, Porcelain Rosé, Sunset Amber.
- **Circular Ripple Transitions**: Smooth circular clip-path wave reveals when toggling themes, driven by modern browser View Transitions.

### 🛡️ Privacy & Offline Guarantee
- **100% Local**: TwoTab runs entirely inside your browser using `chrome.storage.local`.
- **Zero Telemetry**: No external analytics, no user tracking, no third-party scripts, and no external servers.

---

## ⌨️ Keyboard Shortcuts

| Shortcut (Mac) | Shortcut (Windows/Linux) | Action |
| :--- | :--- | :--- |
| <kbd>⌘</kbd> + <kbd>S</kbd> | <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save and close all tabs in the active window |
| <kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>S</kbd> | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | Save and close tabs across all open windows |
| <kbd>⌘</kbd> + <kbd>⌥</kbd> + <kbd>S</kbd> | <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>S</kbd> | Stash only the currently active tab |

---

## 🏗️ Project Architecture

```text
TwoTab/
├── docs/                       # Architectural guides and documentation
│   ├── architecture.md         # Component sandbox hierarchy and messaging
│   ├── data_schema.md          # Storage schema, JSON, CSV, and export formats
│   ├── features.md             # In-depth functional guide and feature breakdown
│   └── known_issues.md         # Resolved issues and changelog
├── public/                     # Static extension assets (icons, logo)
├── src/
│   ├── assets/                 # Global styles and Tailwind CSS tokens
│   ├── components/             # Reusable UI primitives (shadcn / Radix)
│   ├── entrypoints/
│   │   ├── background.ts       # Service worker (capture, alarms, link scanner)
│   │   ├── dormant/            # Zero-bandwidth dormant tab restoration harness
│   │   ├── popup/              # Compact toolbar popup panel (React 19)
│   │   └── tabs/               # Full-canvas management dashboard & Tools Hub
│   ├── hooks/                  # Custom React hooks (storage, themes, viewport)
│   └── lib/                    # Storage engine, deduplication, link health scanner
├── package.json
├── tsconfig.json
├── vitest.config.ts            # Test harness configuration (132 tests)
└── wxt.config.ts               # WXT extension configuration & Manifest V3
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher

### Installation & Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/nickravesh/TwoTab.git
   cd TwoTab
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server with live reload:**
   ```bash
   npm run dev
   ```
   WXT will compile the extension in development mode with Hot Module Replacement (HMR).

4. **Build for production:**
   ```bash
   npm run build
   ```
   This generates the optimized, production-ready extension in `.output/chrome-mv3`.

---

## 🔌 Loading in Google Chrome / Chromium

1. Open Google Chrome (or any Chromium browser: Brave, Edge, Opera, Vivaldi).
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** via the toggle switch in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the **`.output/chrome-mv3`** directory generated inside the `TwoTab` folder.

> [!NOTE]
> Do not select the repository root folder. Chrome requires the compiled directory containing the generated `manifest.json` located at `.output/chrome-mv3`.

---

## 🧪 Testing & Quality Assurance

TwoTab maintains a comprehensive testing and static verification pipeline:

```bash
# Run TypeScript semantic typecheck + all Vitest unit and DOM smoke tests
npm test

# Run TypeScript semantic check only
npm run typecheck

# Package the extension into a zip archive for distribution
npm run zip
```

---

## 📚 Detailed Documentation

For in-depth developer references and technical specifications:
- 🏛️ [System Architecture](docs/architecture.md) — Sandbox boundaries, event lifecycle, and background messaging.
- 💾 [Data Schema & Storage Engine](docs/data_schema.md) — JSON storage layouts, CSV export schemas, and serialization algorithms.
- 🌟 [Feature & User Guide](docs/features.md) — Comprehensive functional breakdown of all features.
- 📋 [Changelog & Resolved Gaps](docs/known_issues.md) — History of resolved improvements and optimizations.

---

## 📄 License

This project is licensed under the terms of the **GNU General Public License v3.0** ([GPL-3.0](LICENSE)).
