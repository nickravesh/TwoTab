---
name: silent-failure-audit
description: >-
  Comprehensive audit, detection, and mitigation framework for silent failures, race conditions,
  unhandled promise rejections, dropped storage writes, and uncommunicated no-ops across
  Chrome Extensions (Manifest V3), Service Workers, React SPAs, and client-side storage engines.
---

# Skill: Zero-Silent-Failures Audit & Prevention Framework

Use this skill whenever auditing a codebase for hidden bugs, conducting reliability reviews, investigating intermittent data loss, or designing resilient browser extension architectures.

---

## 1. Core Philosophy: The Principle of Explicit State

A **silent failure** occurs when a system encounters an error, edge case, or no-op condition, but either:
1. Swallows the exception (`catch {}` or unlogged promises),
2. Returns a false positive (e.g., displaying *"Saved successfully!"* when 0 items were actually saved),
3. Drops concurrent operations due to unsynchronized read-modify-write cycles, or
4. Crashes a component into a blank white screen without a recovery boundary.

Every operation must produce an **explicit, verifiable, and user-intelligible outcome**.

---

## 2. Chrome Extension & Service Worker Failure Vectors

### A. Message Port Closures (`chrome.runtime.onMessage`)
- **The Pitfall**: In Manifest V3, returning `false` (or omitting `return true;`) when performing asynchronous work inside `onMessage` causes Chrome to immediately close the message channel, throwing `The message port closed before a response was received`.
- **The Pattern**:
  ```ts
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveData') {
      (async () => {
        try {
          const result = await processData(request.payload);
          sendResponse({ status: 'success', data: result });
        } catch (err: any) {
          sendResponse({ status: 'error', message: err?.message || 'Unknown error' });
        }
      })();
      return true; // MANDATORY: Keeps port open for async response
    }
  });
  ```

### B. Service Worker Inactivity Termination
- **The Pitfall**: MV3 service workers can be terminated by the browser after ~30 seconds of inactivity. In-memory global variables reset to initial values upon worker restart.
- **The Pattern**:
  - Never rely on long-lived in-memory state across requests.
  - Store transient session state in `chrome.storage.session` (or `chrome.storage.local`).
  - Rehydrate state on startup (`chrome.runtime.onStartup` and `chrome.runtime.onInstalled`).

---

## 3. Storage Engine & Concurrency Hardening

### A. Serialized Storage Mutex Queue
- **The Pitfall**: Direct calls to `chrome.storage.local.set` perform non-atomic writes. If the dashboard, popup, and background worker write simultaneously (or multiple tabs close rapidly), writes race and overwrite each other.
- **The Pattern**:
  ```ts
  class StorageQueue {
    private queue: Array<() => Promise<void>> = [];
    private processing = false;

    async enqueue<T>(operation: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        this.queue.push(async () => {
          try {
            resolve(await operation());
          } catch (e) {
            reject(e);
          }
        });
        this.processNext();
      });
    }

    private async processNext(): Promise<void> {
      if (this.processing || this.queue.length === 0) return;
      this.processing = true;
      const op = this.queue.shift()!;
      try {
        await op();
      } finally {
        this.processing = false;
        this.processNext();
      }
    }
  }
  ```

### B. Storage Quota & Write Error Verification (`safeStorageSet`)
- Always wrap `chrome.storage.local.set` to detect `chrome.runtime.lastError` (e.g., `QuotaExceededError`):
  ```ts
  export async function safeStorageSet(data: Record<string, any>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          console.error('[Storage] Write failed:', chrome.runtime.lastError.message);
          reject(new Error(`Storage write failed: ${chrome.runtime.lastError.message}`));
        } else {
          resolve();
        }
      });
    });
  }
  ```

---

## 4. UI No-Op & False Positive Elimination

### A. Distinguishing True Success vs. Filtered No-Ops
- **The Pitfall**: An action filters out all candidates (e.g., saving a window where all tabs are protected pinned tabs or `chrome://` system URLs) and returns without saving anything, while the frontend happily displays *"Saved window!"*.
- **The Pattern**: Return explicit status descriptors:
  ```ts
  if (eligibleTabs.length === 0) {
    return {
      status: 'no_tabs',
      reason: 'All tabs in this window are pinned or system pages and protected by settings'
    };
  }
  return { status: 'success', count: eligibleTabs.length };
  ```

### B. React `ErrorBoundary` in ALL Entrypoints
- Wrap every independent HTML entrypoint (`popup.html`, `tabs.html`, `sidepanel.html`, `options.html`) in a dedicated class `ErrorBoundary`.
- Prevent white screens by rendering an informative card with:
  1. The error message summary,
  2. A **"Retry"** state reset button,
  3. A fallback link/button to navigate to the primary dashboard.

---

## 5. Fragile Browser APIs & Fallback Architecture

### A. Clipboard Operations
- **The Pitfall**: `navigator.clipboard.writeText()` throws if the extension popup loses document focus during the click event.
- **The Pattern**:
  ```ts
  export async function copyToClipboardSafe(text: string): Promise<boolean> {
    if (!text) return false;
    // 1. Try modern Async Clipboard API
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        console.warn('[Clipboard] Async API failed, using execCommand fallback:', e);
      }
    }
    // 2. DOM fallback
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch (e) {
      console.error('[Clipboard] ExecCommand failed:', e);
      return false;
    }
  }
  ```

### B. Remote Asset / Favicon Fallbacks
- Images loaded from external domains can fail or 404.
- Always attach `onError={(e) => { e.currentTarget.style.display = 'none'; }}` or swap with an SVG generic icon.

---

## 6. Automated Diagnostics & Health Checks

1. **Startup Health Audits**:
   - Check schema version (`_schemaVersion`).
   - Validate array and object invariants across stored keys.
   - Measure storage byte consumption (`chrome.storage.local.getBytesInUse`).
2. **User-Facing Diagnostic Cards**:
   - Expose health status in Settings (Integrity status, quota used, "Run Health Check" button).
3. **Automated Rolling Backups**:
   - Periodically take timestamped snapshots of database state.
   - Deduplicate snapshots if state has not changed since the previous snapshot.

---

## 7. The 10-Point Silent Failure Audit Checklist

When reviewing any feature or PR, verify all 10 checkpoints:

- [ ] **1. Port Keepalive**: Does `chrome.runtime.onMessage` return `true` for all async branches?
- [ ] **2. Error Propagation**: Are message errors caught and returned via `{ status: 'error', message: err.message }`?
- [ ] **3. Write Serialization**: Are all storage writes routed through a mutex write queue?
- [ ] **4. Quota Handling**: Is `chrome.runtime.lastError` checked on every storage write?
- [ ] **5. No-Op Truthfulness**: Does the UI distinguish between 0-item operations and successful saves?
- [ ] **6. UI Crash Isolation**: Is every entrypoint wrapped in a React `ErrorBoundary`?
- [ ] **7. Clipboard Resilience**: Does text copying fall back to `execCommand` on focus loss?
- [ ] **8. Schema Migration**: Are unversioned legacy stores migrated safely without data loss?
- [ ] **9. Alarm Reliability**: Are alarms/cron handlers wrapped in `try/catch` with logged metrics?
- [ ] **10. Corrupt State Recovery**: Can the user restore from a rolling backup or run a diagnostic health check?
