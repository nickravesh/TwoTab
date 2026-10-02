// =============================================================================
// TwoTab Intelligent Tab Grouping — Tab Metadata Normalization Engine
// =============================================================================
// Features:
// 1. Aggressive tracking parameter stripping (110+ params, utm_*, hsa_*, etc.)
// 2. Recursive dormant tab unwrapping (dormant.html?url=...&title=...)
// 3. Robust browser scheme & domain extraction (chrome://, about:, file:, etc.)
// 4. Noise-free title cleaning & HTML entity decoding
// 5. Meaningful path segment extraction and semantic query preservation
// 6. Structured semantic prompt synthesis ("Title: ... Domain: ... Path: ...")
// 7. Deterministic 64-bit cyrb53 hash generation
// =============================================================================

import type {
  Tab,
  NormalizedTabMetadata,
  NormalizeTabOptions,
  CleanDomainInfo,
  UnwrappedTab,
  SanitizedUrlResult,
} from './types';
import {
  EXTENDED_TRACKING_PARAMS,
  TRACKING_PARAM_PREFIX_REGEX,
  FUNCTIONAL_PARAMS_SAFELIST,
  SEMANTIC_QUERY_PARAMS,
  MAX_SEMANTIC_PROMPT_LENGTH,
  MAX_PATH_SEGMENTS,
  MAX_DORMANT_UNWRAP_DEPTH,
} from './constants';
import { MULTI_PART_TLDS } from '../domainOrganizer';

// -----------------------------------------------------------------------------
// 1. Tracking Parameter Evaluator & Safeguard
// -----------------------------------------------------------------------------

/**
 * Evaluates whether a query parameter key is a marketing/telemetry/session tracker.
 * Strictly respects FUNCTIONAL_PARAMS_SAFELIST so search queries, pagination,
 * resource IDs, and application state are never stripped.
 */
export function isTrackingParameter(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const lower = key.toLowerCase();

  // Functional safelist check takes precedence
  if (FUNCTIONAL_PARAMS_SAFELIST.has(lower)) {
    return false;
  }

  // Exact match against known tracking parameters
  if (EXTENDED_TRACKING_PARAMS.has(lower)) {
    return true;
  }

  // Prefix pattern match (e.g. utm_*, hsa_*, pk_*, etc.)
  return TRACKING_PARAM_PREFIX_REGEX.test(lower);
}

// -----------------------------------------------------------------------------
// 2. Recursive Dormant Tab Unwrapping
// -----------------------------------------------------------------------------

const isPlaceholderTitle = (t: string): boolean => {
  const l = (t || '').toLowerCase().trim();
  return (
    !l ||
    l === 'dormant tab' ||
    l.startsWith('dormant tab') ||
    l.startsWith('opening') ||
    l.startsWith('loading dormant') ||
    l === 'dormant without url'
  );
};

/**
 * Recursively unwraps dormant tab wrappers up to maxDepth iterations to extract
 * the original destination URL and title. Handles relative paths, nested wrappers,
 * and double-encoded query parameters.
 */
export function unwrapDormantTab(
  url?: string,
  title?: string,
  maxDepth: number = MAX_DORMANT_UNWRAP_DEPTH
): UnwrappedTab {
  let currentUrl = (url || '').trim();
  let currentTitle = (title || '').trim();

  for (let depth = 0; depth < maxDepth; depth++) {
    if (!currentUrl) break;

    // Fast check: string must contain dormant.html to be a dormant wrapper
    if (!currentUrl.includes('dormant.html')) {
      break;
    }

    let parsed: URL;
    try {
      // Use chrome-extension dummy base to gracefully handle relative paths (/dormant.html?url=...)
      parsed = new URL(currentUrl, 'chrome-extension://dummy-twotab-base');
    } catch {
      break;
    }

    if (parsed.pathname.includes('dormant.html')) {
      // Extract original title from query parameter if available
      const encodedTitle = parsed.searchParams.get('title');
      if (encodedTitle) {
        let decodedTitle = encodedTitle.trim();
        try {
          decodedTitle = decodeURIComponent(decodedTitle);
        } catch {
          // Keep raw if malformed percent sequence
        }

        if (isPlaceholderTitle(currentTitle) || !isPlaceholderTitle(decodedTitle)) {
          if (!isPlaceholderTitle(decodedTitle) || isPlaceholderTitle(currentTitle)) {
            currentTitle = decodedTitle;
          }
        }
      }

      // Extract target URL from query parameter
      const targetUrl = parsed.searchParams.get('url');
      if (targetUrl && targetUrl.trim()) {
        let cleanTarget = targetUrl.trim();
        // Only decode if still percent-encoded protocol
        if (/^(https?%3A|chrome-extension%3A)/i.test(cleanTarget)) {
          try {
            cleanTarget = decodeURIComponent(cleanTarget);
          } catch {
            // Keep raw
          }
        }
        currentUrl = cleanTarget;
        continue; // Recurse to handle nested dormant wrappers
      }
    }

    break;
  }

  return {
    url: currentUrl,
    title: currentTitle,
    cleanUrl: currentUrl,
    cleanTitle: currentTitle,
  };
}

// -----------------------------------------------------------------------------
// 3. URL Sanitization & Canonicalization
// -----------------------------------------------------------------------------

class SanitizedUrlContainer implements SanitizedUrlResult {
  constructor(
    public cleanUrl: string,
    public queryParams: URLSearchParams
  ) {}

  toString(): string {
    return this.cleanUrl;
  }

  [Symbol.toPrimitive](): string {
    return this.cleanUrl;
  }
}

/**
 * Sanitizes and canonicalizes a URL by stripping tracking parameters,
 * default ports (:80, :443), and fragments, while sorting remaining
 * functional search parameters deterministically.
 */
export function sanitizeUrl(
  rawUrl: string,
  options?: NormalizeTabOptions
): SanitizedUrlResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return new SanitizedUrlContainer('', new URLSearchParams());
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return new SanitizedUrlContainer('', new URLSearchParams());
  }

  try {
    const parsed = new URL(trimmed);

    // Strip hash fragment unless explicitly preserved
    parsed.hash = '';

    // Strip tracking parameters
    if (options?.stripTracking !== false) {
      const keysToDelete: string[] = [];
      parsed.searchParams.forEach((_, key) => {
        if (isTrackingParameter(key)) {
          keysToDelete.push(key);
        }
      });
      for (const key of keysToDelete) {
        parsed.searchParams.delete(key);
      }
    }

    // Sort remaining parameters deterministically
    parsed.searchParams.sort();

    // Strip default ports
    if (
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')
    ) {
      parsed.port = '';
    }

    const cleanUrl = parsed.toString();
    return new SanitizedUrlContainer(cleanUrl, parsed.searchParams);
  } catch {
    // Return raw trimmed URL for unparseable schemes
    return new SanitizedUrlContainer(trimmed, new URLSearchParams());
  }
}

// -----------------------------------------------------------------------------
// 4. Domain & Hostname Extraction
// -----------------------------------------------------------------------------

class CleanDomainContainer implements CleanDomainInfo {
  constructor(
    public rootDomain: string,
    public cleanHost: string
  ) {}

  toString(): string {
    return this.cleanHost;
  }

  [Symbol.toPrimitive](): string {
    return this.cleanHost;
  }
}

/**
 * Extracts normalized root domain and clean hostname across web and browser schemes.
 */
export function extractCleanDomain(url: string): CleanDomainInfo {
  if (!url || typeof url !== 'string') {
    return new CleanDomainContainer('', '');
  }

  let target = url.trim();
  if (!target) {
    return new CleanDomainContainer('', '');
  }

  // Handle view-source: prefix
  if (target.toLowerCase().startsWith('view-source:')) {
    target = target.slice(12).trim();
  }

  // Handle blob: prefix
  if (target.toLowerCase().startsWith('blob:')) {
    target = target.slice(5).trim();
  }

  try {
    const parsed = new URL(target, 'http://localhost');

    // Internal browser schemes
    if (parsed.protocol === 'chrome:') {
      const host = `chrome://${parsed.hostname || 'settings'}`;
      return new CleanDomainContainer(host, host);
    }
    if (parsed.protocol === 'edge:') {
      const host = `edge://${parsed.hostname || 'settings'}`;
      return new CleanDomainContainer(host, host);
    }
    if (parsed.protocol === 'brave:') {
      const host = `brave://${parsed.hostname || 'settings'}`;
      return new CleanDomainContainer(host, host);
    }
    if (parsed.protocol === 'about:') {
      const host = `about:${parsed.pathname || 'blank'}`;
      return new CleanDomainContainer(host, host);
    }
    if (parsed.protocol === 'chrome-extension:') {
      return new CleanDomainContainer('chrome-extension', 'chrome-extension');
    }
    if (parsed.protocol === 'file:') {
      return new CleanDomainContainer('local-file', 'local-file');
    }
    if (parsed.protocol === 'data:') {
      return new CleanDomainContainer('data', 'data');
    }
    if (parsed.protocol === 'javascript:') {
      return new CleanDomainContainer('javascript', 'javascript');
    }

    // Standard web hostname
    let cleanHost = parsed.hostname.toLowerCase();
    if (cleanHost.startsWith('www.')) {
      cleanHost = cleanHost.slice(4);
    } else if (cleanHost.startsWith('m.')) {
      cleanHost = cleanHost.slice(2);
    }

    // Preserve non-default ports
    const portSuffix =
      parsed.port && parsed.port !== '80' && parsed.port !== '443'
        ? `:${parsed.port}`
        : '';

    const hostWithPort = `${cleanHost}${portSuffix}`;

    // Extract root domain
    const parts = cleanHost.split('.');
    let rootDomain = cleanHost;

    if (parts.length >= 3) {
      const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
      if (MULTI_PART_TLDS.has(lastTwo)) {
        rootDomain = `${parts[parts.length - 3]}.${lastTwo}`;
      } else {
        rootDomain = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
      }
    }

    const rootDomainWithPort = `${rootDomain}${portSuffix}`;

    return new CleanDomainContainer(rootDomainWithPort, hostWithPort);
  } catch {
    const fallback = target.split('/')[0] || '';
    return new CleanDomainContainer(fallback, fallback);
  }
}

// -----------------------------------------------------------------------------
// 5. Title Normalization & Entity Decoding
// -----------------------------------------------------------------------------

/**
 * Pure TypeScript HTML entity decoder. Safe for Service Workers and Web Workers.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes('&')) return text;

  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

const NOTIFICATION_BADGE_REGEX = /^(\([0-9+]+\)|\[[0-9+]+\]|\*[ ]*)\s*/;

const COMMON_BRAND_SUFFIX_REGEX =
  /\s*[-–—|•/·:]\s*(youtube|github|wikipedia|reddit|medium|twitter|x|amazon|stackoverflow|google search|substack|linkedin|facebook|instagram|notion|figma|confluence|jira|pinterest|bing|ieeexplore|ieee xplore|acm digital library|arxiv|maktabkhooneh|مکتب\s*خونه|مکتب‌خونه|آپارات|دیجی‌کالا|ورزش سه)$/i;

const COMMON_BRAND_PREFIX_REGEX =
  /^(youtube|github|wikipedia|amazon(?:\.com)?|google)\s*[-–—|•/·:]\s*/i;

const COMMON_TUTORIAL_PREFIX_REGEX =
  /^(?:آموزش(?:\s+مفاهیم|\s+جامع|\s+مقدماتی|\s+کامل|\s+تخصصی)?\s*[-–—|•/·:]?\s*|دوره(?:\s+آموزش(?:\s+جامع|\s+کامل)?)?\s*[-–—|•/·:]?\s*|tutorial:\s*|course:\s*)/i;

const ECOMMERCE_PREFIX_REGEX =
  /^(?:مشخصات[،,\s]+)?(?:قیمت\s+و\s+خرید|خرید\s+و\s+قیمت|خرید\s+اینترنتی|قیمت|مشخصات)\s*[-–—|•/·:]?\s*/i;

const ENGLISH_SHOPPING_PREFIX_REGEX =
  /^(?:buy\s+|shop\s+(?:for\s+)?|order\s+)/i;

const PINTEREST_PIN_PREFIX_REGEX =
  /^pin\s+(?:by\s+[^|–—]+?\s+)?on\s+/i;

/**
 * Cleans a tab title by decoding HTML entities, stripping notification badges,
 * removing trailing brand suffixes, and collapsing whitespace.
 * Never strips a title completely if the title itself is the brand name.
 */
export function cleanTabTitle(rawTitle?: string, domain?: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') return '';

  let title = rawTitle.trim();
  if (!title) return '';

  // 1. Decode HTML entities and normalize typographic curly quotes
  title = decodeHtmlEntities(title);
  title = title.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

  // 2. Strip notification badge prefixes like (3) or [99+]
  title = title.replace(NOTIFICATION_BADGE_REGEX, '');

  // 2b. Strip trailing reddit subreddit suffixes (e.g. ": r/applehelp" or "- r/openclaw")
  title = title.replace(/\s*[-–—|•/·:]\s*r\/[a-zA-Z0-9_]+$/i, '').trim();

  // 2c. Normalize inline subreddit mentions (e.g. "r/openclaw" -> "openclaw")
  title = title.replace(/\br\/([a-zA-Z0-9_]+)\b/g, '$1');

  // 3. Strip common brand suffixes (only if remaining text is at least 2 chars)
  const strippedSuffix = title.replace(COMMON_BRAND_SUFFIX_REGEX, '').trim();
  if (strippedSuffix.length >= 2) {
    title = strippedSuffix;
  }

  // 4. Strip common brand prefixes (only if remaining text is at least 2 chars)
  const strippedPrefix = title.replace(COMMON_BRAND_PREFIX_REGEX, '').trim();
  if (strippedPrefix.length >= 2) {
    title = strippedPrefix;
  }

  // 5. Strip generic course/tutorial prefixes (only if remaining text is at least 2 chars)
  const strippedTutorial = title.replace(COMMON_TUTORIAL_PREFIX_REGEX, '').trim();
  if (strippedTutorial.length >= 2) {
    title = strippedTutorial;
  }

  // 5a. Strip e-commerce transactional prefixes
  const strippedEcommerce = title.replace(ECOMMERCE_PREFIX_REGEX, '').trim();
  if (strippedEcommerce.length >= 2) {
    title = strippedEcommerce;
  }
  const strippedEnglishShop = title.replace(ENGLISH_SHOPPING_PREFIX_REGEX, '').trim();
  if (strippedEnglishShop.length >= 2) {
    title = strippedEnglishShop;
  }

  // 5b. Strip Pinterest pin prefix ("Pin by Sarah on ...")
  const strippedPin = title.replace(PINTEREST_PIN_PREFIX_REGEX, '').trim();
  if (strippedPin.length >= 2) {
    title = strippedPin;
  }

  // 6. Strip domain-specific brand suffix if domain provided
  if (domain) {
    const baseName = domain.replace(/^(www\.|m\.)/, '').split('.')[0];
    if (baseName && baseName.length > 2 && !['chrome', 'local', 'data', 'about'].includes(baseName)) {
      const dynamicBrandRegex = new RegExp(`\\s*[-–—|•/·:]\\s*${baseName}(?:\\.[a-z]{2,4})?$`, 'i');
      const strippedDomainBrand = title.replace(dynamicBrandRegex, '').trim();
      if (strippedDomainBrand.length >= 2) {
        title = strippedDomainBrand;
      }
    }
  }

  // 7. Collapse whitespace and trim hanging punctuation
  title = title.replace(/\s+/g, ' ').replace(/^[-–—|•/·:\s]+|[-–—|•/·:\s]+$/g, '').trim();

  return title;
}

// -----------------------------------------------------------------------------
// 6. Path Segment Extraction & Noise Filtering
// -----------------------------------------------------------------------------

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_HASH_REGEX = /^[0-9a-f]{12,}$/i;
const PURE_NUMERIC_REGEX = /^\d+$/;
const WEB_EXT_REGEX = /\.(html?|php|aspx?|jsp|do|action|cgi)$/i;
const HASH_SLUG_SUFFIX_REGEX = /-[0-9a-f]{8,12}$/i;
const LANGUAGE_CODE_REGEX = /^(en|en-us|en-gb|es|fr|de|ja|zh|zh-cn|ru|ko|pt|it)$/i;

export const GENERIC_PATH_ROUTING_TOKENS: ReadonlySet<string> = new Set([
  'watch', 'pin', 'pins', 'course', 'courses', 'document', 'documents',
  'feed', 'trending', 'video', 'videos',
  // E-commerce catalog routing tokens
  'product', 'products', 'goods', 'kala', 'dp', 'gp',
  // Navigation routing tokens
  'detail', 'details', 'view', 'show',
]);

/**
 * Extracts and cleans meaningful path tokens, filtering out UUIDs, commit hashes,
 * pure numbers, language prefixes, and file extensions.
 * Also synthesizes preserved semantic query parameters (q, search, tag, etc.).
 */
export function extractSanitizedPathSegments(
  pathname?: string,
  searchParams?: URLSearchParams,
  maxSegments: number = MAX_PATH_SEGMENTS
): string[] {
  const segments: string[] = [];

  if (pathname && typeof pathname === 'string') {
    const rawSegments = pathname.split('/').filter(Boolean);

    for (const raw of rawSegments) {
      let s = raw;
      try {
        s = decodeURIComponent(s);
      } catch {
        // Keep raw
      }

      // Strip file extensions
      s = s.replace(WEB_EXT_REGEX, '');

      // Skip trivial or index segments
      if (!s || s.toLowerCase() === 'index') continue;

      // Filter generic routing noise tokens (e.g. /watch, /pin, /course, /document, /product)
      if (GENERIC_PATH_ROUTING_TOKENS.has(s.toLowerCase())) {
        continue;
      }

      // Filter product catalog IDs like dkp-123456
      if (/^dkp[-_]?\d+$/i.test(s)) {
        continue;
      }

      // Filter UUIDs, hex commit hashes, and numeric database IDs
      if (UUID_REGEX.test(s) || HEX_HASH_REGEX.test(s) || PURE_NUMERIC_REGEX.test(s)) {
        continue;
      }

      // Filter language code prefixes
      if (LANGUAGE_CODE_REGEX.test(s)) {
        continue;
      }

      // Strip trailing random hash suffixes (e.g. slug-8f7a6b5c -> slug)
      s = s.replace(HASH_SLUG_SUFFIX_REGEX, '');

      // Replace hyphens and underscores with spaces
      s = s.replace(/[-_.]+/g, ' ').trim();

      if (s) {
        segments.push(s);
      }

      if (segments.length >= maxSegments) {
        break;
      }
    }
  }

  // Append preserved semantic search query parameters if present
  if (searchParams && segments.length < maxSegments) {
    for (const param of SEMANTIC_QUERY_PARAMS) {
      if (searchParams.has(param)) {
        const val = searchParams.get(param);
        if (val) {
          let cleanVal = val;
          try {
            cleanVal = decodeURIComponent(cleanVal);
          } catch {
            // Keep raw
          }
          cleanVal = cleanVal.replace(/[-_.]+/g, ' ').trim();
          if (cleanVal) {
            // Include parameter label and value to give distinct semantic context
            const queryToken = param === 'q' || param === 'query' || param === 'search'
              ? `${param} ${cleanVal}`
              : `${param}: ${cleanVal}`;
            segments.push(queryToken);
          }
        }
      }
      if (segments.length >= maxSegments) {
        break;
      }
    }
  }

  return segments;
}

// -----------------------------------------------------------------------------
// 7. Structured Semantic Prompt Synthesis
// -----------------------------------------------------------------------------

export const MULTI_TOPIC_PLATFORMS: ReadonlySet<string> = new Set([
  // Video & streaming
  'youtube.com', 'vimeo.com', 'dailymotion.com', 'aparat.com',
  // Search & social
  'google.com', 'bing.com', 'pinterest.com', 'reddit.com',
  'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
  // Mega e-commerce platforms (products of wildly different categories)
  'digikala.com', 'torob.com', 'emalls.ir', 'amazon.com', 'ebay.com',
  'aliexpress.com', 'walmart.com', 'target.com', 'etsy.com',
  // Content & blogging platforms
  'medium.com', 'substack.com', 'wordpress.com', 'blogspot.com', 'quora.com',
  // Online education & mega course hubs
  'maktabkhooneh.org', 'coursera.org', 'udemy.com', 'edx.org',
]);

/**
 * Builds the deterministic natural language prompt for the embedding model.
 * Format: "Title: <title>. Domain: <domain>. Path: <path>."
 * For multi-topic mega platforms where the platform name does not indicate the topic,
 * the domain token is suppressed to prevent artificial cross-topic domain clustering.
 * Capped to MAX_SEMANTIC_PROMPT_LENGTH (512 chars).
 */
export function buildSemanticPrompt(
  cleanTitle: string,
  cleanHost: string,
  pathSegments: string[]
): string {
  const title = (cleanTitle || cleanHost || 'Untitled').trim().replace(/\s+/g, ' ');
  const hostLower = (cleanHost || '').toLowerCase();
  const root = hostLower.split('.').slice(-2).join('.');
  const isMultiTopic = MULTI_TOPIC_PLATFORMS.has(hostLower) || MULTI_TOPIC_PLATFORMS.has(root);
  const domain = isMultiTopic ? '' : (cleanHost || 'unknown').trim();
  const pathStr = (pathSegments || []).join(' ').trim();

  const parts: string[] = [`Title: ${title}`];
  if (domain) {
    parts.push(`Domain: ${domain}`);
  }
  if (pathStr) {
    parts.push(`Path: ${pathStr}`);
  }

  const prompt = parts.join('. ') + '.';

  return prompt.length > MAX_SEMANTIC_PROMPT_LENGTH
    ? prompt.slice(0, MAX_SEMANTIC_PROMPT_LENGTH).trim()
    : prompt;
}

// -----------------------------------------------------------------------------
// 8. Deterministic Cyrb53 64-Bit Hash
// -----------------------------------------------------------------------------

/**
 * Fast 64-bit deterministic hash (cyrb53) returning a hex string.
 * Used for ephemeral embedding cache lookups.
 */
export function hashString(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// -----------------------------------------------------------------------------
// 9. Semantic Information Quality (SIQ) Evaluator
// -----------------------------------------------------------------------------

export const LOW_INFORMATION_THRESHOLD = 0.35;

export const GENERIC_PAGE_TITLES: ReadonlySet<string> = new Set([
  'home', 'homepage', 'welcome', 'official site', 'dashboard', 'new tab', 'untitled',
  'login', 'signin', 'sign in', 'signup', 'sign up', 'register', 'portal', 'index',
  'search', 'feed', 'explore', 'notifications', 'messages', 'settings', 'account',
  'profile', 'inbox', 'activity', 'overview', 'main', 'start', 'getting started',
  'watch later', 'subscriptions', 'history', 'library', 'trending',
  'error', 'error 403', '403 forbidden', 'error 403 (forbidden)', '403', '404',
  '404 not found', 'page not found', 'domain blocked', 'blocked', 'access denied',
  'pin', 'pins', 'quick saves',
  'pricing', 'plans', 'pricing plans', 'privacy policy', 'terms', 'terms of service',
  'terms of use', 'about', 'about us', 'contact', 'contact us', 'faq',
]);

export const INFRASTRUCTURE_STOPWORDS: ReadonlySet<string> = new Set([
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'io', 'ai', 'co', 'app', 'dev', 'ir', 'uk', 'de', 'fr', 'nl', 'ca', 'au', 'jp', 'cn', 'ru', 'ch', 'se', 'no', 'es', 'it', 'br', 'in', 'me', 'tv', 'cc', 'xyz', 'info', 'biz', 'online', 'site', 'store', 'tech',
  'www', 'm', 'mobile', 'api', 'web', 'mail', 'static', 'cdn', 'assets', 'img', 'media', 'download', 'downloads', 'index', 'html', 'php', 'aspx', 'jsp',
  'http', 'https', 'pin', 'pins', 'post', 'posts', 'view', 'views', 'photo', 'photos', 'item', 'items', 'product', 'products', 'watch', 'video', 'videos', 'channel',
]);

const INFORMATIVENESS_STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'in', 'of', 'to', 'for', 'with', 'on', 'at', 'by',
  'from', 'about', 'is', 'are', 'was', 'were', 'it', 'its', 'as', 'vs',
]);

/**
 * Deterministically calculates the Semantic Information Quality (SIQ) score for a tab.
 * Returns a score between 0.0 (generic platform boilerplate) and 1.0 (rich topical content).
 */
export function calculateTabInformativeness(
  tab: Tab,
  domainInfo: CleanDomainInfo,
  cleanTitle: string,
  pathSegments: string[],
  cleanUrl: string
): { informativeness: number; isLowInformation: boolean } {
  const titleLower = (cleanTitle || '').toLowerCase().trim();
  const domainLower = (domainInfo.cleanHost || domainInfo.rootDomain || '').toLowerCase();
  const rootBase = (domainInfo.rootDomain || '').split('.')[0]?.toLowerCase() || '';

  // 1a. Explicit HTTP Error and Browser Access Failure detection
  const isErrorPattern =
    /\b(401|403|404|500|502|503|504)\b/i.test(titleLower) &&
    /\b(error|forbidden|not found|bad gateway|service unavailable|access denied|permission|that's an error|that’s an error)\b/i.test(titleLower);

  const isBlockedPattern =
    /\b(domain blocked|access denied|site blocked|blocked by administrator)\b/i.test(titleLower);

  const isBrowserErrorPattern =
    /\b(this site can't be reached|this site can’t be reached|connection refused|network error|dns probe|err_connection|privacy error|your connection is not private|connection not secure|certificate error|ssl error|err_cert)\b/i.test(titleLower);

  if (isErrorPattern || isBlockedPattern || isBrowserErrorPattern) {
    return { informativeness: 0.05, isLowInformation: true };
  }

  // 1b. Direct platform/brand match check (including slogans on root URLs like "reddit: the front page")
  const isPlatformTitle =
    titleLower === rootBase ||
    titleLower === domainLower ||
    titleLower.startsWith(`${rootBase}.`) ||
    titleLower.startsWith(`www.${rootBase}`) ||
    titleLower.startsWith(`${rootBase}:`) ||
    titleLower.startsWith(`${rootBase} -`) ||
    titleLower.startsWith(`${rootBase} –`) ||
    titleLower.startsWith(`${rootBase} —`) ||
    titleLower.startsWith(`${rootBase} |`);

  // 2. Generic navigation boilerplate check
  const isGenericTitle = GENERIC_PAGE_TITLES.has(titleLower);

  // 3. Check if URL is root or near-root
  let isRootUrl = false;
  try {
    const parsed = new URL(cleanUrl);
    isRootUrl = parsed.pathname === '/' || parsed.pathname === '';
  } catch {
    isRootUrl = false;
  }

  const isPersianPlatformHomepage =
    isRootUrl &&
    (/\b(دیجی‌کالا|مکتب‌خونه|آپارات|اسنپ)\b/i.test(titleLower) ||
      /\b(فروشگاه اینترنتی|آکادمی آنلاین|صفحه اصلی)\b/i.test(titleLower));

  // Count distinct substantive content words in cleanTitle (excluding pure numbers, hex hashes, and infrastructure words)
  const titleTokens = titleLower.match(/[a-zA-Z0-9\u4e00-\u9fa5]+/g) || [];
  const contentWords = titleTokens.filter(
    (w) =>
      w.length >= 2 &&
      !INFORMATIVENESS_STOPWORDS.has(w) &&
      !INFRASTRUCTURE_STOPWORDS.has(w) &&
      !/^\d+$/.test(w) &&
      !HEX_HASH_REGEX.test(w) &&
      w !== rootBase &&
      !GENERIC_PAGE_TITLES.has(w)
  );
  const distinctContentWords = new Set(contentWords).size;

  // Pinterest pin check: minimal user pins without topical substance
  const isPinterestPin =
    (domainLower.includes('pinterest.com') || rootBase === 'pinterest') &&
    (cleanUrl.includes('/pin/') || cleanUrl.includes('/pin'));
  if (isPinterestPin && (distinctContentWords <= 1 || titleLower === 'pin' || titleLower === 'pins')) {
    return { informativeness: 0.05, isLowInformation: true };
  }

  // Bare media, catalog, or internal file URLs without substantive non-platform content
  const isBareMediaOrCatalog =
    (cleanUrl.includes('/pin/') ||
      cleanUrl.includes('/photo/') ||
      cleanUrl.includes('/image/') ||
      cleanUrl.includes('/watch') ||
      cleanUrl.includes('/product/') ||
      cleanUrl.includes('/item/')) &&
    (distinctContentWords === 0 || isPlatformTitle || cleanTitle.toLowerCase() === domainLower);
  if (isBareMediaOrCatalog && pathSegments.length === 0) {
    return { informativeness: 0.05, isLowInformation: true };
  }

  let score = 0.0;

  if ((isPlatformTitle && isRootUrl) || isPersianPlatformHomepage) {
    // Pure platform homepage or homepage with slogan (e.g. youtube.com, reddit.com, digikala.com)
    score = 0.05;
  } else if (isGenericTitle) {
    score = 0.1;
  } else if (distinctContentWords === 0) {
    score = 0.1;
  } else if (distinctContentWords === 1) {
    score = 0.40;
  } else if (distinctContentWords === 2) {
    score = 0.70;
  } else {
    score = 0.90;
  }

  // Path segments signal: if title is minimal/boilerplate, path may supply rich context
  if (pathSegments.length > 0) {
    const pathContentTokens = pathSegments
      .join(' ')
      .toLowerCase()
      .match(/[a-zA-Z0-9\u4e00-\u9fa5]+/g) || [];
    const distinctPathWords = new Set(
      pathContentTokens.filter(
        (w) =>
          w.length >= 3 &&
          !INFORMATIVENESS_STOPWORDS.has(w) &&
          !INFRASTRUCTURE_STOPWORDS.has(w) &&
          !/^\d+$/.test(w) &&
          !HEX_HASH_REGEX.test(w) &&
          w !== rootBase &&
          !GENERIC_PAGE_TITLES.has(w)
      )
    ).size;

    if (distinctContentWords <= 1 && distinctPathWords >= 2) {
      score = Math.max(score, 0.45);
    }
  }

  // Penalize platform title match if any remains
  if (isPlatformTitle && !isRootUrl) {
    score = Math.min(score, 0.20);
  }

  // Clamp score to [0.0, 1.0]
  const clampedScore = Math.max(0.0, Math.min(1.0, Math.round(score * 100) / 100));
  const isLowInformation = clampedScore < LOW_INFORMATION_THRESHOLD;

  return { informativeness: clampedScore, isLowInformation };
}

// -----------------------------------------------------------------------------
// 10. Master Normalization Function
// -----------------------------------------------------------------------------

/**
 * Normalizes a saved tab's metadata into a deterministic representation
 * ready for semantic embedding generation.
 *
 * Guarantees:
 * - rawTab is strictly preserved (never mutated)
 * - Tracking parameters are stripped from cleanUrl
 * - Dormant wrappers are unwrapped to original target
 * - Title is sanitized, unescaped, and provided with fallbacks
 * - Meaningful path tokens are extracted
 * - Semantic prompt matches "Title: ... Domain: ... Path: ..."
 * - Ephemeral cache hash is deterministic
 */
export function normalizeTab(
  tab: Tab,
  options?: NormalizeTabOptions
): NormalizedTabMetadata {
  // 1. Unwrap dormant tabs if applicable
  const unwrapped =
    options?.unwrapDormant !== false
      ? unwrapDormantTab(tab.url, tab.title, options?.maxDormantDepth)
      : { url: tab.url, title: tab.title, cleanUrl: tab.url, cleanTitle: tab.title };

  const targetUrl = unwrapped.cleanUrl;
  const targetTitle = unwrapped.cleanTitle;

  // 2. Sanitize URL and extract query parameters
  const sanitized = sanitizeUrl(targetUrl, options);
  const cleanUrl = sanitized.cleanUrl;
  const queryParams = sanitized.queryParams;

  // 3. Extract clean domain and hostname
  const domainInfo = extractCleanDomain(cleanUrl);
  const domain = domainInfo.cleanHost || domainInfo.rootDomain || 'unknown';

  // 4. Clean tab title
  let cleanTitle = cleanTabTitle(targetTitle, domainInfo.rootDomain);

  // Fallback title resolution if title is blank or generic
  if (!cleanTitle) {
    cleanTitle = options?.fallbackTitle || domain || 'Untitled';
  }

  // 5. Extract path segments and semantic search queries
  let pathname = '';
  try {
    pathname = new URL(cleanUrl).pathname;
  } catch {
    pathname = '';
  }

  const pathSegments = extractSanitizedPathSegments(
    pathname,
    queryParams,
    options?.maxPathSegments
  );

  // 6. Build structured semantic prompt
  const semanticPrompt = buildSemanticPrompt(cleanTitle, domain, pathSegments);

  // 7. Compute deterministic cyrb53 hash
  const hash = hashString(`${cleanUrl}::${cleanTitle}`);

  // 8. Compute Semantic Information Quality (SIQ)
  const { informativeness, isLowInformation } = calculateTabInformativeness(
    tab,
    domainInfo,
    cleanTitle,
    pathSegments,
    cleanUrl
  );

  return {
    rawTab: tab,
    cleanUrl,
    cleanTitle,
    domain,
    pathSegments,
    semanticPrompt,
    hash,
    informativeness,
    isLowInformation,
  };
}
