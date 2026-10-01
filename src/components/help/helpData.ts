// =============================================================================
// TwoTab Knowledge Center Data Model & Content Architecture (v1.15.0)
// =============================================================================

export type HelpCategoryKey = 
  | 'all'
  | 'getting-started'
  | 'organization'
  | 'power-tools'
  | 'performance'
  | 'privacy-backups'
  | 'faq';

export interface HelpCategory {
  id: HelpCategoryKey;
  label: string;
  shortDescription: string;
  iconName: string;
}

export interface HelpGuide {
  id: string;
  category: HelpCategoryKey;
  title: string;
  badge?: string;
  summary: string;
  whatItDoes: string;
  howItWorks: string;
  whatToExpect: string;
  steps?: string[];
  proTip?: string;
  actionLabel?: string;
  actionTarget?: 'dashboard' | 'archive' | 'closed' | 'tools' | 'settings' | 'help';
  keywords: string[];
}

export interface ShortcutItem {
  id: string;
  category: 'Capture' | 'Navigation' | 'Inspector & Modals';
  action: string;
  macKey: string;
  winKey: string;
  description: string;
}

export interface ContextMenuGuide {
  id: string;
  title: string;
  trigger: string;
  behavior: string;
  benefit: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  steps?: string[];
  category: HelpCategoryKey;
  keywords: string[];
}

// -----------------------------------------------------------------------------
// Category Definitions
// -----------------------------------------------------------------------------

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'all',
    label: 'All Topics',
    shortDescription: 'Browse the complete TwoTab knowledge directory',
    iconName: 'BookOpen',
  },
  {
    id: 'getting-started',
    label: 'Getting Started',
    shortDescription: '1-click stashing, window capture modes, and quick restoration',
    iconName: 'Zap',
  },
  {
    id: 'organization',
    label: 'Tab Organization',
    shortDescription: 'Inspector workspace, 9 color tags, 7-mode sorting, and search',
    iconName: 'Sparkles',
  },
  {
    id: 'power-tools',
    label: 'Power Tools Hub',
    shortDescription: 'Link health audit, duplicate cleaner, domain sorter, and stale tabs',
    iconName: 'SlidersHorizontal',
  },
  {
    id: 'performance',
    label: 'Performance & Dormant Tabs',
    shortDescription: 'Zero-bandwidth dormant tabs restoration and memory savings',
    iconName: 'Cpu',
  },
  {
    id: 'privacy-backups',
    label: 'Backups & 100% Privacy',
    shortDescription: 'Local-first offline storage, rolling 6h snapshots, and multi-format exports',
    iconName: 'Lock',
  },
  {
    id: 'faq',
    label: 'Troubleshooting & FAQ',
    shortDescription: 'Common questions, migration guides, and emergency recovery',
    iconName: 'HelpCircle',
  },
];

// -----------------------------------------------------------------------------
// Core Guides & Topic Modules
// -----------------------------------------------------------------------------

export const HELP_GUIDES: HelpGuide[] = [
  // Getting Started
  {
    id: 'window-capture-modes',
    category: 'getting-started',
    title: '1-Click Window Capture & Save Modes',
    badge: 'Foundational',
    summary: 'Stash all open tabs in your active browser window into a clean, dated collection with a single click or keyboard shortcut.',
    whatItDoes: 'Instantly moves open browser tabs from your browser window into TwoTab, freeing up hundreds of megabytes of RAM while keeping your tabs safely preserved.',
    howItWorks: 'Click "Save Window" on the dashboard or extension popup, or press ⌘S (Ctrl+S). TwoTab queries your open tabs, snapshots their titles and URLs into local storage, and closes the tabs in Chrome.',
    whatToExpect: 'Your open tabs close cleanly, leaving a single TwoTab dashboard tab. A new collection card appears at the top of your dashboard displaying the exact tab count, timestamp, and domain breakdown.',
    steps: [
      'Click the TwoTab extension icon in your Chrome toolbar, or open the TwoTab dashboard.',
      'Click "Save Window" to capture the current window, or click the split arrow for more options:',
      '"Save All Windows" (⌘⇧S): Stashes every open browser window into individual collections simultaneously.',
      '"Save Active Tab" (⌘⌥S): Stashes only the webpage you are currently reading into a recent collection.',
    ],
    proTip: 'Pinned tabs (like email, music, or messaging apps) are automatically protected and left untouched by default. You can adjust this in Settings.',
    actionLabel: 'Go to Dashboard',
    actionTarget: 'dashboard',
    keywords: ['save', 'window', 'capture', 'stash', 'shortcut', 'cmd+s', 'ctrl+s', 'popup', 'all windows'],
  },
  {
    id: 'quick-restoration',
    category: 'getting-started',
    title: 'Restoring Saved Tab Collections',
    badge: 'Core Workflow',
    summary: 'Reopen entire collections with one click, or restore them directly into native colored Chrome Tab Groups.',
    whatItDoes: 'Recreates your saved tabs in the browser whenever you are ready to resume work, research, or reading.',
    howItWorks: 'Every collection card features a primary "Restore All" button and an adjacent split dropdown. Clicking "Restore All" opens every tab in the collection. Clicking the dropdown gives you the option to restore as a native Chrome Tab Group.',
    whatToExpect: 'Tabs open smoothly in your active window. If the collection contains more tabs than your lazy-load threshold (default 5), TwoTab automatically opens background tabs in zero-bandwidth dormant mode to prevent CPU lag.',
    steps: [
      'Locate the collection card on your dashboard.',
      'Click "Restore All" to immediately reopen all tabs.',
      'Or click the dropdown arrow next to Restore and select "Restore as Chrome Tab Group" to group them with your collection’s title and color accent.',
      'Alternatively, click any individual tab title inside the card to open just that single link.',
    ],
    proTip: 'Use middle-click or ⌘+Click (Ctrl+Click) on individual tab links to open them in the background without switching away from TwoTab.',
    actionLabel: 'View Dashboard',
    actionTarget: 'dashboard',
    keywords: ['restore', 'reopen', 'tabs', 'chrome tab groups', 'open collection', 'middle click'],
  },
  {
    id: 'cold-storage-archive',
    category: 'getting-started',
    title: 'Cold Storage Archive',
    badge: 'Declutter',
    summary: 'Move older or reference tab collections out of your daily dashboard without permanently deleting them.',
    whatItDoes: 'Provides a secondary "vault" for tab collections you want to keep indefinitely for reference or research, but don’t want cluttering your daily dashboard view.',
    howItWorks: 'Archiving a group moves it atomically from the active dashboard storage into the dedicated Archive tab. It remains searchable and fully restorable at any time.',
    whatToExpect: 'The collection immediately vanishes from your active dashboard. Switching to the "Archive" tab in the left sidebar reveals all your archived collections.',
    steps: [
      'On any dashboard collection card, click the three-dots menu (•••).',
      'Select "Archive Group".',
      'To view or restore archived tabs, click "Archive" in the sidebar navigation.',
      'On any archived card, click "Unarchive" to return it to your active dashboard whenever you need it again.',
    ],
    proTip: 'Use the "Stale Tabs & Aging Purifier" tool in the Power Tools Hub to automatically identify and batch-archive all collections older than 90 days in one click.',
    actionLabel: 'Explore Cold Archive',
    actionTarget: 'archive',
    keywords: ['archive', 'cold storage', 'unarchive', 'declutter', 'hide', 'vault', 'old tabs'],
  },

  // Tab Organization & Inspector
  {
    id: 'tab-group-inspector',
    category: 'organization',
    title: 'Tab Group Inspector Workspace',
    badge: 'Pro Workspace',
    summary: 'A full-screen modal workspace to explore, filter, reorder, batch-edit, and extract sub-groups from large tab collections.',
    whatItDoes: 'Turns any tab collection into an interactive workspace. Instead of viewing tabs in a constrained card, you can filter by domain, drag-to-reorder, select tabs in bulk, and add new URLs.',
    howItWorks: 'Double-click any collection card on your dashboard, or click the "Expand" maximize icon in the card header. The Inspector modal opens instantly with a live search bar and domain filter chips.',
    whatToExpect: 'A spacious view displaying all tabs with full URLs, favicons, interactive checkboxes, and a top bar showing domain distribution (e.g., github.com: 8, docs.google.com: 4).',
    steps: [
      'Domain Filter Chips: Click any domain pill at the top of the modal to instantly filter the list to only tabs from that website.',
      'Batch Selection: Check individual tab checkboxes or click "Select All" to perform batch operations.',
      'Extract to New Group: Select a few tabs and click "Extract into New Group" to split them out into their own separate collection.',
      'Tab Reordering: Drag any tab using its drag handle to reorder the list to your liking.',
      'Add URL: Click "Add Link" in the modal header to type or paste a new URL directly into the collection without opening a new tab.',
      'Single Collection Export: Click "Export" in the inspector footer to download this specific collection as Markdown or OneTab text.',
    ],
    proTip: 'You can press Esc anytime to smoothly close the Inspector modal without losing any changes.',
    actionLabel: 'Open Dashboard',
    actionTarget: 'dashboard',
    keywords: ['inspector', 'modal', 'reorder', 'drag', 'batch', 'extract', 'domain chips', 'add link', 'single export'],
  },
  {
    id: 'color-tags-and-sorting',
    category: 'organization',
    title: 'Color Tags & 7-Mode Sorting Suite',
    badge: 'Organization',
    summary: 'Assign visual color accents to collections and sort your library across 7 dimensions to find what you need instantly.',
    whatItDoes: 'Gives visual hierarchy to your collections with 9 curated design tokens, and provides multi-tag filtering and instant sorting.',
    howItWorks: 'Click the tag circle on any card to choose from Slate, Blue, Purple, Pink, Red, Orange, Amber, Emerald, or Cyan. Use the top toolbar "Color" dropdown to filter by one or multiple tags simultaneously, and the "Sort" dropdown to arrange collections.',
    whatToExpect: 'Collections immediately display matching colored border accents, header pills, and badge indicators. When filtering, non-matching collections fade smoothly from view.',
    steps: [
      'Assign Color: Click the color badge in any card header to assign a project color.',
      'Rename Collection: Click the title text on any card to edit it inline. Press Enter to save or Esc to cancel.',
      'Multi-Tag Filtering: Click the "Color" dropdown in the top bar and check one or more colors. Only collections matching your selected tags will be displayed.',
      '7-Mode Sorting: Click the "Sort" dropdown to order collections by: Newest First, Oldest First, Most Tabs, Fewest Tabs, Title (A → Z), Title (Z → A), or Color Tag.',
      'Lock Collection: Click the Lock icon in the card menu to pin and protect a collection from accidental deletion or renaming.',
    ],
    proTip: 'Color tags are preserved when restoring as native Chrome Tab Groups, ensuring your Chrome tab strip matches your TwoTab dashboard colors.',
    actionLabel: 'Go to Dashboard',
    actionTarget: 'dashboard',
    keywords: ['tags', 'colors', 'sorting', 'filter', 'rename', 'lock', 'slate', 'emerald', 'blue'],
  },
  {
    id: 'recently-closed-tracker',
    category: 'organization',
    title: 'Live "Recently Closed" Tab Tracker',
    badge: 'Safety Net',
    summary: 'An automatic FIFO tracker that catches and stores recently closed tabs from your browser sessions.',
    whatItDoes: 'Acts as an automatic safety net for accidental tab closures. Whenever you close a tab in Chrome, TwoTab silently logs it so you can reopen it with a single click.',
    howItWorks: 'TwoTab listens to Chrome browser tab closure events and maintains a chronological queue. The retention limit is configurable (10 to 500 tabs) in Settings.',
    whatToExpect: 'Switching to the "Recently Closed" tab in the sidebar reveals a list of all recently closed tabs with timestamps, favicons, domain tags, and a live search bar.',
    steps: [
      'Click "Recently Closed" in the sidebar navigation.',
      'Search through closed tabs by keyword or website domain.',
      'Click any tab to immediately reopen it in your browser.',
      'Click "Restore All into Group" to save all recently closed tabs directly into a new TwoTab collection.',
      'Click "Clear History" to wipe the recently closed queue at any time.',
    ],
    proTip: 'You can customize how many closed tabs TwoTab remembers (from 10 up to 500) under Settings → History Retention.',
    actionLabel: 'View Recently Closed',
    actionTarget: 'closed',
    keywords: ['recently closed', 'undo', 'closed tabs', 'history', 'reopen', 'fifo', 'accidental close'],
  },

  // Power Tools Hub
  {
    id: 'link-health-inspector',
    category: 'power-tools',
    title: 'Link Health & Dead Link Inspector',
    badge: 'Power Tool',
    summary: 'Audits every link in your saved collections to detect dead links (404/410), redirects, and connection timeouts with 1-click Wayback Machine recovery.',
    whatItDoes: 'Over time, websites change URLs, delete articles, or go offline. The Link Health Inspector tests your entire library against live web servers to identify broken links before you need them.',
    howItWorks: 'Click "Start Library Scan". TwoTab sends concurrent, non-intrusive HEAD/GET network requests through a background worker. It categorizes links as Healthy (200 OK), Redirected (301/302), Dead/Not Found (404/410), or Network Timeout/DNS Error.',
    whatToExpect: 'A comprehensive visual health dashboard showing total scanned links, error counts, and grouped results with clear visual badges.',
    steps: [
      'Open the Power Tools Hub and select "Link Health & Dead Link Inspector".',
      'Click "Start Health Audit" to begin scanning your saved collections.',
      'Apply 1-Click Redirects: Click "Apply Batch Redirects" to automatically update outdated URLs to their current destination targets.',
      'Wayback Machine Recovery: For broken 404 links, click "Wayback Archive" to look up the last preserved snapshot from the Internet Archive.',
      'Quarantine or Prune: Click "Quarantine Dead Links" to move broken links into a dedicated review collection, or "Purge Dead Links" to clean them out.',
    ],
    proTip: 'All batch purge or quarantine operations automatically create a safety rolling backup first, so you can reverse changes at any time.',
    actionLabel: 'Launch Link Health Tool',
    actionTarget: 'tools',
    keywords: ['link health', 'dead links', '404', 'broken links', 'redirects', 'wayback machine', 'audit', 'scanner'],
  },
  {
    id: 'duplicate-cleaner',
    category: 'power-tools',
    title: 'Smart Duplicate & Mirror Cleaner',
    badge: 'Power Tool',
    summary: 'Detects exact duplicates, tracking-stripped mirrors, and cross-group identical collections scattered across your library.',
    whatItDoes: 'Identifies tabs you’ve accidentally saved multiple times across different days or collections, and helps you clean them without losing your preferred folder structure.',
    howItWorks: 'Uses a multi-tier matching engine: (1) Exact URL match, (2) Clean URL match (which strips marketing parameters like utm_source, utm_medium, fbclid, gclid, and URL hash fragments), and (3) Cross-Group Mirror detection (identifying collections with 80%+ identical tabs).',
    whatToExpect: 'Side-by-side comparison cards displaying the original tab (marked with a green KEEP badge) and redundant instances (marked with a red REMOVE badge).',
    steps: [
      'Open the Power Tools Hub and select "Smart Duplicate & Mirror Cleaner".',
      'Choose your detection sensitivity: "Exact URLs", "Normalized (Strip Tracking Parameters)", or "Full Library Scan".',
      'Review detected duplicate clusters and toggle which instance you prefer to keep.',
      'Click "Purge All Duplicates" to cleanly remove redundant tabs in a single atomic operation.',
    ],
    proTip: 'When cleaning duplicates, TwoTab automatically preserves the earliest-created instance so you retain your original collection context.',
    actionLabel: 'Launch Duplicate Cleaner',
    actionTarget: 'tools',
    keywords: ['duplicates', 'duplicate cleaner', 'mirror', 'tracking parameters', 'utm', 'clean urls', 'deduplication'],
  },
  {
    id: 'domain-sorter',
    category: 'power-tools',
    title: 'Domain Sorter & Library Organizer',
    badge: 'Power Tool',
    summary: 'Clusters tabs across your entire library by website domain, allowing 1-click consolidation into clean domain-dedicated collections.',
    whatItDoes: 'Solves the "scattered tabs" problem where articles from the same website (e.g., github.com, youtube.com, medium.com) are spread across dozens of different unsorted collections.',
    howItWorks: 'Parses all saved URLs, extracts normalized hostnames and root domains, and groups tabs into ranked domain clusters with live tab counts and sample titles.',
    whatToExpect: 'A clean domain directory showing every website in your library, sorted by tab count. You can expand any domain to view all tabs saved from that site.',
    steps: [
      'Open the Power Tools Hub and select "Domain Sorter & Organizer".',
      'Filter domains by keyword or toggle between "Root Domains" (e.g. google.com) and "Subdomains" (e.g. docs.google.com).',
      'Consolidate Domain: Click "Consolidate into Group" next to any domain to pull all those tabs into a brand-new dedicated collection.',
      'Export Domain Subset: Click "Export Domain" to download only tabs from that specific website as Markdown or HTML Bookmarks.',
    ],
    proTip: 'Consolidating domain tabs automatically cleans up empty groups left behind, keeping your dashboard pristine.',
    actionLabel: 'Launch Domain Sorter',
    actionTarget: 'tools',
    keywords: ['domain sorter', 'organizer', 'cluster', 'group by domain', 'hostnames', 'consolidate'],
  },
  {
    id: 'stale-tabs-purifier',
    category: 'power-tools',
    title: 'Stale Tabs & Aging Purifier',
    badge: 'Power Tool',
    summary: 'Categorizes your library across 4 aging horizons and provides 1-click archiving for dormant tabs and abandoned fragments.',
    whatItDoes: 'In large collections (hundreds or 1,700+ saved tabs), tabs saved months or years ago create cognitive clutter. The Stale Tabs Purifier helps you declutter old tabs safely without losing valuable reference material.',
    howItWorks: 'Analyzes timestamps across 4 aging horizons: Fresh (<30 days), Aging (30–90 days), Dormant/Stale (90–180 days), and Ancient (>180 days). It also detects "Stale Fragments" (abandoned collections with ≤3 tabs saved >90 days ago).',
    whatToExpect: 'A compact summary dashboard with a 4-color visual age distribution meter and filter tabs showing exactly how many dormant tabs are occupying your active dashboard.',
    steps: [
      'Open the Power Tools Hub and select "Stale Tabs & Aging Purifier".',
      'Review the age distribution meter to see what percentage of your library is Fresh vs Dormant.',
      'Click "Archive All Stale (>90d)" to batch-transfer dormant collections to Cold Storage Archive in one click.',
      'Click "Consolidate Fragments" to merge abandoned 1–2 tab collections into organized quarterly archive groups (e.g. "Q1 2026 Archive").',
      'Export Markdown: Click "Export Markdown" to create an external text backup of your stale tabs before archiving or deleting.',
    ],
    proTip: 'Moving tabs to the Cold Archive does not delete them! You can access and restore archived tabs anytime from the Archive tab in the sidebar.',
    actionLabel: 'Launch Stale Tabs Purifier',
    actionTarget: 'tools',
    keywords: ['stale tabs', 'aging', 'purifier', 'cold storage', 'ancient', 'dormant', 'fragments', 'consolidate'],
  },

  // Performance & Dormant Tabs
  {
    id: 'zero-bandwidth-dormant-tabs',
    category: 'performance',
    title: 'Zero-Bandwidth Dormant Tab Restoration',
    badge: 'Performance Engine',
    summary: 'Restore 50+ tabs simultaneously without freezing your browser, draining battery, or exhausting system RAM.',
    whatItDoes: 'Solves the classic browser crash when reopening large tab groups. Instead of forcing Chrome to download 40 heavy web pages at once, TwoTab creates lightweight dormant tabs that consume zero network bandwidth and virtually zero RAM.',
    howItWorks: 'When restoring a collection larger than your lazy-load threshold (default 5 tabs), TwoTab opens the first tab actively and routes background tabs through a special lightweight dormant page (dormant.html).',
    whatToExpect: 'The active tab loads immediately. Background tabs appear in your Chrome tab strip with their real titles and favicons, but remain asleep until you click them.',
    steps: [
      'Restore any collection with 5 or more tabs.',
      'Notice how your browser remains fast, fluid, and responsive with zero CPU spikes.',
      'Click on any background tab when you are ready to view it. The tab wakes up instantly and navigates to the target webpage.',
      'Configure Threshold: Go to Settings → Restoration & Memory to adjust the lazy-load threshold (from 1 to 20 tabs) or toggle this feature on/off.',
    ],
    proTip: 'Each modern web tab consumes roughly 100 MB to 400 MB of RAM. Restoring a 30-tab collection in dormant mode saves over 6 GB of system memory!',
    actionLabel: 'Configure in Settings',
    actionTarget: 'settings',
    keywords: ['dormant', 'zero-bandwidth', 'lazy load', 'memory', 'ram', 'performance', 'battery', 'cpu'],
  },
  {
    id: 'chrome-tab-groups-integration',
    category: 'performance',
    title: 'Native Chrome Tab Groups Integration',
    badge: 'Native Chrome',
    summary: 'Seamlessly convert TwoTab collections into colored, collapsible Chrome Tab Groups directly in your browser’s tab strip.',
    whatItDoes: 'Bridges TwoTab’s offline storage with Chrome’s native tab grouping engine. When you restore tabs, you can group them immediately in your browser tab strip.',
    howItWorks: 'TwoTab uses the Chrome Tab Groups API to bundle restored tabs into a single collapsible tab group, applying your assigned group title and color token.',
    whatToExpect: 'A neat, colored tab group label appears in your browser tab strip with a collapse chevron, keeping your browser tidy.',
    steps: [
      'On any collection card, click the dropdown arrow next to the "Restore All" button.',
      'Select "Restore as Chrome Tab Group".',
      'TwoTab restores the tabs and groups them in Chrome with your collection’s title and color accent.',
    ],
    proTip: 'Collapsing a Chrome Tab Group reduces tab strip clutter while keeping the tabs readily accessible.',
    actionLabel: 'Go to Dashboard',
    actionTarget: 'dashboard',
    keywords: ['chrome tab groups', 'tab groups', 'tab strip', 'native', 'collapse', 'color accent'],
  },

  // Backups, Privacy & Data Portability
  {
    id: 'local-first-privacy',
    category: 'privacy-backups',
    title: '100% Local-First Offline Privacy',
    badge: 'Security',
    summary: 'TwoTab operates entirely inside your browser. No accounts, no cloud databases, and zero analytics tracking.',
    whatItDoes: 'Ensures that your browsing habits, research links, client URLs, and personal bookmarks remain 100% private to you.',
    howItWorks: 'All data is stored directly in Chrome’s internal storage engine (chrome.storage.local). TwoTab makes zero outgoing network calls to external servers or tracking telemetry.',
    whatToExpect: 'Instant performance without network latency, complete offline availability, and absolute peace of mind.',
    steps: [
      'TwoTab requires no account signup or login.',
      'All collections, tags, settings, and history stay on your local computer.',
      'You have complete ownership of your data and can export it at any time.',
    ],
    proTip: 'Because data is stored locally on your device, TwoTab works flawlessly even when you have no internet connection.',
    actionLabel: 'View Privacy Settings',
    actionTarget: 'settings',
    keywords: ['privacy', 'local-first', 'offline', 'security', 'no tracking', 'no cloud', 'chrome.storage.local'],
  },
  {
    id: 'automatic-rolling-backups',
    category: 'privacy-backups',
    title: 'Automatic Rolling Backups & Snapshots',
    badge: 'Data Protection',
    summary: 'Automated 6-hour rolling snapshots and pre-mutation safety backups guarantee zero data loss.',
    whatItDoes: 'Protects your tabs from accidental deletion, browser crashes, or operating system errors by maintaining automated recovery snapshots.',
    howItWorks: 'A lightweight Chrome background alarm automatically captures rolling snapshots of your library every 6 hours (keeping the last 5 snapshots). Furthermore, before any batch action (like clearing data, purging duplicates, or deleting groups), TwoTab automatically captures an emergency snapshot.',
    whatToExpect: 'Silent, background protection. If you ever make a mistake or accidentally delete tabs, you can restore previous states with one click.',
    steps: [
      'Go to Settings → Automatic Rolling Backups.',
      'View the list of saved snapshots with their creation timestamps, group counts, and tab totals.',
      'Click "Restore Snapshot" next to any backup to restore your library to that exact point in time.',
      'Click "Download Backup" to save a JSON snapshot file to your computer’s hard drive.',
    ],
    proTip: 'Snapshots automatically deduplicate identical library states to avoid using unnecessary disk storage.',
    actionLabel: 'Manage Backups',
    actionTarget: 'settings',
    keywords: ['backups', 'rolling backups', 'snapshots', 'emergency', 'restore', 'recovery', 'data safety'],
  },
  {
    id: 'multi-format-data-hub',
    category: 'privacy-backups',
    title: 'Multi-Format Export & OneTab Migration',
    badge: 'Data Portability',
    summary: 'Export to Markdown for Obsidian/Notion, HTML Bookmarks for all browsers, CSV spreadsheets, and OneTab text sync.',
    whatItDoes: 'Provides full data portability. You are never locked into TwoTab—you can export your library into any format or import from other tools.',
    howItWorks: 'Go to Settings → Multi-Format Data Hub. Choose from 5 export and import formats, preview the output, and download with a single click.',
    whatToExpect: 'Cleanly formatted files ready for immediate use in your favorite note-taking apps, spreadsheets, or web browsers.',
    steps: [
      'Markdown (.md): Creates a clean hierarchical outline with clickable links, perfect for Obsidian, Logseq, and Notion.',
      'HTML Bookmarks (.html): Universal Netscape format that can be imported directly into Chrome, Firefox, Safari, Edge, or Arc bookmarks.',
      'JSON Backup (.json): Full-fidelity raw backup including color tags, timestamps, locks, and notes.',
      'CSV Spreadsheet (.csv): Tabular data format with columns for Title, URL, Domain, Group Name, and Date.',
      'OneTab Import / Export (.txt): Seamless two-way migration. Paste OneTab export text into TwoTab to import all your groups instantly.',
    ],
    proTip: 'When migrating from OneTab, you can choose "Merge" to append your OneTab groups to your current TwoTab collections without overwriting existing data.',
    actionLabel: 'Open Data Hub',
    actionTarget: 'settings',
    keywords: ['export', 'import', 'onetab', 'markdown', 'obsidian', 'notion', 'html bookmarks', 'csv', 'json'],
  },
];

// -----------------------------------------------------------------------------
// Interactive Keyboard Shortcuts Reference
// -----------------------------------------------------------------------------

export const KEYBOARD_SHORTCUTS: ShortcutItem[] = [
  // Capture
  {
    id: 'save-window',
    category: 'Capture',
    action: 'Save Current Window',
    macKey: '⌘S',
    winKey: 'Ctrl+S',
    description: 'Captures and stashes all open tabs in your current browser window into a clean collection.',
  },
  {
    id: 'save-all-windows',
    category: 'Capture',
    action: 'Save All Windows',
    macKey: '⌘⇧S',
    winKey: 'Ctrl+Shift+S',
    description: 'Simultaneously captures all open browser windows into separate dated collections.',
  },
  {
    id: 'save-active-tab',
    category: 'Capture',
    action: 'Save Active Tab Only',
    macKey: '⌘⌥S',
    winKey: 'Ctrl+Alt+S',
    description: 'Stashes only the current tab into a new collection without closing other tabs.',
  },

  // Navigation & Search
  {
    id: 'global-search',
    category: 'Navigation',
    action: 'Focus Global Search',
    macKey: '⌘K',
    winKey: 'Ctrl+K',
    description: 'Instantly focuses the search bar to filter collections across titles, URLs, and tags.',
  },
  {
    id: 'dismiss-modal',
    category: 'Navigation',
    action: 'Dismiss Dialog / Modal',
    macKey: 'Esc',
    winKey: 'Esc',
    description: 'Closes any open modal (Inspector, Confirmation dialog, or Search popup).',
  },

  // Inspector & Card Editing
  {
    id: 'inspect-card',
    category: 'Inspector & Modals',
    action: 'Open Inspector Workspace',
    macKey: 'Double-Click Card',
    winKey: 'Double-Click Card',
    description: 'Opens the full-screen Tab Group Inspector workspace for deep curation and reordering.',
  },
  {
    id: 'commit-rename',
    category: 'Inspector & Modals',
    action: 'Save Inline Rename',
    macKey: 'Enter',
    winKey: 'Enter',
    description: 'Commits your new collection title when renaming a group directly on the card.',
  },
  {
    id: 'cancel-rename',
    category: 'Inspector & Modals',
    action: 'Cancel Inline Rename',
    macKey: 'Esc',
    winKey: 'Esc',
    description: 'Reverts changes and cancels inline collection renaming.',
  },
];

// -----------------------------------------------------------------------------
// Right-Click Context Menu Guide
// -----------------------------------------------------------------------------

export const CONTEXT_MENU_GUIDES: ContextMenuGuide[] = [
  {
    id: 'ctx-save-window',
    title: 'Save Current Window',
    trigger: 'Right-click anywhere on any webpage → TwoTab → Save Current Window',
    behavior: 'Stashes all tabs in the active window into a new collection without opening the TwoTab tab.',
    benefit: 'Clean up your desk in one second while reading an article.',
  },
  {
    id: 'ctx-save-selected',
    title: 'Save Selected Tabs',
    trigger: 'Hold Shift or Cmd/Ctrl in Chrome’s tab strip to select tabs → Right-click page → TwoTab → Save Selected Tabs',
    behavior: 'Captures and closes only the tabs you specifically highlighted in your browser’s tab strip.',
    benefit: 'Stash specific research tabs without touching your primary work tabs.',
  },
  {
    id: 'ctx-save-active',
    title: 'Save Active Tab Only',
    trigger: 'Right-click page → TwoTab → Save Active Tab',
    behavior: 'Saves the current page into a dedicated single-tab collection and closes it.',
    benefit: 'Quickly save a long-read article for later.',
  },
  {
    id: 'ctx-save-link',
    title: 'Save Link to TwoTab',
    trigger: 'Right-click any hyperlink on a webpage → TwoTab → Save Link',
    behavior: 'Appends the link directly into your "Quick Links" collection without opening the page.',
    benefit: 'Bookmark links while reading without cluttering your browser with extra tabs.',
  },
];

// -----------------------------------------------------------------------------
// Comprehensive Task-Oriented FAQs
// -----------------------------------------------------------------------------

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-difference-onetab',
    category: 'getting-started',
    question: 'How is TwoTab different from OneTab?',
    answer: 'TwoTab was built as a modern, high-performance successor to OneTab. While OneTab hasn’t changed in years, TwoTab includes a full Manifest V3 architecture, zero-bandwidth dormant tab restoration (saving gigabytes of RAM), the Tab Group Inspector workspace, 9 color tags with multi-filtering, 7-mode sorting, native Chrome Tab Groups integration, a Power Tools Hub (dead link audit, duplicate cleaner, domain sorter, stale tabs purifier), automatic 6-hour rolling backups, and 7 curated themes with circular ripple view transitions.',
    keywords: ['onetab', 'difference', 'compare', 'features', 'manifest v3', 'upgrade'],
  },
  {
    id: 'faq-restore-as-groups',
    category: 'getting-started',
    question: 'Can I restore tabs directly as native Chrome Tab Groups?',
    answer: 'Yes! On any collection card or inside the Tab Group Inspector workspace, click the dropdown arrow next to the primary "Restore" button and choose "Restore as Chrome Tab Group". TwoTab will reopen the tabs in Chrome and group them with your collection’s title and assigned color accent.',
    steps: [
      'Locate the collection card on your dashboard.',
      'Click the dropdown arrow next to "Restore All".',
      'Select "Restore as Chrome Tab Group".',
      'Chrome opens the tabs bundled in a colored tab group.',
    ],
    keywords: ['chrome tab groups', 'native', 'restore', 'grouping', 'colored tabs'],
  },
  {
    id: 'faq-dormant-tabs-explanation',
    category: 'performance',
    question: 'Why do restored background tabs say "Click to load tab"?',
    answer: 'This is TwoTab’s Zero-Bandwidth Dormant Tab engine at work! When restoring 5 or more tabs at once, normal extensions force Chrome to load all 30–50 pages simultaneously, which freezes your browser and spikes memory to 4–8 GB. TwoTab creates lightweight placeholder tabs that consume zero network bandwidth and virtually zero RAM. As soon as you click or switch to a dormant tab, it instantly wakes up and loads the real webpage.',
    steps: [
      'Background tabs stay asleep until you need them, saving battery and memory.',
      'To change the threshold or disable dormant mode, go to Settings → Restoration & Memory.',
    ],
    keywords: ['dormant', 'click to load', 'placeholder', 'memory', 'performance', 'bandwidth', 'ram'],
  },
  {
    id: 'faq-protect-pinned-tabs',
    category: 'getting-started',
    question: 'Are my pinned tabs protected when I save a window?',
    answer: 'Yes, absolutely. By default, TwoTab has "Protect Pinned Tabs" enabled. When you save a window (via button or ⌘S), your pinned tabs (like Slack, Gmail, or Spotify) remain safely open in Chrome and are not captured or closed. You can change this behavior in Settings if you prefer to save pinned tabs too.',
    steps: [
      'Open Settings → Window Capture Behaviors.',
      'Toggle "Protect Pinned Tabs" on or off based on your preference.',
    ],
    keywords: ['pinned tabs', 'protect', 'keep open', 'slack', 'gmail', 'settings'],
  },
  {
    id: 'faq-move-to-cold-archive',
    category: 'organization',
    question: 'How do I move old collections out of my main dashboard without deleting them?',
    answer: 'Use TwoTab’s Cold Storage Archive! On any collection card, click the three-dots menu (•••) and select "Archive Group". The collection moves to the "Archive" tab in the left sidebar, keeping your active dashboard clean. Archived collections remain fully intact and can be restored or unarchived at any time.',
    steps: [
      'Click ••• on any card and select "Archive Group".',
      'Click "Archive" in the sidebar to review your archived collections.',
      'Click "Unarchive" anytime to move a collection back to your main dashboard.',
    ],
    keywords: ['archive', 'cold storage', 'unarchive', 'declutter', 'hide old tabs'],
  },
  {
    id: 'faq-migrate-from-onetab',
    category: 'privacy-backups',
    question: 'How do I migrate my existing library from OneTab into TwoTab?',
    answer: 'Migration takes less than 30 seconds using TwoTab’s built-in OneTab importer:',
    steps: [
      'In OneTab, open the OneTab dashboard and click "Export / Import URLs" in the top right.',
      'Select and copy the entire text block under "Export URLs".',
      'In TwoTab, click "Settings" in the sidebar and scroll to "Multi-Format Data Hub".',
      'Click "OneTab Import / Export", paste your copied text into the text area.',
      'Select "Merge with Existing Data" (so you don’t overwrite your TwoTab groups), and click "Parse & Import".',
      'All your OneTab collections will be recreated in TwoTab immediately!',
    ],
    keywords: ['onetab', 'migration', 'import', 'transfer', 'copy paste', 'data hub'],
  },
  {
    id: 'faq-export-single-collection',
    category: 'organization',
    question: 'Can I export just a single collection rather than my entire library?',
    answer: 'Yes! Double-click any collection card to open the Tab Group Inspector workspace. In the modal footer, click "Export Group" and choose either Markdown (.md) or OneTab plain text. TwoTab generates a clean file containing only the tabs in that specific collection.',
    steps: [
      'Double-click any collection card to open the Inspector modal.',
      'Look at the bottom footer bar and click "Export".',
      'Choose Markdown or OneTab text to copy or download.',
    ],
    keywords: ['export single group', 'markdown', 'inspector', 'share', 'download'],
  },
  {
    id: 'faq-accidental-deletion-recovery',
    category: 'privacy-backups',
    question: 'What happens if I accidentally delete a collection or clear my data?',
    answer: 'You are protected by TwoTab’s multi-tier safety architecture. First, TwoTab requires explicit confirmation dialogs before deleting. Second, TwoTab takes an automatic safety snapshot before batch mutations. Third, automatic rolling backups are saved every 6 hours.',
    steps: [
      'Go to Settings → Automatic Rolling Backups.',
      'Find the most recent snapshot in the list.',
      'Click "Restore Snapshot" to immediately revert your library to that saved state.',
    ],
    keywords: ['undo', 'accidental delete', 'recovery', 'rolling backups', 'emergency snapshot', 'revert'],
  },
  {
    id: 'faq-sync-across-devices',
    category: 'privacy-backups',
    question: 'Does TwoTab sync across my computers or devices?',
    answer: 'TwoTab stores data locally using chrome.storage.local to provide unlimited storage capacity (Chrome Sync has a strict 100 KB limit which corrupts large tab libraries) and 100% offline privacy with zero external servers. To transfer your tabs to another computer, export your library as JSON or HTML Bookmarks from Settings, and import the file on your other device.',
    keywords: ['sync', 'cloud', 'multiple computers', 'devices', 'export import', 'local storage'],
  },
  {
    id: 'faq-offline-privacy-telemetry',
    category: 'privacy-backups',
    question: 'Does TwoTab collect telemetry or send my URLs to the cloud?',
    answer: 'Never. TwoTab is 100% local-first and zero-tracking. We do not use Google Analytics, telemetry beacons, external databases, or third-party servers. Your browsing history, tab titles, and collections never leave your device. You can verify this anytime by inspecting the open-source codebase on GitHub.',
    keywords: ['privacy', 'telemetry', 'tracking', 'security', 'open source', 'local-first'],
  },
];

// -----------------------------------------------------------------------------
// Search & Filter Helper
// -----------------------------------------------------------------------------

export interface SearchResult {
  guides: HelpGuide[];
  shortcuts: ShortcutItem[];
  faqs: FaqItem[];
  contextMenus: ContextMenuGuide[];
  totalMatches: number;
}

export function searchHelpContent(query: string, category: HelpCategoryKey): SearchResult {
  const cleanQuery = query.trim().toLowerCase();

  // Filter guides
  const guides = HELP_GUIDES.filter((guide) => {
    const matchesCategory = category === 'all' || guide.category === category;
    if (!matchesCategory) return false;

    if (!cleanQuery) return true;

    return (
      guide.title.toLowerCase().includes(cleanQuery) ||
      guide.summary.toLowerCase().includes(cleanQuery) ||
      guide.whatItDoes.toLowerCase().includes(cleanQuery) ||
      guide.howItWorks.toLowerCase().includes(cleanQuery) ||
      guide.whatToExpect.toLowerCase().includes(cleanQuery) ||
      guide.keywords.some((k) => k.toLowerCase().includes(cleanQuery))
    );
  });

  // Filter shortcuts
  const shortcuts = KEYBOARD_SHORTCUTS.filter((shortcut) => {
    const matchesCategory = category === 'all' || category === 'getting-started';
    if (!matchesCategory) return false;

    if (!cleanQuery) return true;

    return (
      shortcut.action.toLowerCase().includes(cleanQuery) ||
      shortcut.macKey.toLowerCase().includes(cleanQuery) ||
      shortcut.winKey.toLowerCase().includes(cleanQuery) ||
      shortcut.description.toLowerCase().includes(cleanQuery)
    );
  });

  // Filter context menus
  const contextMenus = CONTEXT_MENU_GUIDES.filter((ctx) => {
    const matchesCategory = category === 'all' || category === 'getting-started';
    if (!matchesCategory) return false;

    if (!cleanQuery) return true;

    return (
      ctx.title.toLowerCase().includes(cleanQuery) ||
      ctx.trigger.toLowerCase().includes(cleanQuery) ||
      ctx.behavior.toLowerCase().includes(cleanQuery) ||
      ctx.benefit.toLowerCase().includes(cleanQuery)
    );
  });

  // Filter FAQs
  const faqs = FAQ_ITEMS.filter((faq) => {
    const matchesCategory = category === 'all' || category === 'faq' || faq.category === category;
    if (!matchesCategory) return false;

    if (!cleanQuery) return true;

    return (
      faq.question.toLowerCase().includes(cleanQuery) ||
      faq.answer.toLowerCase().includes(cleanQuery) ||
      faq.keywords.some((k) => k.toLowerCase().includes(cleanQuery))
    );
  });

  const totalMatches = guides.length + shortcuts.length + contextMenus.length + faqs.length;

  return {
    guides,
    shortcuts,
    faqs,
    contextMenus,
    totalMatches,
  };
}
