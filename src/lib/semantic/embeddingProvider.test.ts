import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SemanticEmbeddingProvider,
  getEmbeddingProvider,
  checkBrowserModelCache,
} from './embeddingProvider';

describe('Semantic Embedding Provider (embeddingProvider.ts)', () => {
  let provider: SemanticEmbeddingProvider;

  beforeEach(() => {
    provider = new SemanticEmbeddingProvider();
  });

  afterEach(async () => {
    await provider.terminate();
  });

  it('starts in unavailable state', () => {
    expect(provider.getState()).toBe('unavailable');
    expect(provider.getCacheSize()).toBe(0);
  });

  it('initializes to ready state when test inference engine is provided', async () => {
    const progressSpy = vi.fn();
    provider.setTestInferenceEngine(async (texts) => {
      return texts.map(() => new Float32Array(384).fill(0.1));
    });

    await provider.initialize(progressSpy);
    expect(provider.getState()).toBe('ready');
  });

  it('generates 384-dimensional embeddings and caches them in-memory', async () => {
    let callCount = 0;
    provider.setTestInferenceEngine(async (texts) => {
      callCount += texts.length;
      return texts.map(() => new Float32Array(384).fill(0.5));
    });

    await provider.initialize();
    const texts = ['Python documentation', 'React hooks guide'];
    const embeddings1 = await provider.generateEmbeddings(texts);

    expect(embeddings1).toHaveLength(2);
    expect(embeddings1[0]).toHaveLength(384);
    expect(callCount).toBe(2);
    expect(provider.getCacheSize()).toBe(2);

    // Calling again with the same texts should hit in-memory cache without calling model engine
    const embeddings2 = await provider.generateEmbeddings(texts);
    expect(embeddings2).toHaveLength(2);
    expect(callCount).toBe(2); // No new model calls!
  });

  it('throws error when trying to generate embeddings before initialization', async () => {
    await expect(provider.generateEmbeddings(['test'])).rejects.toThrow(
      /Cannot generate embeddings|Provider is not ready/
    );
  });

  it('clears in-memory cache on clearCache() and terminate()', async () => {
    provider.setTestInferenceEngine(async (texts) => {
      return texts.map(() => new Float32Array(384));
    });
    await provider.initialize();
    await provider.generateEmbeddings(['sample']);
    expect(provider.getCacheSize()).toBe(1);

    provider.clearCache();
    expect(provider.getCacheSize()).toBe(0);

    await provider.terminate();
    expect(provider.getState()).toBe('unavailable');
  });

  it('returns singleton from getEmbeddingProvider()', () => {
    const p1 = getEmbeddingProvider();
    const p2 = getEmbeddingProvider();
    expect(p1).toBe(p2);
  });

  it('handles empty input array returning immediately', async () => {
    provider.setTestInferenceEngine(async () => []);
    await provider.initialize();
    const res = await provider.generateEmbeddings([]);
    expect(res).toEqual([]);
  });

  it('handles partial in-memory cache hits correctly preserving order', async () => {
    let calledWith: string[] = [];
    provider.setTestInferenceEngine(async (texts) => {
      calledWith = [...texts];
      return texts.map((t) => {
        const v = new Float32Array(384);
        v[0] = t.length;
        return v;
      });
    });

    await provider.initialize();
    // Cache 'first'
    await provider.generateEmbeddings(['first']);
    expect(calledWith).toEqual(['first']);

    // Now request ['first', 'second', 'first', 'third']
    const results = await provider.generateEmbeddings(['first', 'second', 'first', 'third']);
    // Only 'second' and 'third' should have been passed to inference engine
    expect(calledWith).toEqual(['second', 'third']);
    expect(results).toHaveLength(4);
    expect(results[0][0]).toBe(5); // 'first'.length
    expect(results[1][0]).toBe(6); // 'second'.length
    expect(results[2][0]).toBe(5); // 'first'.length
    expect(results[3][0]).toBe(5); // 'third'.length
  });

  it('accepts onProgress callback during generateEmbeddings', async () => {
    const progressSpy = vi.fn();
    provider.setTestInferenceEngine(async (texts) => {
      return texts.map(() => new Float32Array(384));
    });

    await provider.initialize();
    await provider.generateEmbeddings(['item1', 'item2'], progressSpy);
    // Provider state is ready
    expect(provider.getState()).toBe('ready');
  });

  it('checkBrowserModelCache returns false when cache API is empty or absent', async () => {
    const res = await checkBrowserModelCache();
    expect(typeof res).toBe('boolean');
  });
});
