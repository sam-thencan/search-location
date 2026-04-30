/*
 * Debug bridge — runs in the page's MAIN world so window.__lspDebug() is
 * reachable from the DevTools Console without context switching.
 *
 * The actual debug data lives in the SERP counter content script (ISOLATED
 * world). We can't share JS scope across worlds, but window.postMessage()
 * is delivered to listeners in BOTH worlds, so we use it as the bridge.
 *
 * Usage from the tab's DevTools Console:
 *   await __lspDebug()
 */

(function () {
  if (window.__lspDebug) return;

  window.__lspDebug = function () {
    return new Promise((resolve, reject) => {
      const reqId =
        Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);

      const onMessage = (e) => {
        if (e.source !== window) return;
        const data = e.data;
        if (!data || data.__lsp_debug_response !== reqId) return;
        window.removeEventListener('message', onMessage);
        clearTimeout(timeout);
        resolve(data.payload);
      };

      window.addEventListener('message', onMessage);
      window.postMessage({ __lsp_debug_request: reqId }, '*');

      const timeout = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(
          new Error(
            'Local SERP debug bridge timed out — content script may not be running on this page.'
          )
        );
      }, 2000);
    });
  };
})();
