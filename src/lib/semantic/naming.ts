// =============================================================================
// TwoTab Intelligent Tab Grouping — Deterministic Group Naming Engine
// =============================================================================
// Architecture:
// 1. URL & Protocol / TLD Sanitization (eliminates .com, www, http, /watch, /wiki noise)
// 2. Phrase-Aware Candidate Generation (unigrams, bigrams, trigrams in natural word order)
// 3. Technical Acronym & Short Token Preservation (AI, UI, UX, OS, DB, ML, 4K, 3D, Go)
// 4. Document-Frequency & Cluster-Coverage Scoring (cluster-wide relevance over raw TF)
// 5. Delimiter Chunk & Prominence Analysis (favors primary subject over suffix descriptors)
// 6. Top Unigram Compounding (synthesizes natural phrases like Django Authentication)
// 7. Single-Tab Dominance Guard (prevents naming a cluster after a single person)
// 8. Topic-First Branding (eliminates mechanical "Brand — " prefixes while keeping color tags)
// 9. 100% Deterministic & Local (Zero LLM, zero extra embedding calls, zero telemetry)
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
  // Common connective words
  'vs', 'versus', 'with', 'without', 'via', 'per',
]);

/**
 * URL artifacts, protocols, and top-level domain noise that should NEVER be treated
 * as semantic title words.
 */
export const TLD_AND_URL_STOPWORDS: ReadonlySet<string> = new Set([
  'http', 'https', 'ftp', 'www', 'com', 'org', 'net', 'edu', 'gov', 'mil', 'int',
  'xyz', 'info', 'biz', 'tv', 'cc',
  'uk', 'us', 'ca', 'de', 'jp', 'fr', 'au', 'ru', 'ch', 'it', 'nl', 'se', 'no', 'es',
  'html', 'htm', 'php', 'asp', 'aspx', 'jsp', 'do', 'action', 'cgi',
  // Common URL path segment noise
  'watch', 'wiki', 'view', 'index', 'search', 'default', 'main', 'en',
  'questions', 'item', 'items', 'file', 'files',
]);

/**
 * Meaningful short technical tokens (1-2 characters) that must NOT be discarded
 * by word-length filtering.
 */
export const MEANINGFUL_SHORT_TOKENS: ReadonlySet<string> = new Set([
  'ai', 'ui', 'ux', 'os', 'db', 'ml', 'go', '4k', '3d', '2d',
  'ip', 'api', 'sdk', 'cli', 'css', 'js', 'ts', 'pr', 'ci', 'cd',
  'vr', 'ar', 'id', 'io', 'vm', 'qa', 'llm', 'nlp', 'cv', 'dl',
]);

/**
 * Acronyms that should always be formatted in uppercase in group titles.
 */
export const ACRONYMS_ALL_CAPS: ReadonlySet<string> = new Set([
  'AI', 'UI', 'UX', 'OS', 'DB', 'ML', 'API', 'SDK', 'CLI', 'CSS', 'JS', 'TS',
  'PR', 'CI', 'CD', 'VR', 'AR', 'IP', '4K', '3D', '2D', 'SQL', 'HTML', 'REST',
  'JWT', 'RTK', 'LLM', 'NLP', 'URL', 'ID', 'VM', 'QA', 'UHD', 'OLED',
]);

/**
 * Known tech project and brand names with specific casing conventions.
 */
const KNOWN_CASING: Record<string, string> = {
  '9router': '9Router',
  'chatgpt': 'ChatGPT',
  'fastapi': 'FastAPI',
  'simplejwt': 'SimpleJWT',
  'liquidglass': 'LiquidGlass',
  'twotab': 'TwoTab',
  'github': 'GitHub',
  'gitlab': 'GitLab',
  'nextjs': 'Next.js',
  'vuejs': 'Vue.js',
  'nodejs': 'Node.js',
  'stackoverflow': 'Stack Overflow',
};

/**
 * Generic web boilerplate and navigation words that carry minimal topical distinction.
 */
export const WEB_BOILERPLATE_WORDS: ReadonlySet<string> = new Set([
  'home', 'welcome', 'official', 'site', 'dashboard', 'page',
  'login', 'signin', 'signup', 'register', 'getting', 'started', 'online', 'free',
  'untitled', 'new tab', 'portal', 'index', 'search',
]);

export const BOILERPLATE_WORDS: ReadonlySet<string> = new Set([
  ...WEB_BOILERPLATE_WORDS,
  'docs', 'documentation', 'reference', 'overview',
  'part', 'article', 'post', 'blog', 'repository', 'repo', 'repos',
]);

/**
 * Low-specificity media/content suffixes that should be demoted below core subject nouns.
 */
export const DESCRIPTOR_SUFFIXES: ReadonlySet<string> = new Set([
  'ambiance', 'ambient', 'sounds', 'relaxing', 'mix', 'mixtape', 'music', 'video',
  'videos', 'photo', 'photos', 'image', 'images', 'wallpaper', 'wallpapers',
  'profile', 'channel', 'playlist', 'track', 'song', 'audio',
]);

/**
 * Checks if a word is a valid semantic content token.
 */
export function isContentWord(word: string): boolean {
  if (!word || typeof word !== 'string') return false;
  const lower = word.toLowerCase().trim();
  if (!lower) return false;

  // Filter stopwords, URL/TLD noise, and web boilerplate
  if (
    STOPWORDS.has(lower) ||
    TLD_AND_URL_STOPWORDS.has(lower) ||
    WEB_BOILERPLATE_WORDS.has(lower)
  ) {
    return false;
  }

  // Single characters: valid only if CJK ideographs
  if (lower.length === 1) {
    return /[\u4e00-\u9fa5\u3040-\u30ff]/.test(lower);
  }

  // 2-character tokens: check meaningful short token allowlist or digit combinations (v2, 3b)
  if (lower.length === 2) {
    if (MEANINGFUL_SHORT_TOKENS.has(lower)) return true;
    return /\d/.test(lower) && /[a-z]/i.test(lower);
  }

  // 3+ character tokens: must contain at least one letter or CJK ideograph
  return /[a-z\u4e00-\u9fa5]/i.test(lower);
}

/**
 * Formats a single word, preserving known acronyms and established brand casing.
 */
export function formatWord(word: string): string {
  if (!word) return '';
  const upper = word.toUpperCase();
  if (ACRONYMS_ALL_CAPS.has(upper)) {
    return upper;
  }

  const lower = word.toLowerCase();
  if (KNOWN_CASING[lower]) {
    return KNOWN_CASING[lower];
  }

  // Standard Title Case: capitalize first letter, lowercase the rest
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Converts a string into formatted Title Case while preserving uppercase technical acronyms.
 */
export function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map(formatWord)
    .join(' ');
}

/**
 * Checks whether a text is essentially a raw URL or domain.
 */
function isUrlLike(text: string): boolean {
  const t = (text || '').trim().toLowerCase();
  if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('www.')) {
    return true;
  }
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(t);
}

/**
 * Extracts a clean domain label from a URL-like string or hostname.
 */
export function extractCleanDomainLabel(raw: string): string {
  if (!raw) return '';
  let clean = raw.trim().toLowerCase();
  clean = clean.replace(/^[a-z]+:\/\//i, '');
  clean = clean.replace(/^www\./i, '');
  const host = clean.split('/')[0].split('?')[0];

  // IP addresses
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return host;
  }

  // Check branded domains dictionary
  if (BRANDED_DOMAINS[host]) {
    return BRANDED_DOMAINS[host].name;
  }
  const parts = host.split('.');
  if (parts.length >= 2) {
    const root = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
    if (BRANDED_DOMAINS[root]) {
      return BRANDED_DOMAINS[root].name;
    }
    const base = parts[0];
    if (base && base.length >= 2 && !TLD_AND_URL_STOPWORDS.has(base)) {
      return formatWord(base);
    }
  }

  return formatWord(parts[0] || host);
}

/**
 * Candidate phrase extracted from source titles.
 */
export interface CandidatePhrase {
  raw: string; // Lowercase normalized tokens joined by space
  display: string; // Title-cased display string
  words: string[]; // Normalized word tokens
  docIndices: Set<number>; // Tab indices that contain this candidate
  firstChunkOccurrences: number; // Count of occurrences in Chunk 0
  avgPositionRatio: number; // Normalized position in title (0 = start, 1 = end)
  isChunkExact: boolean; // True if candidate matches an entire natural delimited chunk
}

/**
 * Segments a title into natural semantic chunks using structural delimiters.
 */
export function segmentTitleChunks(title: string): string[] {
  if (!title) return [];
  return title
    .split(/\s*[-–—|•·:\n\r/]\s*|\s+-\s+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * Extracts candidate phrases (unigrams, bigrams, trigrams) from a collection of tabs.
 */
export function extractCandidatePhrases(metas: NormalizedTabMetadata[]): CandidatePhrase[] {
  const candidateMap = new Map<string, CandidatePhrase>();

  const registerCandidate = (
    words: string[],
    tabIndex: number,
    isFirstChunk: boolean,
    posRatio: number,
    isExactChunk: boolean
  ) => {
    if (words.length === 0 || words.length > 4) return;
    const raw = words.map((w) => w.toLowerCase()).join(' ');

    if (!candidateMap.has(raw)) {
      const displayWords = words.map(formatWord);
      candidateMap.set(raw, {
        raw,
        display: displayWords.join(' '),
        words: [...words],
        docIndices: new Set(),
        firstChunkOccurrences: 0,
        avgPositionRatio: posRatio,
        isChunkExact: isExactChunk,
      });
    }

    const c = candidateMap.get(raw)!;
    c.docIndices.add(tabIndex);
    if (isFirstChunk) {
      c.firstChunkOccurrences++;
    }
    // Running average of relative position
    c.avgPositionRatio = (c.avgPositionRatio + posRatio) / 2;
    if (isExactChunk) {
      c.isChunkExact = true;
    }
  };

  for (let tabIdx = 0; tabIdx < metas.length; tabIdx++) {
    const meta = metas[tabIdx];
    const rawTitle = meta.cleanTitle || '';

    // Handle URL-only titles
    if (!rawTitle || isUrlLike(rawTitle)) {
      const domainLabel = extractCleanDomainLabel(rawTitle || meta.domain);
      if (domainLabel) {
        registerCandidate([domainLabel], tabIdx, true, 0.0, true);
      }
      continue;
    }

    const chunks = segmentTitleChunks(rawTitle);
    if (chunks.length === 0) continue;

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];
      const isFirstChunk = chunkIdx === 0;

      // Extract alphanumeric word tokens with apostrophe support (e.g. Max's)
      const rawTokens = chunk.match(/[a-zA-Z0-9\u4e00-\u9fa5]+(?:'[a-zA-Z]+)?/g) || [];
      if (rawTokens.length === 0) continue;

      // Filter content tokens
      const contentTokens: Array<{ word: string; originalIndex: number }> = [];
      for (let i = 0; i < rawTokens.length; i++) {
        const w = rawTokens[i];
        if (isContentWord(w)) {
          contentTokens.push({ word: w, originalIndex: i });
        }
      }

      const totalTokens = rawTokens.length;
      const firstToken = rawTokens[0];
      const lastToken = rawTokens[totalTokens - 1];

      // 1. Exact chunk candidate: If chunk starts and ends with content words and has 2 to 4 words
      if (
        totalTokens >= 2 &&
        totalTokens <= 4 &&
        firstToken &&
        lastToken &&
        isContentWord(firstToken) &&
        isContentWord(lastToken)
      ) {
        const chunkWords = rawTokens.filter((w) => !TLD_AND_URL_STOPWORDS.has(w.toLowerCase()));
        registerCandidate(chunkWords, tabIdx, isFirstChunk, chunkIdx / chunks.length, true);
      }

      // 2. Contiguous content-word N-Grams in original title order
      for (let i = 0; i < contentTokens.length; i++) {
        const t1 = contentTokens[i];
        if (!t1) continue;
        const posRatio = (chunkIdx + t1.originalIndex / totalTokens) / (chunks.length + 1);

        // Unigram
        registerCandidate([t1.word], tabIdx, isFirstChunk, posRatio, false);

        // Bigram (adjacent or separated by at most 1 bounded stopword)
        if (i + 1 < contentTokens.length) {
          const t2 = contentTokens[i + 1];
          if (t2 && t2.originalIndex - t1.originalIndex <= 2) {
            registerCandidate([t1.word, t2.word], tabIdx, isFirstChunk, posRatio, false);
          }
        }

        // Trigram (adjacent or separated by small stopwords)
        if (i + 2 < contentTokens.length) {
          const t2 = contentTokens[i + 1];
          const t3 = contentTokens[i + 2];
          if (t2 && t3 && t3.originalIndex - t1.originalIndex <= 3) {
            registerCandidate([t1.word, t2.word, t3.word], tabIdx, isFirstChunk, posRatio, false);
          }
        }
      }

      // 3. Delimiter compound candidate: Combine Chunk 0 unigram with Chunk 1 bigram
      // (e.g. "9Router" + "AI Infrastructure" -> "9Router AI Infrastructure")
      if (chunkIdx === 0 && chunks.length > 1 && contentTokens.length === 1 && contentTokens[0]) {
        const nextChunk = chunks[1];
        const nextChunkTokens = nextChunk
          ? nextChunk.match(/[a-zA-Z0-9\u4e00-\u9fa5]+(?:'[a-zA-Z]+)?/g) || []
          : [];
        const nextContent = nextChunkTokens.filter((w) => isContentWord(w));
        const firstNext = nextContent[0];
        const secondNext = nextContent[1];
        if (firstNext) {
          registerCandidate([contentTokens[0].word, firstNext], tabIdx, true, 0.0, false);
          if (secondNext) {
            registerCandidate(
              [contentTokens[0].word, firstNext, secondNext],
              tabIdx,
              true,
              0.0,
              false
            );
          }
        }
      }
    }
  }

  // Cross-tab verification: check if each candidate phrase exists in other tabs
  const candidates = Array.from(candidateMap.values());
  for (const c of candidates) {
    const phraseLower = c.raw;
    for (let tabIdx = 0; tabIdx < metas.length; tabIdx++) {
      if (c.docIndices.has(tabIdx)) continue;
      const titleLower = (metas[tabIdx].cleanTitle || '').toLowerCase();
      // Fast check: does the title contain the phrase or all words in order?
      if (titleLower.includes(phraseLower)) {
        c.docIndices.add(tabIdx);
      } else if (c.words.length > 1) {
        let lastIdx = -1;
        let allFound = true;
        for (const w of c.words) {
          const found = titleLower.indexOf(w.toLowerCase(), lastIdx + 1);
          if (found === -1) {
            allFound = false;
            break;
          }
          lastIdx = found;
        }
        if (allFound) {
          c.docIndices.add(tabIdx);
        }
      }
    }
  }

  // Top Unigram Compounding: If multiple high-coverage unigrams exist across tabs
  // (e.g. "Django" [DF=3] and "Authentication" [DF=3]), synthesize a compound candidate
  // in source title word order
  const unigrams = candidates.filter((c) => c.words.length === 1 && c.docIndices.size >= 2);
  if (unigrams.length >= 2) {
    unigrams.sort((a, b) => b.docIndices.size - a.docIndices.size);
    const u1 = unigrams[0];
    const u2 = unigrams[1];
    if (u1 && u2 && u2.docIndices.size >= 2) {
      // Determine source word order from the first tab containing both
      let word1 = u1.words[0];
      let word2 = u2.words[0];
      for (const m of metas) {
        const tLower = (m.cleanTitle || '').toLowerCase();
        const p1 = tLower.indexOf(word1.toLowerCase());
        const p2 = tLower.indexOf(word2.toLowerCase());
        if (p1 !== -1 && p2 !== -1) {
          if (p2 < p1) {
            word1 = u2.words[0];
            word2 = u1.words[0];
          }
          break;
        }
      }
      const compoundRaw = `${word1.toLowerCase()} ${word2.toLowerCase()}`;
      if (!candidateMap.has(compoundRaw)) {
        const sharedDocs = new Set<number>();
        for (const idx of u1.docIndices) {
          if (u2.docIndices.has(idx)) sharedDocs.add(idx);
        }
        if (sharedDocs.size >= 2) {
          candidates.push({
            raw: compoundRaw,
            display: `${formatWord(word1)} ${formatWord(word2)}`,
            words: [word1, word2],
            docIndices: sharedDocs,
            firstChunkOccurrences: Math.min(u1.firstChunkOccurrences, u2.firstChunkOccurrences),
            avgPositionRatio: (u1.avgPositionRatio + u2.avgPositionRatio) / 2,
            isChunkExact: false,
          });
        }
      }
    }
  }

  return candidates;
}

/**
 * Scores a candidate phrase based on cluster coverage, phrase continuity,
 * position prominence, acronym preservation, and boilerplate penalties.
 */
export function scoreCandidate(c: CandidatePhrase, totalTabs: number): number {
  const df = c.docIndices.size;
  const coverage = df / totalTabs;

  // 1. Cluster coverage score (primary signal)
  let score = coverage * 15.0;

  // 2. Shared consensus bonus
  if (df >= 2) {
    score += 10.0;
  } else if (totalTabs >= 2) {
    // Heavily penalize a term that only appears in 1 tab of a multi-tab cluster
    score -= 12.0;
  }

  // 3. Phrase length bonus (favor 2-3 word natural phrases)
  const wordCount = c.words.length;
  if (wordCount === 3) {
    score += 5.5; // Rich 3-word phrase with high coverage is optimal
  } else if (wordCount === 2) {
    score += 5.0;
  } else if (wordCount === 1) {
    score += 1.0;
  } else if (wordCount === 4) {
    score += 2.0;
  } else {
    score -= (wordCount - 4) * 3.0;
  }

  // 4. Primary chunk prominence (Chunk 0 is almost universally the core subject)
  if (c.firstChunkOccurrences > 0) {
    score += (c.firstChunkOccurrences / totalTabs) * 4.0;
  }

  // 5. Exact chunk bonus (clean natural phrase bounded by title delimiters)
  if (c.isChunkExact) {
    score += 3.0;
  }

  // 6. Early position bonus
  score += Math.max(0, 1.0 - c.avgPositionRatio) * 2.5;

  // 7. Technical acronym & short token bonus
  for (const w of c.words) {
    const lower = w.toLowerCase();
    if (MEANINGFUL_SHORT_TOKENS.has(lower) || ACRONYMS_ALL_CAPS.has(w.toUpperCase())) {
      score += 2.5;
    }
  }

  // 8. Penalties for boilerplate and descriptor words
  for (const w of c.words) {
    const lower = w.toLowerCase();
    if (BOILERPLATE_WORDS.has(lower)) {
      score -= 4.0;
    }
    if (DESCRIPTOR_SUFFIXES.has(lower)) {
      score -= 2.5;
    }
    if (TLD_AND_URL_STOPWORDS.has(lower)) {
      score -= 15.0;
    }
  }

  // Heavy penalty if candidate consists ENTIRELY of boilerplate
  const allBoilerplate = c.words.every(
    (w) => BOILERPLATE_WORDS.has(w.toLowerCase()) || DESCRIPTOR_SUFFIXES.has(w.toLowerCase())
  );
  if (allBoilerplate) {
    score -= 8.0;
  }

  return score;
}

/**
 * Deterministically generates a natural, human-readable group name and color for a cluster of tabs.
 */
export function generateGroupName(
  tabs: Tab[],
  metadata?: NormalizedTabMetadata[]
): { name: string; color: TabGroupColor } {
  if (tabs.length === 0) {
    return { name: 'Empty Collection', color: 'grey' };
  }

  const metas = metadata ?? tabs.map((t) => normalizeTab(t));
  const totalTabs = metas.length;

  // Determine dominant domain and platform branding
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

  const assignedColor: TabGroupColor = brandEntry ? brandEntry.color : 'blue';

  // 1. Extract all candidate phrases from titles
  let allCandidates = extractCandidatePhrases(metas);

  // Check if any candidate is a meaningful non-boilerplate phrase
  const nonBoilerplateCandidates = allCandidates.filter(
    (c) => !c.words.every((w) => BOILERPLATE_WORDS.has(w.toLowerCase()))
  );

  // If all titles were empty or pure boilerplate (e.g. all titles are "Documentation"),
  // augment with shared path segments
  if (nonBoilerplateCandidates.length === 0) {
    const pathWordsMap = new Map<string, Set<number>>();
    for (let idx = 0; idx < metas.length; idx++) {
      // Subdomain (e.g. fastapi from fastapi.tiangolo.com)
      const domainParts = (metas[idx].domain || '').split('.');
      if (domainParts.length >= 3 && domainParts[0] && isContentWord(domainParts[0])) {
        const sub = domainParts[0].toLowerCase();
        if (!pathWordsMap.has(sub)) pathWordsMap.set(sub, new Set());
        pathWordsMap.get(sub)!.add(idx);
      }
      for (const seg of metas[idx].pathSegments) {
        const words = seg.toLowerCase().split(/\s+/).filter(isContentWord);
        for (const w of words) {
          if (!pathWordsMap.has(w)) pathWordsMap.set(w, new Set());
          pathWordsMap.get(w)!.add(idx);
        }
      }
    }

    for (const [w, docs] of pathWordsMap.entries()) {
      if (docs.size >= (totalTabs >= 2 ? 2 : 1)) {
        allCandidates.push({
          raw: w,
          display: formatWord(w),
          words: [w],
          docIndices: docs,
          firstChunkOccurrences: 0,
          avgPositionRatio: 0.2,
          isChunkExact: false,
        });
      }
    }

    if (pathWordsMap.size > 0) {
      const withContent = allCandidates.filter(
        (c) => !c.words.every((w) => BOILERPLATE_WORDS.has(w.toLowerCase()))
      );
      if (withContent.length > 0) {
        allCandidates = withContent;
      }
    }
  }

  // 2. Identify maximum document frequency across all candidates
  let maxDf = 0;
  for (const c of allCandidates) {
    if (c.docIndices.size > maxDf) {
      maxDf = c.docIndices.size;
    }
  }

  // 3. Single-Tab Dominance Guard:
  // If we have >= 2 tabs, but NO candidate phrase is shared across >= 2 tabs,
  // do NOT pick an arbitrary person or single-tab subject to label the entire group.
  if (totalTabs >= 2 && maxDf < 2) {
    // Conservative platform fallback when no shared topic exists
    if (brandEntry) {
      let platformLabel = brandEntry.name;
      if (dominantDomain.includes('youtube')) platformLabel = 'YouTube';
      else if (dominantDomain.includes('github')) platformLabel = 'GitHub';
      else if (dominantDomain.includes('wikipedia')) platformLabel = 'Wikipedia';
      return { name: platformLabel, color: assignedColor };
    }

    if (dominantDomain) {
      const cleanHost = extractCleanDomainLabel(dominantDomain);
      if (cleanHost) {
        return { name: cleanHost, color: assignedColor };
      }
    }

    return { name: 'Saved Collection', color: assignedColor };
  }

  // 4. Filter candidates: If cluster has >= 2 tabs, require DF >= 2
  const eligibleCandidates = allCandidates.filter((c) =>
    totalTabs >= 2 ? c.docIndices.size >= 2 : c.docIndices.size >= 1
  );

  if (eligibleCandidates.length === 0) {
    // Fallback if no eligible candidates survive
    if (brandEntry) {
      return { name: brandEntry.name, color: assignedColor };
    }
    if (dominantDomain) {
      const cleanHost = extractCleanDomainLabel(dominantDomain);
      if (cleanHost) {
        return { name: cleanHost, color: assignedColor };
      }
    }
    return { name: 'Saved Collection', color: assignedColor };
  }

  // 5. Rank candidates deterministically
  eligibleCandidates.sort((a, b) => {
    const scoreDiff = scoreCandidate(b, totalTabs) - scoreCandidate(a, totalTabs);
    if (Math.abs(scoreDiff) > 1e-5) {
      return scoreDiff;
    }
    // Tie-breaker 1: Document frequency descending
    if (b.docIndices.size !== a.docIndices.size) {
      return b.docIndices.size - a.docIndices.size;
    }
    // Tie-breaker 2: Word count descending (more specific phrase outranks unigram)
    if (b.words.length !== a.words.length) {
      return b.words.length - a.words.length;
    }
    // Tie-breaker 3: First chunk occurrences descending
    if (b.firstChunkOccurrences !== a.firstChunkOccurrences) {
      return b.firstChunkOccurrences - a.firstChunkOccurrences;
    }
    // Tie-breaker 4: Earlier position in title ascending
    if (Math.abs(a.avgPositionRatio - b.avgPositionRatio) > 1e-4) {
      return a.avgPositionRatio - b.avgPositionRatio;
    }
    // Tie-breaker 5: Alphabetical ascending of display string (stable final tie-breaker)
    return a.display.localeCompare(b.display);
  });

  const topCandidate = eligibleCandidates[0];
  let generatedName = topCandidate.display;

  // If the top candidate is a generic boilerplate word like "Repository" or "Documentation"
  // on a branded domain (e.g. GitHub or FastAPI), combine with brand
  if (
    brandEntry &&
    topCandidate.words.length === 1 &&
    BOILERPLATE_WORDS.has(topCandidate.words[0].toLowerCase())
  ) {
    generatedName = `${brandEntry.name} ${generatedName}`;
  }

  // Final sanity check: if the name is empty or pure punctuation, fallback to domain
  if (!generatedName || !/[a-zA-Z0-9\u4e00-\u9fa5]/.test(generatedName)) {
    if (brandEntry) {
      generatedName = brandEntry.name;
    } else if (dominantDomain) {
      generatedName = extractCleanDomainLabel(dominantDomain) || 'Saved Collection';
    } else {
      generatedName = 'Saved Collection';
    }
  }

  return { name: generatedName, color: assignedColor };
}
