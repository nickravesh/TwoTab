/**
 * Tier 2 Boundary Value Analysis: Embedding Provider & Lifecycle
 *
 * Boundary Scenarios:
 * - Rapid concurrent initialization invocations (deduplicated promise)
 * - Repeated termination calls
 * - Massive text batches (200 prompts)
 * - Empty string and whitespace-only prompts
 * - Extremely long prompt strings (>5,000 characters)
 * - Recovery from error states via clean re-initialization
 * - In-memory cache bounds and lifecycle
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockEmbeddingProvider } from '../tier1_features/f04_f05_f06_f22_f23_f24_provider.test';
import { EMBEDDING_DIMENSIONS, computeL2Norm } from '../harness/oracle';

describe('Tier 2 Boundary: Embedding Provider & Lifecycle (B06)', () => {
  let provider: MockEmbeddingProvider;

  beforeEach(() => {
    provider = new MockEmbeddingProvider();
  });

  it('B6.1 rapid concurrent initialize() calls share the same initialization run', async () => {
    const p1 = provider.initialize();
    const p2 = provider.initialize();
    const p3 = provider.initialize();

    await Promise.all([p1, p2, p3]);
    expect(provider.networkCallsCount).toBe(1);
    expect(provider.getState()).toBe('ready');
  });

  it('B6.2 repeated calls to terminate() do not throw exceptions', async () => {
    await provider.initialize();
    await provider.terminate();
    await expect(provider.terminate()).resolves.not.toThrow();
    await expect(provider.terminate()).resolves.not.toThrow();
    expect(provider.getState()).toBe('unavailable');
  });

  it('B6.3 handles massive batch of 200 text prompts efficiently', async () => {
    await provider.initialize();
    const batch = Array.from({ length: 200 }, (_, i) => `Semantic Tab Title ${i} for Stress Testing`);

    const start = performance.now();
    const embeddings = await provider.generateEmbeddings(batch);
    const elapsed = performance.now() - start;

    expect(embeddings.length).toBe(200);
    expect(elapsed).toBeLessThan(200); // 200 prompts generated in <200ms
    expect(provider.getCacheSize()).toBe(200);
  });

  it('B6.4 handles empty string and whitespace-only prompt without crashing', async () => {
    await provider.initialize();
    const embeddings = await provider.generateEmbeddings(['', '   ', '\t\n']);

    expect(embeddings.length).toBe(3);
    for (const emb of embeddings) {
      expect(emb.length).toBe(EMBEDDING_DIMENSIONS);
      expect(computeL2Norm(emb)).toBeCloseTo(1.0, 5);
    }
  });

  it('B6.5 handles massive prompt strings (>5,000 characters)', async () => {
    await provider.initialize();
    const massivePrompt = 'Title: Deep Learning Transformer Attention. '.repeat(150);
    const [embedding] = await provider.generateEmbeddings([massivePrompt]);

    expect(embedding.length).toBe(EMBEDDING_DIMENSIONS);
    expect(computeL2Norm(embedding)).toBeCloseTo(1.0, 5);
  });

  it('B6.6 calling generateEmbeddings after terminate throws explicit error', async () => {
    await provider.initialize();
    await provider.terminate();

    await expect(
      provider.generateEmbeddings(['Text prompt'])
    ).rejects.toThrow(/Cannot generate embeddings/);
  });

  it('B6.7 recovering from simulated network error via re-initialization', async () => {
    provider.simulateNetworkFailure = true;
    await expect(provider.initialize()).rejects.toThrow();
    expect(provider.getState()).toBe('error');

    // Network recovers
    provider.simulateNetworkFailure = false;
    await provider.initialize();
    expect(provider.getState()).toBe('ready');

    const [emb] = await provider.generateEmbeddings(['Recovered prompt']);
    expect(emb.length).toBe(EMBEDDING_DIMENSIONS);
  });

  it('B6.8 cache hit returns identical Float32Array object reference', async () => {
    await provider.initialize();
    const [v1] = await provider.generateEmbeddings(['Identical Cache Test Prompt']);
    const [v2] = await provider.generateEmbeddings(['Identical Cache Test Prompt']);

    expect(v1).toBe(v2);
  });

  it('B6.9 clearCache empties cache while leaving provider in ready state', async () => {
    await provider.initialize();
    await provider.generateEmbeddings(['A', 'B', 'C']);
    expect(provider.getCacheSize()).toBe(3);

    provider.clearCache();
    expect(provider.getCacheSize()).toBe(0);
    expect(provider.getState()).toBe('ready');
  });

  it('B6.10 model caching flag reflects true after initial download and remains true', async () => {
    expect(await provider.isModelCached()).toBe(false);
    await provider.initialize();
    expect(await provider.isModelCached()).toBe(true);

    // Termination does not discard local model cache on disk/IndexedDB
    await provider.terminate();
    expect(await provider.isModelCached()).toBe(true);
  });

  it('B6.11 re-initialization after termination with cached model makes 0 network calls', async () => {
    await provider.initialize();
    expect(provider.networkCallsCount).toBe(1);
    await provider.terminate();

    // Re-initialize: model is cached, zero network requests
    await provider.initialize();
    expect(provider.networkCallsCount).toBe(1);
    expect(provider.getState()).toBe('ready');
  });

  it('B6.12 generateEmbeddings handles mixed batch containing cached and new items', async () => {
    await provider.initialize();
    await provider.generateEmbeddings(['Pre-cached item']);
    expect(provider.getCacheSize()).toBe(1);

    const results = await provider.generateEmbeddings(['Pre-cached item', 'Brand new item']);
    expect(results.length).toBe(2);
    expect(provider.getCacheSize()).toBe(2);
  });

  it('B6.13 generates deterministic embeddings even with unicode and emojis in text', async () => {
    await provider.initialize();
    const [e1] = await provider.generateEmbeddings(['🚀 TwoTab AI グループ化!']);
    const [e2] = await provider.generateEmbeddings(['🚀 TwoTab AI グループ化!']);

    expect(e1).toEqual(e2);
  });

  it('B6.14 verifies all generated vector dimensions are strictly 384', async () => {
    await provider.initialize();
    const results = await provider.generateEmbeddings(['A', 'B', 'C', 'D']);
    expect(results.every((vec) => vec.length === 384)).toBe(true);
  });

  it('B6.15 provider progress callback is not invoked when model is already cached', async () => {
    await provider.initialize();

    let progressInvoked = false;
    await provider.initialize(() => {
      progressInvoked = true;
    });

    expect(progressInvoked).toBe(false);
  });
});
