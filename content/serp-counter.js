/*
 * SERP result counter.
 *
 * Numbers organic results on Google search pages. Starts from the `start`
 * URL param + 1 so page 2 begins at #11 instead of #1 (i.e. result rank
 * stays consistent with position in the full SERP).
 *
 * Gated on settings.showSerpCounter in chrome.storage. Reacts to storage
 * changes in real time so toggling from the side panel updates live tabs.
 */

(function () {
  const STATE_KEY = 'state';
  const BADGE_CLASS = 'lsp-rank-badge';
  const MARKED_ATTR = 'data-lsp-numbered';

  let enabled = false;
  let observer = null;
  let pendingTimer = null;
  let lastUrl = location.href;

  function getStartOffset() {
    const params = new URLSearchParams(location.search);
    const raw = parseInt(params.get('start'), 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  }

  function isOrganicTitle(h3) {
    if (h3.getAttribute(MARKED_ATTR)) return false;
    const a = h3.closest('a[href]');
    if (!a) return false;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return false;
    let url;
    try {
      url = new URL(a.href, location.href);
    } catch {
      return false;
    }
    const host = url.hostname;
    if (!host) return false;
    if (host.includes('google.') && !host.includes('googleblog')) return false;
    if (host === 'webcache.googleusercontent.com') return false;
    if (h3.closest('[data-text-ad]')) return false;
    if (h3.closest('.commercial-unit-desktop-top')) return false;
    if (h3.closest('[aria-label="Ads"]')) return false;
    return true;
  }

  function findOrganicH3s() {
    const roots = document.querySelectorAll('#rso, #search, #center_col');
    const seen = new Set();
    const out = [];
    for (const root of roots) {
      const h3s = root.querySelectorAll('h3');
      for (const h3 of h3s) {
        if (seen.has(h3)) continue;
        seen.add(h3);
        if (isOrganicTitle(h3)) out.push(h3);
      }
    }
    return out;
  }

  function clearBadges() {
    document.querySelectorAll('.' + BADGE_CLASS).forEach((el) => el.remove());
    document
      .querySelectorAll(`[${MARKED_ATTR}]`)
      .forEach((el) => el.removeAttribute(MARKED_ATTR));
  }

  function highestRankSoFar() {
    let max = 0;
    document.querySelectorAll(`[${MARKED_ATTR}]`).forEach((el) => {
      const v = parseInt(el.getAttribute(MARKED_ATTR), 10);
      if (Number.isFinite(v) && v > max) max = v;
    });
    return max;
  }

  function renderBadges() {
    if (!enabled) return;
    const h3s = findOrganicH3s();
    if (h3s.length === 0) return;
    const existingMax = highestRankSoFar();
    const startOffset = existingMax > 0 ? existingMax : getStartOffset();
    let n = startOffset;
    for (const h3 of h3s) {
      n++;
      const badge = document.createElement('span');
      badge.className = BADGE_CLASS;
      badge.textContent = '#' + n;
      badge.setAttribute('aria-hidden', 'true');
      h3.insertBefore(badge, h3.firstChild);
      h3.setAttribute(MARKED_ATTR, String(n));
    }
  }

  function renumberFromScratch() {
    clearBadges();
    renderBadges();
  }

  function scheduleRender() {
    if (pendingTimer) return;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        renumberFromScratch();
      } else {
        renderBadges();
      }
    }, 120);
  }

  function start() {
    if (observer) return;
    lastUrl = location.href;
    renderBadges();
    observer = new MutationObserver(scheduleRender);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', renumberFromScratch);
  }

  function stop() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    window.removeEventListener('popstate', renumberFromScratch);
    clearBadges();
  }

  async function readSetting() {
    try {
      const res = await chrome.storage.sync.get(STATE_KEY);
      const synced = res[STATE_KEY];
      if (synced) return !!synced.settings?.showSerpCounter;
      const local = await chrome.storage.local.get(STATE_KEY);
      return !!local[STATE_KEY]?.settings?.showSerpCounter;
    } catch {
      return false;
    }
  }

  async function applySetting() {
    const next = await readSetting();
    if (next === enabled) return;
    enabled = next;
    if (enabled) start();
    else stop();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (!(area === 'sync' || area === 'local')) return;
    if (!changes[STATE_KEY]) return;
    applySetting();
  });

  applySetting();
})();
