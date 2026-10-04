// =============================================================================
// TwoTab Intelligent Tab Grouping — Apple Watch Style Cohesion Activity Ring
// =============================================================================

import React from 'react';

interface CohesionRingProps {
  score: number; // 0.0 to 1.0
  size?: number; // Outer diameter in pixels (default 32)
  strokeWidth?: number; // Stroke thickness (default 3)
  showLabel?: boolean; // Show percentage next to or inside ring
  className?: string;
}

export const CohesionRing: React.FC<CohesionRingProps> = ({
  score,
  size = 32,
  strokeWidth = 3,
  showLabel = false,
  className = '',
}) => {
  const safeScore = typeof score === 'number' && Number.isFinite(score) ? score : 0;
  const clampedScore = Math.max(0, Math.min(1, safeScore));
  const percentage = Math.round(clampedScore * 100);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - clampedScore * circumference;

  // Dynamic semantic color based on cohesion tier
  const strokeColor =
    clampedScore >= 0.82
      ? 'text-emerald-500 stroke-emerald-500'
      : clampedScore >= 0.70
      ? 'text-primary stroke-primary'
      : 'text-amber-500 stroke-amber-500';

  const badgeBg =
    clampedScore >= 0.82
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
      : clampedScore >= 0.70
      ? 'bg-primary/10 text-primary border-primary/20'
      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={`Cluster Cohesion: ${percentage}% (Mean pairwise semantic similarity)`}
      aria-label={`Cluster Cohesion: ${percentage}%`}
    >
      <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="rotate-[-90deg] transform transition-transform duration-500 ease-out"
        >
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            fill="transparent"
            className="stroke-muted/60"
          />
          {/* Dynamic Activity Stroke */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`${strokeColor} transition-all duration-700 ease-out`}
          />
        </svg>

        {/* Center score if size is large enough and label not shown outside */}
        {size >= 36 && !showLabel && (
          <span className="absolute text-[10px] font-bold tracking-tight text-foreground font-mono">
            {percentage}
          </span>
        )}
      </div>

      {showLabel && (
        <span
          className={`text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded-full border ${badgeBg}`}
        >
          {percentage}% Cohesion
        </span>
      )}
    </div>
  );
};
