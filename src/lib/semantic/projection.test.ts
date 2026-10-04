import { describe, it, expect } from 'vitest';
import {
  projectEmbeddingsTo2D,
  computeClusterCentroids2D,
  computeCentroidEmbedding,
  computeVectorSpectrum,
  type ProjectionInputItem,
} from './projection';
import type { Tab } from '../storage';

describe('Deterministic 2D Projection & Latent Math Suite', () => {
  const createMockTab = (title: string, url: string): Tab => ({ title, url });

  const createSyntheticVector = (dim: number, freq: number, phase: number): Float32Array => {
    const v = new Float32Array(dim);
    let sumSq = 0;
    for (let i = 0; i < dim; i++) {
      const val = Math.cos(i * freq + phase);
      v[i] = val;
      sumSq += val * val;
    }
    const norm = Math.sqrt(sumSq) || 1;
    for (let i = 0; i < dim; i++) {
      v[i] /= norm;
    }
    return v;
  };

  describe('projectEmbeddingsTo2D', () => {
    it('handles empty input gracefully', () => {
      const result = projectEmbeddingsTo2D([]);
      expect(result).toEqual([]);
    });

    it('places singleton item precisely at the canvas center (0.5, 0.5)', () => {
      const tab = createMockTab('Google', 'https://google.com');
      const item: ProjectionInputItem = {
        tab,
        embedding: createSyntheticVector(384, 0.1, 0),
        clusterId: 'c1',
      };

      const result = projectEmbeddingsTo2D([item]);
      expect(result).toHaveLength(1);
      expect(result[0].x).toBe(0.5);
      expect(result[0].y).toBe(0.5);
      expect(result[0].clusterId).toBe('c1');
    });

    it('places two items symmetrically along the horizontal axis', () => {
      const items: ProjectionInputItem[] = [
        { tab: createMockTab('Tab A', 'https://a.com'), embedding: createSyntheticVector(384, 0.1, 0) },
        { tab: createMockTab('Tab B', 'https://b.com'), embedding: createSyntheticVector(384, 0.2, 0.5) },
      ];

      const result = projectEmbeddingsTo2D(items);
      expect(result).toHaveLength(2);
      expect(result[0].x).toBe(0.35);
      expect(result[0].y).toBe(0.5);
      expect(result[1].x).toBe(0.65);
      expect(result[1].y).toBe(0.5);
    });

    it('projects N >= 3 embeddings into padded bounds [0.08, 0.92] deterministically', () => {
      const items: ProjectionInputItem[] = Array.from({ length: 15 }, (_, i) => ({
        id: `tab-${i}`,
        tab: createMockTab(`Tab ${i}`, `https://example.com/${i}`),
        embedding: createSyntheticVector(384, 0.05 * (i + 1), i * 0.2),
        clusterId: i % 2 === 0 ? 'c-even' : 'c-odd',
        clusterColor: i % 2 === 0 ? 'blue' : 'green',
      }));

      const run1 = projectEmbeddingsTo2D(items);
      const run2 = projectEmbeddingsTo2D(items);

      expect(run1).toHaveLength(15);
      // Strict determinism check
      expect(run1).toEqual(run2);

      // Boundary safety check
      for (const pt of run1) {
        expect(pt.x).toBeGreaterThanOrEqual(0.08);
        expect(pt.x).toBeLessThanOrEqual(0.92);
        expect(pt.y).toBeGreaterThanOrEqual(0.08);
        expect(pt.y).toBeLessThanOrEqual(0.92);
      }
    });

    it('safely handles identical/collinear vectors without producing NaN or Infinity', () => {
      const sharedVec = createSyntheticVector(384, 0.15, 0.3);
      const items: ProjectionInputItem[] = Array.from({ length: 6 }, (_, i) => ({
        id: `tab-ident-${i}`,
        tab: createMockTab(`Identical Tab ${i}`, 'https://same.com'),
        embedding: new Float32Array(sharedVec),
      }));

      const result = projectEmbeddingsTo2D(items);
      expect(result).toHaveLength(6);
      for (const pt of result) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
        expect(pt.x).toBeGreaterThanOrEqual(0.08);
        expect(pt.x).toBeLessThanOrEqual(0.92);
        expect(pt.y).toBeGreaterThanOrEqual(0.08);
        expect(pt.y).toBeLessThanOrEqual(0.92);
      }
    });

    it('enforces collision-free minimum distance between points in the same cluster', () => {
      const sharedVec = createSyntheticVector(384, 0.1, 0.2);
      const items: ProjectionInputItem[] = Array.from({ length: 5 }, (_, i) => ({
        id: `tab-${i}`,
        tab: createMockTab(`Tab ${i}`, `https://example.com/${i}`),
        embedding: new Float32Array(sharedVec),
        clusterId: 'cluster-react',
      }));

      const result = projectEmbeddingsTo2D(items);
      expect(result).toHaveLength(5);

      // Check pairwise distance between all nodes
      for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const dxPx = (result[i].x - result[j].x) * 800;
          const dyPx = (result[i].y - result[j].y) * 560;
          const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
          // Guaranteed minimum visual distance >= 24px (circles never collide)
          expect(distPx).toBeGreaterThanOrEqual(24);
        }
      }
    });
  });

  describe('computeClusterCentroids2D', () => {
    it('computes 2D mean positions and counts for cluster groups', () => {
      const points = [
        {
          id: 'p1',
          tab: createMockTab('A', 'https://a.com'),
          x: 0.2,
          y: 0.4,
          clusterId: 'group-1',
          clusterName: 'Group 1',
          clusterColor: 'blue' as const,
        },
        {
          id: 'p2',
          tab: createMockTab('B', 'https://b.com'),
          x: 0.4,
          y: 0.6,
          clusterId: 'group-1',
          clusterName: 'Group 1',
          clusterColor: 'blue' as const,
        },
        {
          id: 'p3',
          tab: createMockTab('C', 'https://c.com'),
          x: 0.8,
          y: 0.8,
          clusterId: 'group-2',
          clusterName: 'Group 2',
          clusterColor: 'green' as const,
        },
      ];

      const centroids = computeClusterCentroids2D(points);
      expect(Object.keys(centroids)).toHaveLength(2);
      expect(centroids['group-1'].x).toBe(0.3);
      expect(centroids['group-1'].y).toBe(0.5);
      expect(centroids['group-1'].tabCount).toBe(2);
      expect(centroids['group-2'].x).toBe(0.8);
      expect(centroids['group-2'].y).toBe(0.8);
      expect(centroids['group-2'].tabCount).toBe(1);
    });
  });

  describe('computeCentroidEmbedding', () => {
    it('averages and normalizes embeddings to unit length', () => {
      const v1 = new Float32Array([1, 0, 0]);
      const v2 = new Float32Array([0, 1, 0]);
      const centroid = computeCentroidEmbedding([v1, v2]);

      expect(centroid).toHaveLength(3);
      const expectedVal = 1 / Math.sqrt(2);
      expect(centroid[0]).toBeCloseTo(expectedVal, 4);
      expect(centroid[1]).toBeCloseTo(expectedVal, 4);
      expect(centroid[2]).toBe(0);

      // Verify unit norm
      const norm = Math.sqrt(centroid[0] ** 2 + centroid[1] ** 2 + centroid[2] ** 2);
      expect(norm).toBeCloseTo(1, 5);
    });
  });

  describe('computeVectorSpectrum', () => {
    it('reduces 384-dimensional embedding into 12 normalized visual energy bands', () => {
      const vec = createSyntheticVector(384, 0.08, 0.4);
      const spectrum = computeVectorSpectrum(vec, 12);

      expect(spectrum).toHaveLength(12);
      for (const val of spectrum) {
        expect(val).toBeGreaterThanOrEqual(0.18);
        expect(val).toBeLessThanOrEqual(1.0);
      }
      // At least one band reaches near peak (1.0)
      expect(Math.max(...spectrum)).toBeCloseTo(1.0, 2);
    });
  });
});
