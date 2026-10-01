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
});
