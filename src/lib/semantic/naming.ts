// =============================================================================
// TwoTab Intelligent Tab Grouping — Deterministic Group Naming Engine
// =============================================================================
// Features:
// 1. Discriminative term extraction from titles and shared path tokens
// 2. Comprehensive stopword & web boilerplate filtering
// 3. Brand domain recognition and TabGroupColor assignment
// 4. Stable deterministic naming (Zero LLM, 100% offline & local)
// =============================================================================

import type { Tab, TabGroupColor } from '../storage';
import type { NormalizedTabMetadata } from './types';
import { normalizeTab } from './normalization';
import { BRANDED_DOMAINS } from '../domainOrganizer';

/**
 * Common English grammatical stopwords and generic website terms.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'could', 'did', 'do', 'does', 'doing', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having',
  'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i',
  'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most',
  'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only',
  'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she',
  'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to',
  'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your',
  'yours', 'yourself', 'yourselves',
  // Web boilerplate
  'home', 'login', 'signin', 'welcome', 'official', 'site', 'index', 'dashboard',
  'portal', 'page', 'search', 'privacy', 'terms', 'overview', 'getting', 'started',
]);

/**
 * Converts a string into Title Case.
 */
export function toTitleCase(str: string): string {
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Deterministically generates a human-readable group name and color for a cluster of tabs.
 */
export function generateGroupName(
  tabs: Tab[],
  metadata?: NormalizedTabMetadata[]
): { name: string; color: TabGroupColor } {
  if (tabs.length === 0) {
    return { name: 'Empty Collection', color: 'grey' };
  }

  const metas = metadata ?? tabs.map((t) => normalizeTab(t));

  // Determine dominant domain
  const domains = metas.map((m) => m.domain).filter(Boolean);
  const domainCounts = new Map<string, number>();
  for (const d of domains) {
    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }

  let dominantDomain = '';
  let maxDomainCount = 0;
  for (const [d, count] of domainCounts.entries()) {
    if (count > maxDomainCount) {
      maxDomainCount = count;
      dominantDomain = d;
    }
  }

  // Tokenize titles
  const titleTokenCounts = new Map<string, number>();
  for (const m of metas) {
    const words = m.cleanTitle
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && /[a-zA-Z]/.test(w));

    for (const w of words) {
      titleTokenCounts.set(w, (titleTokenCounts.get(w) ?? 0) + 1);
    }
  }

  // Find shared path tokens across multiple tabs
  const pathTokenOccurrences = new Map<string, Set<number>>();
  for (let idx = 0; idx < metas.length; idx++) {
    const m = metas[idx];
    const pathWords = m.pathSegments.join(' ')
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && /[a-zA-Z]/.test(w));

    for (const w of pathWords) {
      if (!pathTokenOccurrences.has(w)) pathTokenOccurrences.set(w, new Set());
      pathTokenOccurrences.get(w)!.add(idx);
    }
  }

  const tokenCounts = new Map<string, number>();
  if (titleTokenCounts.size > 0) {
    for (const [w, count] of titleTokenCounts.entries()) {
      tokenCounts.set(w, count);
    }
    // If title has very few distinct words (<= 1), augment with shared path tokens
    if (titleTokenCounts.size <= 1) {
      for (const [w, occ] of pathTokenOccurrences.entries()) {
        if (occ.size >= 2) {
          tokenCounts.set(w, (tokenCounts.get(w) ?? 0) + occ.size);
        }
      }
    }
  } else {
    // Only use path tokens that are shared across multiple tabs
    for (const [w, occ] of pathTokenOccurrences.entries()) {
      if (occ.size >= 2 || (metas.length === 1 && occ.size === 1)) {
        tokenCounts.set(w, occ.size);
      }
    }
  }

  // Rank tokens deterministically: first by frequency descending, then alphabetically ascending
  const sortedTokens = Array.from(tokenCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

  let generatedName = '';
  if (sortedTokens.length >= 2 && sortedTokens[1][1] >= 2) {
    generatedName = toTitleCase(`${sortedTokens[0][0]} ${sortedTokens[1][0]}`);
  } else if (sortedTokens.length >= 1 && sortedTokens[0][1] >= 1) {
    generatedName = toTitleCase(sortedTokens[0][0]);
  }

  // Branded domain check
  const getRootDomain = (d: string) => {
    const parts = d.split('.');
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
    }
    return d;
  };

  const root = getRootDomain(dominantDomain);
  const brandEntry =
    (dominantDomain && BRANDED_DOMAINS[dominantDomain]) ||
    (root && BRANDED_DOMAINS[root]);

  let assignedColor: TabGroupColor = 'blue';
  if (brandEntry) {
    assignedColor = brandEntry.color;
    if (!generatedName || maxDomainCount === tabs.length) {
      generatedName = generatedName ? `${brandEntry.name} — ${generatedName}` : brandEntry.name;
    }
  } else if (dominantDomain && !generatedName) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(dominantDomain)) {
      generatedName = dominantDomain;
    } else {
      generatedName = toTitleCase(dominantDomain.split('.')[0]);
    }
  }

  if (!generatedName) {
    generatedName = 'Saved Collection';
  }

  return { name: generatedName, color: assignedColor };
}
