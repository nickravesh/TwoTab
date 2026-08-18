const params = new URLSearchParams(window.location.search);
const targetUrl = params.get('url');
const targetTitle = params.get('title') || '';

// 1. Immediately set page title in the tab bar
if (targetTitle) {
  document.title = targetTitle;
  const statusEl = document.getElementById('statusText');
  if (statusEl) {
    statusEl.textContent = `Opening ${targetTitle}...`;
  }
}

// 2. Inject authentic favicon using Chrome native favicon provider
if (targetUrl) {
  try {
    const faviconLink = document.createElement('link');
    faviconLink.rel = 'icon';
    faviconLink.type = 'image/png';
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      faviconLink.href = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(targetUrl)}&size=32`;
    } else {
      const parsed = new URL(targetUrl);
      faviconLink.href = `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`;
    }
    document.head.appendChild(faviconLink);
  } catch (e) {
    console.warn('[TwoTab] Favicon injection failed:', e);
  }
}

// 3. Instant auto-wake function
function wakeTab() {
  if (targetUrl) {
    window.location.replace(targetUrl);
  }
}

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
