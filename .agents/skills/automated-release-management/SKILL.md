---
name: automated-release-management
description: >-
  Automated Release Management & Semantic Versioning (SemVer) protocol.
  Use whenever the user asks to "make a release", "publish a new version", "cut a tag",
  or evaluate if a release is needed.
---

# Skill: Automated Release Management & Semantic Versioning (SemVer)

Whenever the user asks to "make a release", "publish a new version", "cut a tag", or evaluate if a release is needed, follow this exact skill protocol.

---

## 1. Release Eligibility Matrix (When to Release vs. When NOT to Release)

DO NOT trigger a git tag/release for:
- Internal code refactoring or formatting changes with no behavior difference.
- Fixing local CI/CD config files or developer tooling setup.
- Typo fixes in internal comments or code files.
- Work-in-progress (WIP) or unverified feature code.
- Small unit test adjustments.

DO trigger a release (`vX.Y.Z`) for:
- Complete user-facing features or UI additions.
- User-reported or stability-critical bug fixes.
- Performance optimizations affecting end-user speed/memory.
- Security updates or data integrity safeguards.
- Breaking database/storage schema updates.

---

## 2. Version Calculation Rules (Semantic Versioning: vMAJOR.MINOR.PATCH)

Always inspect `package.json` to read the current version, then calculate the new version based on changes since the last tag:

### A. PATCH Bump (`v1.0.0` → `v1.0.1`)
Use for backwards-compatible bug fixes and minor internal fixes:
- Fixing state synchronization bugs or memory leaks.
- Fixing broken UI layouts or grid alignment edge cases.
- Minor performance tweaks or query/storage optimizations.
- Updating fallback defaults or error handling logic.

### B. MINOR Bump (`v1.0.0` → `v1.1.0`)
Use for backwards-compatible new features and functional additions:
- Adding new user-facing features (e.g., search filter, setting options, new tab group actions).
- Adding export/import tools or new theme options.
- Non-breaking storage schema additions.
- Reset `PATCH` to `0`.

### C. MAJOR Bump (`v1.0.0` → `v2.0.0`)
Use for breaking changes or fundamental project shifts:
- Complete architectural rewrites or total UI redesigns.
- Storage schema changes that require destructive migrations or break backwards compatibility.
- Dropping support for older browser manifest versions (e.g., MV2 to MV3).
- Reset `MINOR` and `PATCH` to `0`.

---

## 3. Standard Release Protocol Workflow

When instructed to perform a release, follow this sequential execution plan:

1. **Check Git Status & Workspace:**
   Ensure the working directory is clean and all tests pass (`npm run test && npm run build`).

2. **Inspect Current Version:**
   Read `package.json` to identify current version $V_{\text{current}}$.

3. **Determine Target Version:**
   Analyze recent git commits or user requests to classify the change as `PATCH`, `MINOR`, or `MAJOR`. Derive $V_{\text{next}}$.

4. **Update File Metadata:**
   Update the `"version"` field in `package.json` (and `manifest.json` if non-dynamically linked) to $V_{\text{next}}$.

5. **Commit Version Bump:**
   ```bash
   git add package.json package-lock.json
   git commit -m "chore(release): bump version to vX.Y.Z"
   git push origin master
   ```
