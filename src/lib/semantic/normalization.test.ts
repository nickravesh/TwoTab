import { describe, it, expect } from 'vitest';
import type { Tab } from '../storage';
import {
  normalizeTab,
  sanitizeUrl,
  unwrapDormantTab,
  extractCleanDomain,
  cleanTabTitle,
  decodeHtmlEntities,
  extractSanitizedPathSegments,
  buildSemanticPrompt,
  hashString,
  isTrackingParameter,
} from './normalization';

describe('Normalization Engine (src/lib/semantic/normalization.ts)', () => {
  describe('1. Tracking Parameter Evaluator & Stripping', () => {
    it('identifies standard Google Analytics and UTM parameters as tracking', () => {
      expect(isTrackingParameter('utm_source')).toBe(true);
      expect(isTrackingParameter('utm_medium')).toBe(true);
      expect(isTrackingParameter('utm_campaign')).toBe(true);
      expect(isTrackingParameter('utm_content')).toBe(true);
      expect(isTrackingParameter('utm_term')).toBe(true);
      expect(isTrackingParameter('utm_id')).toBe(true);
      expect(isTrackingParameter('gclid')).toBe(true);
      expect(isTrackingParameter('gclsrc')).toBe(true);
      expect(isTrackingParameter('gbraid')).toBe(true);
      expect(isTrackingParameter('wbraid')).toBe(true);
      expect(isTrackingParameter('gad_source')).toBe(true);
      expect(isTrackingParameter('dclid')).toBe(true);
    });

    it('identifies social media tracking parameters as tracking', () => {
      expect(isTrackingParameter('fbclid')).toBe(true);
      expect(isTrackingParameter('igshid')).toBe(true);
      expect(isTrackingParameter('twclid')).toBe(true);
      expect(isTrackingParameter('msclkid')).toBe(true);
      expect(isTrackingParameter('ttclid')).toBe(true);
      expect(isTrackingParameter('si')).toBe(true);
      expect(isTrackingParameter('feature')).toBe(true);
    });

    it('identifies email and CRM automation tracking parameters as tracking', () => {
      expect(isTrackingParameter('mc_cid')).toBe(true);
      expect(isTrackingParameter('mc_eid')).toBe(true);
      expect(isTrackingParameter('_hsenc')).toBe(true);
      expect(isTrackingParameter('_hsmi')).toBe(true);
      expect(isTrackingParameter('hsa_cam')).toBe(true);
      expect(isTrackingParameter('mkt_tok')).toBe(true);
      expect(isTrackingParameter('_kx')).toBe(true);
    });

    it('identifies affiliate and e-commerce tracking noise as tracking', () => {
      expect(isTrackingParameter('irclickid')).toBe(true);
      expect(isTrackingParameter('zanpid')).toBe(true);
      expect(isTrackingParameter('aff_id')).toBe(true);
      expect(isTrackingParameter('qid')).toBe(true);
      expect(isTrackingParameter('sprefix')).toBe(true);
      expect(isTrackingParameter('crid')).toBe(true);
      expect(isTrackingParameter('sr')).toBe(true);
      expect(isTrackingParameter('dib')).toBe(true);
      expect(isTrackingParameter('dib_tag')).toBe(true);
    });

    it('protects critical functional query parameters from being stripped', () => {
      expect(isTrackingParameter('q')).toBe(false);
      expect(isTrackingParameter('query')).toBe(false);
      expect(isTrackingParameter('search')).toBe(false);
      expect(isTrackingParameter('p')).toBe(false);
      expect(isTrackingParameter('page')).toBe(false);
      expect(isTrackingParameter('id')).toBe(false);
      expect(isTrackingParameter('v')).toBe(false);
      expect(isTrackingParameter('t')).toBe(false);
      expect(isTrackingParameter('tab')).toBe(false);
      expect(isTrackingParameter('tag')).toBe(false);
      expect(isTrackingParameter('category')).toBe(false);
      expect(isTrackingParameter('sort')).toBe(false);
      expect(isTrackingParameter('filter')).toBe(false);
    });

    it('evaluates parameter names case-insensitively', () => {
      expect(isTrackingParameter('UTM_SOURCE')).toBe(true);
      expect(isTrackingParameter('GCLID')).toBe(true);
      expect(isTrackingParameter('FbClId')).toBe(true);
      expect(isTrackingParameter('Q')).toBe(false);
    });

    it('sanitizeUrl strips tracking query parameters while preserving functional parameters', () => {
      const url =
        'https://example.com/search?q=machine+learning&utm_source=twitter&page=2&fbclid=12345&category=ai';
      const result = sanitizeUrl(url);
      expect(result.cleanUrl).toBe(
        'https://example.com/search?category=ai&page=2&q=machine+learning'
      );
      expect(result.queryParams.get('q')).toBe('machine learning');
      expect(result.queryParams.get('page')).toBe('2');
      expect(result.queryParams.get('category')).toBe('ai');
      expect(result.queryParams.has('utm_source')).toBe(false);
      expect(result.queryParams.has('fbclid')).toBe(false);
    });

    it('sanitizeUrl removes hash fragment and strips default ports', () => {
      const httpResult = sanitizeUrl('http://example.com:80/path#section');
      expect(httpResult.cleanUrl).toBe('http://example.com/path');

      const httpsResult = sanitizeUrl('https://example.com:443/docs#top');
      expect(httpsResult.cleanUrl).toBe('https://example.com/docs');

      const nonDefaultResult = sanitizeUrl('http://localhost:3000/api#test');
      expect(nonDefaultResult.cleanUrl).toBe('http://localhost:3000/api');
    });
  });

  describe('2. Dormant Tab Unwrapping', () => {
    it('unwraps a standard dormant tab with URL and title', () => {
      const dormantUrl =
        'chrome-extension://twotab/dormant.html?url=https%3A%2F%2Freact.dev%2Freference&title=React+Reference';
      const unwrapped = unwrapDormantTab(dormantUrl, 'Dormant Tab');
      expect(unwrapped.cleanUrl).toBe('https://react.dev/reference');
      expect(unwrapped.cleanTitle).toBe('React Reference');
    });

    it('recursively unwraps triple-nested dormant tab wrappers', () => {
      const leaf = 'https://python.org/doc';
      const wrap1 = `chrome-extension://twotab/dormant.html?url=${encodeURIComponent(leaf)}&title=Python+Doc`;
      const wrap2 = `chrome-extension://twotab/dormant.html?url=${encodeURIComponent(wrap1)}&title=Dormant+Tab`;
      const wrap3 = `chrome-extension://twotab/dormant.html?url=${encodeURIComponent(wrap2)}&title=Opening...`;

      const unwrapped = unwrapDormantTab(wrap3, 'Dormant Tab');
      expect(unwrapped.cleanUrl).toBe(leaf);
      expect(unwrapped.cleanTitle).toBe('Python Doc');
    });

    it('handles relative dormant URLs without throwing in URL constructor', () => {
      const relativeUrl =
        '/dormant.html?url=https%3A%2F%2Fgithub.com%2Fnickravesh&title=Nick+Ravesh';
      const unwrapped = unwrapDormantTab(relativeUrl, 'Dormant Tab');
      expect(unwrapped.cleanUrl).toBe('https://github.com/nickravesh');
      expect(unwrapped.cleanTitle).toBe('Nick Ravesh');
    });

    it('decodes double-encoded dormant target URLs', () => {
      const innerTarget = 'https://example.com/search?query=hello%20world';
      const dormantUrl = `chrome-extension://twotab/dormant.html?url=${encodeURIComponent(
        innerTarget
      )}&title=Search`;
      const unwrapped = unwrapDormantTab(dormantUrl, 'Dormant Tab');
      expect(unwrapped.cleanUrl).toBe(innerTarget);
    });

    it('preserves non-dormant regular URLs and titles verbatim', () => {
      const unwrapped = unwrapDormantTab(
        'https://developer.mozilla.org/en-US/',
        'MDN Web Docs'
      );
      expect(unwrapped.cleanUrl).toBe('https://developer.mozilla.org/en-US/');
      expect(unwrapped.cleanTitle).toBe('MDN Web Docs');
    });

    it('handles dormant tab missing url or title gracefully', () => {
      const missingUrl = 'chrome-extension://twotab/dormant.html?title=Orphan';
      const unwrapped1 = unwrapDormantTab(missingUrl, 'Dormant Tab');
      expect(unwrapped1.cleanUrl).toBe(missingUrl);
      expect(unwrapped1.cleanTitle).toBe('Orphan');

      const missingTitle =
        'chrome-extension://twotab/dormant.html?url=https%3A%2F%2Fexample.com';
      const unwrapped2 = unwrapDormantTab(missingTitle, '');
      expect(unwrapped2.cleanUrl).toBe('https://example.com');
    });
  });

  describe('3. Browser Schemes & Domain Extraction', () => {
    it('normalizes standard domains by stripping www. and mobile prefixes', () => {
      expect(extractCleanDomain('https://www.example.com/page').cleanHost).toBe('example.com');
      expect(extractCleanDomain('https://www.example.com/page').rootDomain).toBe('example.com');
      expect(extractCleanDomain('https://m.wikipedia.org/wiki/AI').cleanHost).toBe('wikipedia.org');
    });

    it('correctly extracts root domains for multi-part TLDs (co.uk, com.au, etc.)', () => {
      const bbc = extractCleanDomain('https://news.bbc.co.uk/world');
      expect(bbc.cleanHost).toBe('news.bbc.co.uk');
      expect(bbc.rootDomain).toBe('bbc.co.uk');

      const aus = extractCleanDomain('https://portal.service.gov.au/login');
      expect(aus.cleanHost).toBe('portal.service.gov.au');
      expect(aus.rootDomain).toBe('service.gov.au');
    });

    it('normalizes internal chrome://, edge://, and brave:// URLs', () => {
      const chrome = extractCleanDomain('chrome://settings/passwords');
      expect(chrome.cleanHost).toBe('chrome://settings');
      expect(chrome.rootDomain).toBe('chrome://settings');

      const edge = extractCleanDomain('edge://extensions');
      expect(edge.cleanHost).toBe('edge://extensions');

      const brave = extractCleanDomain('brave://settings/shields');
      expect(brave.cleanHost).toBe('brave://settings');
    });

    it('normalizes about:, local-file, data:, and javascript: schemes', () => {
      expect(extractCleanDomain('about:blank').cleanHost).toBe('about:blank');
      expect(extractCleanDomain('about:newtab').cleanHost).toBe('about:newtab');
      expect(extractCleanDomain('file:///Users/ali/report.pdf').cleanHost).toBe('local-file');
      expect(extractCleanDomain('data:text/html,<h1>Hello</h1>').cleanHost).toBe('data');
      expect(extractCleanDomain('javascript:alert(1)').cleanHost).toBe('javascript');
    });

    it('handles view-source: and blob: schemes by resolving target host', () => {
      expect(extractCleanDomain('view-source:https://github.com').cleanHost).toBe('github.com');
      expect(extractCleanDomain('blob:https://figma.com/3f191b7d-uuid').cleanHost).toBe('figma.com');
    });

    it('preserves non-default ports for localhost and IP addresses', () => {
      expect(extractCleanDomain('http://localhost:3000/dashboard').cleanHost).toBe('localhost:3000');
      expect(extractCleanDomain('http://192.168.1.1:8080/admin').cleanHost).toBe('192.168.1.1:8080');
      expect(extractCleanDomain('http://[::1]:8080/status').cleanHost).toBe('[::1]:8080');
    });

    it('handles empty or malformed URLs without crashing', () => {
      expect(extractCleanDomain('').cleanHost).toBe('');
      expect(extractCleanDomain('   ').cleanHost).toBe('');
    });
  });

  describe('4. Title Sanitization & Entity Decoding', () => {
    it('decodes named HTML entities cleanly', () => {
      expect(decodeHtmlEntities('AT&amp;T &quot;Wireless&quot; &lt;Docs&gt;')).toBe(
        'AT&T "Wireless" <Docs>'
      );
      expect(decodeHtmlEntities('Tom&#39;s &apos;Fast&apos; &nbsp; App')).toBe(
        "Tom's 'Fast'   App"
      );
      expect(decodeHtmlEntities('Prefix &ndash; Middle &mdash; Suffix')).toBe(
        'Prefix – Middle — Suffix'
      );
    });

    it('decodes decimal and hex numeric HTML entities', () => {
      expect(decodeHtmlEntities('Letter &#65; and &#66;')).toBe('Letter A and B');
      expect(decodeHtmlEntities('Hex &#x43; and &#x44;')).toBe('Hex C and D');
    });

    it('strips notification badge prefixes from titles', () => {
      expect(cleanTabTitle('(3) Pull Requests · facebook/react')).toBe(
        'Pull Requests · facebook/react'
      );
      expect(cleanTabTitle('[99+] Messages - Slack')).toBe('Messages - Slack');
      expect(cleanTabTitle('* Document - Google Docs')).toBe('Document - Google Docs');
    });

    it('strips common platform brand suffixes', () => {
      expect(cleanTabTitle('TwoTab Extension — GitHub')).toBe('TwoTab Extension');
      expect(cleanTabTitle('How to Learn TypeScript - YouTube')).toBe('How to Learn TypeScript');
      expect(cleanTabTitle('Machine Learning • Medium')).toBe('Machine Learning');
      expect(cleanTabTitle('Rust Language · Wikipedia')).toBe('Rust Language');
    });

    it('strips brand prefixes', () => {
      expect(cleanTabTitle('Amazon.com: Mechanical Keyboard')).toBe('Mechanical Keyboard');
      expect(cleanTabTitle('YouTube - Amazing Nature Video')).toBe('Amazing Nature Video');
    });

    it('preserves title when brand is the only content', () => {
      expect(cleanTabTitle('GitHub')).toBe('GitHub');
      expect(cleanTabTitle('YouTube')).toBe('YouTube');
      expect(cleanTabTitle('Amazon')).toBe('Amazon');
    });

    it('strips domain-specific trailing brand if matching host', () => {
      expect(cleanTabTitle('React Reference - React', 'react.dev')).toBe('React Reference');
      expect(cleanTabTitle('Python Tutorial | Python', 'python.org')).toBe('Python Tutorial');
    });

    it('collapses multiple whitespace and trims hanging punctuation', () => {
      expect(cleanTabTitle('   Multiple   Spaces   -   Title   ')).toBe(
        'Multiple Spaces - Title'
      );
      expect(cleanTabTitle('– Hanging Dash Title –')).toBe('Hanging Dash Title');
    });
  });

  describe('5. Path Segment Sanitization', () => {
    it('strips web file extensions from path segments', () => {
      const segments = extractSanitizedPathSegments('/docs/guide.html');
      expect(segments).toEqual(['docs', 'guide']);

      const phpSegments = extractSanitizedPathSegments('/api/v1/user.php');
      expect(phpSegments).toEqual(['api', 'v1', 'user']);
    });

    it('filters out UUIDs and commit hashes', () => {
      const segments = extractSanitizedPathSegments(
        '/repos/owner/commit/7a8b9c0d1e2f3a4b5c6d7e8f/items/550e8400-e29b-41d4-a716-446655440000'
      );
      expect(segments).toEqual(['repos', 'owner', 'commit', 'items']);
    });

    it('filters out pure numeric IDs and language prefixes', () => {
      const segments = extractSanitizedPathSegments('/en-US/posts/987654/overview');
      expect(segments).toEqual(['posts', 'overview']);
    });

    it('converts slug delimiters to clean spaces', () => {
      const segments = extractSanitizedPathSegments(
        '/learn/machine-learning_deep-learning.intro'
      );
      expect(segments).toEqual(['learn', 'machine learning deep learning intro']);
    });

    it('preserves semantic search query parameters in path segments', () => {
      const params = new URLSearchParams('q=quantum+computing&page=2&sort=relevance');
      const segments = extractSanitizedPathSegments('/search', params);
      expect(segments).toEqual(['search', 'q quantum computing']);
    });
  });

  describe('6. Semantic Prompt Construction', () => {
    it('formats prompt strictly following "Title: ... Domain: ... Path: ..."', () => {
      const prompt = buildSemanticPrompt(
        'FastAPI Tutorial First Steps',
        'fastapi.tiangolo.com',
        ['tutorial', 'first steps']
      );
      expect(prompt).toBe(
        'Title: FastAPI Tutorial First Steps. Domain: fastapi.tiangolo.com. Path: tutorial first steps.'
      );
    });

    it('handles empty path segments gracefully', () => {
      const prompt = buildSemanticPrompt('Home', 'example.com', []);
      expect(prompt).toBe('Title: Home. Domain: example.com. Path: .');
    });

    it('enforces maximum character length bound (512 chars)', () => {
      const longTitle = 'A'.repeat(600);
      const prompt = buildSemanticPrompt(longTitle, 'example.com', ['test']);
      expect(prompt.length).toBeLessThanOrEqual(512);
    });
  });

  describe('7. Deterministic Cyrb53 Hash', () => {
    it('produces identical hex hash for identical input strings', () => {
      const hash1 = hashString('https://example.com/test::Test Page');
      const hash2 = hashString('https://example.com/test::Test Page');
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]+$/);
    });

    it('produces different hashes for different inputs', () => {
      const hash1 = hashString('https://example.com/a::A');
      const hash2 = hashString('https://example.com/b::B');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('8. Master normalizeTab Integration', () => {
    it('normalizes a full tab while strictly preserving rawTab immutability', () => {
      const originalTab: Tab = {
        title: 'TwoTab Extension - GitHub',
        url: 'https://github.com/nickravesh/TwoTab?utm_source=twitter&ref=share',
      };
      const copy = { ...originalTab };

      const meta = normalizeTab(originalTab);

      // rawTab is identical reference
      expect(meta.rawTab).toBe(originalTab);
      // Original tab properties not mutated
      expect(originalTab.title).toBe(copy.title);
      expect(originalTab.url).toBe(copy.url);

      // Normalized properties
      expect(meta.cleanUrl).toBe('https://github.com/nickravesh/TwoTab');
      expect(meta.cleanTitle).toBe('TwoTab Extension');
      expect(meta.domain).toBe('github.com');
      expect(meta.pathSegments).toEqual(['nickravesh', 'TwoTab']);
      expect(meta.semanticPrompt).toBe(
        'Title: TwoTab Extension. Domain: github.com. Path: nickravesh TwoTab.'
      );
      expect(meta.hash).toMatch(/^[0-9a-f]+$/);
    });

    it('unwraps dormant tabs inside normalizeTab', () => {
      const tab: Tab = {
        title: 'Dormant Tab',
        url: 'chrome-extension://twotab/dormant.html?url=https%3A%2F%2Fpython.org%2F3%2F&title=Python+Docs',
      };
      const meta = normalizeTab(tab);
      expect(meta.cleanUrl).toBe('https://python.org/3/');
      expect(meta.cleanTitle).toBe('Python Docs');
      expect(meta.domain).toBe('python.org');
    });

    it('falls back to domain when title is blank', () => {
      const tab: Tab = {
        title: '',
        url: 'https://api.github.com/repos/owner/project/issues',
      };
      const meta = normalizeTab(tab);
      expect(meta.cleanTitle).toBe('api.github.com');
      expect(meta.domain).toBe('api.github.com');
      expect(meta.semanticPrompt).toContain('Domain: api.github.com');
      expect(meta.semanticPrompt).toContain('Path: repos owner project issues');
    });

    it('produces identical hash for identical content regardless of stripped tracking parameters', () => {
      const tab1: Tab = {
        title: 'Deterministic Test Title',
        url: 'https://example.com/page?utm_source=twitter',
      };
      const tab2: Tab = {
        title: 'Deterministic Test Title',
        url: 'https://example.com/page?utm_source=facebook',
      };
      const norm1 = normalizeTab(tab1);
      const norm2 = normalizeTab(tab2);

      expect(norm1.cleanUrl).toBe('https://example.com/page');
      expect(norm2.cleanUrl).toBe('https://example.com/page');
      expect(norm1.hash).toBe(norm2.hash);
    });
  });
});
