---
name: color-theme-design-system
description: >-
  Comprehensive guide and production framework for multi-palette color themes, semantic HSL token architecture,
  floating glassmorphism contrast, circular ripple View Transitions, and dynamic ambient lighting.
---

# Skill: Color Theme Architecture & Design System Engineering

Use this skill whenever designing, modifying, auditing, or adding curated color themes, semantic HSL variable tokens, glassmorphism surface elevations, or fluid view transition ripples.

---

## 1. Core Philosophy: The Contrast & Elevation Rule

A cohesive modern design system relies on **layered optical depth** rather than flat surfaces:

1. **The Golden Contrast Rule**: The outer desktop canvas (`--background`) must **never** share the exact lightness/hex value of the elevated floating decks (`--card`).
   - **In Light Themes**: Canvas is a soft, architectural frosted neutral (e.g., `#f1f3f7` / `220 16% 95%`); floating decks and interactive cards are pure luminous white (e.g., `#ffffff` / `0 0% 100%`) with specular top borders (`inset 0 1.5px 1px rgba(255,255,255,0.85)`).
   - **In Dark Themes**: Canvas is a deep matte titanium slate or pitch-black OLED (e.g., `#101013` / `240 6% 7%`); floating decks are elevated smoky frosted glass (e.g., `#1d1d21` / `240 5% 12%`) with crisp rim highlights.
2. **Zero Hardcoded Colors**: Never use hardcoded arbitrary classes (e.g., `text-slate-400`, `bg-zinc-900`, `border-white/10`). All surfaces, typography, actions, and borders must strictly consume semantic HSL design tokens.

---

## 2. Semantic HSL Design Token Architecture

Declare all themes in CSS using space-separated HSL channels without the `hsl()` wrapper, allowing Tailwind to apply dynamic alpha channels (e.g., `bg-primary/10`, `border-border/60`):

```css
:root,
[data-theme="light"] {
  --background: 220 16% 95%;          /* Outer Canvas */
  --foreground: 222.2 47% 11%;        /* Primary Headings & Body */
  --card: 0 0% 100%;                  /* Elevated Floating Panels */
  --card-foreground: 222.2 47% 11%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 47% 11%;
  --primary: 243 75% 59%;             /* Main Brand / Primary Action */
  --primary-foreground: 0 0% 100%;    /* High-contrast action text */
  --secondary: 220 14% 92%;           /* Subtle container background */
  --secondary-foreground: 222.2 47% 11%;
  --muted: 220 14% 92%;               /* Inset backgrounds */
  --muted-foreground: 220 10% 42%;    /* Subtext (WCAG AAA contrast) */
  --accent: 243 75% 59%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 84.2% 60.2%;       /* Soft accessible error red */
  --destructive-foreground: 0 0% 100%;
  --border: 220 13% 86%;              /* Specular card & deck outlines */
  --input: 220 13% 86%;
  --ring: 243 75% 59%;
}
```

---

## 3. The 9 Curated Palettes Blueprint

### 🌙 Dark Palettes (5)

| Palette ID | Name | Canvas (`--background`) | Surface (`--card`) | Accent (`--primary`) | Mood & Design Vibe |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `midnight` | **macOS Midnight** | `240 6% 7%` (`#101013`) | `240 5% 12%` (`#1d1d21`) | `239 84% 67%` (`#6366f1`) | Titanium slate & Apple system indigo |
| `obsidian` | **Raycast Obsidian** | `240 10% 3%` (`#070709`) | `240 8% 8%` (`#131317`) | `263 90% 66%` (`#8b5cf6`) | Deep pitch OLED & electric violet |
| `nord` | **Nordic Aurora** | `165 28% 5%` (`#09110e`) | `165 22% 10%` (`#13221d`) | `160 84% 42%` (`#10b981`) | Sub-arctic pine & emerald aurora mint |
| `ocean` | **Cyber Ocean** | `222 55% 6%` (`#070c17`) | `222 45% 12%` (`#111d33`) | `188 95% 44%` (`#06b6d4`) | Abyssal deep navy & electric cyan glow |
| `amber` | **Sunset Charcoal** | `28 22% 6%` (`#13100d`) | `28 16% 11%` (`#211c17`) | `38 92% 50%` (`#f59e0b`) | Basalt charcoal & golden amber glow |

### ☀️ Light Palettes (4)

| Palette ID | Name | Canvas (`--background`) | Surface (`--card`) | Accent (`--primary`) | Mood & Design Vibe |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `light` | **macOS Studio** | `220 16% 95%` (`#f1f3f7`) | `0 0% 100%` (`#ffffff`) | `243 75% 59%` (`#4f46e5`) | Frosted gallery canvas & royal studio indigo |
| `paper` | **Warm Linen** | `38 32% 93%` (`#f6f1e8`) | `40 30% 98%` (`#fdfbf7`) | `21 88% 48%` (`#ea580c`) | Cozy organic linen & terracotta orange |
| `frost` | **Glacial Mist** | `170 24% 93%` (`#e7f2f0`) | `170 20% 99%` (`#fafffe`) | `174 84% 32%` (`#0d9488`) | Sub-zero arctic mist & pine teal emerald |
| `rose` | **Porcelain Rosé** | `345 35% 94%` (`#f8edf0`) | `345 30% 99%` (`#fffafd`) | `347 77% 50%` (`#e11d48`) | Blushing silk & vibrant raspberry berry |

---

## 4. Circular Ripple View Transitions Architecture

When triggering a theme change via `document.startViewTransition`, implement the circular mask expansion animation:

### A. Override User-Agent 250ms Cutoff in CSS
```css
::view-transition-group(root) {
  animation: none;
}
::view-transition-image-pair(root) {
  isolation: isolate;
}
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
  height: 100%;
  overflow: clip;
}

/* Suppress sub-element cross-fades while the ripple expands */
html.theme-transitioning,
html.theme-transitioning *,
html.theme-transitioning *::before,
html.theme-transitioning *::after {
  transition: none !important;
}
```

### B. JavaScript Implementation with Origin Pinning
```ts
const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
if (doc.startViewTransition && !prefersReducedMotion) {
  document.documentElement.classList.add('theme-transitioning');
  const transition = doc.startViewTransition(() => {
    flushSync(() => {
      applyThemeToDOM(newMode);
    });
  });

  transition.ready.then(() => {
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${radius}px at ${x}px ${y}px)`
        ],
      },
      {
        duration: 900,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        pseudoElement: '::view-transition-new(root)',
      }
    ).finished.finally(() => {
      document.documentElement.classList.remove('theme-transitioning');
    });
  });
}
```

---

## 5. Dynamic Ambient Glow & Tactile Micro-Grain

Enhance surface elevation with procedural lighting that adapts to whatever theme is active:

```css
/* Radial glow radiating the theme's active accent color */
.bg-ambient-glow {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: 
    radial-gradient(circle 800px at 50% -80px, hsl(var(--primary) / 0.09), transparent 70%),
    radial-gradient(circle 600px at 85% 95%, hsl(var(--accent) / 0.05), transparent 60%);
}

/* Tactile micro-grain overlay */
.bg-noise-grain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  opacity: 0.055;
  mix-blend-mode: overlay;
}
.dark .bg-noise-grain {
  opacity: 0.075;
  mix-blend-mode: soft-light;
}
```

---

## 6. The 8-Point Theme Quality Checklist

When creating or modifying themes, verify all 8 points:

- [ ] **1. Canvas vs. Card Contrast**: Does `--background` differ clearly from `--card` in both dark and light modes?
- [ ] **2. Semantic Token Purity**: Are all colors mapped to HSL tokens without hardcoded hex/slate utility classes?
- [ ] **3. Text Contrast (WCAG AAA)**: Is `--muted-foreground` easily readable on both `--card` and `--background`?
- [ ] **4. Action Button Inversion**: Does `--primary-foreground` have high contrast against `--primary`?
- [ ] **5. Dynamic Glow Coupling**: Does `.bg-ambient-glow` radiate the selected theme's `--primary` accent?
- [ ] **6. Fluid Ripple Transition**: Does `startViewTransition` expand smoothly from the clicked button/swatch?
- [ ] **7. Transition Suppression**: Is `html.theme-transitioning` applied during ripples to prevent child CSS flickering?
- [ ] **8. Cross-Context Sync**: Does switching a theme update all open extension tabs and popups instantly via `chrome.storage.onChanged`?
