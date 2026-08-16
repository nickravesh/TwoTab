# Project Guidelines: shadcn/ui & Design System Architecture

This file defines the project rules and best practices for modern UI development, component architecture, and design system usage in **TwoTab**.

---

## 1. shadcn-First Methodology & MCP Integration
- **Consult MCP Tools**: Always consult the connected shadcn MCP server tools (`search_items_in_registries`, `view_items_in_registries`, `get_add_command_for_items`, `get_audit_checklist`) before building custom UI components or complex primitives.
- **Use Standard Primitives**: Prefer official shadcn/ui components (`Card`, `CardHeader`, `CardContent`, `CardFooter`, `Badge`, `Button`, `Dialog`, `DropdownMenu`, `Separator`, `ScrollArea`) over ad-hoc custom containers.

---

## 2. Design Tokens & Theme Variable Architecture
- **No Hardcoded Hex/Slate Colors**: Avoid using hardcoded arbitrary colors (e.g., `text-slate-400`, `border-white/10`).
- **Use HSL Semantic Tokens**: Always consume HSL design tokens defined in `src/assets/tailwind.css`:
  - Surfaces: `bg-background`, `bg-card text-card-foreground`, `bg-muted`
  - Typography: `text-foreground`, `text-muted-foreground` (WCAG compliant high contrast)
  - Borders & Rings: `border-border`, `border-input`, `ring-ring`
  - Actions: `bg-primary text-primary-foreground`, `text-destructive hover:bg-destructive/20`

---

## 3. 3-Tier Card Layout & Flexbox Scroll Semantics
For interactive cards containing scrollable lists (e.g., tab collections), strictly use the 3-tier flexbox pattern:

```tsx
<Card className="flex flex-col h-[360px] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
  {/* Tier 1: Fixed Header */}
  <CardHeader className="shrink-0 pb-3 border-b border-border bg-muted/20">
    <CardTitle>...</CardTitle>
  </CardHeader>

  {/* Tier 2: Scrollable Body (min-h-0 is mandatory for flex child scrolling) */}
  <CardContent className="flex-1 min-h-0 overflow-y-auto custom-scrollbar scroll-fade-bottom p-4 space-y-2">
    {/* List items */}
  </CardContent>

  {/* Tier 3: Fixed Opaque Footer */}
  <CardFooter className="shrink-0 bg-card border-t border-border p-3 relative z-10 flex justify-end gap-2">
    {/* Action buttons */}
  </CardFooter>
</Card>
```

- **`overflow-hidden` on Card**: Keeps internal borders, hover states, and scrollbars strictly inside rounded corners.
- **`shrink-0` on Header & Footer**: Pins the top title and bottom buttons permanently without compression.
- **`flex-1 min-h-0 overflow-y-auto` on Content**: Isolates scrolling strictly to the middle section.
- **Opaque `bg-card` on Footer**: Prevents scrolling text from leaking or showing through action buttons.

---

## 4. Component Variant Extensibility (`cva`)
- Extend shadcn primitives by declaring reusable variants in component files (`cva`) rather than cluttering JSX with inline class overrides.
- Example (Split Button in `button.tsx`):
  ```tsx
  group: {
    splitLeft: "rounded-r-none",
    splitRight: "rounded-l-none border-l border-primary-foreground/20 focus-visible:ring-0 focus-visible:ring-offset-0",
  }
  ```

---

## 5. UI Polish & Accessibility
- **Pluralization**: Always format count labels dynamically (`{count} {count === 1 ? 'tab' : 'tabs'}`).
- **Smooth Scroll Fade**: Apply `.scroll-fade-bottom` (`-webkit-mask-image: linear-gradient(to bottom, black 85%, transparent 100%)`) to scrollable lists so content dissolves smoothly above footer borders.
- **Destructive Actions**: Use soft red (`--destructive: 0 84% 65%` / `#F87171`) with subtle hover backgrounds (`hover:bg-destructive/20`) and explicit confirmation dialogs (`<Dialog />`) before deletion.

---

## 6. View Transitions & Fluid Theme Ripple Architecture
When implementing or modifying theme switching with circular reveal animations via `document.startViewTransition`:

- **Override Chromium's 250ms Group Timer**:
  Chromium's user agent stylesheet terminates view transitions after 250ms by default. Always reset the group and image-pair containers in CSS:
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
  ```
- **Suppress Child Element Transitions During Ripple**:
  Add a `theme-transitioning` class to `<html>` for the duration of the animation to prevent child components with `transition-colors` from cross-fading prematurely:
  ```css
  html.theme-transitioning,
  html.theme-transitioning *,
  html.theme-transitioning *::before,
  html.theme-transitioning *::after {
    transition: none !important;
  }
  ```
- **Pacing & Velocity**:
  Use a balanced ease-in-out curve (`cubic-bezier(0.4, 0, 0.2, 1)`) and ~800ms - 1000ms duration so the wave travels at a steady, tangible speed rather than exploding in the first 100ms.
- **Storage Event Guarding**:
  Guard background storage listeners (`chrome.storage.onChanged`) against triggering concurrent DOM mutations while `html.theme-transitioning` is active.

