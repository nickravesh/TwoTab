const params = new URLSearchParams(window.location.search);
const rawTargetUrl = params.get('url');
const targetTitle = params.get('title') || '';

function sanitizeTargetUrl(url: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  // Prevent script execution or dangerous protocols
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:', 'chrome:', 'edge:', 'chrome-extension:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

const safeTargetUrl = sanitizeTargetUrl(rawTargetUrl);

// 1. Immediately set page title in the tab bar
if (targetTitle) {
  document.title = targetTitle;
} else if (safeTargetUrl) {
  try {
    document.title = new URL(safeTargetUrl).hostname;
  } catch {
    document.title = 'Saved Tab';
  }
}

const statusEl = document.getElementById('statusText');
const spinnerEl = document.querySelector('.spinner');

if (!safeTargetUrl) {
  // Graceful error state instead of infinite hanging spinner
  if (spinnerEl && spinnerEl instanceof HTMLElement) {
    spinnerEl.style.display = 'none';
  }
  if (statusEl) {
    statusEl.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
        <span style="color:#ef4444; font-weight:600; font-size:15px;">Unable to wake tab</span>
        <span style="font-size:13px; color:#94a3b8; max-width:280px; line-height:1.4;">The target address is missing or invalid.</span>
        <a href="/tabs.html" style="margin-top:6px; padding:6px 14px; background:#6366f1; color:#fff; border-radius:6px; text-decoration:none; font-size:13px; font-weight:500;">Open TwoTab Dashboard</a>
      </div>
    `;
  }
} else {
  if (targetTitle && statusEl) {
    statusEl.textContent = `Opening ${targetTitle}...`;
  }

  // 2. Inject authentic favicon using Chrome native favicon provider
  try {
    const faviconLink = document.createElement('link');
    faviconLink.rel = 'icon';
    faviconLink.type = 'image/png';
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      faviconLink.href = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(safeTargetUrl)}&size=32`;
    } else {
      const parsed = new URL(safeTargetUrl);
      faviconLink.href = `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`;
    }
    document.head.appendChild(faviconLink);
  } catch (e) {
    console.warn('[TwoTab] Favicon injection failed:', e);
  }

  // 3. Instant auto-wake function
  let isNavigating = false;
  const wakeTab = () => {
    if (isNavigating) return;
    isNavigating = true;
    try {
      window.location.replace(safeTargetUrl);
    } catch (err) {
      console.error('[TwoTab] Navigation failed:', err);
      isNavigating = false;
      if (spinnerEl && spinnerEl instanceof HTMLElement) {
        spinnerEl.style.display = 'none';
      }
      if (statusEl) {
        statusEl.innerHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
            <span style="color:#ef4444; font-weight:600; font-size:15px;">Navigation failed</span>
            <a href="${safeTargetUrl}" style="margin-top:6px; padding:6px 14px; background:#6366f1; color:#fff; border-radius:6px; text-decoration:none; font-size:13px; font-weight:500;">Click to open directly</a>
          </div>
        `;
      }
    }
  };

  // If tab is already focused / visible upon creation, navigate immediately
  if (!document.hidden || (document.hasFocus && document.hasFocus())) {
    wakeTab();
  }

  // As soon as the user clicks or switches to this tab, wake up immediately
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      wakeTab();
    }
  });

  window.addEventListener('focus', wakeTab);
  window.addEventListener('click', wakeTab);
  window.addEventListener('touchstart', wakeTab);
  window.addEventListener('keydown', wakeTab);
}
