/*
 * SERP result counter.
 *
 * Numbers organic results on Google search pages. Starts from the `start`
 * URL param + 1 so page 2 begins at #11 instead of #1 (rank stays consistent
 * with position in the full SERP).
 *
 * Selector strategy anchored on `div.yuRUbf` (the title/url cluster), since
 * post-March-2025 Google often makes the <a> and <h3> siblings inside that
 * container rather than nesting <h3> under <a>. Falls back to other stable
 * patterns. Filters ads, featured snippets, People-also-ask, AI overviews,
 * knowledge blocks, and Google-internal links.
 *
 * Gated on settings.showSerpCounter in chrome.storage; reacts to storage
 * changes in real time so toggling from the side panel updates open tabs.
 */

(function () {
  const STATE_KEY = 'state';
  const BADGE_CLASS = 'lsp-rank-badge';
  const MARKED_ATTR = 'data-lsp-numbered';

  const SKIP_ANCESTORS = [
    '[data-text-ad]',
    '#tads',
    '#tadsb',
    '#bottomads',
    '[aria-label="Ads"]',
    '.commercial-unit-desktop-top',
    '[jsname="yEVEwb"]',
    '.related-question-pair',
    '[data-initq]',
    '.ULSxyf',
    '.xpdopen',
    '.Kevs9',
    '.kp-blk',
    '.g-blk'
  ];

  let enabled = false;
  let observer = null;
  let pendingTimer = null;
  let lastUrl = location.href;

  function getStartOffset() {
    const raw = parseInt(new URLSearchParams(location.search).get('start'), 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  }

  function isExternalLink(a) {
    if (!a || !a.getAttribute('href')) return false;
    let url;
    try {
      url = new URL(a.href, location.href);
    } catch {
      return false;
    }
    const host = (url.hostname || '').toLowerCase();
    if (!host) return false;
    if (host === 'webcache.googleusercontent.com') return false;
    if (host.includes('google.') && !host.includes('googleblog')) return false;
    return true;
  }

  function findLinkedAnchor(h3) {
    const closestA = h3.closest('a[href]');
    if (closestA) return closestA;
    let node = h3.parentElement;
    for (let depth = 0; node && depth < 5; depth++) {
      const a = node.querySelector(':scope > a[href], :scope a[href]');
      if (a) return a;
      node = node.parentElement;
    }
    return null;
  }

  function findOrganicH3s() {
    const root =
      document.querySelector('#rso') ||
      document.querySelector('#search') ||
      document.querySelector('#center_col') ||
      document.body;

    const seen = new Set();
    const out = [];

    for (const h3 of root.querySelectorAll('h3')) {
      if (seen.has(h3)) continue;
      if (!h3.textContent.trim()) continue;
      if (SKIP_ANCESTORS.some((sel) => h3.closest(sel))) continue;

      const a = findLinkedAnchor(h3);
      if (!isExternalLink(a)) continue;

      const rect = h3.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      seen.add(h3);
      out.push(h3);
    }

    out.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    return out;
  }

  function debugDump() {
    const allH3s = Array.from(document.querySelectorAll('h3'));
    const organic = findOrganicH3s();
    return {
      enabled,
      url: location.href,
      startOffset: getStartOffset(),
      totalH3s: allH3s.length,
      matchedOrganic: organic.length,
      organicTexts: organic.map((h) => h.textContent.trim().slice(0, 60)),
      rejectedH3s: allH3s
        .filter((h) => !organic.includes(h))
        .map((h) => {
          const a = findLinkedAnchor(h);
          const skip = SKIP_ANCESTORS.find((sel) => h.closest(sel));
          return {
            text: h.textContent.trim().slice(0, 60),
            hasAnchor: !!a,
            anchorExternal: !!a && isExternalLink(a),
            anchorHref: a?.href || null,
            skippedBy: skip || null,
            zeroSize:
              h.getBoundingClientRect().width === 0 &&
              h.getBoundingClientRect().height === 0,
            parentTag: h.parentElement?.tagName,
            parentClass: h.parentElement?.className || null
          };
        })
    };
  }

  if (typeof window !== 'undefined') {
    window.__lspDebug = debugDump;
  }

  function clearBadges() {
    document.querySelectorAll('.' + BADGE_CLASS).forEach((el) => el.remove());
    document
      .querySelectorAll('[' + MARKED_ATTR + ']')
      .forEach((el) => el.removeAttribute(MARKED_ATTR));
  }

  function highestRankSoFar() {
    let max = 0;
    document.querySelectorAll('[' + MARKED_ATTR + ']').forEach((el) => {
      const v = parseInt(el.getAttribute(MARKED_ATTR), 10);
      if (Number.isFinite(v) && v > max) max = v;
    });
    return max;
  }

  function renderBadges() {
    if (!enabled) return;
    const allH3s = findOrganicH3s();
    const unmarked = allH3s.filter((h) => !h.hasAttribute(MARKED_ATTR));
    if (unmarked.length === 0) return;

    const existingMax = highestRankSoFar();
    let n = existingMax > 0 ? existingMax : getStartOffset();
    for (const h3 of unmarked) {
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
