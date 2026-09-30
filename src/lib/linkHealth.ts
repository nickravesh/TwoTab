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
  isWaitingForNetwork: boolean;
  velocity: number; // links per second
}

export const LINK_HEALTH_CACHE_KEY = 'twotab_link_health_cache';
export const LINK_HEALTH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days TTL
export const LINK_HEALTH_SCAN_STATE_KEY = 'twotab_link_health_scan_state';

export interface LinkHealthScanState {
  isScanning: boolean;
  isPaused: boolean;
  isWaitingForNetwork: boolean;
  total: number;
  checked: number;
  healthy: number;
  redirected: number;
  protected: number;
  broken: number;
  unreachable: number;
  velocity: number;
  lastUpdated: string;
}

export const DEFAULT_LINK_HEALTH_SCAN_STATE: LinkHealthScanState = {
  isScanning: false,
  isPaused: false,
  isWaitingForNetwork: false,
  total: 0,
  checked: 0,
  healthy: 0,
  redirected: 0,
  protected: 0,
  broken: 0,
  unreachable: 0,
  velocity: 0,
  lastUpdated: '',
};

export async function getLinkHealthScanState(): Promise<LinkHealthScanState> {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return DEFAULT_LINK_HEALTH_SCAN_STATE;
  }
  try {
    const data = await chrome.storage.local.get(LINK_HEALTH_SCAN_STATE_KEY);
    return (data[LINK_HEALTH_SCAN_STATE_KEY] as LinkHealthScanState) || DEFAULT_LINK_HEALTH_SCAN_STATE;
  } catch (e) {
    return DEFAULT_LINK_HEALTH_SCAN_STATE;
  }
}

export async function saveLinkHealthScanState(state: LinkHealthScanState): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
  try {
    await safeStorageSet({ [LINK_HEALTH_SCAN_STATE_KEY]: state });
  } catch (e) {
    console.warn('[TwoTab LinkHealth] Failed to persist scan state:', e);
  }
}

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
// Internet Connectivity Guardian
// =============================================================================

export class NetworkOfflineError extends Error {
  constructor(message = 'Internet connection offline') {
    super(message);
    this.name = 'NetworkOfflineError';
  }
}

/**
 * Checks if an error indicates a full device network disconnection vs single-site error.
 */
export function isPotentialNetworkDrop(err: any): boolean {
  if (!err) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = (err.message || String(err)).toLowerCase();
  const name = (err.name || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('networkerror') ||
    msg.includes('err_internet_disconnected') ||
    msg.includes('err_network_changed') ||
    msg.includes('err_name_not_resolved') ||
    msg.includes('err_connection_reset') ||
    msg.includes('err_address_unreachable') ||
    msg.includes('enotfound') ||
    msg.includes('econnrefused') ||
    name === 'networkofflineerror'
  );
}

/**
 * Verifies if the browser has genuine internet connectivity via live probes.
 */
export async function checkInternetConnectivity(timeoutMs = 2500): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  if (typeof fetch === 'undefined') return true;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Fast probe to Google generate_204 endpoint with random query to avoid cache
    await fetch(`https://www.google.com/generate_204?_t=${Date.now()}`, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timer);
    return true;
  } catch (_) {
    // Secondary fast probe to Cloudflare CDN endpoint
    try {
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), 2000);
      await fetch(`https://1.1.1.1/cdn-cgi/trace?_t=${Date.now()}`, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller2.signal,
      });
      clearTimeout(timer2);
      return true;
    } catch (_) {
      return false;
    }
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
  timeoutMs: number = 8000,
  parentSignal?: AbortSignal
): Promise<LinkHealthResult> {
  if (!isCheckableUrl(url)) {
    return {
      url,
      status: 'unreachable',
      error: 'Non-HTTP protocol',
      checkedAt: new Date().toISOString(),
    };
  }

  // Pre-check offline status
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new NetworkOfflineError();
  }

  const checkedAt = new Date().toISOString();

  // Helper for fetch with timeout & combined abort signal
  const runFetch = async (method: 'HEAD' | 'GET'): Promise<{ response: Response; finalUrl: string }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // If parent signal aborts (e.g. user clicked Pause), abort immediately!
    const onParentAbort = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) {
        clearTimeout(timer);
        throw new DOMException('Aborted by parent signal', 'AbortError');
      }
      parentSignal.addEventListener('abort', onParentAbort);
    }

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
      if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
      return { response: res, finalUrl: res.url || url };
    } catch (err: any) {
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
      throw err;
    }
  };

  try {
    let result: { response: Response; finalUrl: string };

    try {
      result = await runFetch('HEAD');
    } catch (headErr: any) {
      if (parentSignal?.aborted) {
        throw headErr;
      }
      // If HEAD fails due to timeout or abort, classify as unreachable/timeout
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
      // Fallback to GET
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
        if (parentSignal?.aborted) throw getErr;
        if (isPotentialNetworkDrop(getErr)) {
          const isOnline = await checkInternetConnectivity(1500);
          if (!isOnline) throw new NetworkOfflineError();
        }
        return evaluateError(url, getErr, checkedAt);
      }
    }

    return evaluateResponse(url, response, finalUrl, checkedAt);
  } catch (err: any) {
    if (parentSignal?.aborted) {
      throw err;
    }
    // Check if failure is due to device network disconnection
    if (isPotentialNetworkDrop(err)) {
      const isOnline = await checkInternetConnectivity(1500);
      if (!isOnline) {
        throw new NetworkOfflineError();
      }
    }
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
// Domain Rate Limiter & Concurrency Scheduler (Leaky Bucket with Pause Guard)
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
  private isPaused = false;
  private pauseResolvers: Array<() => void> = [];

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

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      const resolvers = [...this.pauseResolvers];
      this.pauseResolvers = [];
      resolvers.forEach((r) => r());
      this.pump();
    }
  }

  public clearQueue(): void {
    this.queue = [];
  }

  public get pendingCount(): number {
    return this.queue.length;
  }

  public get activeCount(): number {
    return this.activeGlobal;
  }

  private async pump(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      while (this.activeGlobal < this.maxGlobal && this.queue.length > 0) {
        if (this.isPaused) {
          // Pause execution
          await new Promise<void>((resolve) => {
            this.pauseResolvers.push(resolve);
          });
          if (this.isPaused) break;
        }

        // Find next item whose domain isn't exceeding per-domain limit
        const index = this.queue.findIndex((item) => {
          const count = this.activeDomains.get(item.domain) || 0;
          return count < this.maxPerDomain;
        });

        if (index === -1) {
          // All pending domains are currently busy at capacity
          break;
        }

        const item = this.queue.splice(index, 1)[0];
        if (!item) break;
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
// Library Scanner Controller with Instant Pause & Network Guardian
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
  private isWaitingForNetwork = false;
  private pauseResolvers: Array<() => void> = [];
  private networkResolvers: Array<() => void> = [];
  private networkCheckInterval: any = null;
  private activeAbortControllers: Set<AbortController> = new Set();

  constructor(options?: ScanOptions) {
    this.limiter = new DomainRateLimiter(
      options?.maxGlobalConcurrency || 6,
      options?.maxPerDomainConcurrency || 2,
      35
    );
  }

  public pause(): void {
    this.isPaused = true;
    this.limiter.pause();
    // Instantly abort all active in-flight fetches so pause takes effect in 0ms!
    for (const ctrl of this.activeAbortControllers) {
      try {
        ctrl.abort();
      } catch (_) {}
    }
    this.activeAbortControllers.clear();
  }

  public resume(): void {
    this.isPaused = false;
    this.isWaitingForNetwork = false;
    this.limiter.resume();
    const resolvers = [...this.pauseResolvers];
    this.pauseResolvers = [];
    resolvers.forEach((r) => r());
  }

  public cancel(): void {
    this.isCancelled = true;
    this.limiter.clearQueue();
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
      this.networkCheckInterval = null;
    }
    for (const ctrl of this.activeAbortControllers) {
      try {
        ctrl.abort();
      } catch (_) {}
    }
    this.activeAbortControllers.clear();
    this.resume();
  }

  public get paused(): boolean {
    return this.isPaused;
  }

  public get waitingForNetwork(): boolean {
    return this.isWaitingForNetwork;
  }

  public get cancelled(): boolean {
    return this.isCancelled;
  }

  private async waitForResume(): Promise<void> {
    if (!this.isPaused) return;
    await new Promise<void>((resolve) => {
      this.pauseResolvers.push(resolve);
    });
  }

  private async waitForNetwork(): Promise<void> {
    if (!this.isWaitingForNetwork) return;
    await new Promise<void>((resolve) => {
      this.networkResolvers.push(resolve);
    });
  }

  public async scan(
    tabs: Array<{ url: string; title: string; groupId?: number }>,
    onProgress: (progress: HealthScanProgress, currentResult: LinkHealthResult, allResults: Record<string, LinkHealthResult>) => void,
    options?: ScanOptions
  ): Promise<Record<string, LinkHealthResult>> {
    this.isCancelled = false;
    this.isPaused = false;
    this.isWaitingForNetwork = false;

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
    const pendingUrls: string[] = [];

    for (const url of checkableUrls) {
      if (cache[url] && !options?.forceRefresh) {
        results[url] = cache[url];
      } else {
        pendingUrls.push(url);
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
          isWaitingForNetwork: this.isWaitingForNetwork,
          velocity,
        },
        currentRes,
        results
      );
    };

    // Initial progress report for cached items
    if (checked > 0) {
      const firstRes = Object.values(results)[0];
      if (firstRes) {
        reportProgress(firstRes);
      }
    }

    let saveCounter = 0;

    // Worker queue pipeline (Worker Pool)
    const workerCount = Math.min(options?.maxGlobalConcurrency || 6, Math.max(1, pendingUrls.length));

    const runWorker = async () => {
      while (pendingUrls.length > 0 && !this.isCancelled) {
        // 1. Pause Gate
        if (this.isPaused) {
          await this.waitForResume();
        }
        if (this.isCancelled) break;

        // 2. Network Offline Gate
        if (this.isWaitingForNetwork) {
          await this.waitForNetwork();
        }
        if (this.isCancelled) break;

        const url = pendingUrls.shift();
        if (!url) break;

        const abortCtrl = new AbortController();
        this.activeAbortControllers.add(abortCtrl);

        try {
          const res = await this.limiter.enqueue(url, () =>
            checkSingleUrl(url, options?.timeoutMs || 8000, abortCtrl.signal)
          );

          this.activeAbortControllers.delete(abortCtrl);

          if (this.isCancelled) break;
          if (this.isPaused) {
            // Put aborted URL back on queue for resume
            pendingUrls.unshift(url);
            continue;
          }

          results[url] = res;
          checked++;
          countStatus(res.status);
          reportProgress(res);

          saveCounter++;
          if (saveCounter % 20 === 0) {
            saveLinkHealthCache(results).catch(() => {});
          }
        } catch (err: any) {
          this.activeAbortControllers.delete(abortCtrl);

          if (this.isCancelled) break;

          if (this.isPaused) {
            // Request was aborted by user clicking Pause: Push back to pendingUrls
            pendingUrls.unshift(url);
            continue;
          }

          if (err instanceof NetworkOfflineError || err.name === 'NetworkOfflineError' || isPotentialNetworkDrop(err)) {
            // Check if full network is offline
            const online = await checkInternetConnectivity(1500);
            if (!online) {
              // General network disconnection: Put URL back into queue!
              pendingUrls.unshift(url);

              // Abort all other active requests immediately and put them back in queue
              for (const ctrl of this.activeAbortControllers) {
                try { ctrl.abort(); } catch (_) {}
              }
              this.activeAbortControllers.clear();

              if (!this.isWaitingForNetwork) {
                this.isWaitingForNetwork = true;
                this.limiter.pause();

                reportProgress({
                  url,
                  status: 'unreachable',
                  error: 'Waiting for internet connection...',
                  checkedAt: new Date().toISOString(),
                });

                // Start auto-recovery watcher
                this.startNetworkRecoveryWatcher(() => {
                  const resolvers = [...this.networkResolvers];
                  this.networkResolvers = [];
                  resolvers.forEach((r) => r());
                });
              }

              await this.waitForNetwork();
              continue;
            }
          }

          // Individual unreachable URL
          results[url] = {
            url,
            status: 'unreachable',
            error: err.message || 'Request failed',
            checkedAt: new Date().toISOString(),
          };
          checked++;
          unreachableCount++;
          reportProgress(results[url]);
        }
      }
    };

    const workers = Array.from({ length: workerCount }, () => runWorker());
    await Promise.all(workers);

    // Final cache persistence
    await saveLinkHealthCache(results);

    return results;
  }

  private startNetworkRecoveryWatcher(onRecovered: () => void): void {
    if (this.networkCheckInterval) clearInterval(this.networkCheckInterval);

    const startedWaitingAt = Date.now();
    const TEN_MINUTES_MS = 10 * 60 * 1000;

    this.networkCheckInterval = setInterval(async () => {
      if (this.isCancelled) {
        clearInterval(this.networkCheckInterval);
        this.networkCheckInterval = null;
        return;
      }

      // Check if 10-minute timeout exceeded
      if (Date.now() - startedWaitingAt > TEN_MINUTES_MS) {
        clearInterval(this.networkCheckInterval);
        this.networkCheckInterval = null;
        this.isWaitingForNetwork = false;
        this.pause(); // Convert to standard pause
        return;
      }

      // Probe connectivity
      const online = await checkInternetConnectivity(1500);
      if (online) {
        clearInterval(this.networkCheckInterval);
        this.networkCheckInterval = null;
        this.isWaitingForNetwork = false;
        this.limiter.resume();
        onRecovered();
      }
    }, 2000);
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
    color: 'red',
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
