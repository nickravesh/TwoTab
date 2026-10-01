import { describe, it, expect } from 'vitest';
import {
  computeCosineSimilarity,
  computeCosineSimilarityUnnormalized,
  computeDotProduct,
  computeSimilarityMatrix,
  cosineDistance,
  l2Normalize,
  l2NormalizeInPlace,
  computeL2Norm,
  isNormalizedVector,
  isZeroVector,
  clampSimilarity,
  EXPECTED_EMBEDDING_DIM,
} from './similarity';

describe('Similarity & Vector Math Engine (src/lib/semantic/similarity.ts)', () => {
  describe('1. Standard Mathematical Invariants', () => {
    it('returns 1.0 for referentially identical unit vectors', () => {
      const v = new Float32Array(EXPECTED_EMBEDDING_DIM);
      v[0] = 1.0;
      expect(computeCosineSimilarity(v, v)).toBe(1.0);
    });

    it('returns 1.0 for distinct vectors with identical values', () => {
      const a = new Float32Array(EXPECTED_EMBEDDING_DIM);
      const b = new Float32Array(EXPECTED_EMBEDDING_DIM);
      for (let i = 0; i < EXPECTED_EMBEDDING_DIM; i++) {
        const val = Math.sin(i);
        a[i] = val;
        b[i] = val;
      }
      const u = l2Normalize(a);
      const v = l2Normalize(b);
      expect(computeCosineSimilarity(u, v)).toBeCloseTo(1.0, 5);
    });

    it('returns 0.0 for orthogonal basis vectors in 384 dimensions', () => {
      const a = new Float32Array(EXPECTED_EMBEDDING_DIM);
      const b = new Float32Array(EXPECTED_EMBEDDING_DIM);
      a[0] = 1.0;
      b[1] = 1.0;
      expect(computeCosineSimilarity(a, b)).toBe(0.0);
    });

    it('returns -1.0 for diametrically opposing unit vectors', () => {
      const a = new Float32Array(EXPECTED_EMBEDDING_DIM);
      const b = new Float32Array(EXPECTED_EMBEDDING_DIM);
      a[0] = 1.0;
      b[0] = -1.0;
      expect(computeCosineSimilarity(a, b)).toBe(-1.0);
    });

    it('calculates known trigonometric cosine angles accurately', () => {
      // 60 degrees: cos(pi/3) = 0.5
      // Vector 1 = [1, 0], Vector 2 = [cos(pi/3), sin(pi/3)] = [0.5, sqrt(3)/2]
      const a = new Float32Array(EXPECTED_EMBEDDING_DIM);
      const b = new Float32Array(EXPECTED_EMBEDDING_DIM);
      a[0] = 1.0;
      b[0] = 0.5;
      b[1] = Math.sqrt(3) / 2;

      expect(computeCosineSimilarity(a, b)).toBeCloseTo(0.5, 5);

      // 45 degrees: cos(pi/4) = sqrt(2)/2 ~= 0.70710678
      const c = new Float32Array(EXPECTED_EMBEDDING_DIM);
      c[0] = Math.SQRT1_2;
      c[1] = Math.SQRT1_2;
      expect(computeCosineSimilarity(a, c)).toBeCloseTo(Math.SQRT1_2, 5);
    });
  });

  describe('2. Floating-Point Precision & Clamping', () => {
    it('clamps dot products that exceed 1.0 due to float32 quantization', () => {
      // Create a Float32Array whose raw float64 sum exceeds 1.0
      // In 2D: [3/5, 4/5] -> fround(0.6)^2 + fround(0.8)^2 = 1.0000000476837158
      const a = new Float32Array(2);
      a[0] = Math.fround(3 / 5);
      a[1] = Math.fround(4 / 5);

      const sim = computeCosineSimilarity(a, a);
      expect(sim).toBeLessThanOrEqual(1.0);
      expect(sim).toBe(1.0);
    });

    it('clamps dot products that drop below -1.0', () => {
      const a = new Float32Array(2);
      const b = new Float32Array(2);
      a[0] = Math.fround(3 / 5);
      a[1] = Math.fround(4 / 5);
      b[0] = -Math.fround(3 / 5);
      b[1] = -Math.fround(4 / 5);

      const sim = computeCosineSimilarity(a, b);
      expect(sim).toBeGreaterThanOrEqual(-1.0);
      expect(sim).toBe(-1.0);
    });

    it('never returns JavaScript -0 (negative zero)', () => {
      const res = clampSimilarity(-0);
      expect(Object.is(res, -0)).toBe(false);
      expect(res).toBe(0.0);
    });

    it('matches unnormalized cosine similarity within 1e-6 on 50 random unit vectors', () => {
      for (let trial = 0; trial < 50; trial++) {
        const rawA = new Float32Array(EXPECTED_EMBEDDING_DIM);
        const rawB = new Float32Array(EXPECTED_EMBEDDING_DIM);
        for (let i = 0; i < EXPECTED_EMBEDDING_DIM; i++) {
          rawA[i] = (Math.random() - 0.5) * 2;
          rawB[i] = (Math.random() - 0.5) * 2;
        }

        const unitA = l2Normalize(rawA);
        const unitB = l2Normalize(rawB);

        const fastSim = computeCosineSimilarity(unitA, unitB);
        const unnormSim = computeCosineSimilarityUnnormalized(unitA, unitB);

        expect(fastSim).toBeCloseTo(unnormSim, 5);
      }
    });
  });

  describe('3. Numerical Defenses & Edge Cases', () => {
    it('returns 0.0 when comparing a vector with a zero vector', () => {
      const unit = new Float32Array(EXPECTED_EMBEDDING_DIM);
      unit[0] = 1.0;
      const zero = new Float32Array(EXPECTED_EMBEDDING_DIM);

      expect(computeCosineSimilarity(unit, zero)).toBe(0.0);
      expect(computeCosineSimilarity(zero, unit)).toBe(0.0);
    });

    it('returns 0.0 when comparing two zero vectors', () => {
      const z1 = new Float32Array(EXPECTED_EMBEDDING_DIM);
      const z2 = new Float32Array(EXPECTED_EMBEDDING_DIM);
      expect(computeCosineSimilarity(z1, z2)).toBe(0.0);
    });

    it('returns 0.0 when comparing a zero vector with itself by reference', () => {
      const zero = new Float32Array(EXPECTED_EMBEDDING_DIM);
      expect(computeCosineSimilarity(zero, zero)).toBe(0.0);
    });

    it('returns 0.0 when either vector contains NaN', () => {
      const a = new Float32Array(EXPECTED_EMBEDDING_DIM);
      const b = new Float32Array(EXPECTED_EMBEDDING_DIM);
      a[0] = 1.0;
      b[0] = 1.0;
      b[42] = NaN;

      expect(computeCosineSimilarity(a, b)).toBe(0.0);
      expect(computeCosineSimilarity(b, a)).toBe(0.0);
    });

    it('returns 0.0 when either vector contains Infinity or -Infinity', () => {
      const a = new Float32Array(EXPECTED_EMBEDDING_DIM);
      const b = new Float32Array(EXPECTED_EMBEDDING_DIM);
      a[0] = 1.0;
      b[0] = 1.0;
      b[10] = Infinity;

      expect(computeCosineSimilarity(a, b)).toBe(0.0);
      expect(computeCosineSimilarity(b, a)).toBe(0.0);

      b[10] = -Infinity;
      expect(computeCosineSimilarity(a, b)).toBe(0.0);
    });

    it('returns 0.0 when vectors have mismatching dimensions in computeCosineSimilarity', () => {
      const a = new Float32Array(384);
      const b = new Float32Array(128);
      a[0] = 1.0;
      b[0] = 1.0;

      expect(computeCosineSimilarity(a, b)).toBe(0.0);
    });

    it('returns 0.0 for empty vectors', () => {
      const empty1 = new Float32Array(0);
      const empty2 = new Float32Array(0);
      expect(computeCosineSimilarity(empty1, empty2)).toBe(0.0);
    });

    it('computeDotProduct throws explicit Error on dimension mismatch', () => {
      const a = new Float32Array(384);
      const b = new Float32Array(256);
      expect(() => computeDotProduct(a, b)).toThrow(/Dimension mismatch/);
    });
  });

  describe('4. L2 Normalization & Vector Inspection Helpers', () => {
    it('computes correct Euclidean norm for known vectors', () => {
      const v = new Float32Array([3, 4]);
      expect(computeL2Norm(v)).toBe(5.0);

      const zero = new Float32Array(10);
      expect(computeL2Norm(zero)).toBe(0.0);
    });

    it('normalizes arbitrary vectors to unit length (||v|| = 1.0)', () => {
      const raw = new Float32Array(EXPECTED_EMBEDDING_DIM);
      for (let i = 0; i < EXPECTED_EMBEDDING_DIM; i++) {
        raw[i] = (i + 1) * 0.1;
      }
      const unit = l2Normalize(raw);
      expect(computeL2Norm(unit)).toBeCloseTo(1.0, 5);
      expect(isNormalizedVector(unit)).toBe(true);
    });

    it('handles zero vector normalization without NaN or throwing', () => {
      const zero = new Float32Array(EXPECTED_EMBEDDING_DIM);
      const norm = l2Normalize(zero);
      expect(computeL2Norm(norm)).toBe(0.0);
      for (let i = 0; i < norm.length; i++) {
        expect(norm[i]).toBe(0.0);
      }
    });

    it('l2NormalizeInPlace mutates buffer in place and returns same reference', () => {
      const v = new Float32Array([3, 4]);
      const res = l2NormalizeInPlace(v);
      expect(res).toBe(v);
      expect(v[0]).toBeCloseTo(0.6, 5);
      expect(v[1]).toBeCloseTo(0.8, 5);
      expect(computeL2Norm(v)).toBeCloseTo(1.0, 5);
    });

    it('isNormalizedVector accurately detects normalized vs unnormalized vectors', () => {
      const unit = new Float32Array([1, 0, 0]);
      expect(isNormalizedVector(unit)).toBe(true);

      const unnorm = new Float32Array([2, 0, 0]);
      expect(isNormalizedVector(unnorm)).toBe(false);
    });

    it('isZeroVector accurately detects zero and near-zero vectors', () => {
      const zero = new Float32Array(EXPECTED_EMBEDDING_DIM);
      expect(isZeroVector(zero)).toBe(true);

      const nonZero = new Float32Array(EXPECTED_EMBEDDING_DIM);
      nonZero[100] = 0.5;
      expect(isZeroVector(nonZero)).toBe(false);
    });
  });

  describe('5. Cosine Distance Invariants', () => {
    it('returns 0.0 distance for identical vectors', () => {
      const a = new Float32Array(EXPECTED_EMBEDDING_DIM);
      a[0] = 1.0;
      expect(cosineDistance(a, a)).toBe(0.0);
    });

    it('returns 1.0 distance for orthogonal vectors', () => {
      const a = new Float32Array(EXPECTED_EMBEDDING_DIM);
      const b = new Float32Array(EXPECTED_EMBEDDING_DIM);
      a[0] = 1.0;
      b[1] = 1.0;
      expect(cosineDistance(a, b)).toBe(1.0);
    });

    it('returns 2.0 distance for opposing vectors', () => {
      const a = new Float32Array(EXPECTED_EMBEDDING_DIM);
      const b = new Float32Array(EXPECTED_EMBEDDING_DIM);
      a[0] = 1.0;
      b[0] = -1.0;
      expect(cosineDistance(a, b)).toBe(2.0);
    });

    it('preserves symmetry distance(a, b) === distance(b, a)', () => {
      const a = new Float32Array(EXPECTED_EMBEDDING_DIM);
      const b = new Float32Array(EXPECTED_EMBEDDING_DIM);
      a[0] = 0.6;
      a[1] = 0.8;
      b[0] = 0.8;
      b[1] = 0.6;
      expect(cosineDistance(a, b)).toBe(cosineDistance(b, a));
    });
  });

  describe('6. Pairwise Similarity Matrix', () => {
    it('returns empty matrix for empty input array', () => {
      expect(computeSimilarityMatrix([])).toEqual([]);
    });

    it('returns [[1.0]] for a single valid unit vector', () => {
      const a = new Float32Array(EXPECTED_EMBEDDING_DIM);
      a[0] = 1.0;
      expect(computeSimilarityMatrix([a])).toEqual([[1.0]]);
    });

    it('computes symmetric NxN matrix where M[i][j] === M[j][i]', () => {
      const vectors: Float32Array[] = [];
      for (let k = 0; k < 5; k++) {
        const v = new Float32Array(EXPECTED_EMBEDDING_DIM);
        for (let i = 0; i < EXPECTED_EMBEDDING_DIM; i++) {
          v[i] = Math.sin(k * 100 + i);
        }
        vectors.push(l2Normalize(v));
      }

      const matrix = computeSimilarityMatrix(vectors);
      expect(matrix.length).toBe(5);

      for (let i = 0; i < 5; i++) {
        expect(matrix[i].length).toBe(5);
        expect(matrix[i][i]).toBe(1.0); // Diagonal is 1.0
        for (let j = 0; j < 5; j++) {
          expect(matrix[i][j]).toBeCloseTo(matrix[j][i], 6); // Symmetric
        }
      }
    });

    it('sets diagonal elements to 0.0 for zero vectors', () => {
      const valid = new Float32Array(EXPECTED_EMBEDDING_DIM);
      valid[0] = 1.0;
      const zero = new Float32Array(EXPECTED_EMBEDDING_DIM);

      const matrix = computeSimilarityMatrix([valid, zero]);
      expect(matrix[0][0]).toBe(1.0);
      expect(matrix[1][1]).toBe(0.0);
      expect(matrix[0][1]).toBe(0.0);
      expect(matrix[1][0]).toBe(0.0);
    });

    it('executes 100x100 matrix computation in under 50ms', () => {
      const vectors: Float32Array[] = [];
      for (let k = 0; k < 100; k++) {
        const v = new Float32Array(EXPECTED_EMBEDDING_DIM);
        v[k % EXPECTED_EMBEDDING_DIM] = 1.0;
        vectors.push(v);
      }

      const start = performance.now();
      const matrix = computeSimilarityMatrix(vectors);
      const elapsed = performance.now() - start;

      expect(matrix.length).toBe(100);
      expect(elapsed).toBeLessThan(50);
    });
  });
});
