// =============================================================================
// TwoTab Intelligent Tab Grouping — Semantic Embedding Provider
// =============================================================================
// Features:
// 1. Lazy-loading singleton provider for Xenova/all-MiniLM-L6-v2 (FP32 ONNX)
// 2. Offloads inference to dedicated Web Worker (src/workers/embedding.worker.ts)
// 3. Transparent progress reporting during on-demand download & initialization
// 4. In-memory ephemeral embedding cache to eliminate redundant computation
// 5. Zero persistence of raw embedding vectors in chrome.storage.local
// 6. Zero external APIs, zero telemetry, 100% local inference
// =============================================================================

import type {
  EmbeddingProviderState,
  ModelDownloadProgress,
  IEmbeddingProvider,
} from './types';

/**
 * Fast 32-bit FNV-1a hash for in-memory cache keys.
 */
function hashText(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Checks if the model is cached in browser CacheStorage.
 */
export async function checkBrowserModelCache(modelName = 'all-MiniLM-L6-v2'): Promise<boolean> {
  if (typeof caches === 'undefined') {
    return false;
  }
  try {
    const keys = await caches.keys();
    for (const key of keys) {
      if (key.includes('transformers') || key.includes('huggingface')) {
        const cache = await caches.open(key);
        const reqs = await cache.keys();
        for (const req of reqs) {
          if (req.url.includes(modelName) || req.url.includes('model.onnx')) {
            return true;
          }
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

export class SemanticEmbeddingProvider implements IEmbeddingProvider {
  private state: EmbeddingProviderState = 'unavailable';
  private worker: Worker | null = null;
  private messageCounter = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (data: any) => void; reject: (err: any) => void }
  >();
  private inMemoryCache = new Map<string, Float32Array>();
  private onProgressCallback: ((progress: ModelDownloadProgress) => void) | null = null;
  private initPromise: Promise<void> | null = null;

  // Custom inference engine override (primarily for unit testing without workers)
  private testInferenceEngine: ((texts: string[]) => Promise<Float32Array[]>) | null = null;

  public getState(): EmbeddingProviderState {
    return this.state;
  }

  public getCacheSize(): number {
    return this.inMemoryCache.size;
  }

  public clearCache(): void {
    this.inMemoryCache.clear();
  }

  public setTestInferenceEngine(
    engine: ((texts: string[]) => Promise<Float32Array[]>) | null
  ): void {
    this.testInferenceEngine = engine;
  }

  public async isModelCached(): Promise<boolean> {
    return checkBrowserModelCache('all-MiniLM-L6-v2');
  }

  public async initialize(
    onProgress?: (progress: ModelDownloadProgress) => void
  ): Promise<void> {
    if (this.state === 'ready') {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.onProgressCallback = onProgress || null;

    this.initPromise = (async () => {
      try {
        const cached = await this.isModelCached();
        this.state = cached ? 'loading' : 'downloading';

        if (this.testInferenceEngine) {
          // If a test inference engine is provided, complete immediately
          this.state = 'ready';
          return;
        }

        // Check if Web Worker is available in this environment
        if (typeof Worker === 'undefined') {
          // Fallback for node/unit test environment where Worker is unavailable
          this.state = 'ready';
          return;
        }

        // Initialize Web Worker using modern ESM worker syntax
        if (!this.worker) {
          this.worker = new Worker(
            new URL('../../workers/embedding.worker.ts', import.meta.url),
            { type: 'module' }
          );

          this.worker.onmessage = (event: MessageEvent) => {
            const { id, type, payload, error } = event.data;

            if (type === 'PROGRESS') {
              this.onProgressCallback?.(payload);
              return;
            }

            if (id !== undefined && this.pendingRequests.has(id)) {
              const { resolve, reject } = this.pendingRequests.get(id)!;
              this.pendingRequests.delete(id);

              if (type === 'ERROR') {
                reject(new Error(error || 'Worker error'));
              } else {
                resolve(payload);
              }
            }
          };

          this.worker.onerror = (err) => {
            console.error('[TwoTab AI] Worker execution error:', err);
            this.state = 'error';
            const errorObj = new Error(err.message || 'Worker thread execution error');
            for (const { reject } of this.pendingRequests.values()) {
              reject(errorObj);
            }
            this.pendingRequests.clear();
          };
        }

        // Send INIT command to worker with extension base URL for local WASM assets
        const wasmBaseUrl =
          typeof chrome !== 'undefined' && chrome.runtime?.getURL
            ? chrome.runtime.getURL('ort/')
            : undefined;

        await this.postWorkerMessage('INIT', { wasmBaseUrl });
        this.state = 'ready';
        console.log('[TwoTab AI] Model pipeline successfully initialized.');
      } catch (err: any) {
        this.state = 'error';
        this.initPromise = null;
        console.error('[TwoTab AI] Initialization failed:', err);
        throw err;
      }
    })();

    return this.initPromise;
  }

  public async generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
    if (this.state !== 'ready') {
      throw new Error(`[TwoTab AI] Provider is not ready. Current state: ${this.state}`);
    }

    if (!texts || texts.length === 0) {
      return [];
    }

    // Identify which texts are already cached vs need model inference
    const results: Float32Array[] = new Array(texts.length);
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const h = hashText(texts[i]);
      if (this.inMemoryCache.has(h)) {
        results[i] = this.inMemoryCache.get(h)!;
      } else {
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i]);
      }
    }

    // If all embeddings were cached in-memory, return immediately
    if (uncachedTexts.length === 0) {
      return results;
    }

    let generated: Float32Array[] = [];

    if (this.testInferenceEngine) {
      generated = await this.testInferenceEngine(uncachedTexts);
    } else if (this.worker) {
      const res = await this.postWorkerMessage('EMBED', { texts: uncachedTexts });
      generated = res.embeddings;
    } else {
      // Fallback synthetic generator for workerless environments
      generated = uncachedTexts.map(() => new Float32Array(384));
    }

    // Store new embeddings in-memory and fill results array
    for (let j = 0; j < uncachedTexts.length; j++) {
      const originalIdx = uncachedIndices[j];
      const vec = generated[j];
      const h = hashText(uncachedTexts[j]);
      this.inMemoryCache.set(h, vec);
      results[originalIdx] = vec;
    }

    return results;
  }

  public async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.postWorkerMessage('DISPOSE', {});
      } catch {
        // Ignore termination message error
      }
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
    this.inMemoryCache.clear();
    this.state = 'unavailable';
    this.initPromise = null;
    console.log('[TwoTab AI] Model provider terminated.');
  }

  private postWorkerMessage(type: string, payload: any): Promise<any> {
    if (!this.worker) {
      return Promise.reject(new Error('[TwoTab AI] Worker is not active'));
    }

    const id = ++this.messageCounter;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.worker!.postMessage({ id, type, payload });
    });
  }
}

// Global lazy singleton instance
let providerInstance: SemanticEmbeddingProvider | null = null;

export function getEmbeddingProvider(): SemanticEmbeddingProvider {
  if (!providerInstance) {
    providerInstance = new SemanticEmbeddingProvider();
  }
  return providerInstance;
}
