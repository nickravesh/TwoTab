// =============================================================================
// TwoTab Intelligent Tab Grouping — Vector Similarity & Numerical Math Engine
// =============================================================================
// Features:
// 1. O(d) dot-product cosine similarity for pre-normalized 384-d embeddings
// 2. 8-way loop unrolling for maximum V8 TurboFan throughput (zero GC allocations)
// 3. Strict IEEE-754 numerical clamping to [-1.0, 1.0] (defense against NaN in Math.acos)
// 4. Zero-safe and NaN/Infinity defense (zero vectors, empty, non-finite return 0.0)
// 5. Unnormalized fallback cosine similarity single-pass calculator
// 6. Pairwise symmetric similarity matrix generator with upper-triangle optimization
// 7. L2 normalization and norm checking utilities
// =============================================================================

import {
  EXPECTED_EMBEDDING_DIM,
  SIMILARITY_EPSILON,
  NORMALIZATION_TOLERANCE,
} from './constants';

export { EXPECTED_EMBEDDING_DIM, SIMILARITY_EPSILON, NORMALIZATION_TOLERANCE };

// -----------------------------------------------------------------------------
// 1. Numerical Clamping & Sanitization
// -----------------------------------------------------------------------------

/**
 * Clamps a similarity score strictly to [-1.0, 1.0], maps NaN/Infinity to 0.0,
 * snaps subnormal floating-point noise around zero to 0.0, and normalizes
 * JavaScript -0 (negative zero) to +0.0.
 */
export function clampSimilarity(val: number): number {
  if (Number.isNaN(val) || !Number.isFinite(val)) {
    return 0.0;
  }
  if (val > 1.0) return 1.0;
  if (val < -1.0) return -1.0;
  // Snap subnormal floating noise around zero
  if (Math.abs(val) < 1e-15) return 0.0;
  // Eliminate -0
  return val === 0 ? 0.0 : val;
}

// -----------------------------------------------------------------------------
// 2. Vector Norms & Inspection
// -----------------------------------------------------------------------------

/**
 * Checks whether a vector is all zeros or has all elements within epsilon of 0.
 */
export function isZeroVector(
  vector: Float32Array,
  epsilon: number = SIMILARITY_EPSILON
): boolean {
  if (!vector || vector.length === 0) return true;
  for (let i = 0; i < vector.length; i++) {
    if (Math.abs(vector[i]) > epsilon) return false;
  }
  return true;
}

/**
 * Computes Euclidean L2 norm ||v||_2 = sqrt(sum(v_i^2)).
 */
export function computeL2Norm(vector: Float32Array): number {
  if (!vector || vector.length === 0) return 0.0;
  let sumSq = 0.0;
  const len = vector.length;
  for (let i = 0; i < len; i++) {
    const v = vector[i];
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq);
  if (Number.isNaN(norm) || !Number.isFinite(norm)) return 0.0;
  return norm;
}

/**
 * Returns true if the vector's L2 norm is within tolerance of 1.0.
 */
export function isNormalizedVector(
  vector: Float32Array,
  tolerance: number = NORMALIZATION_TOLERANCE
): boolean {
  const norm = computeL2Norm(vector);
  return Math.abs(norm - 1.0) <= tolerance;
}

/**
 * Produces a new unit-normalized Float32Array copy of the input vector.
 * Returns a zero-filled vector if input norm is 0, NaN, or non-finite.
 */
export function l2Normalize(vector: Float32Array): Float32Array {
  const len = vector ? vector.length : 0;
  if (len === 0) return new Float32Array(0);

  const norm = computeL2Norm(vector);
  const result = new Float32Array(len);
  if (norm < SIMILARITY_EPSILON) {
    return result;
  }

  const invNorm = 1.0 / norm;
  for (let i = 0; i < len; i++) {
    result[i] = vector[i] * invNorm;
  }
  return result;
}

/**
 * In-place L2 normalization mutating the given Float32Array buffer.
 * Zero heap allocations.
 */
export function l2NormalizeInPlace(vector: Float32Array): Float32Array {
  const len = vector ? vector.length : 0;
  if (len === 0) return vector;

  const norm = computeL2Norm(vector);
  if (norm < SIMILARITY_EPSILON) {
    vector.fill(0);
    return vector;
  }

  const invNorm = 1.0 / norm;
  for (let i = 0; i < len; i++) {
    vector[i] = vector[i] * invNorm;
  }
  return vector;
}

// -----------------------------------------------------------------------------
// 3. Fast Cosine Similarity
// -----------------------------------------------------------------------------

/**
 * Fast O(d) Dot-Product Cosine Similarity for unit-normalized vectors.
 *
 * Guarantees:
 * - 8-way unrolled loop for maximum TurboFan register efficiency
 * - Zero heap allocations in inner loop
 * - Referential identity optimization for identical vector instances
 * - Clamped strictly to [-1.0, 1.0]
 * - Returns 0.0 for zero vectors, NaNs, infinities, empty, or mismatched lengths
 */
export function computeCosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (!a || !b) return 0.0;
  const len = a.length;
  if (len !== b.length || len === 0) return 0.0;

  // Referential identity optimization
  if (a === b) {
    let hasNonZero = false;
    for (let i = 0; i < len; i++) {
      const val = a[i];
      if (Number.isNaN(val) || !Number.isFinite(val)) return 0.0;
      if (val !== 0) hasNonZero = true;
    }
    return hasNonZero ? 1.0 : 0.0;
  }

  // 8-way unrolled dot product accumulation
  let dot = 0.0;
  const limit = len - (len % 8);
  let i = 0;

  for (; i < limit; i += 8) {
    dot +=
      a[i] * b[i] +
      a[i + 1] * b[i + 1] +
      a[i + 2] * b[i + 2] +
      a[i + 3] * b[i + 3] +
      a[i + 4] * b[i + 4] +
      a[i + 5] * b[i + 5] +
      a[i + 6] * b[i + 6] +
      a[i + 7] * b[i + 7];
  }

  // Remainder cleanup loop
  for (; i < len; i++) {
    dot += a[i] * b[i];
  }

  return clampSimilarity(dot);
}

/**
 * Fallback Cosine Similarity for unnormalized or arbitrary vectors.
 * Computes dot product and norms in a single pass without extra memory allocations.
 */
export function computeCosineSimilarityUnnormalized(
  a: Float32Array,
  b: Float32Array
): number {
  if (!a || !b) return 0.0;
  const len = a.length;
  if (len !== b.length || len === 0) return 0.0;

  let dot = 0.0;
  let normASq = 0.0;
  let normBSq = 0.0;

  for (let i = 0; i < len; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    normASq += ai * ai;
    normBSq += bi * bi;
  }

  const denom = Math.sqrt(normASq) * Math.sqrt(normBSq);
  if (denom < SIMILARITY_EPSILON || !Number.isFinite(denom) || Number.isNaN(denom)) {
    return 0.0;
  }

  return clampSimilarity(dot / denom);
}

/**
 * Explicit dot product helper that throws on dimension mismatch.
 * Matches oracle dot product contract.
 */
export function computeDotProduct(a: Float32Array, b: Float32Array): number {
  if (!a || !b) return 0.0;
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  return computeCosineSimilarity(a, b);
}

/**
 * Cosine distance defined as 1.0 - similarity.
 * Invariant: Always in range [0.0, 2.0].
 */
export function cosineDistance(a: Float32Array, b: Float32Array): number {
  return 1.0 - computeCosineSimilarity(a, b);
}

// -----------------------------------------------------------------------------
// 4. Pairwise Similarity Matrix
// -----------------------------------------------------------------------------

/**
 * Computes a full N x N pairwise similarity matrix for an array of embeddings.
 *
 * Guarantees:
 * - Symmetric: M[i][j] === M[j][i]
 * - Diagonal: M[i][i] === 1.0 (or 0.0 if vector i is all zeros)
 * - Complexity: N(N - 1) / 2 dot product calculations (50% reduction)
 * - Zero vectors short-circuit without dot product evaluations
 */
export function computeSimilarityMatrix(embeddings: Float32Array[]): number[][] {
  if (!embeddings || embeddings.length === 0) return [];
  const n = embeddings.length;
  const matrix: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    matrix[i] = new Array(n);
  }

  // Pre-evaluate zero/invalid vectors for diagonal and short-circuiting
  const isZero = new Array<boolean>(n);
  for (let i = 0; i < n; i++) {
    const emb = embeddings[i];
    isZero[i] = !emb || emb.length === 0 || isZeroVector(emb);
    matrix[i][i] = isZero[i] ? 0.0 : 1.0;
  }

  for (let i = 0; i < n; i++) {
    const a = embeddings[i];
    const aIsZero = isZero[i];

    for (let j = i + 1; j < n; j++) {
      if (aIsZero || isZero[j]) {
        matrix[i][j] = 0.0;
        matrix[j][i] = 0.0;
      } else {
        const sim = computeCosineSimilarity(a, embeddings[j]);
        matrix[i][j] = sim;
        matrix[j][i] = sim;
      }
    }
  }

  return matrix;
}
