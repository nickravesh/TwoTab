// =============================================================================
// TwoTab Intelligent Tab Grouping — Dedicated Web Worker for Model Inference
// =============================================================================
// Features:
// 1. Runs @huggingface/transformers in isolated worker thread
// 2. Loads Xenova/all-MiniLM-L6-v2 in FP32 ONNX format (onnx/model.onnx)
// 3. Reports fine-grained download/loading progress
// 4. Batched feature extraction with mean pooling & L2 normalization
// 5. Single-threaded WASM execution (numThreads: 1) for strict MV3 CSP compliance
// =============================================================================

import { pipeline, env } from '@huggingface/transformers';

// Strict local browser configuration
env.allowLocalModels = false;
if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

let extractor: any = null;

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  try {
    if (type === 'INIT') {
      if (!extractor) {
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          dtype: 'fp32',
          progress_callback: (progress: any) => {
            self.postMessage({ type: 'PROGRESS', payload: progress });
          },
        });
      }
      self.postMessage({ id, type: 'INIT_SUCCESS' });
    } else if (type === 'EMBED') {
      if (!extractor) {
        throw new Error('[TwoTab AI] Model pipeline is not initialized');
      }

      const texts: string[] = payload.texts;
      if (!texts || texts.length === 0) {
        self.postMessage({ id, type: 'EMBED_SUCCESS', payload: { embeddings: [] } });
        return;
      }

      const output = await extractor(texts, {
        pooling: 'mean',
        normalize: true,
      });

      const dims = 384;
      const flatData = output.data as Float32Array;
      const embeddings: Float32Array[] = [];

      for (let i = 0; i < texts.length; i++) {
        const start = i * dims;
        const end = start + dims;
        embeddings.push(flatData.slice(start, end));
      }

      self.postMessage({ id, type: 'EMBED_SUCCESS', payload: { embeddings } });
    } else if (type === 'DISPOSE') {
      if (extractor && typeof extractor.dispose === 'function') {
        await extractor.dispose();
      }
      extractor = null;
      self.postMessage({ id, type: 'DISPOSE_SUCCESS' });
    }
  } catch (err: any) {
    self.postMessage({
      id,
      type: 'ERROR',
      error: err?.message || String(err),
    });
  }
};
