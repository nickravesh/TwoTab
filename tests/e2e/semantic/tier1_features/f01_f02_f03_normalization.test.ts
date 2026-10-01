/**
 * Tier 1 Feature Coverage: Tab Metadata Normalization
 *
 * Feature 1: Tracking Parameter Stripping (R1)
 * Feature 2: Dormant Tab Unwrapping (R1)
 * Feature 3: Semantic Text Synthesis (R1)
 *
 * Verification: 100% offline, deterministic oracle derivation.
 */

import { describe, it, expect } from 'vitest';
import { oracleNormalizeTab } from '../harness/oracle';
import type { Tab } from '@/lib/storage';

describe('Tier 1: Tab Normalization (Features 1, 2, 3)', () => {
  describe('Feature 1: Tracking Parameter Stripping (R1)', () => {
    it('1.1 strips Google Analytics & Ads tracking parameters (utm_*, gclid)', () => {
      const tab: Tab = {
        title: 'Article on Web Performance',
        url: 'https://example.com/article?utm_source=twitter&utm_medium=social&utm_campaign=launch&utm_term=perf&utm_content=v1&gclid=CjwKCAjw123',
      };
      const norm = oracleNormalizeTab(tab);
      expect(norm.cleanUrl).toBe('https://example.com/article');
      expect(norm.cleanUrl).not.toContain('utm_source');
      expect(norm.cleanUrl).not.toContain('gclid');
    });

    it('1.2 strips social & ad network click IDs (fbclid, msclkid, mc_eid, igshid, _hsenc, _hsmi)', () => {
      const tab: Tab = {
        title: 'Product Page',
        url: 'https://shop.example.com/item?fbclid=IwAR123&msclkid=abc456&mc_eid=def789&igshid=ghi012&_hsenc=p2ANqtz&_hsmi=987654',
      };
      const norm = oracleNormalizeTab(tab);
      expect(norm.cleanUrl).toBe('https://shop.example.com/item');
      expect(norm.cleanUrl).not.toContain('fbclid');
      expect(norm.cleanUrl).not.toContain('msclkid');
      expect(norm.cleanUrl).not.toContain('mc_eid');
      expect(norm.cleanUrl).not.toContain('igshid');
      expect(norm.cleanUrl).not.toContain('_hsenc');
      expect(norm.cleanUrl).not.toContain('_hsmi');
    });

    it('1.3 strips referrer and campaign tokens (ref, source, campaign, trk, si)', () => {
      const tab: Tab = {
        title: 'Documentation Hub',
        url: 'https://docs.example.com/guide?ref=homepage&source=sidebar&campaign=promo&trk=direct&si=user_session_456',
      };
      const norm = oracleNormalizeTab(tab);
      expect(norm.cleanUrl).toBe('https://docs.example.com/guide');
      expect(norm.cleanUrl).not.toContain('ref=');
      expect(norm.cleanUrl).not.toContain('source=');
      expect(norm.cleanUrl).not.toContain('trk=');
      expect(norm.cleanUrl).not.toContain('si=');
    });

    it('1.4 preserves legitimate functional query parameters (q, search, page, id, category)', () => {
      const tab: Tab = {
        title: 'Search Results for Transformers',
        url: 'https://example.com/search?q=transformers&page=2&category=ai&utm_source=nav',
      };
      const norm = oracleNormalizeTab(tab);
      const url = new URL(norm.cleanUrl);
      expect(url.searchParams.get('q')).toBe('transformers');
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('category')).toBe('ai');
      expect(url.searchParams.has('utm_source')).toBe(false);
    });

    it('1.5 handles uppercase tracking parameters case-insensitively', () => {
      const tab: Tab = {
        title: 'Case Insensitive Tracking Test',
        url: 'https://example.com/post?UTM_SOURCE=Newsletter&GCLID=AdWords123&utm_CAMPAIGN=Summer',
      };
      const norm = oracleNormalizeTab(tab);
      expect(norm.cleanUrl).toBe('https://example.com/post');
      expect(norm.cleanUrl).not.toContain('UTM_SOURCE');
      expect(norm.cleanUrl).not.toContain('GCLID');
      expect(norm.cleanUrl).not.toContain('utm_CAMPAIGN');
    });
  });

  describe('Feature 2: Dormant Tab Unwrapping (R1)', () => {
    it('2.1 unwraps target web URL from dormant tab container', () => {
      const tab: Tab = {
        title: 'Dormant Tab — GitHub',
        url: 'chrome-extension://twotab-extension/dormant.html?url=https%3A%2F%2Fgithub.com%2Fnickravesh%2FTwoTab&title=TwoTab%20Repository',
      };
      const norm = oracleNormalizeTab(tab);
      expect(norm.cleanUrl).toBe('https://github.com/nickravesh/TwoTab');
    });

    it('2.2 unwraps original page title from dormant tab metadata', () => {
      const tab: Tab = {
        title: 'Dormant Tab — Python Docs',
        url: 'chrome-extension://twotab-extension/dormant.html?url=https%3A%2F%2Fdocs.python.org%2F3%2F&title=Python%203%20Documentation',
      };
      const norm = oracleNormalizeTab(tab);
      expect(norm.cleanTitle).toBe('Python 3 Documentation');
    });

    it('2.3 decodes double-encoded dormant target URLs accurately', () => {
      const innerTarget = 'https://example.com/search?query=hello%20world';
      const dormantUrl = `chrome-extension://twotab-ext/dormant.html?url=${encodeURIComponent(innerTarget)}&title=Search`;
      const tab: Tab = {
        title: 'Dormant Tab',
        url: dormantUrl,
      };
      const norm = oracleNormalizeTab(tab);
      expect(norm.cleanUrl).toContain('https://example.com/search?query=hello%20world');
    });

    it('2.4 preserves non-dormant regular URLs and titles verbatim', () => {
      const tab: Tab = {
        title: 'Regular Un-suspended Web Page',
        url: 'https://react.dev/reference/react',
      };
      const norm = oracleNormalizeTab(tab);
      expect(norm.cleanUrl).toBe('https://react.dev/reference/react');
      expect(norm.cleanTitle).toBe('Regular Un-suspended Web Page');
    });

    it('2.5 gracefully handles dormant URLs missing title or url query parameter', () => {
      const tabMissingUrl: Tab = {
        title: 'Dormant without URL',
        url: 'chrome-extension://twotab-ext/dormant.html?title=Orphan',
      };
      const normMissingUrl = oracleNormalizeTab(tabMissingUrl);
      expect(normMissingUrl.cleanUrl).toBe('chrome-extension://twotab-ext/dormant.html?title=Orphan');

      const tabMissingTitle: Tab = {
        title: '',
        url: 'chrome-extension://twotab-ext/dormant.html?url=https%3A%2F%2Fexample.com',
      };
      const normMissingTitle = oracleNormalizeTab(tabMissingTitle);
      expect(normMissingTitle.cleanUrl).toBe('https://example.com/');
      expect(normMissingTitle.domain).toBe('example.com');
    });
  });

  describe('Feature 3: Semantic Text Synthesis (R1)', () => {
    it('3.1 generates structured prompt containing Title, Domain, and Path segments', () => {
      const tab: Tab = {
        title: 'FastAPI Tutorial First Steps',
        url: 'https://fastapi.tiangolo.com/tutorial/first-steps/',
      };
      const norm = oracleNormalizeTab(tab);
      expect(norm.semanticPrompt).toMatch(/^Title:\s+FastAPI Tutorial First Steps\.\s+Domain:\s+fastapi\.tiangolo\.com\.\s+Path:\s+tutorial first steps\.$/);
    });

    it('3.2 strips www. prefix from domain during prompt synthesis', () => {
      const tab: Tab = {
        title: 'Example Homepage',
        url: 'https://www.example.com/index.html',
      };
      const norm = oracleNormalizeTab(tab);
      expect(norm.domain).toBe('example.com');
      expect(norm.semanticPrompt).toContain('Domain: example.com');
      expect(norm.semanticPrompt).not.toContain('www.example.com');
    });

    it('3.3 cleans file extensions (.html, .php, .asp) and replaces separators with spaces in path', () => {
      const tab: Tab = {
        title: 'Machine Learning Basics',
        url: 'https://learn.ai/deep-learning_guide/intro.html',
      };
      const norm = oracleNormalizeTab(tab);
      expect(norm.pathSegments).toEqual(['deep learning guide', 'intro']);
      expect(norm.semanticPrompt).toContain('Path: deep learning guide intro');
    });

    it('3.4 synthesizes fallback semantic title from domain and path when title is blank', () => {
      const tab: Tab = {
        title: '',
        url: 'https://api.github.com/repos/owner/project/issues',
      };
      const norm = oracleNormalizeTab(tab);
      expect(norm.cleanTitle).toBe('api.github.com');
      expect(norm.semanticPrompt).toContain('Domain: api.github.com');
      expect(norm.semanticPrompt).toContain('Path: repos owner project issues');
    });

    it('3.5 generates a deterministic hex hash string based on clean URL and title', () => {
      const tab1: Tab = {
        title: 'Deterministic Test Title',
        url: 'https://example.com/page?utm_source=twitter',
      };
      const tab2: Tab = {
        title: 'Deterministic Test Title',
        url: 'https://example.com/page?utm_source=facebook',
      };
      const norm1 = oracleNormalizeTab(tab1);
      const norm2 = oracleNormalizeTab(tab2);

      // Since both clean URLs strip utm_source to https://example.com/page, their hashes must match
      expect(norm1.hash).toBe(norm2.hash);
      expect(norm1.hash).toMatch(/^[0-9a-f]+$/);
    });
  });
});
