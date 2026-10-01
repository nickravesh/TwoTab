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

// Strict local browser and Chrome Extension MV3 configuration
env.allowLocalModels = false;
env.useBrowserCache = true;
// CRITICAL: Disable WASM caching via blob URLs because Chrome MV3 CSP strictly
// blocks dynamic import('blob:chrome-extension://...').
env.useWasmCache = false;

let extractor: any = null;

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  try {
    if (type === 'INIT') {
      const wasmBaseUrl =
        payload?.wasmBaseUrl ||
        (typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL('ort/')
          : undefined);

      const onnxBackend = (env.backends.onnx ??= {}) as any;
      const wasmBackend = (onnxBackend.wasm ??= {});

      if (wasmBaseUrl) {
        const ortBase = wasmBaseUrl.endsWith('/') ? wasmBaseUrl : `${wasmBaseUrl}/`;
        const paths = {
          mjs: `${ortBase}ort-wasm-simd-threaded.asyncify.mjs`,
          wasm: `${ortBase}ort-wasm-simd-threaded.asyncify.wasm`,
        };

        wasmBackend.wasmPaths = paths;
        wasmBackend.numThreads = 1;
        wasmBackend.proxy = false;
      } else {
        wasmBackend.numThreads = 1;
        wasmBackend.proxy = false;
      }

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

      const dims = 384;
      const embeddings: Float32Array[] = [];

      // Process sequentially (batch_size = 1) to eliminate WebAssembly buffer/integer
      // overflow risks (ONNX Runtime SafeIntOnOverflow in CalcMemSizeForArrayWithAlignment)
      // and keep WASM linear heap allocations minimal.
      for (let i = 0; i < texts.length; i++) {
        const rawText = texts[i];
        const text = rawText && rawText.trim().length > 0 ? rawText.trim() : 'Untitled';

        let vec: Float32Array;
        try {
          const output = await extractor(text, {
            pooling: 'mean',
            normalize: true,
          });

          const flatData = output.data as Float32Array;
          vec = new Float32Array(flatData.slice(0, dims));

          // Immediately free underlying ONNX WebAssembly tensor memory
          if (output && typeof output.dispose === 'function') {
            output.dispose();
          }
        } catch (itemErr: any) {
          console.warn(`[TwoTab AI] Item inference failed at index ${i}, retrying with truncated prompt:`, itemErr);
          const fallbackOutput = await extractor(text.slice(0, 120), {
            pooling: 'mean',
            normalize: true,
          });
          const flatData = fallbackOutput.data as Float32Array;
          vec = new Float32Array(flatData.slice(0, dims));
          if (fallbackOutput && typeof fallbackOutput.dispose === 'function') {
            fallbackOutput.dispose();
          }
        }

        embeddings.push(vec);

        // Emit progress updates so the user gets smooth feedback during embedding
        self.postMessage({
          type: 'PROGRESS',
          payload: {
            status: 'embedding',
            loaded: i + 1,
            total: texts.length,
            progress: Math.round(((i + 1) / texts.length) * 100),
          },
        });
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
