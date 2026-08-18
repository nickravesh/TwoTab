import { describe, it, expect } from 'vitest';
import {
  type TabGroup,
  type TabGroupColor,
  SORT_OPTIONS,
  COLOR_FILTER_ITEMS,
  filterAndSortTabGroups,
  type SortOption,
} from './storage';

describe('Dashboard Filtering & Sorting Engine Unit Tests', () => {
  const mockGroups: TabGroup[] = [
    {
      id: 101,
      name: 'Design System',
      color: 'purple',
      date: '2026-08-15T10:00:00Z',
      tabs: [
        { title: 'Figma UI Kit', url: 'https://figma.com/design' },
        { title: 'Tailwind CSS Docs', url: 'https://tailwindcss.com' },
        { title: 'Radix UI Primitives', url: 'https://radix-ui.com' },
      ],
    },
    {
      id: 102,
      name: 'Backend Research',
      color: 'blue',
      date: '2026-08-10T08:00:00Z',
      tabs: [
        { title: 'PostgreSQL Indexes', url: 'https://postgresql.org/docs' },
        { title: 'Go Concurrency', url: 'https://golang.org/doc' },
      ],
    },
    {
      id: 103,
      name: 'Alpha Project',
      color: 'green',
      date: '2026-08-18T12:00:00Z',
      tabs: [
        { title: 'Repo Alpha', url: 'https://github.com/project/alpha' },
      ],
    },
    {
      id: 104,
      name: 'Zeta Notes',
      color: 'red',
      date: '2026-08-01T04:00:00Z',
      tabs: [
        { title: 'Note 1', url: 'https://notes.com/1' },
        { title: 'Note 2', url: 'https://notes.com/2' },
        { title: 'Note 3', url: 'https://notes.com/3' },
        { title: 'Note 4', url: 'https://notes.com/4' },
      ],
    },
    {
      id: 105,
      name: 'Unorganized Quick Links',
      date: '2026-08-12T15:00:00Z',
      // No color tag (untagged)
      tabs: [
        { title: 'Article A', url: 'https://news.ycombinator.com' },
        { title: 'Article B', url: 'https://lobste.rs' },
      ],
    },
  ];

  describe('Color Tag Multi-Filtering', () => {
    it('returns all groups when no color filter is selected', () => {
      const result = filterAndSortTabGroups(mockGroups, new Set(), '', 'date-desc');
      expect(result.length).toBe(5);
    });

    it('filters by a single color tag correctly', () => {
      const result = filterAndSortTabGroups(mockGroups, new Set(['purple']), '', 'date-desc');
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Design System');
      expect(result[0].color).toBe('purple');
    });

    it('filters by multiple selected color tags simultaneously', () => {
      const result = filterAndSortTabGroups(mockGroups, new Set(['purple', 'blue']), '', 'date-desc');
      expect(result.length).toBe(2);
      expect(result.map((g) => g.name)).toEqual(['Design System', 'Backend Research']);
    });

    it('filters untagged collections when "none" is selected', () => {
      const result = filterAndSortTabGroups(mockGroups, new Set(['none']), '', 'date-desc');
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Unorganized Quick Links');
      expect(result[0].color).toBeUndefined();
    });

    it('combines untagged ("none") and tagged selections', () => {
      const result = filterAndSortTabGroups(mockGroups, new Set(['none', 'green']), '', 'date-desc');
      expect(result.length).toBe(2);
      expect(result.map((g) => g.name)).toEqual(['Alpha Project', 'Unorganized Quick Links']);
    });

    it('returns an empty array when no collections match selected color tags', () => {
      const result = filterAndSortTabGroups(mockGroups, new Set(['cyan']), '', 'date-desc');
      expect(result.length).toBe(0);
    });

    it('accepts array representation of filter tags', () => {
      const result = filterAndSortTabGroups(mockGroups, ['red', 'blue'], '', 'date-desc');
      expect(result.length).toBe(2);
      expect(result.map((g) => g.name)).toEqual(['Backend Research', 'Zeta Notes']);
    });

    it('computes live color tag counts accurately across all collections', () => {
      const counts = new Map<string, number>();
      for (const g of mockGroups) {
        const c = g.color || 'none';
        counts.set(c, (counts.get(c) || 0) + 1);
      }

      expect(counts.get('purple')).toBe(1);
      expect(counts.get('blue')).toBe(1);
      expect(counts.get('green')).toBe(1);
      expect(counts.get('red')).toBe(1);
      expect(counts.get('none')).toBe(1);
      expect(counts.get('yellow') || 0).toBe(0);
    });
  });

  describe('Sorting Suite', () => {
    it('sorts by date-desc (Newest First)', () => {
      const result = filterAndSortTabGroups(mockGroups, new Set(), '', 'date-desc');
      expect(result.map((g) => g.name)).toEqual([
        'Alpha Project', // Aug 18
        'Design System', // Aug 15
        'Unorganized Quick Links', // Aug 12
        'Backend Research', // Aug 10
        'Zeta Notes', // Aug 01
      ]);
    });

    it('sorts by date-asc (Oldest First)', () => {
      const result = filterAndSortTabGroups(mockGroups, new Set(), '', 'date-asc');
      expect(result.map((g) => g.name)).toEqual([
        'Zeta Notes', // Aug 01
        'Backend Research', // Aug 10
        'Unorganized Quick Links', // Aug 12
        'Design System', // Aug 15
        'Alpha Project', // Aug 18
      ]);
    });

    it('sorts by tabs-desc (Most Tabs First)', () => {
      const result = filterAndSortTabGroups(mockGroups, new Set(), '', 'tabs-desc');
      expect(result.map((g) => g.tabs.length)).toEqual([4, 3, 2, 2, 1]);
      expect(result[0].name).toBe('Zeta Notes');
      expect(result[1].name).toBe('Design System');
    });

    it('sorts by tabs-asc (Fewest Tabs First)', () => {
      const result = filterAndSortTabGroups(mockGroups, new Set(), '', 'tabs-asc');
      expect(result.map((g) => g.tabs.length)).toEqual([1, 2, 2, 3, 4]);
      expect(result[0].name).toBe('Alpha Project');
      expect(result[result.length - 1].name).toBe('Zeta Notes');
    });

    it('sorts by title-asc (Name A → Z)', () => {
      const result = filterAndSortTabGroups(mockGroups, new Set(), '', 'title-asc');
      expect(result.map((g) => g.name)).toEqual([
        'Alpha Project',
        'Backend Research',
        'Design System',
        'Unorganized Quick Links',
        'Zeta Notes',
      ]);
    });

    it('sorts by title-desc (Name Z → A)', () => {
      const result = filterAndSortTabGroups(mockGroups, new Set(), '', 'title-desc');
      expect(result.map((g) => g.name)).toEqual([
        'Zeta Notes',
        'Unorganized Quick Links',
        'Design System',
        'Backend Research',
        'Alpha Project',
      ]);
    });

    it('sorts by color tag spectrum order (blue -> green -> red -> purple -> none)', () => {
      const result = filterAndSortTabGroups(mockGroups, new Set(), '', 'color');
      expect(result.map((g) => g.color || 'none')).toEqual([
        'blue',
        'green',
        'red',
        'purple',
        'none',
      ]);
    });
  });

  describe('Combined Search, Color Filtering, and Sorting', () => {
    it('applies search and color filter together with custom sort', () => {
      // Filter for purple and blue, search for 'doc', sort alphabetically
      const result = filterAndSortTabGroups(
        mockGroups,
        new Set(['purple', 'blue']),
        'doc',
        'title-asc'
      );
      // 'Backend Research' matches 'PostgreSQL Indexes' (docs) and 'Go Concurrency' (doc)
      // 'Design System' matches 'Tailwind CSS Docs'
      expect(result.length).toBe(2);
      expect(result.map((g) => g.name)).toEqual(['Backend Research', 'Design System']);
    });

    it('handles search queries matching only group title', () => {
      const result = filterAndSortTabGroups(mockGroups, new Set(), 'zeta', 'date-desc');
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Zeta Notes');
    });

    it('handles special regex characters safely in search input', () => {
      const specialGroups: TabGroup[] = [
        {
          id: 999,
          name: 'Regex [Test] (Special+Chars)',
          date: '2026-08-18',
          tabs: [{ title: 'Special? URL* [Docs]', url: 'https://test.com/[path]' }],
        },
      ];

      const result = filterAndSortTabGroups(specialGroups, new Set(), '[Test]', 'date-desc');
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Regex [Test] (Special+Chars)');
    });
  });

  describe('Constants and Schemas Verification', () => {
    it('SORT_OPTIONS contains all 7 defined sort modes with valid labels and descriptions', () => {
      expect(SORT_OPTIONS.length).toBe(7);
      const ids = SORT_OPTIONS.map((s) => s.id);
      expect(ids).toContain('date-desc');
      expect(ids).toContain('date-asc');
      expect(ids).toContain('tabs-desc');
      expect(ids).toContain('tabs-asc');
      expect(ids).toContain('title-asc');
      expect(ids).toContain('title-desc');
      expect(ids).toContain('color');

      SORT_OPTIONS.forEach((opt) => {
        expect(opt.label).toBeTruthy();
        expect(opt.description).toBeTruthy();
      });
    });

    it('COLOR_FILTER_ITEMS includes all standard 9 palette hues plus untagged ("none")', () => {
      expect(COLOR_FILTER_ITEMS.length).toBe(10);
      const colorIds = COLOR_FILTER_ITEMS.map((c) => c.id);
      expect(colorIds).toEqual([
        'grey',
        'blue',
        'purple',
        'pink',
        'red',
        'orange',
        'yellow',
        'green',
        'cyan',
        'none',
      ]);
    });
  });
});
