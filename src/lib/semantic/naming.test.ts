import { describe, it, expect } from 'vitest';
import { generateGroupName, toTitleCase } from './naming';
import type { Tab } from '../storage';

describe('Deterministic Group Naming Engine (naming.ts)', () => {
  it('handles empty tab array', () => {
    const res = generateGroupName([]);
    expect(res.name).toBe('Empty Collection');
    expect(res.color).toBe('grey');
  });

  it('generates title-cased name from prominent title terms', () => {
    const tabs: Tab[] = [
      { title: 'Django REST Framework Authentication Guide', url: 'https://django-rest-framework.org/api-guide/authentication/' },
      { title: 'JWT Authentication with Django SimpleJWT', url: 'https://github.com/jazzband/djangorestframework-simplejwt' },
      { title: 'Django Permissions and Authentication', url: 'https://docs.djangoproject.com/en/5.0/topics/auth/' },
    ];
    const res = generateGroupName(tabs);
    expect(res.name.toLowerCase()).toContain('django');
    expect(res.name.toLowerCase()).toContain('authentication');
  });

  it('strips stopwords cleanly', () => {
    const tabs: Tab[] = [
      { title: 'The Guide To Modern Web Development For Beginners', url: 'https://example.com/guide' },
      { title: 'A Complete Tutorial On Modern Web Development', url: 'https://example.com/tutorial' },
    ];
    const res = generateGroupName(tabs);
    expect(res.name.toLowerCase()).toContain('modern');
    expect(res.name.toLowerCase()).toContain('development');
  });

  it('recognizes branded domains and sets appropriate color', () => {
    const tabs: Tab[] = [
      { title: 'TwoTab Repository', url: 'https://github.com/nickravesh/TwoTab' },
      { title: 'React Core Repository', url: 'https://github.com/facebook/react' },
    ];
    const res = generateGroupName(tabs);
    expect(res.color).toBe('purple'); // GitHub is purple in BRANDED_DOMAINS
    expect(res.name).toContain('GitHub');
  });

  it('falls back to domain when titles are uninformative or empty', () => {
    const tabs: Tab[] = [
      { title: '', url: 'https://stackoverflow.com/questions/12345' },
      { title: '', url: 'https://stackoverflow.com/questions/67890' },
    ];
    const res = generateGroupName(tabs);
    expect(res.name.toLowerCase()).toContain('stack overflow');
    expect(res.color).toBe('orange');
  });

  it('augments brief identical titles with shared path keywords', () => {
    const tabs: Tab[] = [
      { title: 'Documentation', url: 'https://fastapi.tiangolo.com/tutorial/security/' },
      { title: 'Documentation', url: 'https://fastapi.tiangolo.com/tutorial/cors/' },
    ];
    const res = generateGroupName(tabs);
    expect(res.name.toLowerCase()).toMatch(/fastapi|tutorial/);
  });

  it('handles IP address hostnames properly', () => {
    const tabs: Tab[] = [
      { title: '', url: 'http://192.168.1.1/dashboard' },
      { title: '', url: 'http://192.168.1.1/settings' },
    ];
    const res = generateGroupName(tabs);
    expect(res.name.toLowerCase()).toMatch(/192\.168\.1\.1|dashboard|settings/);
  });

  it('is 100% deterministic across multiple runs', () => {
    const tabs: Tab[] = [
      { title: 'PostgreSQL Indexing Explained', url: 'https://postgres.org/index' },
      { title: 'PostgreSQL Query Optimization with EXPLAIN', url: 'https://postgres.org/explain' },
    ];
    const first = generateGroupName(tabs);
    for (let i = 0; i < 20; i++) {
      const next = generateGroupName(tabs);
      expect(next.name).toBe(first.name);
      expect(next.color).toBe(first.color);
    }
  });

  it('toTitleCase formats words correctly', () => {
    expect(toTitleCase('hello world')).toBe('Hello World');
    expect(toTitleCase('dJaNgO aUtH')).toBe('Django Auth');
    expect(toTitleCase('')).toBe('');
  });

  describe('Redesigned Phrase-Aware Naming Regression Suite (Section 21)', () => {
    it('Case 1: preserves source word order for Gemini / Flash without brand prefix', () => {
      const tabs: Tab[] = [
        { title: 'gemeni 3.7 flash vs 3.6 flash - Google Search', url: 'https://google.com/search?q=1' },
        { title: 'gemeni 3.6 flash vs gemeni 3.1 pro benchmark - Google Search', url: 'https://google.com/search?q=2' },
      ];
      const { name, color } = generateGroupName(tabs);
      expect(name).not.toMatch(/flash gemeni/i);
      expect(name.toLowerCase()).toContain('gemeni flash');
      expect(name).not.toContain('Google —');
      expect(color).toBe('blue');
    });

    it("Case 2: prioritizes core subject Life is Strange / Max Mixtape over generic ambiance/folk descriptors", () => {
      const tabs: Tab[] = [
        { title: "Life is Strange: Max's Mixtape | Side B | Folk & Indie Pop Mix | Music & Ambiance", url: 'https://youtube.com/watch?v=b' },
        { title: "Life is Strange: Max's Mixtape | Side A | Folk & Indie Pop Mix | Music & Ambiance", url: 'https://youtube.com/watch?v=a' },
      ];
      const { name, color } = generateGroupName(tabs);
      expect(name).not.toContain('YouTube —');
      expect(name).not.toMatch(/ambiance folk/i);
      expect(name.toLowerCase()).toMatch(/life is strange|max's mixtape|life strange/);
      expect(color).toBe('red');
    });

    it('Case 3: does not label group after one person when two unrelated people are clustered', () => {
      const tabs: Tab[] = [
        { title: '(43) Ali Sharifi Zarchi - YouTube', url: 'https://youtube.com/channel/ali' },
        { title: 'sima shahverdi - YouTube', url: 'https://youtube.com/channel/sima' },
      ];
      const { name, color } = generateGroupName(tabs);
      expect(name).not.toBe('Ali');
      expect(name).not.toBe('YouTube — Ali');
      expect(name).toContain('YouTube');
      expect(color).toBe('red');
    });

    it('Case 4: derives clean domain label from URL-only tabs without TLD leakage', () => {
      const tabs: Tab[] = [
        { title: 'www.moviesho.com', url: 'https://moviesho.com' },
        { title: 'www.moviesho.com', url: 'https://moviesho.com' },
      ];
      const { name } = generateGroupName(tabs);
      expect(name).not.toMatch(/com moviesho/i);
      expect(name.toLowerCase()).toContain('moviesho');
    });

    it('Case 5: preserves meaningful short acronyms like AI in technical titles', () => {
      const tabs: Tab[] = [
        { title: '9Router - AI Infrastructure Management', url: 'http://198.55.103.161/dashboard' },
        { title: '9Router - AI Infrastructure Management', url: 'http://198.55.103.161/settings' },
      ];
      const { name } = generateGroupName(tabs);
      expect(name).toContain('AI');
      expect(name.toLowerCase()).toMatch(/9router|infrastructure/);
    });

    it('Case 6: preserves project topic Hermes Agent Backend rather than isolated unigram', () => {
      const tabs: Tab[] = [
        { title: 'Hermes agent terminal backend', url: 'https://chatgpt.com/c/1' },
        { title: 'Hermes Agent Terminal Backend Choices - Google Gemini', url: 'https://gemini.google.com/app' },
      ];
      const { name } = generateGroupName(tabs);
      expect(name.toLowerCase()).toContain('hermes');
      expect(name.toLowerCase()).toMatch(/agent|backend/);
    });

    it('Case 7: favors Docker Engine over generic Docs boilerplate', () => {
      const tabs: Tab[] = [
        { title: 'Install Docker Engine on Ubuntu - Docker Docs', url: 'https://docs.docker.com/engine/install/ubuntu/' },
        { title: 'Install Docker Engine on Ubuntu - Docker Docs', url: 'https://docs.docker.com/engine/install/ubuntu/' },
      ];
      const { name } = generateGroupName(tabs);
      expect(name.toLowerCase()).toContain('docker');
      expect(name.toLowerCase()).toContain('engine');
    });

    it('Case 8: preserves subject phrase Chloe Price without forced brand prefix', () => {
      const tabs: Tab[] = [
        { title: 'chloe price - Google Search', url: 'https://google.com/search?q=chloe+price' },
        { title: 'chloe price profile photo - Google Search', url: 'https://google.com/search?q=chloe+price+photo' },
      ];
      const { name, color } = generateGroupName(tabs);
      expect(name).toBe('Chloe Price');
      expect(name).not.toContain('Google —');
      expect(color).toBe('blue');
    });

    it('Case 9: preserves shared product model concept Gemini Model', () => {
      const tabs: Tab[] = [
        { title: 'Gemini 3.7 Flash: our most intelligent workhorse model', url: 'https://blog.google/technology/ai/gemini-3-7-flash/' },
        { title: 'Gemini Omni experts answer key questions about the model', url: 'https://blog.google/technology/ai/gemini-omni-qa/' },
      ];
      const { name } = generateGroupName(tabs);
      expect(name.toLowerCase()).toContain('gemini');
      expect(name.toLowerCase()).toContain('model');
    });

    it('Case 10: produces 100% identical naming across 50 repeated runs', () => {
      const tabs: Tab[] = [
        { title: 'LiquidGlass — WebGL Glass Effects for the Web', url: 'https://liquid-glass.ybouane.com' },
        { title: 'ybouane/liquidglass: A liquid glass effect library for the web', url: 'https://github.com/ybouane/liquidglass' },
      ];
      const first = generateGroupName(tabs);
      for (let i = 0; i < 50; i++) {
        const next = generateGroupName(tabs);
        expect(next.name).toBe(first.name);
        expect(next.color).toBe(first.color);
      }
    });
  });
});
