// =============================================================================
// TwoTab Intelligent Tab Grouping — Semantic Subsystem Types
// =============================================================================

import type { Tab, TabGroup, TabGroupColor } from '../storage';

// Re-export core storage primitives for unified semantic imports
export type { Tab, TabGroup, TabGroupColor };

// -----------------------------------------------------------------------------
// Milestone 1: Metadata Normalization & Similarity
// -----------------------------------------------------------------------------

/**
 * Deterministically normalized metadata representation of a single tab.
 */
export interface NormalizedTabMetadata {
  /** Original, unmodified tab reference (strictly preserved for non-destructive storage) */
  rawTab: Tab;
  /** Normalized canonical URL with tracking parameters stripped */
  cleanUrl: string;
  /** Sanitized, boilerplate-free title with fallback resolution */
  cleanTitle: string;
  /** Canonical domain or clean host (e.g. "github.com", "docs.python.org", "chrome://settings") */
  domain: string;
  /** Informative cleaned path tokens and preserved query values */
  pathSegments: string[];
  /** Structured textual prompt for MiniLM embedding generation */
  semanticPrompt: string;
  /** Deterministic 64-bit cyrb53 hex hash string for ephemeral embedding cache lookup */
  hash: string;
}

/**
 * Configuration options for tab metadata normalization.
 */
export interface NormalizeTabOptions {
  /** If true, unwrap dormant tab URLs recursively. Defaults to true. */
  unwrapDormant?: boolean;
  /** If true, strip tracking and marketing query parameters. Defaults to true. */
  stripTracking?: boolean;
  /** Custom fallback title if title and path are completely empty. */
  fallbackTitle?: string;
  /** Maximum number of path segments to retain in prompt. Defaults to 6. */
  maxPathSegments?: number;
  /** Maximum recursion depth for nested dormant tabs. Defaults to 5. */
  maxDormantDepth?: number;
}

/**
 * Clean domain extraction results.
 */
export interface CleanDomainInfo {
  /** The root domain (e.g. "python.org", "github.com", "bbc.co.uk") */
  rootDomain: string;
  /** The clean hostname without www (e.g. "docs.python.org", "api.github.com") */
  cleanHost: string;
}

/**
 * Result of unwrapping a dormant tab wrapper.
 */
export interface UnwrappedTab {
  url: string;
  title: string;
  cleanUrl: string;
  cleanTitle: string;
}

/**
 * Result of URL sanitization.
 */
export interface SanitizedUrlResult {
  cleanUrl: string;
  queryParams: URLSearchParams;
}

// -----------------------------------------------------------------------------
// Milestone 2: Clustering & Naming Contracts
// -----------------------------------------------------------------------------

export interface ClusterGroup {
  id: string;
  name: string;
  color: TabGroupColor;
  tabs: Tab[];
  coherenceScore: number;
}

export interface ClusteringResult {
  clusters: ClusterGroup[];
  ungroupedTabs: Tab[];
}

export interface ClusteringOptions {
  similarityThreshold?: number; // Default 0.70
  minimumGroupSize?: number;    // Default 2
}

// -----------------------------------------------------------------------------
// Milestone 3: Embedding Provider & Web Worker Contracts
// -----------------------------------------------------------------------------

export type EmbeddingProviderState =
  | 'unavailable'
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'error';

export interface ModelDownloadProgress {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
  progress?: number;
}

export interface IEmbeddingProvider {
  getState(): EmbeddingProviderState;
  isModelCached(): Promise<boolean>;
  initialize(onProgress?: (progress: ModelDownloadProgress) => void): Promise<void>;
  generateEmbeddings(
    texts: string[],
    onProgress?: (progress: ModelDownloadProgress) => void
  ): Promise<Float32Array[]>;
  terminate(): Promise<void>;
  clearCache(): void;
  getCacheSize(): number;
}

// -----------------------------------------------------------------------------
// Milestone 4: Reorganizer & Storage Safety Contracts
// -----------------------------------------------------------------------------

export interface ReorganizationPlan {
  originalGroups: TabGroup[];
  proposedGroups: TabGroup[];
  ungroupedTabs: Tab[];
}

export interface ReorganizationResult {
  success: boolean;
  snapshotTimestamp: number;
  updatedGroups: TabGroup[];
  error?: string;
}
