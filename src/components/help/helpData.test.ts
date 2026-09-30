import { describe, it, expect } from 'vitest';
import {
  HELP_CATEGORIES,
  HELP_GUIDES,
  KEYBOARD_SHORTCUTS,
  CONTEXT_MENU_GUIDES,
  FAQ_ITEMS,
  searchHelpContent,
  type HelpCategoryKey,
} from './helpData';

describe('Help Center Data Model & Search Indexing (helpData.ts)', () => {
  describe('Schema Integrity & Content Completeness', () => {
    it('contains all 7 expected categories with non-empty metadata', () => {
      expect(HELP_CATEGORIES.length).toBe(7);
      const categoryIds = HELP_CATEGORIES.map((c) => c.id);
      expect(categoryIds).toEqual([
        'all',
        'getting-started',
        'organization',
        'power-tools',
        'performance',
        'privacy-backups',
        'faq',
      ]);

      HELP_CATEGORIES.forEach((cat) => {
        expect(cat.label.trim().length).toBeGreaterThan(0);
        expect(cat.shortDescription.trim().length).toBeGreaterThan(0);
        expect(cat.iconName.trim().length).toBeGreaterThan(0);
      });
    });

    it('validates every HelpGuide has 3-pillar context (whatItDoes, howItWorks, whatToExpect)', () => {
      expect(HELP_GUIDES.length).toBeGreaterThan(8);

      HELP_GUIDES.forEach((guide) => {
        expect(guide.id.trim().length).toBeGreaterThan(0);
        expect(guide.title.trim().length).toBeGreaterThan(0);
        expect(guide.summary.trim().length).toBeGreaterThan(0);
        expect(guide.whatItDoes.trim().length).toBeGreaterThan(0);
        expect(guide.howItWorks.trim().length).toBeGreaterThan(0);
        expect(guide.whatToExpect.trim().length).toBeGreaterThan(0);
        expect(Array.isArray(guide.keywords)).toBe(true);
        expect(guide.keywords.length).toBeGreaterThan(0);
      });
    });

    it('covers all 4 Power Tools explicitly in HELP_GUIDES', () => {
      const powerToolIds = HELP_GUIDES.filter((g) => g.category === 'power-tools').map((g) => g.id);
      expect(powerToolIds).toContain('link-health-inspector');
      expect(powerToolIds).toContain('duplicate-cleaner');
      expect(powerToolIds).toContain('domain-sorter');
      expect(powerToolIds).toContain('stale-tabs-purifier');
    });

    it('validates keyboard shortcuts have Mac and Windows key mappings', () => {
      expect(KEYBOARD_SHORTCUTS.length).toBeGreaterThan(5);

      KEYBOARD_SHORTCUTS.forEach((sc) => {
        expect(sc.id.trim().length).toBeGreaterThan(0);
        expect(sc.action.trim().length).toBeGreaterThan(0);
        expect(sc.macKey.trim().length).toBeGreaterThan(0);
        expect(sc.winKey.trim().length).toBeGreaterThan(0);
        expect(sc.description.trim().length).toBeGreaterThan(0);
      });
    });

    it('validates context menus have triggers, behaviors, and benefits', () => {
      expect(CONTEXT_MENU_GUIDES.length).toBe(4);

      CONTEXT_MENU_GUIDES.forEach((ctx) => {
        expect(ctx.title.trim().length).toBeGreaterThan(0);
        expect(ctx.trigger.trim().length).toBeGreaterThan(0);
        expect(ctx.behavior.trim().length).toBeGreaterThan(0);
        expect(ctx.benefit.trim().length).toBeGreaterThan(0);
      });
    });

    it('validates all FAQ items have clear questions and solutions', () => {
      expect(FAQ_ITEMS.length).toBeGreaterThan(5);

      FAQ_ITEMS.forEach((faq) => {
        expect(faq.question.trim().length).toBeGreaterThan(0);
        expect(faq.answer.trim().length).toBeGreaterThan(0);
        expect(faq.keywords.length).toBeGreaterThan(0);
      });
    });
  });

  describe('searchHelpContent Search & Filtering Engine', () => {
    it('returns all guides and FAQs when query is empty and category is "all"', () => {
      const result = searchHelpContent('', 'all');
      expect(result.guides.length).toBe(HELP_GUIDES.length);
      expect(result.shortcuts.length).toBe(KEYBOARD_SHORTCUTS.length);
      expect(result.contextMenus.length).toBe(CONTEXT_MENU_GUIDES.length);
      expect(result.faqs.length).toBe(FAQ_ITEMS.length);
      expect(result.totalMatches).toBe(
        HELP_GUIDES.length + KEYBOARD_SHORTCUTS.length + CONTEXT_MENU_GUIDES.length + FAQ_ITEMS.length
      );
    });

    it('filters strictly by category when category is specified', () => {
      const result = searchHelpContent('', 'power-tools');
      expect(result.guides.length).toBe(4);
      result.guides.forEach((g) => {
        expect(g.category).toBe('power-tools');
      });
      // Shortcuts and context menus are not in power-tools
      expect(result.shortcuts.length).toBe(0);
      expect(result.contextMenus.length).toBe(0);
    });

    it('searches across titles, summaries, and keywords for "dead links"', () => {
      const result = searchHelpContent('dead links', 'all');
      expect(result.guides.some((g) => g.id === 'link-health-inspector')).toBe(true);
      expect(result.totalMatches).toBeGreaterThan(0);
    });

    it('searches for "dormant" and matches zero-bandwidth dormant restoration and FAQ', () => {
      const result = searchHelpContent('dormant', 'all');
      expect(result.guides.some((g) => g.id === 'zero-bandwidth-dormant-tabs')).toBe(true);
      expect(result.faqs.some((f) => f.id === 'faq-dormant-tabs-explanation')).toBe(true);
    });

    it('searches for keyboard shortcuts by key combination "⌘S"', () => {
      const result = searchHelpContent('⌘S', 'all');
      expect(result.shortcuts.some((s) => s.id === 'save-window')).toBe(true);
    });

    it('searches for OneTab migration and matches both guide and FAQ', () => {
      const result = searchHelpContent('onetab', 'all');
      expect(result.guides.some((g) => g.id === 'multi-format-data-hub')).toBe(true);
      expect(result.faqs.some((f) => f.id === 'faq-migrate-from-onetab')).toBe(true);
    });

    it('returns totalMatches: 0 for nonsensical query', () => {
      const result = searchHelpContent('xyznonexistentquery999', 'all');
      expect(result.totalMatches).toBe(0);
      expect(result.guides.length).toBe(0);
      expect(result.shortcuts.length).toBe(0);
      expect(result.faqs.length).toBe(0);
      expect(result.contextMenus.length).toBe(0);
    });
  });
});
