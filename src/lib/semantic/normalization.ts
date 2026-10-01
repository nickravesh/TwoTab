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
  /\s*[-–—|•/·:]\s*(youtube|github|wikipedia|reddit|medium|twitter|x|amazon|stackoverflow|google search|substack|linkedin|facebook|instagram|notion|figma|confluence|jira)$/i;

const COMMON_BRAND_PREFIX_REGEX =
  /^(youtube|github|wikipedia|amazon(?:\.com)?|google)\s*[-–—|•/·:]\s*/i;

/**
 * Cleans a tab title by decoding HTML entities, stripping notification badges,
 * removing trailing brand suffixes, and collapsing whitespace.
 * Never strips a title completely if the title itself is the brand name.
 */
export function cleanTabTitle(rawTitle?: string, domain?: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') return '';

  let title = rawTitle.trim();
  if (!title) return '';

  // 1. Decode HTML entities
  title = decodeHtmlEntities(title);

  // 2. Strip notification badge prefixes like (3) or [99+]
  title = title.replace(NOTIFICATION_BADGE_REGEX, '');

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

  // 5. Strip domain-specific brand suffix if domain provided
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

  // 6. Collapse whitespace and trim hanging punctuation
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

/**
 * Builds the deterministic natural language prompt for the embedding model.
 * Format: "Title: <title>. Domain: <domain>. Path: <path>."
 * Capped to MAX_SEMANTIC_PROMPT_LENGTH (512 chars).
 */
export function buildSemanticPrompt(
  cleanTitle: string,
  cleanHost: string,
  pathSegments: string[]
): string {
  const title = (cleanTitle || cleanHost || 'Untitled').trim().replace(/\s+/g, ' ');
  const domain = (cleanHost || 'unknown').trim();
  const pathStr = (pathSegments || []).join(' ').trim();

  const prompt = `Title: ${title}. Domain: ${domain}. Path: ${pathStr}.`.trim();

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
// 9. Master Normalization Function
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

  return {
    rawTab: tab,
    cleanUrl,
    cleanTitle,
    domain,
    pathSegments,
    semanticPrompt,
    hash,
  };
}
