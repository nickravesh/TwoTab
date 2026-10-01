import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateDeterministicEmbedding,
  generateControlledVectorPair,
  generateChainingTriad,
  computeDotProduct,
  computeL2Norm,
  l2Normalize,
  oracleNormalizeTab,
  oracleClusterTabs,
  oracleGenerateGroupName,
  EMBEDDING_DIMENSIONS,
} from './harness/oracle';
import { setupMockChromeStorage, MockLocalStorage } from './harness/mockStorage';
import {
  PYTHON_TABS,
  REACT_TABS,
  SHOPPING_TABS,
  DORMANT_TABS,
  BOUNDARY_TABS,
} from './harness/fixtures';

describe('E2E Semantic Harness Suite', () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = setupMockChromeStorage();
  });

  describe('1. Deterministic Synthetic Embeddings & Vector Math', () => {
    it('produces exactly 384-dimensional unit-normalized vectors', () => {
      const vec = generateDeterministicEmbedding('Python Tutorial');
      expect(vec.length).toBe(EMBEDDING_DIMENSIONS);

      const norm = computeL2Norm(vec);
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it('generates identical embeddings for identical text (100% deterministic)', () => {
      const v1 = generateDeterministicEmbedding('FastAPI Routing');
      const v2 = generateDeterministicEmbedding('FastAPI Routing');
      expect(v1).toEqual(v2);

      const sim = computeDotProduct(v1, v2);
      expect(sim).toBeCloseTo(1.0, 5);
    });

    it('generates high similarity for same-topic tabs and low similarity for different topics', () => {
      const py1 = generateDeterministicEmbedding(PYTHON_TABS[0].title, { topic: 'python' });
      const py2 = generateDeterministicEmbedding(PYTHON_TABS[1].title, { topic: 'python' });
      const react1 = generateDeterministicEmbedding(REACT_TABS[0].title, { topic: 'react' });

      const sameTopicSim = computeDotProduct(py1, py2);
      const crossTopicSim = computeDotProduct(py1, react1);

      expect(sameTopicSim).toBeGreaterThanOrEqual(0.70);
      expect(crossTopicSim).toBeLessThan(0.40);
    });

    it('generates vector pairs with exact target similarities', () => {
      const targets = [-1.0, -0.5, 0.0, 0.5, 0.70, 0.85, 1.0];
      for (const target of targets) {
        const [u, v] = generateControlledVectorPair(target);
        expect(computeL2Norm(u)).toBeCloseTo(1.0, 5);
        expect(computeL2Norm(v)).toBeCloseTo(1.0, 5);

        const sim = computeDotProduct(u, v);
        expect(sim).toBeCloseTo(target, 4);
      }
    });

    it('generates chaining triad with controlled pairwise similarities', () => {
      const [a, b, c] = generateChainingTriad(0.85, 0.85, 0.50);
      expect(computeDotProduct(a, b)).toBeCloseTo(0.85, 4);
      expect(computeDotProduct(b, c)).toBeCloseTo(0.85, 4);
      expect(computeDotProduct(a, c)).toBeCloseTo(0.50, 4);
    });
  });

  describe('2. Metadata Normalization Oracle', () => {
    it('strips tracking parameters from shopping tabs', () => {
      const meta = oracleNormalizeTab(SHOPPING_TABS[0]);
      expect(meta.cleanUrl).not.toContain('utm_source');
      expect(meta.cleanUrl).not.toContain('fbclid');
      expect(meta.cleanUrl).toContain('https://www.amazon.com/dp/B09XS7JWHH');
    });

    it('unwraps dormant tabs correctly', () => {
      const meta = oracleNormalizeTab(DORMANT_TABS[0]);
      expect(meta.cleanUrl).toBe('https://github.com/nickravesh/TwoTab');
      expect(meta.cleanTitle).toBe('TwoTab Repository');
      expect(meta.domain).toBe('github.com');
    });

    it('synthesizes prompt with title, domain, and path keywords', () => {
      const meta = oracleNormalizeTab(PYTHON_TABS[0]);
      expect(meta.semanticPrompt).toContain('Title:');
      expect(meta.semanticPrompt).toContain('Domain: docs.python.org');
      expect(meta.semanticPrompt).toContain('Path: 3 tutorial index');
    });
  });

  describe('3. Clustering Oracle & Anti-Chaining Invariant', () => {
    it('clusters same-topic tabs together above similarity threshold 0.70', () => {
      const items = [
        ...PYTHON_TABS.slice(0, 3).map((tab) => ({
          tab,
          embedding: generateDeterministicEmbedding(tab.title, { topic: 'python' }),
        })),
        ...REACT_TABS.slice(0, 3).map((tab) => ({
          tab,
          embedding: generateDeterministicEmbedding(tab.title, { topic: 'react' }),
        })),
      ];

      const result = oracleClusterTabs(items, { similarityThreshold: 0.70 });
      expect(result.clusters.length).toBe(2);
      expect(result.ungroupedTabs.length).toBe(0);

      // Verify each cluster has 3 tabs
      expect(result.clusters[0].tabs.length).toBe(3);
      expect(result.clusters[1].tabs.length).toBe(3);
    });

    it('rejects chaining when A ~ B and B ~ C but A !~ C (complete linkage)', () => {
      const [vA, vB, vC] = generateChainingTriad(0.85, 0.85, 0.40);
      const items = [
        { tab: { title: 'Tab A', url: 'https://a.com' }, embedding: vA },
        { tab: { title: 'Tab B', url: 'https://b.com' }, embedding: vB },
        { tab: { title: 'Tab C', url: 'https://c.com' }, embedding: vC },
      ];

      const result = oracleClusterTabs(items, { similarityThreshold: 0.70 });
      // Complete linkage prevents merging all 3 into one cluster because min pairwise similarity is 0.40 < 0.70
      // So at most 2 tabs merge into a cluster, and 1 remains ungrouped!
      const allClusterTabsCount = result.clusters.reduce((sum, c) => sum + c.tabs.length, 0);
      expect(allClusterTabsCount).toBeLessThan(3);
      expect(result.ungroupedTabs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('4. Mock Chrome Storage & Invariant Guards', () => {
    it('sets and gets data correctly via chrome.storage.local', async () => {
      await chrome.storage.local.set({ testKey: 'hello' });
      const res = await chrome.storage.local.get('testKey');
      expect(res.testKey).toBe('hello');
    });

    it('catches raw 384-dimensional embedding vectors when assertNoRawEmbeddings is run', async () => {
      // Clean storage
      mockStorage.assertNoRawEmbeddings();

      // Corrupted storage containing raw vector
      const rawVector = Array.from({ length: 384 }, () => 0.1);
      await chrome.storage.local.set({ illegalEmbeddings: [rawVector] });

      expect(() => mockStorage.assertNoRawEmbeddings()).toThrow(/Violation/);
    });
  });
});
