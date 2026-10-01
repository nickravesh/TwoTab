// =============================================================================
// TwoTab Intelligent Tab Grouping — First-Use Consent Dialog
// =============================================================================
// Features:
// 1. Transparent disclosure of ~90 MB one-time model download
// 2. Strict privacy guarantees: 100% on-device, zero telemetry, offline capable
// 3. Clear user opt-in before acquiring model weights
// 4. Conforms to TwoTab Design System and semantic tokens (AGENTS.md)
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
import { Sparkles, ShieldCheck, Download, HardDrive, Wifi } from 'lucide-react';

interface ConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export const ConsentDialog: React.FC<ConsentDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-6 rounded-2xl bg-card border-border shadow-xl">
        <DialogHeader className="space-y-2.5">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <DialogTitle className="text-base font-bold text-foreground tracking-tight">
            Enable Intelligent Tab Grouping
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            TwoTab organizes your tabs semantically using an on-device embedding model.
            To enable this feature, a one-time download is required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border/60">
            <HardDrive className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <span className="font-semibold text-foreground text-xs">~90 MB One-Time Download</span>
              <p className="text-muted-foreground text-[11px] leading-normal">
                Downloads the official FP32 ONNX model (<code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[10px] border border-border/60">Xenova/all-MiniLM-L6-v2</code>) into your browser&apos;s local cache.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border/60">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <span className="font-semibold text-foreground text-xs">100% Local &amp; Private</span>
              <p className="text-muted-foreground text-[11px] leading-normal">
                All inference runs completely inside your browser. Your tabs, titles, and URLs are <strong>never</strong> transmitted to external servers, cloud APIs, or telemetry services.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border/60">
            <Wifi className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <span className="font-semibold text-foreground text-xs">Works Offline</span>
              <p className="text-muted-foreground text-[11px] leading-normal">
                Once downloaded and cached, Intelligent Grouping operates entirely offline without an active internet connection.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex sm:justify-end gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="rounded-lg text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
            className="rounded-lg text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            Download &amp; Enable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
