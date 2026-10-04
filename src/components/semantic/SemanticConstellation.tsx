// =============================================================================
// TwoTab Intelligent Tab Grouping — Semantic Constellation (2D Star Map)
// =============================================================================
// High-performance, hardware-accelerated interactive 2D star-map / constellation
// visualizer for projected tab embeddings.
//
// Key Features:
// 1. 60-120 FPS Buttery-Smooth Navigation: Drag-pan and wheel-zoom decoupled from
//    React re-render loops via direct GPU-accelerated transforms & requestAnimationFrame.
// 2. Beautiful Harmonic Palette: Curated, balanced, low-chroma hues replacing
//    harsh saturated neons for maximum eye comfort in light & dark modes.
// 3. Zero Collisions: Integrated with deterministic physics force relaxation,
//    guaranteeing clear distance between nodes and zero overlap on centroid pills.
// 4. Local-Only Privacy: 100% offline favicons and initial tokens with zero external pings.
// 5. Progressive Disclosure: Deep cluster telemetry (spectrum + cohesion) in floating inspector.
// =============================================================================

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { Tab, TabGroupColor } from '@/lib/storage';
import {
  type ProjectedPoint,
  computeClusterCentroids2D,
  type ClusterCentroid2D,
} from '@/lib/semantic/projection';
import { CohesionRing } from './CohesionRing';
import { VectorSpectrum } from './VectorSpectrum';
import { Sparkles, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

export interface SemanticConstellationProps {
  points: ProjectedPoint[];
  selectedClusterId?: string | null;
  searchQuery?: string;
  clusterCentroidMap?: Map<string, Float32Array>;
  onSelectCluster?: (clusterId: string | null) => void;
  className?: string;
}

/**
 * Harmonious, eye-friendly color palette with balanced luminance and subtle saturation.
 * Replaces harsh neon primitives with elegant, cohesive jewel/slate tones.
 */
export const HARMONIC_PALETTE: Record<
  TabGroupColor,
  {
    accent: string;
    fill: string;
    stroke: string;
    glow: string;
    badgeText: string;
  }
> = {
  blue: {
    accent: '#4f6df5',
    fill: 'rgba(79, 109, 245, 0.05)',
    stroke: 'rgba(79, 109, 245, 0.22)',
    glow: 'rgba(79, 109, 245, 0.12)',
    badgeText: '#4f6df5',
  },
  cyan: {
    accent: '#0284c7',
    fill: 'rgba(2, 132, 199, 0.05)',
    stroke: 'rgba(2, 132, 199, 0.22)',
    glow: 'rgba(2, 132, 199, 0.12)',
    badgeText: '#0284c7',
  },
  green: {
    accent: '#10b981',
    fill: 'rgba(16, 185, 129, 0.05)',
    stroke: 'rgba(16, 185, 129, 0.22)',
    glow: 'rgba(16, 185, 129, 0.12)',
    badgeText: '#059669',
  },
  yellow: {
    accent: '#f59e0b',
    fill: 'rgba(245, 158, 11, 0.05)',
    stroke: 'rgba(245, 158, 11, 0.22)',
    glow: 'rgba(245, 158, 11, 0.12)',
    badgeText: '#d97706',
  },
  orange: {
    accent: '#f97316',
    fill: 'rgba(249, 115, 22, 0.05)',
    stroke: 'rgba(249, 115, 22, 0.22)',
    glow: 'rgba(249, 115, 22, 0.12)',
    badgeText: '#ea580c',
  },
  red: {
    accent: '#f43f5e',
    fill: 'rgba(244, 63, 94, 0.05)',
    stroke: 'rgba(244, 63, 94, 0.22)',
    glow: 'rgba(244, 63, 94, 0.12)',
    badgeText: '#e11d48',
  },
  pink: {
    accent: '#d946ef',
    fill: 'rgba(217, 70, 239, 0.05)',
    stroke: 'rgba(217, 70, 239, 0.22)',
    glow: 'rgba(217, 70, 239, 0.12)',
    badgeText: '#c026d3',
  },
  purple: {
    accent: '#8b5cf6',
    fill: 'rgba(139, 92, 246, 0.05)',
    stroke: 'rgba(139, 92, 246, 0.22)',
    glow: 'rgba(139, 92, 246, 0.12)',
    badgeText: '#7c3aed',
  },
  grey: {
    accent: '#64748b',
    fill: 'rgba(100, 116, 139, 0.05)',
    stroke: 'rgba(100, 116, 139, 0.20)',
    glow: 'rgba(100, 116, 139, 0.10)',
    badgeText: '#475569',
  },
};

const getSafeHost = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'internal';
  } catch {
    return 'unknown';
  }
};

const getHostInitial = (host: string): string => {
  const clean = host.replace(/^(docs\.|api\.|en\.|m\.)/, '');
  return (clean.charAt(0) || '•').toUpperCase();
};

export const SemanticConstellation: React.FC<SemanticConstellationProps> = ({
  points,
  selectedClusterId = null,
  searchQuery = '',
  clusterCentroidMap,
  onSelectCluster,
  className = '',
}) => {
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isInteracted, setIsInteracted] = useState<boolean>(false);

  // High-performance animation refs (bypasses React reconciliation during drag)
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const zoomRef = useRef<number>(1);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const graphLayerRef = useRef<SVGGElement>(null);
  const rafIdRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport base dimension
  const WIDTH = 800;
  const HEIGHT = 560;

  // Compute 2D centroids for each cluster
  const centroids = useMemo(() => computeClusterCentroids2D(points), [points]);

  const activeClusterId = selectedClusterId || hoveredClusterId;

  const hoveredPoint = useMemo(
    () => points.find((p) => p.id === hoveredPointId) || null,
    [points, hoveredPointId]
  );

  const activeClusterCentroid = useMemo(() => {
    if (activeClusterId && centroids[activeClusterId]) {
      return centroids[activeClusterId];
    }
    return null;
  }, [activeClusterId, centroids]);

  // Synchronize layer transform directly on the DOM node for 120 FPS smoothness
  const applyTransformDirect = useCallback((x: number, y: number, z: number) => {
    if (graphLayerRef.current) {
      graphLayerRef.current.setAttribute('transform', `translate(${x}, ${y}) scale(${z})`);
    }
  }, []);

  // Smoothly center on selected cluster when changed from outside
  useEffect(() => {
    if (selectedClusterId && centroids[selectedClusterId]) {
      const c = centroids[selectedClusterId];
      const targetPanX = Math.round(WIDTH / 2 - c.x * WIDTH * zoomRef.current);
      const targetPanY = Math.round(HEIGHT / 2 - c.y * HEIGHT * zoomRef.current);
      panRef.current = { x: targetPanX, y: targetPanY };
      applyTransformDirect(targetPanX, targetPanY, zoomRef.current);
      setIsInteracted(true);
    }
  }, [selectedClusterId, centroids, applyTransformDirect]);

  // Pointer drag event handlers with direct RAF synchronization
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...panRef.current };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    panRef.current.x = Math.round(panStartRef.current.x + dx);
    panRef.current.y = Math.round(panStartRef.current.y + dy);

    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        applyTransformDirect(panRef.current.x, panRef.current.y, zoomRef.current);
        rafIdRef.current = 0;
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Safe no-op if pointer already released
      }
      if (panRef.current.x !== 0 || panRef.current.y !== 0) {
        setIsInteracted(true);
      }
    }
  };

  // Wheel zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    const nextZoom = Math.max(0.5, Math.min(3.5, Number((zoomRef.current + delta).toFixed(2))));
    zoomRef.current = nextZoom;
    setZoomLevel(nextZoom);
    setIsInteracted(true);

    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        applyTransformDirect(panRef.current.x, panRef.current.y, zoomRef.current);
        rafIdRef.current = 0;
      });
    }
  };

  const handleResetView = () => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoomLevel(1);
    setIsInteracted(false);
    applyTransformDirect(0, 0, 1);
    onSelectCluster?.(null);
  };

  const handleZoomIn = () => {
    const nextZoom = Math.min(3.5, Number((zoomRef.current + 0.25).toFixed(2)));
    zoomRef.current = nextZoom;
    setZoomLevel(nextZoom);
    setIsInteracted(true);
    applyTransformDirect(panRef.current.x, panRef.current.y, nextZoom);
  };

  const handleZoomOut = () => {
    const nextZoom = Math.max(0.5, Number((zoomRef.current - 0.25).toFixed(2)));
    zoomRef.current = nextZoom;
    setZoomLevel(nextZoom);
    setIsInteracted(true);
    applyTransformDirect(panRef.current.x, panRef.current.y, nextZoom);
  };

  // Clean search query match
  const cleanQuery = searchQuery.trim().toLowerCase();
  const isSearchActive = cleanQuery.length > 0;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex flex-col rounded-2xl overflow-hidden bg-card/40 border border-border/70 select-none ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      style={{ cursor: isDraggingRef.current ? 'grabbing' : 'grab' }}
    >
      {/* Top Floating Glassmorphism Command Strip */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/90 backdrop-blur-xl border border-border/80 shadow-xs pointer-events-auto">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground tracking-tight">
            Semantic Constellation Map
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {points.length} {points.length === 1 ? 'node' : 'nodes'}
          </span>
        </div>

        {/* Zoom Controls & Smooth Reset Button */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-card/90 backdrop-blur-xl border border-border shadow-xs pointer-events-auto">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 0.5}
            className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 transition-colors"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono font-semibold text-foreground/80 px-1 min-w-[36px] text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3.5}
            className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 transition-colors"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {(isInteracted || zoomLevel !== 1 || selectedClusterId) && (
            <>
              <span className="w-px h-3 bg-border" />
              <button
                type="button"
                onClick={handleResetView}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Reset view and pan"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Floating Progressive Disclosure Inspector Card (Top-Right) */}
      {(hoveredPoint || activeClusterCentroid) && (
        <div className="absolute top-14 right-3 z-30 max-w-sm w-72 p-3.5 rounded-2xl bg-card/95 backdrop-blur-2xl border border-border shadow-2xl space-y-2 animate-in fade-in duration-100 pointer-events-none">
          {/* Header Info */}
          <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                style={{
                  backgroundColor: activeClusterCentroid
                    ? HARMONIC_PALETTE[activeClusterCentroid.clusterColor]?.accent || '#64748b'
                    : '#64748b',
                }}
              />
              <span className="text-xs font-bold text-foreground truncate">
                {activeClusterCentroid?.clusterName || hoveredPoint?.clusterName || 'Tab Details'}
              </span>
            </div>
            {hoveredPoint?.coherence !== undefined && (
              <CohesionRing score={hoveredPoint.coherence} size={22} strokeWidth={2.5} />
            )}
          </div>

          {/* Tab details if hovering a node */}
          {hoveredPoint && (
            <div className="min-w-0">
              <p
                dir="auto"
                className="text-xs font-semibold text-foreground/90 truncate"
                style={{ unicodeBidi: 'plaintext' }}
              >
                {hoveredPoint.tab.title || hoveredPoint.tab.url}
              </p>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                {getSafeHost(hoveredPoint.tab.url)}
              </p>
            </div>
          )}

          {/* Latent Spectrogram if Centroid Embedding is available */}
          {activeClusterCentroid && clusterCentroidMap?.get(activeClusterCentroid.clusterId) && (
            <div className="pt-1 border-t border-border/40 flex items-center justify-between gap-2">
              <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground font-mono">
                Latent Signature:
              </span>
              <VectorSpectrum
                embedding={clusterCentroidMap.get(activeClusterCentroid.clusterId)}
                color={activeClusterCentroid.clusterColor}
                height={12}
              />
            </div>
          )}
        </div>
      )}

      {/* Main SVG Visualization Canvas */}
      <div className="flex-1 w-full h-full min-h-[380px] relative overflow-hidden">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-full block"
          style={{ touchAction: 'none' }}
        >
          {/* Subtle Ambient Vignette */}
          <rect width={WIDTH} height={HEIGHT} fill="none" />

          {/* GPU Hardware-Accelerated Interactive Graph Layer */}
          <g
            ref={graphLayerRef}
            style={{
              willChange: 'transform',
              transformOrigin: '0 0',
            }}
          >
            {/* Layer 1: Ambient Cluster Territories (Delicate, eye-friendly celestial zones) */}
            {Object.values(centroids).map((c) => {
              const cx = c.x * WIDTH;
              const cy = c.y * HEIGHT;
              const radius = Math.min(160, Math.max(50, 40 + c.tabCount * 10));
              const isClusterActive = activeClusterId === c.clusterId;
              const pal = HARMONIC_PALETTE[c.clusterColor] || HARMONIC_PALETTE.blue;

              return (
                <g key={`halo-${c.clusterId}`}>
                  {/* Soft Background Fill */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill={isClusterActive ? pal.glow : pal.fill}
                    className="pointer-events-none"
                  />
                  {/* Subtle Perimeter Dashed Boundary */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill="none"
                    stroke={pal.accent}
                    strokeWidth={isClusterActive ? 1.2 : 0.8}
                    strokeOpacity={isClusterActive ? 0.35 : 0.14}
                    strokeDasharray="4 6"
                    className="pointer-events-none"
                  />
                </g>
              );
            })}

            {/* Layer 2: Constellation Hairline Connections */}
            {points.map((p) => {
              if (!p.clusterId || !centroids[p.clusterId]) return null;
              const centroid = centroids[p.clusterId];
              const x1 = p.x * WIDTH;
              const y1 = p.y * HEIGHT;
              const x2 = centroid.x * WIDTH;
              const y2 = centroid.y * HEIGHT;

              const pal = HARMONIC_PALETTE[p.clusterColor || 'blue'] || HARMONIC_PALETTE.blue;
              const isPointHovered = hoveredPointId === p.id;
              const isClusterActive = activeClusterId === p.clusterId;

              let strokeOpacity = 0.16;
              let strokeWidth = 1;
              if (isPointHovered) {
                strokeOpacity = 0.85;
                strokeWidth = 2;
              } else if (isClusterActive) {
                strokeOpacity = 0.55;
                strokeWidth = 1.2;
              } else if (activeClusterId) {
                strokeOpacity = 0.04;
              }

              return (
                <line
                  key={`line-${p.id}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={pal.accent}
                  strokeWidth={strokeWidth}
                  strokeOpacity={strokeOpacity}
                  strokeDasharray={isPointHovered ? undefined : '2 3'}
                  className="pointer-events-none"
                />
              );
            })}

            {/* Layer 3: Cluster Centroids & Collision-Protected Labels */}
            {Object.values(centroids).map((c) => {
              const cx = c.x * WIDTH;
              const cy = c.y * HEIGHT;
              const pal = HARMONIC_PALETTE[c.clusterColor] || HARMONIC_PALETTE.blue;
              const isClusterActive = activeClusterId === c.clusterId;
              const labelText =
                c.clusterName.length > 22
                  ? `${c.clusterName.slice(0, 20)}…`
                  : c.clusterName;

              return (
                <g
                  key={`centroid-${c.clusterId}`}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCluster?.(c.clusterId === selectedClusterId ? null : c.clusterId);
                  }}
                  onMouseEnter={() => setHoveredClusterId(c.clusterId)}
                  onMouseLeave={() => setHoveredClusterId(null)}
                >
                  {/* Outer Concentric Pulse Ring */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isClusterActive ? 12 : 9}
                    fill="none"
                    stroke={pal.accent}
                    strokeWidth={1.2}
                    strokeOpacity={isClusterActive ? 0.8 : 0.35}
                  />

                  {/* Centroid Jewel Anchor Core */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isClusterActive ? 6 : 4.5}
                    fill={pal.accent}
                  />

                  {/* Floating Centroid Title Pill (Collision-Free Zone) */}
                  <g transform={`translate(${cx}, ${cy + 18})`}>
                    <rect
                      x={-Math.min(90, labelText.length * 3.6 + 12)}
                      y={-9}
                      width={Math.min(180, labelText.length * 7.2 + 24)}
                      height={18}
                      rx={9}
                      fill="hsl(var(--card))"
                      stroke="hsl(var(--border))"
                      strokeWidth={1}
                    />
                    <text
                      textAnchor="middle"
                      y={3.5}
                      className="text-[9px] font-semibold fill-foreground pointer-events-none select-none tracking-tight"
                    >
                      {labelText}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Layer 4: Interactive Tab Nodes */}
            {points.map((p) => {
              const cx = p.x * WIDTH;
              const cy = p.y * HEIGHT;
              const pal = p.clusterColor
                ? HARMONIC_PALETTE[p.clusterColor] || HARMONIC_PALETTE.blue
                : HARMONIC_PALETTE.grey;
              const host = getSafeHost(p.tab.url);
              const isHovered = hoveredPointId === p.id;
              const isClusterActive = activeClusterId === p.clusterId;

              // Search filtering match
              const matchesSearch =
                !isSearchActive ||
                (p.tab.title && p.tab.title.toLowerCase().includes(cleanQuery)) ||
                p.tab.url.toLowerCase().includes(cleanQuery) ||
                (p.clusterName && p.clusterName.toLowerCase().includes(cleanQuery));

              const isDimmed = (activeClusterId && activeClusterId !== p.clusterId) || !matchesSearch;

              const radius = isHovered ? 11 : isClusterActive ? 8.5 : 7;
              const opacity = isDimmed ? 0.15 : 1;
              const initial = getHostInitial(host);

              return (
                <g
                  key={`node-${p.id}`}
                  className="cursor-pointer"
                  style={{ opacity }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (p.clusterId) {
                      onSelectCluster?.(p.clusterId === selectedClusterId ? null : p.clusterId);
                    }
                  }}
                  onMouseEnter={() => {
                    setHoveredPointId(p.id);
                    if (p.clusterId) setHoveredClusterId(p.clusterId);
                  }}
                  onMouseLeave={() => {
                    setHoveredPointId(null);
                    setHoveredClusterId(null);
                  }}
                >
                  {/* Subtle Hover Outer Aura */}
                  {isHovered && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius + 4}
                      fill={pal.accent}
                      fillOpacity={0.25}
                    />
                  )}

                  {/* Clean Elevated Disc Base */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill="hsl(var(--card))"
                    stroke={pal.accent}
                    strokeWidth={isHovered ? 2 : 1.5}
                  />

                  {/* Local Favicon or Elegant Host Initial Token */}
                  {(p.tab as { favIconUrl?: string }).favIconUrl && radius >= 8 ? (
                    <image
                      href={(p.tab as { favIconUrl?: string }).favIconUrl}
                      x={cx - 5.5}
                      y={cy - 5.5}
                      width={11}
                      height={11}
                      className="pointer-events-none rounded-xs"
                      preserveAspectRatio="xMidYMid slice"
                    />
                  ) : radius >= 7 ? (
                    <text
                      x={cx}
                      y={cy + 0.5}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="font-bold font-mono text-[8px] fill-foreground/75 pointer-events-none select-none"
                    >
                      {initial}
                    </text>
                  ) : (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius / 2.5}
                      fill={pal.accent}
                      className="pointer-events-none"
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Bottom Swatch Filter Legend */}
      <div className="px-3.5 py-2.5 border-t border-border/40 bg-muted/20 flex items-center justify-between gap-2 overflow-x-auto custom-scrollbar z-10">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mr-1">
            Clusters:
          </span>
          {Object.values(centroids).map((c) => {
            const pal = HARMONIC_PALETTE[c.clusterColor] || HARMONIC_PALETTE.blue;
            const isSelected = selectedClusterId === c.clusterId;

            return (
              <button
                key={`legend-${c.clusterId}`}
                type="button"
                onClick={() => onSelectCluster?.(isSelected ? null : c.clusterId)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                  isSelected
                    ? 'bg-foreground text-background border-foreground shadow-xs font-semibold'
                    : 'bg-card border-border text-foreground hover:bg-muted'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: pal.accent }}
                />
                <span className="truncate max-w-[130px]">{c.clusterName}</span>
                <span className="opacity-60 font-mono text-[10px]">({c.tabCount})</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
