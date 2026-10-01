/**
 * Tier 1 Feature Coverage: Deterministic Group Naming & Brand Recognition
 *
 * Feature 10: Deterministic Term Extraction (R4)
 * Feature 11: Stopword & Web Boilerplate Stripping (R4)
 * Feature 12: Brand Recognition Integration (R4)
 *
 * Verification: 100% offline, deterministic heuristic logic. Zero generative LLMs.
 */

import { describe, it, expect } from 'vitest';
import { oracleGenerateGroupName } from '../harness/oracle';
import { PYTHON_TABS, REACT_TABS, GITHUB_TABS } from '../harness/fixtures';
import type { Tab } from '@/lib/storage';

describe('Tier 1: Deterministic Group Naming Engine (Features 10, 11, 12)', () => {
  describe('Feature 10: Deterministic Term Extraction (R4)', () => {
    it('10.1 extracts top recurring terms and synthesizes descriptive group name', () => {
      const tabs: Tab[] = [
        { title: 'Python Asyncio Tutorial: Asynchronous Programming in Python', url: 'https://realpython.com/async-python' },
        { title: 'Python Asyncio Documentation — Task and Coroutine Primitives', url: 'https://docs.python.org/3/library/asyncio.html' },
      ];

      const { name } = oracleGenerateGroupName(tabs);
      expect(name.toLowerCase()).toContain('python');
      expect(name.toLowerCase()).toContain('asyncio');
    });

    it('10.2 formats synthesized name in proper Title Case', () => {
      const tabs: Tab[] = [
        { title: 'machine learning algorithms and neural networks', url: 'https://example.com/ml1' },
        { title: 'machine learning practical guide in python', url: 'https://example.com/ml2' },
      ];

      const { name } = oracleGenerateGroupName(tabs);
      // Title Case: each word capitalized
      const words = name.split(/\s+/);
      for (const w of words) {
        if (w.length > 0 && w !== '—') {
          expect(w[0]).toBe(w[0].toUpperCase());
        }
      }
    });

    it('10.3 falls back to dominant domain when tab titles are uninformative or empty', () => {
      const tabs: Tab[] = [
        { title: '', url: 'https://stackoverflow.com/questions/12345' },
        { title: '', url: 'https://stackoverflow.com/questions/67890' },
      ];

      const { name } = oracleGenerateGroupName(tabs);
      expect(name.toLowerCase().replace(/\s+/g, '')).toContain('stackoverflow');
    });

    it('10.4 extracts meaningful path keywords when titles are brief or identical', () => {
      const tabs: Tab[] = [
        { title: 'Documentation', url: 'https://fastapi.tiangolo.com/tutorial/security/' },
        { title: 'Documentation', url: 'https://fastapi.tiangolo.com/tutorial/cors/' },
      ];

      const { name } = oracleGenerateGroupName(tabs);
      expect(name.toLowerCase()).toMatch(/fastapi|tutorial/);
    });

    it('10.5 produces 100% deterministic naming output for identical tab input across runs', () => {
      const tabs = PYTHON_TABS.slice(0, 3);
      const firstRun = oracleGenerateGroupName(tabs);

      for (let run = 1; run <= 25; run++) {
        const nextRun = oracleGenerateGroupName(tabs);
        expect(nextRun.name).toBe(firstRun.name);
        expect(nextRun.color).toBe(firstRun.color);
      }
    });
  });

  describe('Feature 11: Stopword & Web Boilerplate Stripping (R4)', () => {
    it('11.1 strips grammatical English stopwords (the, a, and, or, in, of, to, with)', () => {
      const tabs: Tab[] = [
        { title: 'The Guide to the Best of Web Performance and Optimization', url: 'https://example.com/1' },
        { title: 'A Primer on Performance and Optimization for Developers', url: 'https://example.com/2' },
      ];

      const { name } = oracleGenerateGroupName(tabs);
      const lower = name.toLowerCase();
      expect(lower).not.toMatch(/\b(the|and|for|of|to|on)\b/);
      expect(lower).toMatch(/performance|optimization/);
    });

    it('11.2 strips web boilerplate words (Home, Login, Welcome, Official, Site, Index, Portal, Search)', () => {
      const tabs: Tab[] = [
        { title: 'Welcome to the Official Home Portal of Docker Containers', url: 'https://docker.com/welcome' },
        { title: 'Docker Official Site: Index and Getting Started Dashboard', url: 'https://docker.com/index' },
      ];

      const { name } = oracleGenerateGroupName(tabs);
      const lower = name.toLowerCase();
      expect(lower).not.toContain('welcome');
      expect(lower).not.toContain('official');
      expect(lower).not.toContain('portal');
      expect(lower).not.toContain('index');
      expect(lower).toContain('docker');
    });

    it('11.3 ignores pure numbers and single-character punctuation in token ranking', () => {
      const tabs: Tab[] = [
        { title: 'Version 1 2 3 - Release Notes 2026', url: 'https://example.com/v1' },
        { title: 'Update 4 5 6 - Release Notes 2026', url: 'https://example.com/v2' },
      ];

      const { name } = oracleGenerateGroupName(tabs);
      expect(name).not.toMatch(/\b(1|2|3|4|5|6)\b/);
      expect(name.toLowerCase()).toContain('release');
    });

    it('11.4 safely handles titles composed entirely of stopwords and boilerplate', () => {
      const tabs: Tab[] = [
        { title: 'Home - Welcome', url: 'https://seriouseats.com/' },
        { title: 'Official Site - Index', url: 'https://seriouseats.com/' },
      ];

      const { name } = oracleGenerateGroupName(tabs);
      // Fallback cleanly to domain
      expect(name.toLowerCase()).toContain('seriouseats');
    });

    it('11.5 handles titles with special punctuation characters without throwing exceptions', () => {
      const tabs: Tab[] = [
        { title: 'C++ vs C# [2026]: What’s the Difference? (Part 1/2) | TechBlog', url: 'https://example.com/p1' },
        { title: 'C++ & C# Performance: Benchmarks & Architecture (Part 2/2)', url: 'https://example.com/p2' },
      ];

      expect(() => oracleGenerateGroupName(tabs)).not.toThrow();
      const { name } = oracleGenerateGroupName(tabs);
      expect(name.length).toBeGreaterThan(0);
    });
  });

  describe('Feature 12: Brand Recognition Integration (R4)', () => {
    it('12.1 recognizes GitHub domain and applies brand name and purple color tag', () => {
      const tabs = GITHUB_TABS.slice(0, 2);
      const { name, color } = oracleGenerateGroupName(tabs);

      expect(name).toContain('GitHub');
      expect(color).toBe('purple');
    });

    it('12.2 recognizes YouTube domain and assigns red color tag', () => {
      const tabs: Tab[] = [
        { title: 'React 19 Complete Tutorial Course - YouTube', url: 'https://www.youtube.com/watch?v=123' },
        { title: 'Next.js Full Stack Project - YouTube', url: 'https://www.youtube.com/watch?v=456' },
      ];

      const { name, color } = oracleGenerateGroupName(tabs);
      expect(name).toContain('YouTube');
      expect(color).toBe('red');
    });

    it('12.3 recognizes Wikipedia domain and assigns grey color tag', () => {
      const tabs: Tab[] = [
        { title: 'Artificial Neural Network - Wikipedia', url: 'https://en.wikipedia.org/wiki/Artificial_neural_network' },
        { title: 'Transformer (deep learning) - Wikipedia', url: 'https://en.wikipedia.org/wiki/Transformer_(deep_learning)' },
      ];

      const { name, color } = oracleGenerateGroupName(tabs);
      expect(name).toContain('Wikipedia');
      expect(color).toBe('grey');
    });

    it('12.4 extracts clean domain title for unbranded domains (e.g., realpython.com -> Realpython)', () => {
      const tabs: Tab[] = [
        { title: '', url: 'https://realpython.com/article1' },
        { title: '', url: 'https://realpython.com/article2' },
      ];

      const { name } = oracleGenerateGroupName(tabs);
      expect(name).toContain('Realpython');
    });

    it('12.5 assigns default color (blue) when cluster has no matching brand dictionary entry', () => {
      const tabs: Tab[] = [
        { title: 'Baking Artisan Bread', url: 'https://random-artisan-baker.net/recipe1' },
        { title: 'Sourdough Techniques', url: 'https://random-artisan-baker.net/recipe2' },
      ];

      const { color } = oracleGenerateGroupName(tabs);
      expect(color).toBe('blue');
    });
  });
});
