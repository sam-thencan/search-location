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
  const SESSION_KEY = 'serpPages';
  const BADGE_CLASS = 'lsp-rank-badge';
  const BADGE_UNCONFIDENT_CLASS = 'lsp-rank-badge-unconfident';
  const MARKED_ATTR = 'data-lsp-numbered';
  const RESULTS_PER_PAGE = 10;

  const SKIP_ANCESTORS = [
    '[data-text-ad]',
    '[data-text-ad="1"]',
    '#tads',
    '#tadsb',
    '#bottomads',
    '[aria-label="Ads"]',
    '[aria-label="Ad"]',
    '[aria-label*="Sponsored"]',
    '.commercial-unit-desktop-top',
    '.commercial-unit-mobile-top',
    '.commercial-unit-mobile-bottom',
    '.cu-container',
    '[data-async-context*="ad"]',
    '[jsname="yEVEwb"]',
    '.related-question-pair',
    '[data-initq]',
    '.xpdopen',
    '.Kevs9',
    '.kp-blk',
    '.g-blk'
  ];

  const SPONSORED_LABEL_RE = /^\s*sponsored\b/i;
  const SPONSORED_LABEL_MAX_LEN = 80;

  function looksLikeSponsoredLabel(el) {
    if (!el) return false;
    const text = (el.textContent || '').trim();
    return text.length > 0 && text.length < SPONSORED_LABEL_MAX_LEN && SPONSORED_LABEL_RE.test(text);
  }

  /**
   * Fallback heuristic for sponsored blocks (local-services ads, "Sponsored
   * result" boxes) where Google's structural markers vary. Walks up from the
   * h3 and looks for a *short* "Sponsored …" label — either the ancestor's
   * first element child (header inside the block) or its previous sibling
   * (header before the block).
   *
   * Both the short-text requirement and the sibling/first-child constraint
   * are important: a naive "any ancestor's textContent starts with
   * Sponsored" check fires for every h3 on the page when the LSA block is
   * the first thing in the column, because the column's textContent starts
   * with the LSA's leading "Sponsored" too.
   *
   * Bounded at depth 8 and stops at the column root.
   */
  function isInsideSponsoredBlock(h3) {
    let node = h3.parentElement;
    let depth = 0;
    while (node && depth < 8) {
      const id = node.id;
      if (id === 'rso' || id === 'search' || id === 'center_col') break;

      if (looksLikeSponsoredLabel(node.firstElementChild)) return true;
      if (looksLikeSponsoredLabel(node.previousElementSibling)) return true;

      node = node.parentElement;
      depth++;
    }
    return false;
  }

  let enabled = false;
  let observer = null;
  let pendingTimer = null;
  let lastUrl = location.href;

  function getStartOffset() {
    const raw = parseInt(new URLSearchParams(location.search).get('start'), 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  }

  function getQueryKey() {
    const raw = new URLSearchParams(location.search).get('q') || '';
    return raw.trim().toLowerCase();
  }

  function getPageNumber() {
    return Math.floor(getStartOffset() / RESULTS_PER_PAGE) + 1;
  }

  async function readPageHistory(query) {
    if (!query) return {};
    try {
      const res = await chrome.storage.session.get(SESSION_KEY);
      const all = res[SESSION_KEY] || {};
      return all[query] || {};
    } catch {
      return {};
    }
  }

  async function writePageHistory(query, start, entry) {
    if (!query) return;
    try {
      const res = await chrome.storage.session.get(SESSION_KEY);
      const all = res[SESSION_KEY] || {};
      const hist = all[query] || {};
      hist[String(start)] = { ...entry, at: Date.now() };
      all[query] = hist;
      await chrome.storage.session.set({ [SESSION_KEY]: all });
    } catch (err) {
      console.warn('[lsp] failed to persist page history:', err);
    }
  }

  async function clearQueryHistory(query) {
    if (!query) return;
    try {
      const res = await chrome.storage.session.get(SESSION_KEY);
      const all = res[SESSION_KEY] || {};
      if (all[query]) {
        delete all[query];
        await chrome.storage.session.set({ [SESSION_KEY]: all });
      }
    } catch (err) {
      console.warn('[lsp] failed to clear page history:', err);
    }
  }

  function isReload() {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      return nav?.type === 'reload';
    } catch {
      return false;
    }
  }

  /**
   * Decide starting rank + confidence for the current (query, start) pair.
   *  - mode 'first'        : this is page 1 (start=0). Confident, rank 1.
   *  - mode 'resume'       : we've already rendered this exact page. Use stored firstRank.
   *  - mode 'continuous'   : we rendered the immediately-previous page; continue from its lastRank+1.
   *  - mode 'gap'          : we have some history but not for the previous page. Unconfident: pN#M.
   *  - mode 'cold'         : zero history for this query. Unconfident: pN#M.
   */
  async function resolveStartingRank() {
    const start = getStartOffset();
    const query = getQueryKey();
    if (start === 0) {
      return { firstRank: 1, confident: true, mode: 'first', pageNumber: 1 };
    }
    const hist = await readPageHistory(query);
    const existing = hist[String(start)];
    if (existing && existing.confident) {
      return { firstRank: existing.firstRank, confident: true, mode: 'resume', pageNumber: getPageNumber() };
    }
    const prev = hist[String(start - RESULTS_PER_PAGE)];
    if (prev && prev.confident && Number.isFinite(prev.lastRank)) {
      return { firstRank: prev.lastRank + 1, confident: true, mode: 'continuous', pageNumber: getPageNumber() };
    }
    return { firstRank: 1, confident: false, mode: Object.keys(hist).length > 0 ? 'gap' : 'cold', pageNumber: getPageNumber() };
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

  /**
   * Count h3s that *directly* belong to a given hveid block — i.e., their
   * own closest [data-hveid] ancestor IS this block (not a nested one) —
   * AND have an external-link anchor. Used to tell a single-result block
   * (1 such h3) apart from a sitelinks-group block (2+ such h3s).
   */
  function countExternalH3sDirectlyIn(block) {
    if (!block) return 0;
    let n = 0;
    for (const h of block.querySelectorAll('h3')) {
      if (h.closest('[data-hveid]') !== block) continue;
      const a = findLinkedAnchor(h);
      if (!a || !isExternalLink(a)) continue;
      if ((h.textContent || '').trim()) n++;
      if (n >= 2) return n;
    }
    return n;
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


  /**
   * Walk every h3 in the results column and decide whether it represents an
   * organic result we should number. Returns both the accepted h3s (in
   * document order) and a per-rejection reason log so the debug dump can
   * surface accurate diagnostics.
   *
   * Tracked as an array of { block, hostname } so we can run both a
   * .contains() check (nested-hveid sitelinks) and an immediately-previous-
   * domain check (sibling-hveid sitelinks).
   */
  function classifyH3s() {
    const root =
      document.querySelector('#rso') ||
      document.querySelector('#search') ||
      document.querySelector('#center_col') ||
      document.body;

    const organic = [];
    const rejected = [];
    const claimed = [];

    for (const h3 of root.querySelectorAll('h3')) {
      if (!h3.textContent.trim()) {
        rejected.push({ h3, reason: 'empty-text' });
        continue;
      }
      const skipSel = SKIP_ANCESTORS.find((sel) => h3.closest(sel));
      if (skipSel) {
        rejected.push({ h3, reason: skipSel });
        continue;
      }
      if (isInsideSponsoredBlock(h3)) {
        rejected.push({ h3, reason: 'sponsored-label' });
        continue;
      }

      // Organic results are always inside a [data-hveid] container (Google's
      // per-result tracking marker). Knowledge panels, GBP self-management
      // widgets, and chrome around the SERP don't have data-hveid, so this
      // alone filters out a lot of false positives like 'Your business on
      // Google' headers near external website buttons.
      const myBlock = h3.closest('[data-hveid]');
      if (!myBlock) {
        rejected.push({ h3, reason: 'no-hveid' });
        continue;
      }

      const a = findLinkedAnchor(h3);
      if (!isExternalLink(a)) {
        rejected.push({ h3, reason: 'not-external' });
        continue;
      }

      const rect = h3.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        rejected.push({ h3, reason: 'zero-size' });
        continue;
      }

      // Sitelink #1 — same exact hveid block as a previously-claimed result.
      if (claimed.some((c) => c.block === myBlock)) {
        rejected.push({ h3, reason: 'duplicate-hveid-block' });
        continue;
      }

      // Sitelink #2 — my hveid block is *nested inside* a previously-claimed
      // block (the brand SERP case where featured sitelinks have their own
      // hveid nested inside the main result's hveid).
      if (claimed.some((c) => c.block !== myBlock && c.block.contains(myBlock))) {
        rejected.push({ h3, reason: 'sitelink-of-claimed' });
        continue;
      }

      // Sitelink #3 — my hveid block is a *sibling* of the previous block
      // and points at the same domain, AND my block looks like a sitelinks
      // group (it contains 2+ external-link h3s of its own). Both signals
      // are required because two consecutive same-domain organic results
      // (e.g. two YouTube videos for the same query) each live in their
      // own single-h3 hveid block and SHOULD both be numbered. A real
      // 'More results from brand.com »' sitelinks block always packs
      // multiple titles into a single hveid container.
      let myHostname = '';
      try {
        myHostname = new URL(a.href, location.href).hostname.toLowerCase();
      } catch {
        /* malformed url */
      }
      const last = claimed[claimed.length - 1];
      if (
        last &&
        last.hostname &&
        myHostname &&
        last.hostname === myHostname &&
        countExternalH3sDirectlyIn(myBlock) >= 2
      ) {
        rejected.push({ h3, reason: 'sibling-sitelink-same-domain' });
        continue;
      }

      claimed.push({ block: myBlock, hostname: myHostname });
      organic.push(h3);
    }

    return { organic, rejected };
  }

  function findOrganicH3s() {
    return classifyH3s().organic;
  }

  function debugDump() {
    const allH3s = Array.from(document.querySelectorAll('h3'));
    const { organic, rejected } = classifyH3s();
    return {
      enabled,
      url: location.href,
      startOffset: getStartOffset(),
      totalH3s: allH3s.length,
      matchedOrganic: organic.length,
      organicTexts: organic.map((h) => h.textContent.trim().slice(0, 60)),
      rejectedH3s: rejected.map(({ h3, reason }) => {
        const a = findLinkedAnchor(h3);
        const rect = h3.getBoundingClientRect();
        return {
          text: h3.textContent.trim().slice(0, 60),
          hasAnchor: !!a,
          anchorExternal: !!a && isExternalLink(a),
          anchorHref: a?.href || null,
          skippedBy: reason,
          zeroSize: rect.width === 0 && rect.height === 0,
          parentTag: h3.parentElement?.tagName,
          parentClass: h3.parentElement?.className || null
        };
      })
    };
  }

  // Bridge from MAIN world. content/debug-bridge.js exposes
  // window.__lspDebug() in the page's main world; it postMessages a request
  // here, we run debugDump in this isolated world (where it has access to
  // the closure state), and post the result back. window.postMessage is
  // shared across worlds, so this is the cleanest cross-world data channel.
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || typeof data.__lsp_debug_request !== 'string') return;
    let payload;
    try {
      payload = debugDump();
    } catch (err) {
      payload = { error: String(err?.message || err) };
    }
    window.postMessage(
      { __lsp_debug_response: data.__lsp_debug_request, payload },
      '*'
    );
  });

  function clearBadges() {
    document.querySelectorAll('.' + BADGE_CLASS).forEach((el) => el.remove());
    document
      .querySelectorAll('[' + MARKED_ATTR + ']')
      .forEach((el) => el.removeAttribute(MARKED_ATTR));
  }

  let currentResolution = null;

  function markedCount() {
    return document.querySelectorAll('[' + MARKED_ATTR + ']').length;
  }

  async function renderBadges() {
    if (!enabled) return;
    const allH3s = findOrganicH3s();
    const unmarked = allH3s.filter((h) => !h.hasAttribute(MARKED_ATTR));
    if (unmarked.length === 0) return;

    if (!currentResolution) {
      currentResolution = await resolveStartingRank();
    }

    const already = markedCount();
    const { firstRank, confident, pageNumber } = currentResolution;
    let n = firstRank + already - 1;

    for (const h3 of unmarked) {
      n++;
      const perPage = n - firstRank + 1;
      const badge = document.createElement('span');
      badge.className = confident ? BADGE_CLASS : BADGE_CLASS + ' ' + BADGE_UNCONFIDENT_CLASS;
      badge.textContent = confident ? '#' + n : 'p' + pageNumber + '#' + perPage;
      badge.setAttribute('aria-hidden', 'true');
      if (!confident) {
        badge.title =
          'Position-on-page only — we don\'t have the earlier pages in session, so the absolute rank is unknown.';
      }
      h3.insertBefore(badge, h3.firstChild);
      h3.setAttribute(MARKED_ATTR, confident ? String(n) : pageNumber + ':' + perPage);
    }

    await persistCurrentPage(n);
  }

  async function persistCurrentPage(lastRank) {
    if (!currentResolution) return;
    const { firstRank, confident } = currentResolution;
    await writePageHistory(getQueryKey(), getStartOffset(), {
      firstRank,
      lastRank,
      confident
    });
  }

  async function renumberFromScratch() {
    clearBadges();
    currentResolution = null;
    if (getStartOffset() === 0) {
      await clearQueryHistory(getQueryKey());
    }
    await renderBadges();
  }

  function scheduleRender() {
    if (pendingTimer) return;
    pendingTimer = setTimeout(async () => {
      pendingTimer = null;
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        await renumberFromScratch();
      } else {
        await renderBadges();
      }
    }, 120);
  }

  async function start() {
    if (observer) return;
    lastUrl = location.href;
    currentResolution = null;
    await maybeResetHistory();
    await renderBadges();
    logStartupDiagnostic();
    observer = new MutationObserver(scheduleRender);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', renumberFromScratch);
  }

  async function maybeResetHistory() {
    const query = getQueryKey();
    if (!query) return;
    if (isReload() || getStartOffset() === 0) {
      await clearQueryHistory(query);
    }
  }

  function logStartupDiagnostic() {
    try {
      const organic = findOrganicH3s();
      const info = {
        url: location.href,
        query: getQueryKey() || '(no q)',
        start: getStartOffset(),
        page: getPageNumber(),
        resolvedRank: currentResolution?.firstRank,
        mode: currentResolution?.mode,
        confident: currentResolution?.confident,
        matchedOrganic: organic.length,
        totalH3s: document.querySelectorAll('h3').length
      };
      console.log('%c[Local SERP]%c counter active', 'color:#EF6A47;font-weight:bold', 'color:inherit', info);
      if (organic.length === 0 && info.totalH3s > 0) {
        console.warn(
          '[Local SERP] No organic results matched despite ' + info.totalH3s + ' <h3>s present. ' +
          'Run window.__lspDebug() in the ISOLATED world console (DevTools Console → context dropdown → select the extension) for a full dump.'
        );
      }
    } catch (err) {
      console.warn('[Local SERP] diagnostic failed:', err);
    }
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
