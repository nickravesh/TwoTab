// =============================================================================
// TwoTab Intelligent Tab Grouping — Semantic Constants
// =============================================================================

/**
 * Universal marketing, telemetry, affiliate, and session query parameter blocklist.
 * Over 110 patterns covering major ad networks, tracking platforms, social media,
 * email CRM systems, affiliate tracking, and e-commerce telemetry.
 */
export const EXTENDED_TRACKING_PARAMS: ReadonlySet<string> = new Set([
  // Google Analytics & Google Ads
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_name', 'utm_reader', 'utm_place', 'utm_pubreferrer', 'utm_swu',
  'gclid', 'gclsrc', 'gbraid', 'wbraid', 'gad_source', 'dclid',
  '_ga', '_gl',

  // Meta (Facebook, Instagram, Threads)
  'fbclid', 'igshid', 'fblid',
  'fb_action_ids', 'fb_action_types', 'fb_source', 'fb_ref',
  'action_object_map', 'action_type_map', 'action_ref_map',

  // Twitter / X
  'twclid',

  // Microsoft Advertising, Bing & LinkedIn
  'msclkid', 'cvid',
  'li_fat_id', 'lipi', 'trk', 'trkcampaign',

  // TikTok, Pinterest & Social Media
  'ttclid', '_r',
  'epik', 'pp',

  // Yandex & Yahoo
  'yclid', 'ymclid', '_openstat',

  // Email / CRM / Marketing Automation (Mailchimp, HubSpot, Marketo, Klaviyo, etc.)
  'mc_cid', 'mc_eid',
  '_hsenc', '_hsmi', 'hsctatracking',
  'mkt_tok',
  'vero_id', 'vero_conv',
  '_kx', 'kl_campaign_id', 'kl_eid',
  'cm_mmc', 'cm_ven',
  '__s',
  'pi_campaign_id', 'pi_recipient_id',
  'vgo_ee',

  // Affiliate & Ad Networks (Impact, Rakuten, CJ, ShareASale, etc.)
  'wickedid', 'zanpid',
  'irclickid', 'irgwc',
  'ranmid', 'raneaid', 'ransiteid',
  'sscid',
  'ad_id', 'adset_id', 'campaign_id', 'click_id', 'clickid', 'afftrack',
  'aff_id',

  // Generic Telemetry & Referrer Trackers
  'session_id', 'tracking_code', 'tracking_id', 'visitor_id',
  'ref', 'ref_src', 'ref_url', 'source', 'campaign', 'sharing', 'recipient',
  's_kwcid', 'ef_id',
  'sc_campaign', 'sc_channel', 'sc_content', 'sc_medium', 'sc_outcome',

  // Media / Streaming Trackers (YouTube, Spotify, etc.)
  'si', 'feature',

  // E-Commerce Search & Click Noise (Amazon, eBay, etc.)
  'qid', 'sprefix', 'crid', 'sr', 'dib', 'dib_tag', 'th', 'psc',
  '_trksid', '_trkparms', 'epid',
]);

/**
 * Common prefixes for bulk tracking parameter matching.
 */
export const TRACKING_PARAM_PREFIX_REGEX = /^(utm_|hsa_|pk_|mtm_|matomo_|piwik_|at_|aff_|_hs|_ga)/i;

/**
 * Critical functional parameters that must NEVER be stripped, even if matching a broad rule.
 */
export const FUNCTIONAL_PARAMS_SAFELIST: ReadonlySet<string> = new Set([
  'q', 'query', 'search', 'text',
  'p', 'page', 'page_number', 'offset', 'start',
  'id', 'article_id', 'post_id', 'item_id',
  'v', 't',
  'tab', 'section', 'view', 'mode',
  'hl', 'lang', 'locale',
  'tag', 'tags', 'category', 'topic',
  'sort', 'order', 'filter',
]);

/**
 * Semantic query parameters that capture meaningful search or topic intents.
 * These are preserved and synthesized into path segments when present.
 */
export const SEMANTIC_QUERY_PARAMS: ReadonlySet<string> = new Set([
  'q',
  'query',
  'search',
  'search_query',
  'keyword',
  'keywords',
  'term',
  'topic',
  'tag',
  'tags',
  'category',
  'tab',
  'view',
]);

// -----------------------------------------------------------------------------
// Numerical & Mathematical Vector Constants
// -----------------------------------------------------------------------------

/** Expected dimension of Xenova/all-MiniLM-L6-v2 embeddings */
export const EXPECTED_EMBEDDING_DIM = 384;

/** Mathematical epsilon for zero-vector detection and safe division */
export const SIMILARITY_EPSILON = 1e-12;

/** Floating-point tolerance for L2 unit norm checks */
export const NORMALIZATION_TOLERANCE = 1e-3;

/** Default similarity threshold for complete-linkage agglomerative clustering */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.70;

/** Default minimum group size for clustering */
export const DEFAULT_MINIMUM_GROUP_SIZE = 2;

/** Maximum length of the synthesized semantic text prompt in characters */
export const MAX_SEMANTIC_PROMPT_LENGTH = 512;

/** Maximum number of path segments extracted from a URL */
export const MAX_PATH_SEGMENTS = 6;

/** Maximum recursion depth for nested dormant tab wrappers */
export const MAX_DORMANT_UNWRAP_DEPTH = 5;
