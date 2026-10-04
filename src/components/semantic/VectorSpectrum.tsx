// =============================================================================
// TwoTab Intelligent Tab Grouping — Latent Vector Micro-Spectrogram
// =============================================================================

import React, { useMemo } from 'react';
import type { TabGroupColor } from '@/lib/storage';
import { computeVectorSpectrum } from '@/lib/semantic/projection';

interface VectorSpectrumProps {
  embedding?: Float32Array;
  spectrum?: number[];
  color?: TabGroupColor;
  height?: number; // Height in pixels (default 16)
  numBands?: number; // Number of latent energy bands (default 12)
  className?: string;
}

const BAR_COLOR_CLASSES: Record<TabGroupColor, string> = {
  blue: 'bg-blue-500/70 dark:bg-blue-400/80 group-hover:bg-blue-500',
  cyan: 'bg-cyan-500/70 dark:bg-cyan-400/80 group-hover:bg-cyan-500',
  green: 'bg-emerald-500/70 dark:bg-emerald-400/80 group-hover:bg-emerald-500',
  yellow: 'bg-amber-500/70 dark:bg-amber-400/80 group-hover:bg-amber-500',
  orange: 'bg-orange-500/70 dark:bg-orange-400/80 group-hover:bg-orange-500',
  red: 'bg-red-500/70 dark:bg-red-400/80 group-hover:bg-red-500',
  pink: 'bg-pink-500/70 dark:bg-pink-400/80 group-hover:bg-pink-500',
  purple: 'bg-purple-500/70 dark:bg-purple-400/80 group-hover:bg-purple-500',
  grey: 'bg-zinc-500/70 dark:bg-zinc-400/80 group-hover:bg-zinc-500',
};

export const VectorSpectrum: React.FC<VectorSpectrumProps> = ({
  embedding,
  spectrum,
  color = 'blue',
  height = 16,
  numBands = 12,
  className = '',
}) => {
  const bands = useMemo(() => {
    if (spectrum && spectrum.length > 0) return spectrum;
    if (embedding && embedding.length > 0) {
      return computeVectorSpectrum(embedding, numBands);
    }
    // Fallback baseline wave
    return Array.from({ length: numBands }, (_, i) => 0.3 + 0.4 * Math.sin((i / numBands) * Math.PI));
  }, [spectrum, embedding, numBands]);

  const barColor = BAR_COLOR_CLASSES[color] || BAR_COLOR_CLASSES.blue;

  return (
    <div
      className={`group flex items-end gap-[2px] px-1.5 py-1 rounded-md bg-muted/30 border border-border/40 hover:border-border transition-colors ${className}`}
      style={{ height: height + 8 }}
      title="Latent Vector Signature (384-dimensional semantic fingerprint)"
      aria-label="Latent Vector Signature"
    >
      {bands.map((val, idx) => (
        <span
          key={idx}
          className={`w-[3px] rounded-full transition-all duration-300 ease-out ${barColor}`}
          style={{
            height: `${Math.round(val * height)}px`,
            minHeight: '3px',
          }}
        />
      ))}
    </div>
  );
};
