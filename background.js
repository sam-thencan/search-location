/*
 * Service worker: owns the DNR rule that injects X-Geo + Accept-Language,
 * manages cookie cleanup on disable, opens the side panel on action click,
 * and brokers messages from the side panel UI.
 */

import { encodeUuleV2 } from './lib/uule.js';
import { buildAcceptLanguage } from './lib/acceptLanguage.js';
import { getState, setState } from './lib/storage.js';

const RULE_ID = 1;

const GOOGLE_DOMAINS = [
  'google.com', 'www.google.com',
  'google.co.uk', 'www.google.co.uk',
  'google.de', 'www.google.de',
  'google.fr', 'www.google.fr',
  'google.ca', 'www.google.ca',
  'google.com.au', 'www.google.com.au',
  'google.es', 'www.google.es',
  'google.it', 'www.google.it',
  'google.com.mx', 'www.google.com.mx',
  'google.com.br', 'www.google.com.br',
  'google.co.in', 'www.google.co.in',
  'google.co.jp', 'www.google.co.jp',
  'google.co.nz', 'www.google.co.nz'
];

const ICONS = {
  on: {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png'
  },
  off: {
    '16': 'icons/icon16-off.png',
    '48': 'icons/icon48-off.png',
    '128': 'icons/icon128-off.png'
  }
};

async function setActionState(enabled) {
  try {
    await chrome.action.setIcon({ path: enabled ? ICONS.on : ICONS.off });
    await chrome.action.setTitle({
      title: enabled ? 'Local SERP Side Panel (ACTIVE)' : 'Local SERP Side Panel (off)'
    });
  } catch (err) {
    console.warn('setActionState failed:', err);
  }
}

const COOKIE_URLS = [
  'https://www.google.com/',
  'https://google.com/',
  'https://www.google.co.uk/',
  'https://www.google.de/',
  'https://www.google.fr/',
  'https://www.google.ca/',
  'https://www.google.com.au/',
  'https://www.google.es/',
  'https://www.google.it/',
  'https://www.google.com.mx/',
  'https://www.google.com.br/',
  'https://www.google.co.in/',
  'https://www.google.co.jp/',
  'https://www.google.co.nz/'
];

async function allowSessionStorageInContentScripts() {
  try {
    await chrome.storage.session.setAccessLevel({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
    });
  } catch (err) {
    console.warn('[bg] session setAccessLevel failed:', err);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('setPanelBehavior failed:', err);
  }
  await allowSessionStorageInContentScripts();
  const state = await getState();
  const on = !!(state.activeState?.enabled && state.activeState.lat != null && state.activeState.lng != null);
  if (on) await applyRule(state.activeState);
  await setActionState(on);
});

chrome.runtime.onStartup.addListener(async () => {
  const state = await getState();
  const on = !!(state.activeState?.enabled && state.activeState.lat != null && state.activeState.lng != null);
  if (on) {
    await applyRule(state.activeState);
  } else {
    await removeRule();
  }
  await setActionState(on);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-spoof') return;
  const state = await getState();
  if (state.activeState?.enabled) {
    await disable();
  } else {
    const a = state.activeState;
    if (a?.lat == null || a?.lng == null) {
      console.warn('[bg] toggle shortcut pressed but no lat/lng configured');
      return;
    }
    await enable(a);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch((err) => {
    console.error('[bg] handler error', err);
    sendResponse({ ok: false, error: String(err?.message || err) });
  });
  return true;
});

async function handleMessage(msg) {
  switch (msg?.type) {
    case 'ENABLE': {
      await enable(msg.payload);
      return { ok: true };
    }
    case 'DISABLE': {
      await disable();
      return { ok: true };
    }
    default:
      return { ok: false, error: `Unknown message type: ${msg?.type}` };
  }
}

async function enable(activeState) {
  const { lat, lng, hl, gl, radius, advanced } = activeState || {};
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new Error('Enable requires finite lat/lng.');
  }

  await applyRule(activeState);

  const current = await getState();
  current.activeState = {
    ...current.activeState,
    ...activeState,
    enabled: true,
    lat: Number(lat),
    lng: Number(lng),
    hl,
    gl,
    radius,
    advanced: { ...current.activeState.advanced, ...(advanced || {}) }
  };
  await setState(current);
  await setActionState(true);
}

async function applyRule(activeState) {
  const { lat, lng, hl, gl, radius, advanced } = activeState;
  const { header } = encodeUuleV2({
    lat: Number(lat),
    lng: Number(lng),
    radius,
    exactMode: advanced?.exactMode,
    role: advanced?.role || undefined,
    producer: advanced?.producer || undefined
  });
  const acceptLanguage = buildAcceptLanguage(hl, gl);

  const rule = {
    id: RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'X-Geo', operation: 'set', value: header },
        { header: 'Accept-Language', operation: 'set', value: acceptLanguage }
      ]
    },
    condition: {
      requestDomains: GOOGLE_DOMAINS,
      resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest']
    }
  };

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules: [rule]
  });
}

async function removeRule() {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID]
  });
}

async function disable() {
  await removeRule();
  await clearUuleCookies();
  const current = await getState();
  current.activeState = { ...current.activeState, enabled: false };
  await setState(current);
  await setActionState(false);
}

async function clearUuleCookies() {
  await Promise.all(
    COOKIE_URLS.map((url) =>
      chrome.cookies.remove({ url, name: 'UULE' }).catch(() => {})
    )
  );
}

(async () => {
  try {
    await allowSessionStorageInContentScripts();
    const state = await getState();
    const on = !!(
      state.activeState?.enabled &&
      state.activeState.lat != null &&
      state.activeState.lng != null
    );
    if (on) {
      await applyRule(state.activeState);
    }
    await setActionState(on);
  } catch (err) {
    console.warn('[bg] initial sync failed:', err);
  }
})();
