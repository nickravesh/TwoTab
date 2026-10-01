/**
 * Tier 2 Boundary Value Analysis: Fast Cosine Similarity & Vector Math
 *
 * Boundary Scenarios:
 * - All-zero vectors and near-zero vectors (<1e-12)
 * - NaN, null, and Infinity floating-point values
 * - Exact mathematical boundaries: -1.000, 0.000, +1.000
 * - Threshold boundary gating: 0.699999 vs 0.700000 vs 0.700001
 * - Cauchy-Schwarz inequality validation: |A · B| <= ||A|| * ||B||
 * - Commutative symmetry: A · B === B · A
 * - Precision stability across 10,000 iterations
 */

import { describe, it, expect } from 'vitest';
import {
  computeDotProduct,
  l2Normalize,
  computeL2Norm,
  generateControlledVectorPair,
  EMBEDDING_DIMENSIONS,
} from '../harness/oracle';

describe('Tier 2 Boundary: Similarity & Vector Math (B02)', () => {
  it('B2.1 handles all-zero vector by returning 0.0 similarity without throwing division by zero', () => {
    const zero = new Float32Array(EMBEDDING_DIMENSIONS);
    const normalized = l2Normalize(zero);
    expect(computeL2Norm(normalized)).toBe(0);

    const normal = new Float32Array(EMBEDDING_DIMENSIONS);
    normal[0] = 1.0;

    const sim = computeDotProduct(normalized, normal);
    expect(sim).toBe(0.0);
  });

  it('B2.2 handles near-zero magnitude vectors (< 1e-12) safely', () => {
    const tiny = new Float32Array(EMBEDDING_DIMENSIONS);
    tiny.fill(1e-15);
    const normalized = l2Normalize(tiny);
    expect(computeL2Norm(normalized)).toBe(0);
  });

  it('B2.3 clamps dot product cleanly to [-1.0, 1.0] even with floating-point overshoot (e.g. 1.000002)', () => {
    const [u, v] = generateControlledVectorPair(1.0);
    const sim = computeDotProduct(u, v);
    expect(sim).toBeLessThanOrEqual(1.0);
    expect(sim).toBeGreaterThanOrEqual(-1.0);
  });

  it('B2.4 evaluates exact threshold boundary 0.700000 vs 0.699999 and 0.700001', () => {
    const [uBelow, vBelow] = generateControlledVectorPair(0.699999);
    const [uExact, vExact] = generateControlledVectorPair(0.700000);
    const [uAbove, vAbove] = generateControlledVectorPair(0.700001);

    const simBelow = computeDotProduct(uBelow, vBelow);
    const simExact = computeDotProduct(uExact, vExact);
    const simAbove = computeDotProduct(uAbove, vAbove);

    expect(simBelow).toBeLessThan(0.70);
    expect(simExact).toBeCloseTo(0.70, 5);
    expect(simAbove).toBeGreaterThan(0.70);
  });

  it('B2.5 satisfies commutative symmetry: computeDotProduct(A, B) === computeDotProduct(B, A)', () => {
    const [u, v] = generateControlledVectorPair(0.65);
    expect(computeDotProduct(u, v)).toBeCloseTo(computeDotProduct(v, u), 6);
  });

  it('B2.6 satisfies Cauchy-Schwarz inequality: |A · B| <= ||A|| * ||B|| for arbitrary vectors', () => {
    const a = new Float32Array(EMBEDDING_DIMENSIONS);
    const b = new Float32Array(EMBEDDING_DIMENSIONS);
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
      a[i] = Math.sin(i);
      b[i] = Math.cos(i);
    }

    const dot = computeDotProduct(a, b);
    const normA = computeL2Norm(a);
    const normB = computeL2Norm(b);

    expect(Math.abs(dot)).toBeLessThanOrEqual(normA * normB + 1e-4);
  });

  it('B2.7 handles vectors with extreme large values without overflow during L2 normalization', () => {
    const huge = new Float32Array(EMBEDDING_DIMENSIONS);
    huge.fill(1e18);

    const normalized = l2Normalize(huge);
    expect(computeL2Norm(normalized)).toBeCloseTo(1.0, 5);
    expect(Number.isFinite(normalized[0])).toBe(true);
  });

  it('B2.8 handles vectors with extreme small values without underflow during L2 normalization', () => {
    const tiny = new Float32Array(EMBEDDING_DIMENSIONS);
    tiny.fill(1e-10);

    const normalized = l2Normalize(tiny);
    expect(computeL2Norm(normalized)).toBeCloseTo(1.0, 5);
    expect(Number.isFinite(normalized[0])).toBe(true);
  });

  it('B2.9 returns 0.0 when vector elements contain NaN values rather than propagating NaN', () => {
    const withNan = new Float32Array(EMBEDDING_DIMENSIONS);
    withNan[0] = NaN;
    const normal = new Float32Array(EMBEDDING_DIMENSIONS);
    normal[0] = 1.0;

    const sim = computeDotProduct(withNan, normal);
    expect(sim).toBe(0.0);
  });

  it('B2.10 maintains sub-millisecond execution over 10,000 dot product iterations', () => {
    const [u, v] = generateControlledVectorPair(0.82);
    const start = performance.now();

    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      sum += computeDotProduct(u, v);
    }

    const elapsed = performance.now() - start;
    expect(sum).toBeGreaterThan(8000);
    expect(elapsed).toBeLessThan(150); // 10,000 iterations in <150ms
  });

  it('B2.11 boundary at negative extreme -1.000000', () => {
    const [u, v] = generateControlledVectorPair(-1.0);
    const sim = computeDotProduct(u, v);
    expect(sim).toBeCloseTo(-1.0, 5);
  });

  it('B2.12 boundary at positive extreme +1.000000', () => {
    const [u, v] = generateControlledVectorPair(1.0);
    const sim = computeDotProduct(u, v);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  it('B2.13 boundary at exact orthogonal 0.000000', () => {
    const [u, v] = generateControlledVectorPair(0.0);
    const sim = computeDotProduct(u, v);
    expect(sim).toBeCloseTo(0.0, 5);
  });

  it('B2.14 supports arbitrary dimensions in generateControlledVectorPair', () => {
    const [u, v] = generateControlledVectorPair(0.5, 128);
    expect(u.length).toBe(128);
    expect(v.length).toBe(128);
    expect(computeDotProduct(u, v)).toBeCloseTo(0.5, 4);
  });

  it('B2.15 rejects invalid target similarity outside [-1.0, 1.0]', () => {
    expect(() => generateControlledVectorPair(1.05)).toThrow();
    expect(() => generateControlledVectorPair(-1.05)).toThrow();
  });
});
