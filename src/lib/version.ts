// =============================================================================
// TwoTab Version Configuration
// =============================================================================

export const APP_VERSION = '1.17.0';

/**
 * Returns the current application version with a leading 'v'.
 * Uses Chrome runtime manifest when available, falling back to APP_VERSION.
 */
export function getAppVersion(): string {
  try {
    if (typeof chrome !== 'undefined' && chrome?.runtime?.getManifest?.()?.version) {
      return `v${chrome.runtime.getManifest().version}`;
    }
  } catch {
    // Graceful fallback for restricted contexts
  }
  return `v${APP_VERSION}`;
}
