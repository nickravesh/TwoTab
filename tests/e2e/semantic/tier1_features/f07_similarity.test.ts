/**
 * Tier 1 Feature Coverage: Vector Math & Fast Cosine Similarity
 *
 * Feature 7: Fast Dot-Product Cosine Similarity (R3)
 *
 * Verification: 100% offline, deterministic mathematical properties.
 */

import { describe, it, expect } from 'vitest';
import {
  computeDotProduct,
  l2Normalize,
  computeL2Norm,
  generateControlledVectorPair,
  EMBEDDING_DIMENSIONS,
} from '../harness/oracle';

describe('Tier 1: Similarity & Vector Math (Feature 7)', () => {
  it('7.1 computes dot product equal to 1.000 for identical unit vectors', () => {
    const v = new Float32Array(EMBEDDING_DIMENSIONS);
    v.fill(1.0);
    const u = l2Normalize(v);

    const sim = computeDotProduct(u, u);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  it('7.2 computes dot product equal to 0.000 for orthogonal unit vectors', () => {
    const [u, v] = generateControlledVectorPair(0.0);
    const sim = computeDotProduct(u, v);
    expect(sim).toBeCloseTo(0.0, 5);
  });

  it('7.3 computes dot product equal to -1.000 for anti-parallel (opposite) unit vectors', () => {
    const [u, v] = generateControlledVectorPair(-1.0);
    const sim = computeDotProduct(u, v);
    expect(sim).toBeCloseTo(-1.0, 5);
  });

  it('7.4 preserves monotonic linear scaling across intermediate similarity values (-0.75, -0.25, 0.25, 0.70, 0.85)', () => {
    const testValues = [-0.75, -0.25, 0.25, 0.70, 0.85];
    for (const target of testValues) {
      const [u, v] = generateControlledVectorPair(target);
      const computed = computeDotProduct(u, v);
      expect(computed).toBeCloseTo(target, 4);
    }
  });

  it('7.5 throws explicit Error when vectors have mismatched dimensions', () => {
    const v384 = new Float32Array(384);
    const v128 = new Float32Array(128);

    expect(() => computeDotProduct(v384, v128)).toThrow(/Dimension mismatch/);
  });
});
