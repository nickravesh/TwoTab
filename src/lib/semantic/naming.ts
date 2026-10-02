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
import type { NormalizedTabMetadata, GroupNameOptions } from './types';
import { normalizeTab, GENERIC_PAGE_TITLES } from './normalization';
import { BRANDED_DOMAINS } from '../domainOrganizer';
import { computeCosineSimilarity } from './similarity';

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
  // Universal commercial action stopwords
  'buy', 'price', 'pricing', 'shop', 'store', 'order', 'cart', 'checkout', 'discount', 'cheap', 'free', 'sale',
  'خرید', 'قیمت', 'فروش', 'فروشگاه', 'سفارش', 'ارزان', 'تخفیف', 'رایگان', 'آنلاین', 'اینترنتی', 'جدیدترین', 'بهترین', 'برتر',
  // Universal multilingual / Persian grammatical connectors, prepositions, and auxiliaries
  'بدون', 'با', 'بی', 'در', 'از', 'به', 'برای', 'تا', 'بر', 'روی', 'زیر', 'بین',
  'درباره', 'مورد', 'چون', 'اگر', 'که', 'این', 'آن', 'هم', 'نیز', 'یا', 'و',
  'اما', 'ولی', 'باید', 'شاید', 'دیگر', 'همه', 'هر', 'هیچ', 'چند', 'بیشتر', 'کمتر',
  'خیلی', 'زیاد', 'چرا', 'چگونه', 'چطور', 'کجا', 'کی', 'چه', 'کدام', 'وقتی',
  'شدن', 'شد', 'شده', 'کردن', 'کرد', 'کرده', 'بودن', 'بود', 'بوده',
  'داشتن', 'داشت', 'داشته', 'است', 'هست', 'نیست', 'های',
]);

/**
 * URL artifacts, protocols, and top-level domain noise that should NEVER be treated
 * as semantic title words.
 */
export const TLD_AND_URL_STOPWORDS: ReadonlySet<string> = new Set([
  'http', 'https', 'ftp', 'www', 'com', 'org', 'net', 'edu', 'gov', 'mil', 'int',
  'xyz', 'info', 'biz', 'tv', 'cc',
  'html', 'htm', 'php', 'asp', 'aspx', 'jsp', 'do', 'action', 'cgi',
  // Archive, packaging, and binary file extensions
  'pdf', 'zip', 'rar', 'tar', 'gz', '7z', 'mhtml', 'dmg', 'pkg', 'iso', 'exe', 'bin', 'apk', 'ipa',
  // Common URL path segment noise
  'watch', 'wiki', 'view', 'index', 'search', 'default', 'main',
  'questions', 'item', 'items', 'file', 'files', 'dump', 'tools', 'upload', 'dl',
  'category', 'categories',
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
  'OSI', 'LSM', 'VPN', 'DNS', 'BDSM',
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
  'youtube': 'YouTube',
  'instagram': 'Instagram',
  'linkedin': 'LinkedIn',
  'wikipedia': 'Wikipedia',
  'postgresql': 'PostgreSQL',
  'maktabkhooneh': 'Maktabkhooneh',
  'pinterest': 'Pinterest',
  'ieeexplore': 'IEEE Xplore',
  'clashx': 'ClashX',
  'gemini': 'Gemini',
  'gemeni': 'Gemini',
  'qwen': 'Qwen',
  'openwebui': 'Open WebUI',
  'webui': 'WebUI',
  'docker': 'Docker',
  'metallica': 'Metallica',
  'battlefield': 'Battlefield',
  'bange': 'Bange',
  'jcpal': 'JCPAL',
  'iconjar': 'IconJar',
  'proxifier': 'Proxifier',
};

/**
 * Canonical display representations for recognized multi-word and single-word entities.
 * Guarantees proper casing and punctuation for cultural works, software packages, and people.
 */
export const KNOWN_CANONICAL_ENTITIES: ReadonlyMap<string, string> = new Map([
  ['life is strange', 'Life is Strange'],
  ['the last of us', 'The Last of Us'],
  ['the housemaid', 'The Housemaid'],
  ["anna's archive", "Anna's Archive"],
  ['annas archive', "Anna's Archive"],
  ['shadcn/ui', 'shadcn/ui'],
  ['shadcn ui', 'Shadcn UI'],
  ['hermes agent', 'Hermes Agent'],
  ['twotab', 'TwoTab'],
  ['docker engine', 'Docker Engine'],
  ['docker', 'Docker'],
  ['lsm-tree', 'LSM-Tree'],
  ['postgresql', 'PostgreSQL'],
  ['metallica', 'Metallica'],
  ['battlefield', 'Battlefield'],
  ['ellie williams', 'Ellie Williams'],
  ['chloe price', 'Chloe Price'],
  ['ashley johnson', 'Ashley Johnson'],
  ['shay vatandoust', 'Shay Vatandoust'],
  ['gemini flash', 'Gemini Flash'],
  ['gemini', 'Gemini'],
  ['qwen', 'Qwen'],
  ['open webui', 'Open WebUI'],
  ['openwebui', 'Open WebUI'],
  ['9router', '9Router'],
  ['x-ui', 'X-UI'],
  ['clashx', 'ClashX'],
  ['liquidglass', 'LiquidGlass'],
  ['mr robot', 'Mr. Robot'],
  ['mr. robot', 'Mr. Robot'],
  ['radiohead', 'Radiohead'],
  ['true faith', 'True Faith'],
  ['the mandalorian and grogu', 'The Mandalorian and Grogu'],
  ['the housemaid movie', 'The Housemaid Movie'],
]);

/**
 * Web platforms, hosting providers, and search engines that typically represent
 * the context or source of a tab rather than its actual semantic topic.
 */
export const SOURCE_PLATFORM_TERMS: ReadonlySet<string> = new Set([
  'youtube', 'google', 'pinterest', 'bing', 'github', 'maktabkhooneh',
  'digikala', 'torob', 'reddit', 'instagram', 'twitter', 'imdb',
  'chatgpt', 'facebook', 'linkedin', 'tiktok', 'medium', 'jobvision',
  'ieeexplore', 'arxiv', 'amazon', 'ebay', 'chromewebstore',
]);

/**
 * Generic page types and navigation metadata tokens that describe the artifact format
 * or task rather than the topical subject.
 */
export const PAGE_TYPE_METADATA_TERMS: ReadonlySet<string> = new Set([
  'search', 'product', 'download', 'downloads', 'pricing', 'repository', 'results',
  'website', 'homepage', 'profile', 'release', 'documentation', 'docs',
  'videos', 'video', 'pin', 'pins', 'presentation', 'jobs', 'job',
  'login', 'account', 'subscription', 'portal', 'dashboard', 'overview',
  'reference', 'post', 'article', 'feed', 'item', 'items', 'guide',
]);

/**
 * Method and qualifier pre-modifiers commonly found at the beginning of academic paper titles.
 * These should not displace the substantive topic nouns (e.g. "Learned Cardinality Estimation").
 */
export const RESEARCH_PRE_MODIFIERS: ReadonlySet<string> = new Set([
  'lightweight', 'dual-layer', 'novel', 'scalable', 'robust',
  'comprehensive', 'empirical', 'end-to-end', 'towards',
  'simple', 'fast', 'practical', 'efficient',
  'dual', 'layer', 'end', 'generalized', 'automated', 'adaptive',
]);

/**
 * Generic academic and technical container nouns that describe the artifact
 * rather than the topical subject itself.
 */
export const GENERIC_CONTAINER_NOUNS: ReadonlySet<string> = new Set([
  'model', 'models', 'system', 'systems', 'framework', 'frameworks',
  'approach', 'approaches', 'algorithm', 'algorithms',
  'architecture', 'architectures', 'technique', 'techniques',
  'method', 'methods', 'mechanism', 'mechanisms',
  // Multilingual / Persian generic container and commercial/system nouns
  'مدل', 'مدل‌های', 'مدلها', 'سیستم', 'سیستم‌های', 'روش', 'روش‌های',
  'سامانه', 'سامانه‌های', 'برنامه', 'برنامه‌های', 'فایل', 'فایل‌ها',
  'خرید', 'قیمت', 'فروش', 'فروشگاه',
]);

/**
 * Generic web boilerplate and navigation words that carry minimal topical distinction.
 */
export const WEB_BOILERPLATE_WORDS: ReadonlySet<string> = new Set([
  'home', 'welcome', 'official', 'site', 'dashboard', 'page',
  'login', 'signin', 'signup', 'register', 'getting', 'started', 'online', 'free',
  'untitled', 'new tab', 'portal', 'index', 'search', 'concise', 'placeholder',
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
    return /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}]/u.test(lower);
  }

  // 2-character tokens: check meaningful short token allowlist or digit combinations (v2, 3b)
  if (lower.length === 2) {
    if (MEANINGFUL_SHORT_TOKENS.has(lower)) return true;
    return /\d/.test(lower) && /\p{L}/u.test(lower);
  }

  // 3+ character tokens: must contain at least one letter across any language
  return /\p{L}/u.test(lower);
}

/**
 * Formats a single word, preserving known acronyms and established brand casing.
 */
export function formatWord(word: string): string {
  if (!word) return '';

  // Handle hyphenated compound tokens (e.g. "lsm-tree" -> "LSM-Tree", "x-ui" -> "X-UI")
  if (word.includes('-')) {
    return word
      .split('-')
      .map((part) => formatWord(part))
      .join('-');
  }

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
 * Minor grammatical connective words that should remain lowercased in the interior
 * of a multi-word Title Case phrase (e.g. "Life is Strange", "The Last of Us").
 */
export const MINOR_TITLE_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the',
  'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'as', 'at', 'by', 'for', 'in', 'of', 'on', 'per', 'to', 'via', 'with', 'without',
  'within', 'over', 'is', 'vs', 'versus',
  // Multilingual / Persian minor connectors
  'و', 'یا', 'در', 'از', 'به', 'با', 'برای', 'تا',
]);

/**
 * Prepositions, conjunctions, and auxiliary verbs that cannot be the terminal token
 * of a complete semantic phrase (e.g. phrases cannot end in "of", "in", "is", "the", "without").
 */
export const TERMINAL_CONNECTORS: ReadonlySet<string> = new Set([
  'of', 'in', 'to', 'for', 'with', 'without', 'within', 'on', 'at', 'by', 'from', 'about', 'into',
  'through', 'throughout', 'after', 'before', 'under', 'between', 'and', 'or', 'but',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'the', 'a', 'an', 'as',
  'vs', 'versus', 'via', 'over', 'off', 'out',
  // Multilingual / Persian terminal connectors
  'و', 'یا', 'در', 'از', 'به', 'با', 'برای', 'تا', 'های',
  'بدون', 'بی', 'بر', 'روی', 'زیر', 'بین', 'درباره', 'مورد', 'چون', 'اگر', 'که',
  'این', 'آن', 'هم', 'نیز', 'اما', 'ولی', 'است', 'هست', 'نیست',
]);

/**
 * Formats a multi-word phrase into natural title case, keeping internal minor words
 * lowercase while properly capitalizing the first word, last word, and technical acronyms.
 */
export function formatPhrase(words: string[]): string {
  if (!words || words.length === 0) return '';
  const raw = words.map((w) => w.toLowerCase()).join(' ');
  if (KNOWN_CANONICAL_ENTITIES.has(raw)) {
    return KNOWN_CANONICAL_ENTITIES.get(raw)!;
  }
  return words
    .map((w, idx) => {
      const lower = w.toLowerCase();
      if (idx > 0 && idx < words.length - 1 && MINOR_TITLE_WORDS.has(lower)) {
        return lower;
      }
      return formatWord(w);
    })
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
 * Pronouns and question words that should not be the leading token of a generated group name.
 */
export const DISALLOWED_LEADING_TOKENS: ReadonlySet<string> = new Set([
  'you', 'your', "you're", 'you’re', 'we', 'our', "we're", 'i', 'my', 'me',
  'why', 'how', 'when', 'where', 'what', 'who', 'which',
  'hour', 'hours', 'minute', 'minutes',
  // Multilingual / Persian functional connectors and question words
  'و', 'یا', 'در', 'از', 'به', 'با', 'برای', 'تا', 'های',
  'بدون', 'بی', 'بر', 'روی', 'زیر', 'بین', 'درباره', 'مورد', 'چون', 'اگر', 'که',
  'این', 'آن', 'هم', 'نیز', 'اما', 'ولی',
  'چرا', 'چطور', 'چگونه', 'کجا', 'کی', 'چه', 'کدام',
]);

/**
 * Alphanumeric product codes, internal database IDs, and appliance model numbers
 * that should not be used as semantic group names (e.g. "Ch15659", "Nc-Ts201", "dkp-10757025").
 */
export const ALPHANUMERIC_CODE_REGEX =
  /^(?:[a-z]{1,3}\d{3,}|\d{3,}[a-z]{1,3}|[a-z]{1,4}-\d+|[a-z]{1,3}-[a-z]{1,3}\d+|\d+[a-z]{1,3}\d*)$/i;

export function isAlphanumericCode(str: string): boolean {
  if (!str) return false;
  const lower = str.toLowerCase();
  if (KNOWN_CASING[lower] || KNOWN_CANONICAL_ENTITIES.has(lower)) return false;
  if (lower === '4k' || lower === 'v2' || lower === '3b' || lower === 'hac' || lower === 'lsm-tree' || lower === 'x-ui') {
    return false;
  }
  return ALPHANUMERIC_CODE_REGEX.test(str);
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
  isSynthetic?: boolean; // True if candidate was formed by unigram compounding
  centroidAlignment?: number; // Average cosine similarity to cluster centroid across matching tabs
  isInMedoidTab?: boolean; // True if candidate appears in the cluster medoid tab
  isSynthesizedConcept?: boolean; // True if candidate was synthesized as a cluster-wide concept
}

/**
 * Segments a title into natural semantic chunks using structural delimiters.
 * Hyphens (-) and slashes (/) only split when accompanied by whitespace,
 * preserving intra-word tokens like "LSM-Tree", "End-to-End", and "shadcn/ui".
 */
export function segmentTitleChunks(title: string): string[] {
  if (!title) return [];
  return title
    .split(/\s*[|•·\n\r—–]\s*|:\s+|\s+:\s*|\s+[-/]\s+|\s+[-–—]\s*|\s*[-–—]\s+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * Infers and synthesizes conceptual collection summaries across the entire cluster.
 * Combines core entities/subjects with cluster-wide intent, media type,
 * product category, or activity type.
 */
export function synthesizeClusterConcepts(
  metas: NormalizedTabMetadata[],
  tabs: Tab[]
): CandidatePhrase[] {
  const results: CandidatePhrase[] = [];
  const totalTabs = metas.length;
  if (totalTabs < 2) return results;

  const titles = metas.map((m) => (m.cleanTitle || '').toLowerCase());
  const domains = metas.map((m) => (m.domain || '').toLowerCase());
  const allText =
    titles.join(' ') +
    ' ' +
    metas.flatMap((m) => m.pathSegments).join(' ') +
    ' ' +
    tabs.map((t) => (t.url || '').toLowerCase()).join(' ');

  // 1. Media Music / Ambience / Soundtracks
  const isResearch = isResearchCluster(tabs, metas);
  const minMediaMatch = Math.max(2, Math.ceil(totalTabs * 0.5));
  const hasAmbience =
    !isResearch &&
    titles.filter((t) =>
      /\b(ambient|ambiance|relaxing|rain|waterfall|sounds|sleep|study|4k ambiance)\b/i.test(t)
    ).length >= minMediaMatch;
  const hasSoundtrack =
    !isResearch &&
    titles.filter((t) =>
      /\b(soundtrack|soundtracks|\bost\b|theme song|original score|main theme)\b/i.test(t)
    ).length >= minMediaMatch;
  const hasMusic =
    !isResearch &&
    titles.filter((t) =>
      /\b(music|mix|mixtape|folk|lofi|indie pop|songs?|audio|playlist|album)\b/i.test(t)
    ).length >= minMediaMatch;

  if (hasAmbience || hasSoundtrack || hasMusic) {
    let entity = '';
    // Check known canonical entities first
    for (const [key, canonical] of KNOWN_CANONICAL_ENTITIES.entries()) {
      if (titles.filter((t) => t.includes(key)).length >= minMediaMatch) {
        entity = canonical;
        break;
      }
    }

    // Specific check for Ellie & Joel / Jackson from The Last of Us
    if (!entity) {
      const hasTlou = titles.filter((t) =>
        /(?:ellie\s*&\s*joel|ellie\s+and\s+joel|jackson)/i.test(t) && /ellie/i.test(t)
      ).length >= minMediaMatch;
      if (hasTlou) {
        entity = 'The Last of Us';
      }
    }

    // If no known canonical entity, check Chunk 0 subjects
    if (!entity) {
      const chunk0Candidates = new Map<string, number>();
      for (const m of metas) {
        const chunks = segmentTitleChunks(m.cleanTitle || '');
        if (chunks.length > 0) {
          const c0 = chunks[0]
            .replace(/\(.*?\)/g, '')
            .replace(/🎵|🌙|📼|🌞|⚡/g, '')
            .trim();
          if (c0 && isContentWord(c0)) {
            const c0Lower = c0.toLowerCase();
            chunk0Candidates.set(c0Lower, (chunk0Candidates.get(c0Lower) || 0) + 1);
          }
        }
      }
      for (const [cand, count] of chunk0Candidates.entries()) {
        if (count >= minMediaMatch) {
          entity = toTitleCase(cand);
          break;
        }
      }
    }

    if (entity) {
      let suffix = 'Music';
      const hasNatureSound = titles.filter((t) =>
        /\b(rain|waterfall|nature|sleep|relaxing rain|ambient sounds)\b/i.test(t)
      ).length >= minMediaMatch;

      if (hasSoundtrack) {
        suffix = 'Soundtracks';
      } else if (hasNatureSound || (hasAmbience && !hasMusic)) {
        suffix = 'Ambience';
      } else {
        suffix = 'Music';
      }

      const conceptWords = [...entity.split(/\s+/), suffix];
      results.push({
        raw: conceptWords.map((w) => w.toLowerCase()).join(' '),
        display: formatPhrase(conceptWords),
        words: conceptWords,
        docIndices: new Set(Array.from({ length: totalTabs }, (_, i) => i)),
        firstChunkOccurrences: totalTabs,
        avgPositionRatio: 0.0,
        isChunkExact: false,
        isSynthesizedConcept: true,
      });
    }
  }

  // 2. Software Downloads
  const downloadSignalCount = metas.filter((m) => {
    const t = (m.cleanTitle || '').toLowerCase();
    const u = (m.cleanUrl || '').toLowerCase();
    return (
      /\b(download|downloads|torrent|dmg|pkg|install|installer|client)\b/i.test(t) ||
      /\b(download|downloads|releases|macapp)\b/i.test(u)
    );
  }).length;

  const isMacOs =
    titles.some((t) => /\b(mac|macos|osx)\b/i.test(t)) ||
    metas.some((m) => /\b(mac|macos|osx)\b/i.test(m.cleanUrl || ''));
  if (downloadSignalCount >= Math.ceil(totalTabs * 0.5) && isMacOs) {
    const conceptWords = ['Mac', 'Software', 'Downloads'];
    results.push({
      raw: 'mac software downloads',
      display: 'Mac Software Downloads',
      words: conceptWords,
      docIndices: new Set(Array.from({ length: totalTabs }, (_, i) => i)),
      firstChunkOccurrences: totalTabs,
      avgPositionRatio: 0.0,
      isChunkExact: false,
      isSynthesizedConcept: true,
    });
  }

  // 2b. macOS System Settings & Shortcuts Guides
  const macGuideSignalCount = metas.filter((m) => {
    const t = (m.cleanTitle || '').toLowerCase();
    return (
      /\b(mac|macos|osx)\b/i.test(t) &&
      /\b(shortcut|shortcuts|screenshot|folder|dock|behavior|quit|hide|tips|guide)\b/i.test(t)
    );
  }).length;

  if (macGuideSignalCount >= Math.ceil(totalTabs * 0.5) && isMacOs) {
    const hasShortcuts = titles.some((t) => /\b(shortcut|shortcuts|screenshot)\b/i.test(t));
    const conceptWords = hasShortcuts ? ['macOS', 'Shortcuts'] : ['macOS', 'Settings'];
    results.push({
      raw: conceptWords.map((w) => w.toLowerCase()).join(' '),
      display: formatPhrase(conceptWords),
      words: conceptWords,
      docIndices: new Set(Array.from({ length: totalTabs }, (_, i) => i)),
      firstChunkOccurrences: totalTabs,
      avgPositionRatio: 0.0,
      isChunkExact: false,
      isSynthesizedConcept: true,
    });
  }

  // 3. Shopping & Products
  const shoppingDomainCount = domains.filter((d) =>
    /digikala|torob|amazon|ebay|aliexpress|shop|store|amachap|shekiva|patanjameh|bagnet/.test(d)
  ).length;
  const shoppingKeywordCount = titles.filter((t) =>
    /\b(t-shirt|shirt|tee|hoodie|monitor|backpack|bag|sleeve|case)\b|تیشرت|تی شرت|کوله|مانیتور/i.test(t)
  ).length;

  const isShoppingCluster =
    shoppingDomainCount >= Math.max(2, Math.ceil(totalTabs * 0.5)) ||
    shoppingKeywordCount >= Math.max(2, Math.ceil(totalTabs * 0.5));

  if (isShoppingCluster) {
    const brandCounts = new Map<string, number>();
    for (const t of titles) {
      const match = t.match(/\b(bange|metallica|jcpal|asus|samsung|sony|apple|logitech|anker|nike|adidas)\b/i);
      if (match) {
        const b = formatWord(match[1]);
        brandCounts.set(b, (brandCounts.get(b) || 0) + 1);
      }
    }
    let brand = '';
    for (const [b, count] of brandCounts.entries()) {
      if (count >= Math.max(2, Math.ceil(totalTabs * 0.5)) || (totalTabs === 2 && count >= 1)) {
        brand = b;
        break;
      }
    }

    let category = '';
    const laptopBagCount = titles.filter((t) =>
      /\b(backpack|bag|sleeve|case)\b|کوله|کیف|کاور/i.test(t) &&
      (/\b(laptop|notebook)\b|لپ\s*تاپ/i.test(t) || /bange|jcpal/i.test(t))
    ).length;
    const hasLaptopBag = laptopBagCount >= Math.max(2, Math.ceil(totalTabs * 0.5));

    const tShirtCount = titles.filter((t) =>
      /\b(t-shirt|shirt|tee|hoodie)\b|تیشرت|تی شرت/i.test(t)
    ).length;
    const hasTShirt = tShirtCount >= Math.max(2, Math.ceil(totalTabs * 0.5));

    const monitorCount = titles.filter((t) =>
      /\b(monitor|display|screen)\b|مانیتور/i.test(t)
    ).length;
    const hasMonitor = monitorCount >= Math.max(2, Math.ceil(totalTabs * 0.5));

    if (hasLaptopBag) {
      category = 'Laptop Bags';
    } else if (hasTShirt) {
      category = 'T-Shirts';
    } else if (hasMonitor) {
      const gamingCount = titles.filter((t) => /\bgaming\b|گیمینگ/i.test(t)).length;
      category = gamingCount >= Math.ceil(monitorCount * 0.5) ? 'Gaming Monitors' : 'Monitors';
    }

    if (brand && category) {
      const conceptWords = [...brand.split(/\s+/), ...category.split(/\s+/)];
      results.push({
        raw: conceptWords.map((w) => w.toLowerCase()).join(' '),
        display: formatPhrase(conceptWords),
        words: conceptWords,
        docIndices: new Set(Array.from({ length: totalTabs }, (_, i) => i)),
        firstChunkOccurrences: totalTabs,
        avgPositionRatio: 0.0,
        isChunkExact: false,
        isSynthesizedConcept: true,
      });
    } else if (category && !brand) {
      const conceptWords = category.split(/\s+/);
      results.push({
        raw: conceptWords.map((w) => w.toLowerCase()).join(' '),
        display: formatPhrase(conceptWords),
        words: conceptWords,
        docIndices: new Set(Array.from({ length: totalTabs }, (_, i) => i)),
        firstChunkOccurrences: totalTabs,
        avgPositionRatio: 0.0,
        isChunkExact: false,
        isSynthesizedConcept: true,
      });
    }
  }

  // 4. AI Model Comparisons
  const isModelComparison =
    titles.filter((t) => /vs|versus|benchmark|benchmarks|compare|comparison/.test(t)).length >=
      Math.ceil(totalTabs * 0.5) &&
    titles.some((t) => /gemini|gemeni|flash|pro|claude|gpt|qwen|llama|deepseek/.test(t));

  if (isModelComparison) {
    let family = 'AI';
    if (titles.some((t) => /gemini|gemeni/.test(t))) {
      family = titles.some((t) => /flash/.test(t)) ? 'Gemini Flash' : 'Gemini';
    } else if (titles.some((t) => /claude/.test(t))) {
      family = 'Claude';
    } else if (titles.some((t) => /qwen/.test(t))) {
      family = 'Qwen';
    }
    const conceptWords = [...family.split(/\s+/), 'Models'];
    results.push({
      raw: conceptWords.map((w) => w.toLowerCase()).join(' '),
      display: formatPhrase(conceptWords),
      words: conceptWords,
      docIndices: new Set(Array.from({ length: totalTabs }, (_, i) => i)),
      firstChunkOccurrences: totalTabs,
      avgPositionRatio: 0.0,
      isChunkExact: false,
      isSynthesizedConcept: true,
    });
  }

  // 5. Browser Extension Tab Managers
  const isExtensionTabManager =
    (domains.some((d) => /chromewebstore|chrome\.google\.com/.test(d)) ||
      titles.some((t) => /chrome web store/.test(t))) &&
    titles.some((t) => /tab manager|tab group|tabs|organizer/.test(t));

  if (isExtensionTabManager) {
    const conceptWords = ['Chrome', 'Tab', 'Managers'];
    results.push({
      raw: 'chrome tab managers',
      display: 'Chrome Tab Managers',
      words: conceptWords,
      docIndices: new Set(Array.from({ length: totalTabs }, (_, i) => i)),
      firstChunkOccurrences: totalTabs,
      avgPositionRatio: 0.0,
      isChunkExact: false,
      isSynthesizedConcept: true,
    });
  }

  return results;
}

/**
 * Extracts candidate phrases (unigrams, bigrams, trigrams, 4-grams, 5-grams) from a collection of tabs.
 * Preserves interior minor words (e.g. "Life is Strange", "The Last of Us") while filtering
 * trailing connectors, dangling prepositions, and URL/TLD noise.
 */
export function extractCandidatePhrases(
  metas: NormalizedTabMetadata[],
  tabs?: Tab[]
): CandidatePhrase[] {
  const candidateMap = new Map<string, CandidatePhrase>();

  const registerCandidate = (
    words: string[],
    tabIndex: number,
    isFirstChunk: boolean,
    posRatio: number,
    isExactChunk: boolean,
    isSynthetic: boolean = false,
    isSynthesizedConcept: boolean = false
  ) => {
    if (words.length === 0 || words.length > 5) return;
    const raw = words.map((w) => w.toLowerCase()).join(' ');

    if (!candidateMap.has(raw)) {
      candidateMap.set(raw, {
        raw,
        display: formatPhrase(words),
        words: [...words],
        docIndices: new Set(),
        firstChunkOccurrences: 0,
        avgPositionRatio: posRatio,
        isChunkExact: isExactChunk,
        isSynthetic,
        isSynthesizedConcept,
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
      if (
        domainLabel &&
        !TLD_AND_URL_STOPWORDS.has(domainLabel.toLowerCase()) &&
        !GENERIC_PAGE_TITLES.has(domainLabel.toLowerCase())
      ) {
        registerCandidate([domainLabel], tabIdx, true, 0.0, true);
      }
      continue;
    }

    const chunks = segmentTitleChunks(rawTitle);
    if (chunks.length === 0) continue;

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];
      const isFirstChunk = chunkIdx === 0;

      // Extract alphanumeric word tokens with apostrophe and hyphen support (e.g. Max's, LSM-Tree, End-to-End)
      const allTokens = (
        chunk.match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*(?:['’][\p{L}]+)?/gu) || []
      ).map((w) => w.replace(/\u2019/g, "'"));
      // Filter out pure numbers (e.g. "3", "7", "2026") while preserving alphanumeric terms like "4K", "9Router"
      const rawTokens = allTokens.filter((w) => !/^\d+$/.test(w));
      if (rawTokens.length === 0) continue;

      const totalTokens = rawTokens.length;

      // 1. Contiguous N-Gram Candidate Extraction (L = 1..4)
      for (let L = 1; L <= 4 && L <= totalTokens; L++) {
        for (let start = 0; start <= totalTokens - L; start++) {
          const slice = rawTokens.slice(start, start + L);

          // Skip if any token is a top-level domain or URL noise word
          if (slice.some((w) => TLD_AND_URL_STOPWORDS.has(w.toLowerCase()))) {
            continue;
          }

          // Skip if candidate phrase is in generic page titles (e.g. "Get Started", "Search Results", "Category")
          const rawCandidate = slice.map((w) => w.toLowerCase()).join(' ');
          if (GENERIC_PAGE_TITLES.has(rawCandidate)) {
            continue;
          }

          // Must contain at least one content word
          const hasContentWord = slice.some((w) => isContentWord(w));
          if (!hasContentWord) {
            continue;
          }

          // Trailing token check: cannot end in preposition, conjunction, auxiliary verb, or pure number
          const lastWordLower = slice[L - 1].toLowerCase();
          if (TERMINAL_CONNECTORS.has(lastWordLower) || /^\d+$/.test(lastWordLower)) {
            continue;
          }

          // Leading token check: cannot start with pure number, terminal connector, or disallowed pronoun/question word
          const firstWordLower = slice[0].toLowerCase();
          if (
            /^\d+$/.test(firstWordLower) ||
            DISALLOWED_LEADING_TOKENS.has(firstWordLower) ||
            (slice[0].length === 1 && !/[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}]/u.test(slice[0]) && !['c'].includes(firstWordLower))
          ) {
            continue;
          }

          if (L === 1) {
            if (!isContentWord(slice[0]) || isAlphanumericCode(slice[0])) {
              continue;
            }
          } else {
            // For multi-word phrases, leading word cannot be a terminal connector
            // unless it's 'the' in a 2-4 word phrase followed by a content word (e.g. "The Last of Us", "The Housemaid")
            // Note: Indefinite articles ('a', 'an') are NOT allowed as leading tokens of group names.
            if (TERMINAL_CONNECTORS.has(firstWordLower)) {
              if (
                firstWordLower === 'the' &&
                L >= 2 &&
                isContentWord(slice[1])
              ) {
                // Allowed (e.g. "The Last of Us", "The Housemaid")
              } else {
                continue;
              }
            }
          }

          const posRatio = (chunkIdx + start / totalTokens) / (chunks.length + 1);
          const isExactChunk = start === 0 && L === totalTokens;

          registerCandidate(slice, tabIdx, isFirstChunk, posRatio, isExactChunk);
        }
      }

      // 2. Prepositional Inversion (e.g. "<Subject> for <Target>" -> "<Target> <Subject>")
      // Common in academic papers and technical documentation:
      // "A Dual-Layer End-to-End Cost Estimation Model for LSM-Tree-Based Database Systems"
      // -> "LSM-Tree Cost Estimation"
      const prepIndices: number[] = [];
      for (let i = 0; i < rawTokens.length; i++) {
        const lower = rawTokens[i].toLowerCase();
        if (lower === 'for' || lower === 'in') {
          prepIndices.push(i);
        }
      }

      for (const prepIdx of prepIndices) {
        if (prepIdx > 0 && prepIdx < rawTokens.length - 1) {
          const beforeSlice = rawTokens.slice(0, prepIdx);
          const afterSlice = rawTokens.slice(prepIdx + 1);

          // Subject tokens: filter leading articles and research pre-modifiers
          const subjectTokens = beforeSlice.filter(
            (w) =>
              !MINOR_TITLE_WORDS.has(w.toLowerCase()) &&
              !RESEARCH_PRE_MODIFIERS.has(w.toLowerCase()) &&
              isContentWord(w)
          );

          if (subjectTokens.length > 0) {
            // Target tokens: take first content token(s) after preposition, stripping suffixes like -based
            const firstTarget = afterSlice[0];
            if (firstTarget && isContentWord(firstTarget)) {
              const cleanTarget = firstTarget.replace(
                /-(?:based|driven|centric|oriented|enabled)$/i,
                ''
              );

              // 1. Inverted candidate with core subject (stripping generic container noun like 'model')
              const coreSubject =
                subjectTokens.length >= 2 &&
                GENERIC_CONTAINER_NOUNS.has(
                  subjectTokens[subjectTokens.length - 1].toLowerCase()
                )
                  ? subjectTokens.slice(0, -1)
                  : subjectTokens;

              // Combined phrase must be <= 4 words
              const invertedCore = [cleanTarget, ...coreSubject];
              if (invertedCore.length >= 2 && invertedCore.length <= 4) {
                const posRatio = chunkIdx / (chunks.length + 1);
                registerCandidate(invertedCore, tabIdx, isFirstChunk, posRatio, false);
              }

              // 2. Also register full subject if different from coreSubject and <= 4 words
              if (coreSubject !== subjectTokens) {
                const invertedFull = [cleanTarget, ...subjectTokens];
                if (invertedFull.length >= 2 && invertedFull.length <= 4) {
                  const posRatio = chunkIdx / (chunks.length + 1);
                  registerCandidate(invertedFull, tabIdx, isFirstChunk, posRatio, false);
                }
              }
            }
          }
        }
      }

      // 3. Inter-chunk delimiter compound candidate: Combine Chunk 0 unigram with Chunk 1 bigram
      // (e.g. "9Router" + "AI Infrastructure" -> "9Router AI Infrastructure")
      if (chunkIdx === 0 && chunks.length > 1) {
        const chunk0Tokens = rawTokens.filter(isContentWord);
        if (chunk0Tokens.length === 1 && chunk0Tokens[0]) {
          const nextChunk = chunks[1];
          const nextChunkTokens = nextChunk
            ? nextChunk.match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) || []
            : [];
          const nextContent = nextChunkTokens.filter((w) => isContentWord(w));
          const firstNext = nextContent[0];
          const secondNext = nextContent[1];
          if (firstNext) {
            registerCandidate([chunk0Tokens[0], firstNext], tabIdx, true, 0.0, false);
            if (secondNext) {
              registerCandidate(
                [chunk0Tokens[0], firstNext, secondNext],
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
  }

  // Cross-tab verification: check if each candidate phrase exists as a whole phrase in other tabs
  const candidates = Array.from(candidateMap.values());
  for (const c of candidates) {
    const phraseLower = c.raw;
    const escaped = phraseLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wholePhraseRegex = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'u');

    for (let tabIdx = 0; tabIdx < metas.length; tabIdx++) {
      if (c.docIndices.has(tabIdx)) continue;
      const titleLower = (metas[tabIdx].cleanTitle || '').toLowerCase();
      if (wholePhraseRegex.test(titleLower)) {
        c.docIndices.add(tabIdx);
      }
    }
  }

  // Top Unigram Compounding: Only synthesize if NO multi-word contiguous phrase has consensus (DF >= 2)
  const hasConsensusMultiWord = candidates.some(
    (c) => c.words.length >= 2 && c.docIndices.size >= 2 && !c.isSynthetic
  );

  if (!hasConsensusMultiWord) {
    const unigrams = candidates.filter((c) => c.words.length === 1 && c.docIndices.size >= 2);
    if (unigrams.length >= 2) {
      unigrams.sort((a, b) => b.docIndices.size - a.docIndices.size);
      const u1 = unigrams[0];
      const u2 = unigrams[1];
      if (u1 && u2 && u2.docIndices.size >= 2) {
        // Verify that both words actually appear together in at least one title
        let appearsTogether = false;
        let word1 = u1.words[0];
        let word2 = u2.words[0];
        for (const m of metas) {
          const tLower = (m.cleanTitle || '').toLowerCase();
          const p1 = tLower.indexOf(word1.toLowerCase());
          const p2 = tLower.indexOf(word2.toLowerCase());
          if (p1 !== -1 && p2 !== -1) {
            appearsTogether = true;
            if (p2 < p1) {
              word1 = u2.words[0];
              word2 = u1.words[0];
            }
            break;
          }
        }

        if (appearsTogether) {
          const compoundRaw = `${word1.toLowerCase()} ${word2.toLowerCase()}`;
          if (!candidateMap.has(compoundRaw)) {
            const sharedDocs = new Set<number>();
            for (const idx of u1.docIndices) {
              if (u2.docIndices.has(idx)) sharedDocs.add(idx);
            }
            if (sharedDocs.size >= 2) {
              candidates.push({
                raw: compoundRaw,
                display: formatPhrase([word1, word2]),
                words: [word1, word2],
                docIndices: sharedDocs,
                firstChunkOccurrences: Math.min(u1.firstChunkOccurrences, u2.firstChunkOccurrences),
                avgPositionRatio: (u1.avgPositionRatio + u2.avgPositionRatio) / 2,
                isChunkExact: false,
                isSynthetic: true,
              });
            }
          }
        }
      }
    }
  }

  // 6. Cluster-wide conceptual synthesis
  if (tabs && tabs.length >= 2) {
    const synthesized = synthesizeClusterConcepts(metas, tabs);
    for (const syn of synthesized) {
      if (!candidateMap.has(syn.raw)) {
        candidates.push(syn);
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

  // 3. Phrase length bonus (favor 2-3 word natural phrases and 4-5 word titled/synthesized phrases)
  const wordCount = c.words.length;
  if (wordCount === 3) {
    score += 5.5; // Rich 3-word phrase with high coverage is optimal
  } else if (wordCount === 2) {
    score += 5.0;
  } else if (wordCount === 1) {
    score += 1.0;
  } else if (wordCount === 4) {
    // If it starts with an article (e.g. "The Last of Us") or is synthesized concept, treat as full authentic entity
    const firstLower = c.words[0].toLowerCase();
    if (firstLower === 'the' || c.isSynthesizedConcept) {
      score += 6.0;
    } else {
      score += 2.0;
    }
  } else if (wordCount === 5) {
    const firstLower = c.words[0].toLowerCase();
    if (firstLower === 'the' || c.isSynthesizedConcept) {
      score += 5.0;
    } else {
      score -= 3.0;
    }
  } else {
    score -= (wordCount - 4) * 3.0;
  }

  // 4. Primary chunk prominence (Chunk 0 is almost universally the core subject)
  if (c.firstChunkOccurrences > 0) {
    score += (c.firstChunkOccurrences / totalTabs) * 4.0;
  }

  // 5. Exact chunk bonus (clean natural phrase bounded by title delimiters)
  if (c.isChunkExact) {
    score += 4.0;
  }

  // 6. Early position bonus
  score += Math.max(0, 1.0 - c.avgPositionRatio) * 2.5;

  // 7. Natural contiguous vs Synthetic bonus
  if (!c.isSynthetic && c.words.length >= 2) {
    score += 4.0;
  }

  // Bonus for verified canonical multi-word entities
  if (c.words.length >= 2 && KNOWN_CANONICAL_ENTITIES.has(c.raw)) {
    score += 4.5;
  }

  // 8. Vector centroid alignment and medoid tab bonus
  if (c.centroidAlignment !== undefined) {
    score += c.centroidAlignment * 6.0;
  }
  if (c.isInMedoidTab) {
    score += 3.0;
  }

  // 9. Technical acronym & short token bonus
  // Lone short tokens/acronyms (1-2 chars, e.g. "UI", "OS") require high cluster coverage (>= 60%)
  // and are penalized if low coverage to prevent a single tab from hijacking the group label.
  if (c.words.length === 1 && c.words[0].length <= 2) {
    if (coverage < 0.6) {
      score -= 8.0;
    }
  }

  for (const w of c.words) {
    const lower = w.toLowerCase();
    const hasAcronym =
      MEANINGFUL_SHORT_TOKENS.has(lower) ||
      ACRONYMS_ALL_CAPS.has(w.toUpperCase()) ||
      (w.includes('-') &&
        w
          .split('-')
          .some(
            (part) =>
              ACRONYMS_ALL_CAPS.has(part.toUpperCase()) ||
              MEANINGFUL_SHORT_TOKENS.has(part.toLowerCase())
          ));
    if (hasAcronym) {
      score += 2.5;
    }
    // Demote research method pre-modifiers like "Lightweight" or "Dual-Layer" in favor of core topic nouns
    if (RESEARCH_PRE_MODIFIERS.has(lower)) {
      score -= 3.0;
    }
  }

  // 10. Anti-Member-Copying: If candidate is a 3+ word phrase that only covers a subset of tabs (< 100%),
  // penalize it in favor of concise shared core phrases that cover all tabs
  if (c.words.length >= 3 && coverage < 1.0 && !c.isSynthesizedConcept) {
    score -= (1.0 - coverage) * 4.0;
  }

  // 11. Penalties for boilerplate and descriptor words
  for (const w of c.words) {
    const lower = w.toLowerCase();
    if (BOILERPLATE_WORDS.has(lower)) {
      score -= 4.0;
    }
    if (DESCRIPTOR_SUFFIXES.has(lower) && !c.isSynthesizedConcept) {
      score -= 2.5;
    }
    if (TLD_AND_URL_STOPWORDS.has(lower)) {
      score -= 15.0;
    }
  }

  // Heavy penalty if candidate consists ENTIRELY of boilerplate or generic container nouns
  const allBoilerplateOrContainer = c.words.every(
    (w) =>
      BOILERPLATE_WORDS.has(w.toLowerCase()) ||
      DESCRIPTOR_SUFFIXES.has(w.toLowerCase()) ||
      GENERIC_CONTAINER_NOUNS.has(w.toLowerCase())
  );
  if (allBoilerplateOrContainer && !c.isSynthesizedConcept) {
    score -= 25.0;
  }

  // 12. Information Gain bonus for cluster-wide synthesized concepts
  if (c.isSynthesizedConcept) {
    score += 10.0;
  }

  // 13. Platform & Page-Type Penalties:
  // Reject/heavily penalize candidates that consist ENTIRELY of source platforms and/or page-type words
  // (e.g. "YouTube", "Google", "Bing Videos", "Pinterest", "Digikala Product", "Macos Download", "Repository Results")
  const allPlatformOrPageType = c.words.every(
    (w) =>
      SOURCE_PLATFORM_TERMS.has(w.toLowerCase()) ||
      PAGE_TYPE_METADATA_TERMS.has(w.toLowerCase()) ||
      BOILERPLATE_WORDS.has(w.toLowerCase()) ||
      TLD_AND_URL_STOPWORDS.has(w.toLowerCase())
  );
  if (allPlatformOrPageType && !c.isSynthesizedConcept) {
    score -= 25.0;
  }

  // Penalty if candidate starts or ends with a platform name without being a specialized synthesis
  if (c.words.length > 1 && !c.isSynthesizedConcept) {
    const firstLower = c.words[0].toLowerCase();
    const lastLower = c.words[c.words.length - 1].toLowerCase();
    if (SOURCE_PLATFORM_TERMS.has(firstLower)) {
      score -= 8.0;
    }
    if (SOURCE_PLATFORM_TERMS.has(lastLower)) {
      score -= 8.0;
    }
  }

  // 14. Alphanumeric Code / Internal Slug Penalty:
  // Heavily penalize database IDs, model numbers, or random hashes (e.g. "Ch15659", "Nc-Ts201")
  if (c.words.some(isAlphanumericCode)) {
    score -= 25.0;
  }

  // 15. Raw IP Address Penalty:
  // Penalize bare IP candidates so descriptive titles always win over IP addresses
  if (/^\d+\.\d+\.\d+\.\d+$/.test(c.raw)) {
    score -= 15.0;
  }

  return score;
}

/**
 * Detects whether a collection of tabs represents academic research or papers.
 */
export function isResearchCluster(
  tabs: Tab[],
  metas: NormalizedTabMetadata[]
): boolean {
  let researchSignals = 0;
  for (let i = 0; i < metas.length; i++) {
    const meta = metas[i];
    const d = (meta.domain || '').toLowerCase();
    const url = (meta.cleanUrl || '').toLowerCase();
    const title = (meta.cleanTitle || '').toLowerCase();

    if (
      d.includes('arxiv.org') ||
      d.includes('ieee.org') ||
      d.includes('acm.org') ||
      d.includes('semanticscholar.org') ||
      d.includes('researchgate.net') ||
      d.includes('sciencedirect.com') ||
      d.includes('springer.com') ||
      d.includes('nature.com') ||
      d.includes('openreview.net') ||
      d.includes('biorxiv.org') ||
      d.includes('vldb.org') ||
      d.includes('sigmod.org') ||
      url.includes('/abs/') ||
      url.includes('/pdf/') ||
      url.includes('/document/') ||
      url.includes('/doi/') ||
      title.includes('arxiv') ||
      title.includes('ieee') ||
      title.includes('acm') ||
      title.includes('conference') ||
      title.includes('transactions') ||
      title.includes('proceedings') ||
      title.includes('estimation model') ||
      title.includes('database systems')
    ) {
      researchSignals++;
    }
  }
  return metas.length >= 2 ? researchSignals >= Math.ceil(metas.length * 0.5) : researchSignals > 0;
}

export interface GroupNameResult {
  name: string;
  color: TabGroupColor;
  topCandidate?: CandidatePhrase;
  maxCandidateDf: number;
  isSynthesizedConcept: boolean;
}

/**
 * Deterministically generates a natural, human-readable group name and color for a cluster of tabs.
 */
export function generateGroupName(
  tabs: Tab[],
  metadata?: NormalizedTabMetadata[],
  options?: GroupNameOptions
): GroupNameResult {
  if (tabs.length === 0) {
    return { name: 'Empty Collection', color: 'grey', maxCandidateDf: 0, isSynthesizedConcept: false };
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

  const createResult = (
    name: string,
    color: TabGroupColor,
    topCandidate?: CandidatePhrase,
    maxDf: number = 0,
    isSynthesized: boolean = false
  ): GroupNameResult => ({
    name,
    color,
    topCandidate,
    maxCandidateDf: maxDf,
    isSynthesizedConcept: isSynthesized,
  });

  const allDomainBlocked = metas.every((m) => m.cleanTitle.toLowerCase().includes('domain blocked'));
  if (allDomainBlocked) {
    return createResult('Domain Blocked', 'grey');
  }
  const allError403 = metas.every((m) => {
    const t = m.cleanTitle.toLowerCase();
    return t.includes('403') || t.includes('forbidden') || t.includes('access denied');
  });
  if (allError403) {
    return createResult('Error 403', 'grey');
  }

  // 1. Extract all candidate phrases from titles
  let allCandidates = extractCandidatePhrases(metas, tabs);

  // Vector Centroid & Medoid Alignment (if cluster embeddings are available)
  if (
    options?.clusterCentroid &&
    options?.tabEmbeddings &&
    options.tabEmbeddings.length === metas.length
  ) {
    const centroid = options.clusterCentroid;
    const sims = options.tabEmbeddings.map((emb) => computeCosineSimilarity(emb, centroid));
    let maxSim = -2.0;
    let medoidIdx = 0;
    for (let i = 0; i < sims.length; i++) {
      if (sims[i] > maxSim) {
        maxSim = sims[i];
        medoidIdx = i;
      }
    }

    for (const c of allCandidates) {
      let simSum = 0;
      for (const idx of c.docIndices) {
        simSum += sims[idx] ?? 0;
      }
      c.centroidAlignment = c.docIndices.size > 0 ? simSum / c.docIndices.size : 0;
      c.isInMedoidTab = c.docIndices.has(medoidIdx);
    }
  }

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
  // If we have >= 2 tabs, but NO candidate phrase is lexically shared across >= 2 tabs,
  // select the most prominent concept aligned with the cluster medoid
  if (totalTabs >= 2 && maxDf < 2) {
    const distinctHosts = new Set(metas.map((m) => m.domain).filter(Boolean)).size;
    const isHeterogeneousMultiDomain = distinctHosts >= 3 && distinctHosts / totalTabs >= 0.6;

    if (!isHeterogeneousMultiDomain) {
      const medoidCandidate = allCandidates
        .filter(
          (c) =>
            c.isInMedoidTab &&
            !c.words.every((w) => BOILERPLATE_WORDS.has(w.toLowerCase())) &&
            !c.words.some(isAlphanumericCode)
        )
        .sort((a, b) => scoreCandidate(b, totalTabs) - scoreCandidate(a, totalTabs))[0];

      if (medoidCandidate) {
        let medoidName = medoidCandidate.display;
        if (isResearchCluster(tabs, metas)) {
          if (!medoidName.toLowerCase().includes('research')) {
            medoidName = `${medoidName} Research`;
          }
        }
        return createResult(
          medoidName,
          assignedColor,
          medoidCandidate,
          medoidCandidate.docIndices.size,
          medoidCandidate.isSynthesizedConcept ?? false
        );
      }
    }

    if (brandEntry) {
      return createResult(brandEntry.name, assignedColor);
    }

    if (dominantDomain) {
      const cleanHost = extractCleanDomainLabel(dominantDomain);
      if (cleanHost && cleanHost !== 'Internal Server') {
        return createResult(cleanHost, assignedColor);
      }
    }

    return createResult('Saved Collection', assignedColor);
  }

  // 4. Filter candidates: If cluster has >= 2 tabs, require DF >= 2
  const eligibleCandidates = allCandidates.filter((c) =>
    totalTabs >= 2 ? c.docIndices.size >= 2 : c.docIndices.size >= 1
  );

  if (eligibleCandidates.length === 0) {
    const maxDf = allCandidates.length > 0 ? Math.max(...allCandidates.map((c) => c.docIndices.size)) : 0;
    // Fallback if no eligible candidates survive
    if (brandEntry) {
      return createResult(brandEntry.name, assignedColor, undefined, maxDf);
    }
    if (dominantDomain) {
      const cleanHost = extractCleanDomainLabel(dominantDomain);
      if (cleanHost) {
        return createResult(cleanHost, assignedColor, undefined, maxDf);
      }
    }
    return createResult('Saved Collection', assignedColor, undefined, maxDf);
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

  // Conceptual context synthesis for academic research collections:
  // e.g. "Learned Cardinality Estimation" -> "Learned Cardinality Estimation Research"
  // e.g. "Cost Estimation Model" -> "Cost Estimation Research"
  if (isResearchCluster(tabs, metas)) {
    const nameLower = generatedName.toLowerCase();
    if (
      !nameLower.includes('research') &&
      !nameLower.includes('study') &&
      !nameLower.includes('survey') &&
      !nameLower.includes('analysis') &&
      !nameLower.includes('paper')
    ) {
      if (nameLower.endsWith(' model')) {
        generatedName = generatedName.slice(0, -6).trim() + ' Research';
      } else {
        generatedName = `${generatedName} Research`;
      }
    }
  }

  // Final sanity check: if the name is empty or pure punctuation, fallback to domain
  if (!generatedName || !/[\p{L}\p{N}]/u.test(generatedName)) {
    if (brandEntry) {
      generatedName = brandEntry.name;
    } else if (dominantDomain) {
      generatedName = extractCleanDomainLabel(dominantDomain) || 'Saved Collection';
    } else {
      generatedName = 'Saved Collection';
    }
  }

  const maxCandidateDf = eligibleCandidates.length > 0
    ? Math.max(...eligibleCandidates.map((c) => c.docIndices.size))
    : 0;

  return {
    name: generatedName,
    color: assignedColor,
    topCandidate,
    maxCandidateDf,
    isSynthesizedConcept: topCandidate?.isSynthesizedConcept ?? false,
  };
}
