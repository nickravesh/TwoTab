---
description: Universal standards for compile-time type verification, fast-bundler gap prevention, and DOM component smoke testing across TypeScript and React applications.
globs: ["**/*.ts", "**/*.tsx", "package.json", "tsconfig.json"]
---

# Universal Standard: Zero-Assumption Quality & Build Verification Pipeline

This rule defines mandatory quality gates to eliminate runtime crashes caused by the **Fast-Bundler Gap** and unmounted JSX symbol omissions.

---

## 1. The Fast-Bundler Gap
- Modern fast bundlers (Vite, esbuild, SWC, Turbopack, Rollup, WXT) transpile TSX and strip types rapidly without executing a full semantic typecheck pass.
- Pure logic unit tests (`src/lib/*.test.ts`) do not evaluate unmounted or deferred JSX branches (such as collapsed accordions, modal dialogs, or sub-tab switchers).
- **The Consequence**: An unimported icon or typo in an unmounted accordion will silently pass unit tests and production build bundling, then crash at runtime when clicked.

---

## 2. Mandatory Compiler Gating in Scripts (`package.json`)
Every project build and test command MUST enforce strict typecheck gating:
- **Build Gating**: `"build": "tsc --noEmit && <bundler> build"`
- **Test Gating**: `"test": "tsc --noEmit && vitest run"` (or Jest)
- **Standalone Typecheck**: `"typecheck": "tsc --noEmit"`

A build or test run MUST NOT be considered green if there are any TypeScript compiler errors or missing symbol imports.

---

## 3. Full-Tree DOM Component Smoke & Regression Testing
Every application with a user interface must maintain automated virtual DOM rendering smoke tests (using `@testing-library/react` and `happy-dom`/`jsdom`):
1. **Mounting Verification**: Ensure all top-level view containers mount without thrown exceptions.
2. **Disclosure & Sub-Tree Traversal**: Programmatically click and expand all accordions, tabs, and modal containers to force React to evaluate deferred JSX sub-trees and verify 100% symbol resolution.
3. **Mock Isolation**: Ensure standard runtime APIs (e.g. `chrome.*`, `localStorage`, `matchMedia`, `clipboard`) are cleanly mocked so tests run deterministically in CI and local dev.
