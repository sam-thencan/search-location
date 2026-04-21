/*
 * Thin wrapper around chrome.storage.sync with chrome.storage.local fallback.
 * Also broadcasts an 'STATE_CHANGED' runtime message after writes so open
 * surfaces (side panel) can re-render.
 */

const DEFAULT_STATE = {
  presets: [],
  recents: [],
  activeState: {
    enabled: false,
    address: '',
    lat: null,
    lng: null,
    hl: 'en',
    gl: 'us',
    radius: 65000,
    advanced: {
      exactMode: false,
      role: '',
      producer: '',
      provenance: ''
    }
  },
  settings: {
    googleGeocodingApiKey: '',
    usingLocalFallback: false,
    showSerpCounter: false
  }
};

const STATE_KEY = 'state';

async function readFrom(area) {
  try {
    const res = await chrome.storage[area].get(STATE_KEY);
    return res[STATE_KEY] || null;
  } catch {
    return null;
  }
}

async function writeTo(area, value) {
  await chrome.storage[area].set({ [STATE_KEY]: value });
}

export async function getState() {
  const synced = await readFrom('sync');
  if (synced) return mergeDefaults(synced);
  const local = await readFrom('local');
  if (local) return mergeDefaults(local);
  return structuredClone(DEFAULT_STATE);
}

function mergeDefaults(state) {
  return {
    ...DEFAULT_STATE,
    ...state,
    activeState: {
      ...DEFAULT_STATE.activeState,
      ...(state.activeState || {}),
      advanced: {
        ...DEFAULT_STATE.activeState.advanced,
        ...((state.activeState && state.activeState.advanced) || {})
      }
    },
    settings: {
      ...DEFAULT_STATE.settings,
      ...(state.settings || {})
    }
  };
}

export async function setState(nextState) {
  try {
    await writeTo('sync', nextState);
    if (nextState.settings?.usingLocalFallback) {
      nextState.settings.usingLocalFallback = false;
      await writeTo('sync', nextState);
    }
  } catch (err) {
    const message = String(err?.message || err);
    if (/QUOTA|quota|MAX_/i.test(message)) {
      nextState.settings = {
        ...(nextState.settings || {}),
        usingLocalFallback: true
      };
      await writeTo('local', nextState);
      broadcast('STORAGE_FALLBACK', {
        message: 'Synced storage full — using local storage.'
      });
    } else {
      throw err;
    }
  }
  broadcast('STATE_CHANGED', { state: nextState });
  return nextState;
}

export async function updateState(patch) {
  const current = await getState();
  const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
  return setState(next);
}

function broadcast(type, payload) {
  try {
    chrome.runtime.sendMessage({ type, payload }).catch(() => {});
  } catch {
    /* no listeners is fine */
  }
}

export const DEFAULTS = DEFAULT_STATE;
