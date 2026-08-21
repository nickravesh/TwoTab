import {
  getGroups,
  safeStorageSet,
  createRollingBackup,
  type TabGroup,
  type Tab,
} from './storage';

// =============================================================================
// Link Health Types & Constants
// =============================================================================

export type LinkHealthStatus =
  | 'healthy'     // 200-299: Reachable and responsive
  | 'redirected'  // 301-308 / target URL changed: URL moved to a new destination
  | 'protected'   // 401, 403, 429, Cloudflare: Requires auth / bot challenge (alive, not dead)
  | 'broken'      // 404, 410: Confirmed missing / deleted
  | 'unreachable';// DNS failure, timeout, 500-599: Server/network unreachable

export interface LinkHealthResult {
  url: string;
  status: LinkHealthStatus;
  statusCode?: number;
  finalUrl?: string; // If redirected, the destination URL
  error?: string;
  checkedAt: string;
}

export interface HealthScanProgress {
  total: number;
  checked: number;
  healthy: number;
  redirected: number;
  protected: number;
  broken: number;
  unreachable: number;
  isScanning: boolean;
  isPaused: boolean;
  velocity: number; // links per second
}

export const LINK_HEALTH_CACHE_KEY = 'twotab_link_health_cache';
export const LINK_HEALTH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days TTL

// =============================================================================
// Cache Management
// =============================================================================

export async function getLinkHealthCache(): Promise<Record<string, LinkHealthResult>> {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return {};
  }
  try {
    const data = await chrome.storage.local.get(LINK_HEALTH_CACHE_KEY);
    const rawCache = data[LINK_HEALTH_CACHE_KEY] || {};
    const now = Date.now();
    const validCache: Record<string, LinkHealthResult> = {};

    // Filter out expired items
    for (const [url, item] of Object.entries(rawCache as Record<string, LinkHealthResult>)) {
      if (item && item.checkedAt) {
        const itemTime = new Date(item.checkedAt).getTime();
        if (now - itemTime < LINK_HEALTH_CACHE_TTL_MS) {
          validCache[url] = item;
        }
      }
    }
    return validCache;
  } catch (e) {
    console.warn('[TwoTab LinkHealth] Failed to load health cache:', e);
    return {};
  }
}

export async function saveLinkHealthCache(cache: Record<string, LinkHealthResult>): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
  try {
    await safeStorageSet({ [LINK_HEALTH_CACHE_KEY]: cache });
  } catch (e) {
    console.warn('[TwoTab LinkHealth] Failed to persist health cache:', e);
  }
}

export async function clearLinkHealthCache(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
  try {
    await safeStorageSet({ [LINK_HEALTH_CACHE_KEY]: {} });
  } catch (e) {
    console.warn('[TwoTab LinkHealth] Failed to clear health cache:', e);
  }
}

// =============================================================================
// URL Validation & Normalization
// =============================================================================

export function isCheckableUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.trim().toLowerCase();
  if (
    lower.startsWith('chrome://') ||
    lower.startsWith('chrome-extension://') ||
    lower.startsWith('about:') ||
    lower.startsWith('edge:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('javascript:')
  ) {
    return false;
  }
  return lower.startsWith('http://') || lower.startsWith('https://');
}

export function extractDomainFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch (_) {
    return 'unknown';
  }
}

function normalizeUrlForCompare(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash for comparison
    let path = parsed.pathname;
    if (path.endsWith('/') && path.length > 1) {
      path = path.slice(0, -1);
    }
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;
  } catch (_) {
    return url.trim();
  }
}

// =============================================================================
// Single URL Health Checker (HEAD with GET fallback & timeout)
// =============================================================================

export async function checkSingleUrl(
  url: string,
  timeoutMs: number = 8000
): Promise<LinkHealthResult> {
  if (!isCheckableUrl(url)) {
    return {
      url,
      status: 'unreachable',
      error: 'Non-HTTP protocol',
      checkedAt: new Date().toISOString(),
    };
  }

  const checkedAt = new Date().toISOString();

  // Helper for fetch with timeout
  const runFetch = async (method: 'HEAD' | 'GET'): Promise<{ response: Response; finalUrl: string }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timer);
      return { response: res, finalUrl: res.url || url };
    } catch (err: any) {
      clearTimeout(timer);
      throw err;
    }
  };

  try {
    let result: { response: Response; finalUrl: string };

    try {
      result = await runFetch('HEAD');
    } catch (headErr: any) {
      // If HEAD fails due to 405 Method Not Allowed, or network rejection, try streamed GET fallback
      if (
        headErr.name === 'AbortError' ||
        (headErr.message && headErr.message.includes('aborted'))
      ) {
        return {
          url,
          status: 'unreachable',
          error: 'Connection timed out',
          checkedAt,
        };
      }
      result = await runFetch('GET');
    }

    const { response, finalUrl } = result;
    const statusCode = response.status;

    // 1. If 405 (Method Not Allowed) on HEAD, retry with GET
    if (statusCode === 405 || statusCode === 501) {
      try {
        const getResult = await runFetch('GET');
        return evaluateResponse(url, getResult.response, getResult.finalUrl, checkedAt);
      } catch (getErr: any) {
        return evaluateError(url, getErr, checkedAt);
      }
    }

    return evaluateResponse(url, response, finalUrl, checkedAt);
  } catch (err: any) {
    return evaluateError(url, err, checkedAt);
  }
}

function evaluateResponse(
  originalUrl: string,
  response: Response,
  finalUrl: string,
  checkedAt: string
): LinkHealthResult {
  const statusCode = response.status;

  // 1. Check for Redirect (final destination URL changed)
  const normOriginal = normalizeUrlForCompare(originalUrl);
  const normFinal = normalizeUrlForCompare(finalUrl);
  const hasRedirected = normOriginal !== normFinal && Boolean(finalUrl);

  if (hasRedirected && (response.ok || statusCode < 400)) {
    return {
      url: originalUrl,
      status: 'redirected',
      statusCode,
      finalUrl,
      checkedAt,
    };
  }

  // 2. Healthy 200-299
  if (response.ok || (statusCode >= 200 && statusCode < 300)) {
    return {
      url: originalUrl,
      status: 'healthy',
      statusCode,
      checkedAt,
    };
  }

  // 3. Protected / Auth Required (401 Unauthorized, 403 Forbidden, 429 Rate Limit, Cloudflare)
  if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
    return {
      url: originalUrl,
      status: 'protected',
      statusCode,
      error: statusCode === 429 ? 'Rate limited (429)' : 'Authentication / Protected (401/403)',
      checkedAt,
    };
  }

  // 4. Confirmed Dead (404 Not Found, 410 Gone)
  if (statusCode === 404 || statusCode === 410) {
    return {
      url: originalUrl,
      status: 'broken',
      statusCode,
      error: statusCode === 410 ? 'Page Gone (410)' : 'Not Found (404)',
      checkedAt,
    };
  }

  // 5. Server Errors (500, 502, 503, 504)
  return {
    url: originalUrl,
    status: 'unreachable',
    statusCode,
    error: `Server Error (${statusCode})`,
    checkedAt,
  };
}

function evaluateError(url: string, err: any, checkedAt: string): LinkHealthResult {
  const errMsg = err?.message || String(err);
  if (err?.name === 'AbortError' || errMsg.includes('aborted') || errMsg.includes('timeout')) {
    return {
      url,
      status: 'unreachable',
      error: 'Connection timed out',
      checkedAt,
    };
  }

  // Common CORS / Network / DNS errors
  return {
    url,
    status: 'unreachable',
    error: errMsg.length > 60 ? `${errMsg.slice(0, 57)}...` : errMsg,
    checkedAt,
  };
}

// =============================================================================
// Domain Rate Limiter & Concurrency Scheduler (Leaky Bucket)
// =============================================================================

export class DomainRateLimiter {
  private maxGlobal: number;
  private maxPerDomain: number;
  private domainDelayMs: number;

  private activeGlobal = 0;
  private activeDomains: Map<string, number> = new Map();
  private domainLastUsed: Map<string, number> = new Map();
  private queue: Array<{
    url: string;
    domain: string;
    task: () => Promise<LinkHealthResult>;
    resolve: (res: LinkHealthResult) => void;
    reject: (err: any) => void;
  }> = [];

  private isRunning = false;

  constructor(maxGlobal = 6, maxPerDomain = 2, domainDelayMs = 40) {
    this.maxGlobal = maxGlobal;
    this.maxPerDomain = maxPerDomain;
    this.domainDelayMs = domainDelayMs;
  }

  public enqueue(url: string, task: () => Promise<LinkHealthResult>): Promise<LinkHealthResult> {
    const domain = extractDomainFromUrl(url);
    return new Promise((resolve, reject) => {
      this.queue.push({ url, domain, task, resolve, reject });
      this.pump();
    });
  }

  public clearQueue(): void {
    this.queue = [];
  }

  public get pendingCount(): number {
    return this.queue.length;
  }

  private async pump(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      while (this.activeGlobal < this.maxGlobal && this.queue.length > 0) {
        // Find next item whose domain isn't exceeding per-domain limit
        const index = this.queue.findIndex((item) => {
          const count = this.activeDomains.get(item.domain) || 0;
          return count < this.maxPerDomain;
        });

        if (index === -1) {
          // All pending domains are currently busy at capacity
          break;
        }

        const [item] = this.queue.splice(index, 1);
        const { domain, task, resolve, reject } = item;

        // Apply domain cooldown if needed
        const lastUsed = this.domainLastUsed.get(domain) || 0;
        const elapsed = Date.now() - lastUsed;
        if (elapsed < this.domainDelayMs) {
          await new Promise((r) => setTimeout(r, this.domainDelayMs - elapsed));
        }

        this.activeGlobal++;
        this.activeDomains.set(domain, (this.activeDomains.get(domain) || 0) + 1);
        this.domainLastUsed.set(domain, Date.now());

        // Execute task without blocking pump loop
        (async () => {
          try {
            const res = await task();
            resolve(res);
          } catch (e) {
            reject(e);
          } finally {
            this.activeGlobal--;
            const current = this.activeDomains.get(domain) || 1;
            if (current <= 1) {
              this.activeDomains.delete(domain);
            } else {
              this.activeDomains.set(domain, current - 1);
            }
            this.pump();
          }
        })();
      }
    } finally {
      this.isRunning = false;
    }
  }
}

// =============================================================================
// Library Scanner Controller
// =============================================================================

export interface ScanOptions {
  forceRefresh?: boolean;
  timeoutMs?: number;
  maxGlobalConcurrency?: number;
  maxPerDomainConcurrency?: number;
}

export class HealthScanController {
  private limiter: DomainRateLimiter;
  private isCancelled = false;
  private isPaused = false;
  private activeScanPromise: Promise<Record<string, LinkHealthResult>> | null = null;
  private pauseResolver: (() => void) | null = null;

  constructor(options?: ScanOptions) {
    this.limiter = new DomainRateLimiter(
      options?.maxGlobalConcurrency || 6,
      options?.maxPerDomainConcurrency || 2,
      35
    );
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      if (this.pauseResolver) {
        this.pauseResolver();
        this.pauseResolver = null;
      }
    }
  }

  public cancel(): void {
    this.isCancelled = true;
    this.limiter.clearQueue();
    this.resume();
  }

  public get paused(): boolean {
    return this.isPaused;
  }

  public get cancelled(): boolean {
    return this.isCancelled;
  }

  public async scan(
    tabs: Array<{ url: string; title: string; groupId?: number }>,
    onProgress: (progress: HealthScanProgress, currentResult: LinkHealthResult, allResults: Record<string, LinkHealthResult>) => void,
    options?: ScanOptions
  ): Promise<Record<string, LinkHealthResult>> {
    this.isCancelled = false;
    this.isPaused = false;

    const checkableUrls: string[] = [];
    const seen = new Set<string>();

    for (const t of tabs) {
      if (t && t.url && isCheckableUrl(t.url) && !seen.has(t.url)) {
        seen.add(t.url);
        checkableUrls.push(t.url);
      }
    }

    const total = checkableUrls.length;
    const results: Record<string, LinkHealthResult> = {};

    // 1. Pre-fill from cache if not forcing refresh
    const cache = options?.forceRefresh ? {} : await getLinkHealthCache();
    const urlsToFetch: string[] = [];

    for (const url of checkableUrls) {
      if (cache[url] && !options?.forceRefresh) {
        results[url] = cache[url];
      } else {
        urlsToFetch.push(url);
      }
    }

    let checked = Object.keys(results).length;
    let healthyCount = 0;
    let redirectedCount = 0;
    let protectedCount = 0;
    let brokenCount = 0;
    let unreachableCount = 0;

    const countStatus = (status: LinkHealthStatus) => {
      if (status === 'healthy') healthyCount++;
      else if (status === 'redirected') redirectedCount++;
      else if (status === 'protected') protectedCount++;
      else if (status === 'broken') brokenCount++;
      else if (status === 'unreachable') unreachableCount++;
    };

    // Count cached items
    for (const res of Object.values(results)) {
      countStatus(res.status);
    }

    const startTime = Date.now();

    const reportProgress = (currentRes: LinkHealthResult) => {
      const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
      const velocity = Number((checked / elapsedSec).toFixed(1));
      onProgress(
        {
          total,
          checked,
          healthy: healthyCount,
          redirected: redirectedCount,
          protected: protectedCount,
          broken: brokenCount,
          unreachable: unreachableCount,
          isScanning: checked < total && !this.isCancelled,
          isPaused: this.isPaused,
          velocity,
        },
        currentRes,
        results
      );
    };

    // Initial progress report for cached items
    if (checked > 0) {
      reportProgress(Object.values(results)[0]);
    }

    let saveCounter = 0;

    // Scan remaining URLs through limiter
    const promises = urlsToFetch.map(async (url) => {
      if (this.isCancelled) return;

      // Handle pause
      if (this.isPaused) {
        await new Promise<void>((r) => {
          this.pauseResolver = r;
        });
      }

      if (this.isCancelled) return;

      const res = await this.limiter.enqueue(url, () =>
        checkSingleUrl(url, options?.timeoutMs || 8000)
      );

      if (this.isCancelled) return;

      results[url] = res;
      checked++;
      countStatus(res.status);
      reportProgress(res);

      saveCounter++;
      // Batch save cache every 20 items to avoid storage IPC churn
      if (saveCounter % 20 === 0) {
        saveLinkHealthCache(results).catch(() => {});
      }
    });

    await Promise.all(promises);

    // Final cache persistence
    await saveLinkHealthCache(results);

    return results;
  }
}

// =============================================================================
// Batch Resolution Actions (Atomic with Rollback Backup)
// =============================================================================

/**
 * Updates all instances of redirected URLs across all saved groups.
 */
export async function applyBatchRedirects(
  redirects: Array<{ oldUrl: string; newUrl: string }>
): Promise<{ updatedCount: number; affectedGroupsCount: number }> {
  if (!redirects || redirects.length === 0) {
    return { updatedCount: 0, affectedGroupsCount: 0 };
  }

  // 1. Create rolling backup snapshot for 100% undo safety
  await createRollingBackup();

  const groups = await getGroups();
  const redirectMap = new Map<string, string>();
  for (const r of redirects) {
    if (r.oldUrl && r.newUrl && r.oldUrl !== r.newUrl) {
      redirectMap.set(r.oldUrl, r.newUrl);
    }
  }

  let updatedCount = 0;
  let affectedGroupsCount = 0;

  const updatedGroups: TabGroup[] = groups.map((g) => {
    let groupChanged = false;
    const newTabs = g.tabs.map((t) => {
      if (t.url && redirectMap.has(t.url)) {
        const replacement = redirectMap.get(t.url)!;
        updatedCount++;
        groupChanged = true;
        return { ...t, url: replacement };
      }
      return t;
    });

    if (groupChanged) {
      affectedGroupsCount++;
      return { ...g, tabs: newTabs };
    }
    return g;
  });

  if (updatedCount > 0) {
    await safeStorageSet({ tabGroups: updatedGroups });

    // Update local health cache to reflect the new URLs
    const cache = await getLinkHealthCache();
    for (const [oldUrl, newUrl] of redirectMap.entries()) {
      if (cache[oldUrl]) {
        delete cache[oldUrl];
        cache[newUrl] = {
          url: newUrl,
          status: 'healthy',
          statusCode: 200,
          checkedAt: new Date().toISOString(),
        };
      }
    }
    await saveLinkHealthCache(cache);
  }

  return { updatedCount, affectedGroupsCount };
}

/**
 * Moves all broken tabs out of their current groups and consolidates them into a new quarantine group.
 */
export async function quarantineBrokenLinks(
  brokenUrls: string[],
  quarantineTitle?: string
): Promise<{ quarantinedCount: number; newGroupId: number | null }> {
  if (!brokenUrls || brokenUrls.length === 0) {
    return { quarantinedCount: 0, newGroupId: null };
  }

  await createRollingBackup();

  const groups = await getGroups();
  const brokenSet = new Set(brokenUrls);
  const quarantinedTabs: Tab[] = [];
  const updatedGroups: TabGroup[] = [];

  for (const g of groups) {
    const remainingTabs: Tab[] = [];
    for (const t of g.tabs) {
      if (t.url && brokenSet.has(t.url)) {
        quarantinedTabs.push(t);
      } else {
        remainingTabs.push(t);
      }
    }
    // Only keep group if it still has tabs
    if (remainingTabs.length > 0) {
      updatedGroups.push({ ...g, tabs: remainingTabs });
    }
  }

  if (quarantinedTabs.length === 0) {
    return { quarantinedCount: 0, newGroupId: null };
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const newGroupId = Date.now() + Math.floor(Math.random() * 1000);

  const quarantineGroup: TabGroup = {
    id: newGroupId,
    date: now.toISOString(),
    name: quarantineTitle || `Broken Links Archive (${dateStr})`,
    color: 'rose',
    tabs: quarantinedTabs,
  };

  updatedGroups.unshift(quarantineGroup);
  await safeStorageSet({ tabGroups: updatedGroups });

  return { quarantinedCount: quarantinedTabs.length, newGroupId };
}

/**
 * Permanently removes all broken tabs from all groups.
 */
export async function purgeBrokenLinks(
  brokenUrls: string[]
): Promise<{ purgedCount: number; affectedGroupsCount: number }> {
  if (!brokenUrls || brokenUrls.length === 0) {
    return { purgedCount: 0, affectedGroupsCount: 0 };
  }

  await createRollingBackup();

  const groups = await getGroups();
  const brokenSet = new Set(brokenUrls);
  let purgedCount = 0;
  let affectedGroupsCount = 0;

  const updatedGroups: TabGroup[] = [];

  for (const g of groups) {
    let groupChanged = false;
    const remainingTabs: Tab[] = [];
    for (const t of g.tabs) {
      if (t.url && brokenSet.has(t.url)) {
        purgedCount++;
        groupChanged = true;
      } else {
        remainingTabs.push(t);
      }
    }
    if (groupChanged) {
      affectedGroupsCount++;
    }
    // Only keep non-empty groups
    if (remainingTabs.length > 0) {
      updatedGroups.push({ ...g, tabs: remainingTabs });
    }
  }

  if (purgedCount > 0) {
    await safeStorageSet({ tabGroups: updatedGroups });
  }

  return { purgedCount, affectedGroupsCount };
}

/**
 * Generates an official Internet Archive Wayback Machine snapshot lookup link.
 */
export function getWaybackUrl(url: string): string {
  if (!url) return '';
  return `https://web.archive.org/web/*/${encodeURI(url)}`;
}
