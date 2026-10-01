import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Dormant Tab Engine (dormant/main.ts)', () => {
  let originalLocation: Location;

  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = '';
    document.body.innerHTML = `
      <div id="statusText">Loading dormant tab...</div>
      <div class="spinner"></div>
    `;

    (globalThis as any).chrome = {
      runtime: {
        id: 'twotab-test-extension-id',
      },
    };
  });

  it('renders graceful error UI when url param is missing', async () => {
    // Set URL with no url parameter
    window.history.replaceState({}, '', '/dormant.html');

    await import('../dormant/main');

    const statusEl = document.getElementById('statusText');
    const spinnerEl = document.querySelector('.spinner') as HTMLElement;

    expect(statusEl?.textContent).toContain('Unable to wake tab');
    expect(statusEl?.textContent).toContain('The target address is missing or invalid.');
    expect(spinnerEl?.style.display).toBe('none');
  });

  it('sanitizes dangerous javascript: or vbscript: URLs to prevent script injection', async () => {
    window.history.replaceState({}, '', '/dormant.html?url=javascript:alert(1)&title=Dangerous');

    await import('../dormant/main');

    const statusEl = document.getElementById('statusText');
    const spinnerEl = document.querySelector('.spinner') as HTMLElement;

    expect(statusEl?.textContent).toContain('Unable to wake tab');
    expect(spinnerEl?.style.display).toBe('none');
  });

  it('sets document title, creates favicon link, and wakes tab upon user interaction', async () => {
    const targetUrl = 'https://developer.mozilla.org/en-US/docs/Web/JavaScript';
    const targetTitle = 'MDN JavaScript Documentation';
    window.history.replaceState(
      {},
      '',
      `/dormant.html?url=${encodeURIComponent(targetUrl)}&title=${encodeURIComponent(targetTitle)}`
    );

    // Mock document.hidden to true and hasFocus to false to test event-based wake
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.hasFocus = () => false;

    const replaceSpy = vi.fn();
    delete (window as any).location;
    window.location = {
      ...window.location,
      replace: replaceSpy,
      search: `?url=${encodeURIComponent(targetUrl)}&title=${encodeURIComponent(targetTitle)}`,
    } as any;

    await import('../dormant/main');

    // Title set
    expect(document.title).toBe(targetTitle);

    // Favicon link injected into head
    const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    expect(favicon).not.toBeNull();
    expect(favicon.href).toContain('chrome-extension://twotab-test-extension-id/_favicon/');

    // Status text updated
    const statusEl = document.getElementById('statusText');
    expect(statusEl?.textContent).toContain(`Opening ${targetTitle}...`);

    // Not navigated yet because tab was hidden
    expect(replaceSpy).not.toHaveBeenCalled();

    // User switches to tab (visibilitychange event with hidden = false)
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(replaceSpy).toHaveBeenCalledWith(targetUrl);
  });

  it('wakes immediately if document is not hidden upon initial boot', async () => {
    const targetUrl = 'https://github.com/nickravesh/TwoTab';
    window.history.replaceState({}, '', `/dormant.html?url=${encodeURIComponent(targetUrl)}`);

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });

    const replaceSpy = vi.fn();
    delete (window as any).location;
    window.location = {
      ...window.location,
      replace: replaceSpy,
      search: `?url=${encodeURIComponent(targetUrl)}`,
    } as any;

    await import('../dormant/main');

    expect(replaceSpy).toHaveBeenCalledWith(targetUrl);
  });
});
