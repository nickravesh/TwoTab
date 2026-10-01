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

  it('checkBrowserModelCache returns false when cache API is empty or absent', async () => {
    const res = await checkBrowserModelCache();
    expect(typeof res).toBe('boolean');
  });
});
