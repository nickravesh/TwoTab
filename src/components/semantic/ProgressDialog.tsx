// =============================================================================
// TwoTab Intelligent Tab Grouping — Live Progress Feedback Dialog
// =============================================================================
// Features:
// 1. Honest progress indicators for downloading, loading, embedding, and clustering
// 2. Clear status messages without fabricated progress percentages
// 3. Graceful abort/cancel capability without storage mutation
// =============================================================================

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Cpu, Sparkles, Layers, AlertCircle } from 'lucide-react';
import type { ModelDownloadProgress } from '@/lib/semantic';

export type PipelineStage =
  | 'idle'
  | 'downloading'
  | 'loading'
  | 'embedding'
  | 'clustering'
  | 'error';

interface ProgressDialogProps {
  open: boolean;
  stage: PipelineStage;
  downloadProgress?: ModelDownloadProgress | null;
  error?: string | null;
  onCancel?: () => void;
}

export const ProgressDialog: React.FC<ProgressDialogProps> = ({
  open,
  stage,
  downloadProgress,
  error,
  onCancel,
}) => {
  const getStageIcon = () => {
    switch (stage) {
      case 'downloading':
        return <Download className="w-5 h-5 text-primary animate-bounce" />;
      case 'loading':
        return <Cpu className="w-5 h-5 text-primary animate-spin" />;
      case 'embedding':
        return <Sparkles className="w-5 h-5 text-primary animate-pulse" />;
      case 'clustering':
        return <Layers className="w-5 h-5 text-primary animate-pulse" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
    }
  };

  const getStageTitle = () => {
    switch (stage) {
      case 'downloading':
        return 'Downloading Local AI Model...';
      case 'loading':
        return 'Initializing ONNX WebAssembly Runtime...';
      case 'embedding':
        return 'Analyzing Tab Semantics...';
      case 'clustering':
        return 'Discovering Related Tab Groups...';
      case 'error':
        return 'Analysis Failed';
      default:
        return 'Processing Tabs...';
    }
  };

  const getStageDescription = () => {
    switch (stage) {
      case 'downloading':
        if (downloadProgress?.progress !== undefined && !isNaN(downloadProgress.progress)) {
          const mbLoaded = downloadProgress.loaded ? (downloadProgress.loaded / (1024 * 1024)).toFixed(1) : '?';
          const mbTotal = downloadProgress.total ? (downloadProgress.total / (1024 * 1024)).toFixed(1) : '90.4';
          return `Downloading model weights (${mbLoaded} MB / ${mbTotal} MB — ${Math.round(downloadProgress.progress)}%)`;
        }
        return 'Acquiring Xenova/all-MiniLM-L6-v2 FP32 ONNX model (~90 MB) into browser cache...';
      case 'loading':
        return 'Compiling single-threaded WebAssembly execution pipeline...';
      case 'embedding':
        return 'Generating normalized 384-dimensional vector embeddings for tab titles and domains...';
      case 'clustering':
        return 'Computing cosine similarities and running complete-linkage agglomerative clustering...';
      case 'error':
        return error || 'An unexpected error occurred during semantic analysis.';
      default:
        return 'Please wait while TwoTab processes your tabs.';
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel?.()}>
      <DialogContent className="sm:max-w-[440px] p-6 rounded-2xl bg-card border-border shadow-xl">
        <DialogHeader className="space-y-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            {getStageIcon()}
          </div>
          <DialogTitle className="text-base font-bold text-foreground">
            {getStageTitle()}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {getStageDescription()}
          </DialogDescription>
        </DialogHeader>

        {stage !== 'error' && (
          <div className="py-4 space-y-2">
            <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden">
              {stage === 'downloading' && downloadProgress?.progress !== undefined ? (
                <div
                  className="bg-primary h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, downloadProgress.progress))}%` }}
                />
              ) : (
                <div className="bg-primary h-full rounded-full animate-pulse w-2/3" />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/80 text-center font-mono">
              Inference is 100% on-device • Zero network transmission
            </p>
          </div>
        )}

        <DialogFooter className="pt-2 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCancel?.()}
            className="rounded-lg text-xs"
          >
            {stage === 'error' ? 'Close' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
