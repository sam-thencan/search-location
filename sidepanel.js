import { geocodeAddress, reverseGeocode, autocomplete, GeocodeError } from './lib/geocode.js';
import { getState, updateState, DEFAULTS } from './lib/storage.js';

const $ = (id) => document.getElementById(id);

const els = {
  enable: $('enable-toggle'),
  statusPill: $('status-pill'),
  toggleLabel: $('toggle-label'),
  toggleSub: $('toggle-sub'),
  address: $('address'),
  addressError: $('address-error'),
  geocodeBtn: $('geocode-btn'),
  reverseBtn: $('reverse-btn'),
  lat: $('lat'),
  lng: $('lng'),
  hl: $('hl'),
  hlCustom: $('hl-custom'),
  gl: $('gl'),
  glCustom: $('gl-custom'),
  presetSelect: $('preset-select'),
  savePresetBtn: $('save-preset-btn'),
  presetList: $('preset-list'),
  radius: $('radius'),
  exactMode: $('exact-mode'),
  role: $('role'),
  producer: $('producer'),
  googleKey: $('google-key'),
  uulePreview: $('uule-preview'),
  uuleBody: $('uule-body'),
  serpCounter: $('serp-counter-toggle'),
  acList: $('ac-list'),
  recentsField: $('recents-field'),
  recentsRow: $('recents-row'),
  shareUrl: $('share-url'),
  copyUrlBtn: $('copy-url-btn'),
  tabStatus: $('tab-status'),
  toast: $('toast')
};

const GOOGLE_HOST_RE = /(^|\.)google\.[a-z.]+$/i;

let state = null;
let lastGeocodeAt = 0;

init();

async function init() {
  state = await getState();
  hydrateFromState();
  attachListeners();
  await refreshUulePreview();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'STATE_CHANGED') {
      state = msg.payload.state;
      hydrateFromState({ skipInputs: true });
    }
    if (msg?.type === 'STORAGE_FALLBACK') {
      showToast(msg.payload?.message || 'Using local storage fallback.', true);
    }
  });

  chrome.tabs.onActivated.addListener(refreshTabStatus);
  chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
    if (changeInfo.url || changeInfo.status === 'complete') refreshTabStatus();
  });
  chrome.windows.onFocusChanged.addListener(refreshTabStatus);
  refreshTabStatus();
}

async function refreshTabStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const kind = classifyTab(tab?.url);
    const enabled = !!state?.activeState?.enabled;
    applyTabStatus(kind, enabled);
    if (els.shareUrl.value || kind === 'google-search') {
      await refreshUulePreview();
    }
  } catch {
    els.tabStatus.hidden = true;
  }
}

function classifyTab(url) {
  if (!url) return 'other';
  let u;
  try { u = new URL(url); } catch { return 'other'; }
  if (!GOOGLE_HOST_RE.test(u.hostname)) return 'other';
  if (u.pathname.startsWith('/search')) return 'google-search';
  return 'google-other';
}

function applyTabStatus(kind, enabled) {
  const el = els.tabStatus;
  el.className = 'tab-status';
  if (kind === 'google-search') {
    el.classList.add(enabled ? 'ok' : '');
    el.innerHTML = enabled
      ? '<span class="dot"></span>Active on this Google SERP tab.'
      : '<span class="dot"></span>Google SERP tab — turn spoof on to affect it.';
    el.hidden = false;
  } else if (kind === 'google-other') {
    el.classList.add('ok');
    el.innerHTML = '<span class="dot"></span>Google tab — spoof applies to searches here.';
    el.hidden = false;
  } else {
    if (enabled) {
      el.classList.add('warn');
      el.innerHTML = '<span class="dot"></span>Not a Google tab — spoof only affects Google.';
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }
}

function hydrateFromState({ skipInputs } = {}) {
  const a = state.activeState;
  document.body.classList.toggle('active', !!a.enabled);
  els.statusPill.textContent = a.enabled ? 'ACTIVE' : 'OFF';
  els.statusPill.classList.toggle('pill-on', a.enabled);
  els.statusPill.classList.toggle('pill-off', !a.enabled);
  els.toggleLabel.textContent = a.enabled ? 'Spoof ON' : 'Spoof Location';
  els.toggleSub.textContent = a.enabled
    ? `${fmt(a.lat)}, ${fmt(a.lng)} · ${a.hl}/${a.gl}`
    : 'Off';
  els.enable.checked = !!a.enabled;

  if (!skipInputs) {
    els.address.value = a.address || '';
    els.lat.value = a.lat ?? '';
    els.lng.value = a.lng ?? '';
    setDropdownOrCustom(els.hl, els.hlCustom, a.hl || 'en');
    setDropdownOrCustom(els.gl, els.glCustom, a.gl || 'us');
    els.radius.value = a.radius ?? 65000;
    els.exactMode.checked = !!a.advanced?.exactMode;
    els.role.value = a.advanced?.role || '';
    els.producer.value = a.advanced?.producer || '';
    els.googleKey.value = state.settings?.googleGeocodingApiKey || '';
    els.serpCounter.checked = !!state.settings?.showSerpCounter;
  }
  renderPresets();
  renderRecents();
}

function fmt(n) {
  return typeof n === 'number' ? n.toFixed(4) : '—';
}

function setDropdownOrCustom(select, customInput, value) {
  const has = Array.from(select.options).some((o) => o.value === value);
  if (has) {
    select.value = value;
    customInput.hidden = true;
    customInput.value = '';
  } else {
    select.value = '__custom__';
    customInput.hidden = false;
    customInput.value = value;
  }
}

function readHlGl() {
  const hl =
    els.hl.value === '__custom__' ? (els.hlCustom.value || 'en').trim() : els.hl.value;
  const gl =
    els.gl.value === '__custom__' ? (els.glCustom.value || 'us').trim() : els.gl.value;
  return { hl, gl };
}

function readForm() {
  const { hl, gl } = readHlGl();
  const lat = parseFloat(els.lat.value);
  const lng = parseFloat(els.lng.value);
  const radiusRaw = parseInt(els.radius.value, 10);
  const radius = Number.isFinite(radiusRaw) ? radiusRaw : 65000;
  return {
    address: els.address.value.trim(),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    hl,
    gl,
    radius,
    advanced: {
      exactMode: els.exactMode.checked,
      role: els.role.value.trim(),
      producer: els.producer.value.trim()
    }
  };
}

function attachListeners() {
  els.hl.addEventListener('change', () => {
    els.hlCustom.hidden = els.hl.value !== '__custom__';
    persistFormToState();
  });
  els.gl.addEventListener('change', () => {
    els.glCustom.hidden = els.gl.value !== '__custom__';
    persistFormToState();
  });
  ['hlCustom', 'glCustom', 'address', 'lat', 'lng', 'radius', 'role', 'producer'].forEach((k) => {
    els[k].addEventListener('change', persistFormToState);
    els[k].addEventListener('blur', persistFormToState);
  });

  els.lat.addEventListener('input', refreshUulePreview);
  els.lng.addEventListener('input', refreshUulePreview);
  els.radius.addEventListener('input', refreshUulePreview);
  els.exactMode.addEventListener('change', () => {
    if (els.exactMode.checked) {
      els.radius.value = -1;
    } else if (parseInt(els.radius.value, 10) === -1) {
      els.radius.value = 65000;
    }
    persistFormToState();
    refreshUulePreview();
  });

  els.googleKey.addEventListener('change', async () => {
    await updateState((s) => ({
      ...s,
      settings: { ...s.settings, googleGeocodingApiKey: els.googleKey.value.trim() }
    }));
  });

  els.serpCounter.addEventListener('change', async () => {
    state = await updateState((s) => ({
      ...s,
      settings: { ...s.settings, showSerpCounter: els.serpCounter.checked }
    }));
    showToast(els.serpCounter.checked ? 'SERP counter on.' : 'SERP counter off.');
  });

  els.geocodeBtn.addEventListener('click', onGeocode);
  els.reverseBtn.addEventListener('click', onReverseGeocode);

  setupAutocomplete();

  els.enable.addEventListener('change', onToggleChange);

  els.presetSelect.addEventListener('change', onPresetSelect);
  els.savePresetBtn.addEventListener('click', onSavePreset);

  els.copyUrlBtn.addEventListener('click', onCopyShareUrl);
}

async function onCopyShareUrl() {
  const url = els.shareUrl.value;
  if (!url) {
    showToast('Set a location first.', true);
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Share URL copied.');
  } catch {
    els.shareUrl.select();
    document.execCommand('copy');
    showToast('Share URL copied.');
  }
}

async function persistFormToState() {
  const form = readForm();
  state = await updateState((s) => ({
    ...s,
    activeState: { ...s.activeState, ...form, enabled: s.activeState.enabled }
  }));
  await refreshUulePreview();
}

async function refreshUulePreview() {
  const lat = parseFloat(els.lat.value);
  const lng = parseFloat(els.lng.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    els.uulePreview.value = '(enter lat/lng to see preview)';
    els.uuleBody.value = '';
    els.shareUrl.value = '';
    return;
  }
  const radius = parseInt(els.radius.value, 10);
  const res = await chrome.runtime.sendMessage({
    type: 'PREVIEW_UULE',
    payload: { lat, lng, radius, exactMode: els.exactMode.checked }
  });
  if (res?.ok) {
    els.uulePreview.value = res.header;
    els.uuleBody.value = res.body;
    await refreshShareUrl(res.urlParam);
  }
}

async function refreshShareUrl(urlParam) {
  const { hl, gl } = readHlGl();
  let q = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.url) {
      const u = new URL(tab.url);
      if (u.hostname.includes('google.') && u.pathname.startsWith('/search')) {
        q = u.searchParams.get('q') || '';
      }
    }
  } catch {
    /* no tab access is fine */
  }
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('uule', urlParam);
  if (hl) params.set('hl', hl);
  if (gl) params.set('gl', gl);
  els.shareUrl.value = 'https://www.google.com/search?' + params.toString();
}

async function onGeocode() {
  const now = Date.now();
  if (now - lastGeocodeAt < 1100) {
    showToast('Slow down — 1 req/sec limit on Nominatim.', true);
    return;
  }
  lastGeocodeAt = now;
  els.addressError.hidden = true;
  const address = els.address.value.trim();
  if (!address) {
    els.addressError.textContent = 'Enter an address first.';
    els.addressError.hidden = false;
    return;
  }
  els.geocodeBtn.disabled = true;
  els.geocodeBtn.textContent = '…';
  try {
    const key = state.settings?.googleGeocodingApiKey || '';
    const hit = await geocodeAddress(address, { googleApiKey: key });
    els.lat.value = hit.lat;
    els.lng.value = hit.lng;
    els.address.value = hit.address;
    await persistFormToState();
    await pushRecent({ address: hit.address, lat: hit.lat, lng: hit.lng });
    if (state.activeState?.enabled) {
      const form = readForm();
      const res = await chrome.runtime.sendMessage({ type: 'ENABLE', payload: form });
      if (res?.ok) {
        showToast(`Spoof moved to ${hit.address.split(',')[0]}.`);
      } else {
        showToast(res?.error || 'Failed to re-apply spoof.', true);
      }
    }
  } catch (err) {
    const msg = err instanceof GeocodeError ? err.message : 'Geocoding failed.';
    els.addressError.textContent = msg;
    els.addressError.hidden = false;
  } finally {
    els.geocodeBtn.disabled = false;
    els.geocodeBtn.textContent = 'Geocode';
  }
}

async function onReverseGeocode() {
  const lat = parseFloat(els.lat.value);
  const lng = parseFloat(els.lng.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    showToast('Enter valid lat/lng first.', true);
    return;
  }
  els.reverseBtn.disabled = true;
  try {
    const key = state.settings?.googleGeocodingApiKey || '';
    const hit = await reverseGeocode(lat, lng, { googleApiKey: key });
    els.address.value = hit.address;
    await persistFormToState();
    await pushRecent({ address: hit.address, lat, lng });
  } catch (err) {
    const msg = err instanceof GeocodeError ? err.message : 'Reverse geocoding failed.';
    showToast(msg, true);
  } finally {
    els.reverseBtn.disabled = false;
  }
}

async function onToggleChange() {
  const form = readForm();
  if (els.enable.checked) {
    if (form.lat == null || form.lng == null) {
      showToast('Enter a lat/lng first.', true);
      els.enable.checked = false;
      return;
    }
    if (Math.abs(form.lat) > 90 || Math.abs(form.lng) > 180) {
      showToast('Lat/lng out of range.', true);
      els.enable.checked = false;
      return;
    }
    const res = await chrome.runtime.sendMessage({ type: 'ENABLE', payload: form });
    if (!res?.ok) {
      showToast(res?.error || 'Failed to enable.', true);
      els.enable.checked = false;
      return;
    }
    state = await getState();
    hydrateFromState({ skipInputs: true });
    await refreshTabStatus();
    showToast('Spoofing active.');
  } else {
    const res = await chrome.runtime.sendMessage({ type: 'DISABLE' });
    if (!res?.ok) {
      showToast(res?.error || 'Failed to disable.', true);
      return;
    }
    state = await getState();
    hydrateFromState({ skipInputs: true });
    await refreshTabStatus();
    showToast('Spoofing disabled — UULE cookies cleared.');
  }
}

function renderPresets() {
  const presets = state.presets || [];
  const currentValue = els.presetSelect.value;
  els.presetSelect.innerHTML = '<option value="">Load preset…</option>';
  presets.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    els.presetSelect.appendChild(opt);
  });
  if (presets.find((p) => p.id === currentValue)) {
    els.presetSelect.value = currentValue;
  }

  els.presetList.innerHTML = '';
  if (presets.length === 0) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="muted small">No presets yet.</span>';
    els.presetList.appendChild(li);
    return;
  }
  presets.forEach((p) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'preset-name';
    name.textContent = p.name;
    const rename = document.createElement('button');
    rename.textContent = 'Rename';
    rename.addEventListener('click', () => renamePreset(p.id));
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'del';
    del.addEventListener('click', () => deletePreset(p.id));
    li.append(name, rename, del);
    els.presetList.appendChild(li);
  });
}

async function onPresetSelect() {
  const id = els.presetSelect.value;
  if (!id) return;
  const preset = (state.presets || []).find((p) => p.id === id);
  if (!preset) return;
  els.address.value = preset.address || '';
  els.lat.value = preset.lat;
  els.lng.value = preset.lng;
  setDropdownOrCustom(els.hl, els.hlCustom, preset.hl || 'en');
  setDropdownOrCustom(els.gl, els.glCustom, preset.gl || 'us');
  if (preset.radius != null) els.radius.value = preset.radius;
  await persistFormToState();
  showToast(`Loaded: ${preset.name}`);
  if (state.activeState?.enabled) {
    const form = readForm();
    const res = await chrome.runtime.sendMessage({ type: 'ENABLE', payload: form });
    if (!res?.ok) showToast(res?.error || 'Failed to re-apply.', true);
  }
}

async function onSavePreset() {
  const form = readForm();
  if (form.lat == null || form.lng == null) {
    showToast('Enter lat/lng before saving.', true);
    return;
  }
  const name = prompt('Preset name:', form.address || `${form.lat.toFixed(3)}, ${form.lng.toFixed(3)}`);
  if (!name) return;
  const id = crypto.randomUUID();
  state = await updateState((s) => ({
    ...s,
    presets: [
      ...(s.presets || []),
      {
        id,
        name: name.trim(),
        address: form.address,
        lat: form.lat,
        lng: form.lng,
        hl: form.hl,
        gl: form.gl,
        radius: form.radius,
        createdAt: Date.now()
      }
    ]
  }));
  renderPresets();
  els.presetSelect.value = id;
  showToast('Preset saved.');
}

async function renamePreset(id) {
  const p = (state.presets || []).find((x) => x.id === id);
  if (!p) return;
  const name = prompt('New name:', p.name);
  if (!name) return;
  state = await updateState((s) => ({
    ...s,
    presets: s.presets.map((x) => (x.id === id ? { ...x, name: name.trim() } : x))
  }));
  renderPresets();
}

async function deletePreset(id) {
  if (!confirm('Delete this preset?')) return;
  state = await updateState((s) => ({
    ...s,
    presets: s.presets.filter((x) => x.id !== id)
  }));
  renderPresets();
}

async function pushRecent({ address, lat, lng }) {
  if (!address || lat == null || lng == null) return;
  state = await updateState((s) => {
    const without = (s.recents || []).filter(
      (r) => r.address !== address && !(Math.abs(r.lat - lat) < 1e-6 && Math.abs(r.lng - lng) < 1e-6)
    );
    return {
      ...s,
      recents: [{ address, lat, lng, at: Date.now() }, ...without].slice(0, 5)
    };
  });
  renderRecents();
}

function shortLabel(addr) {
  if (!addr) return '';
  const parts = addr.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return addr;
  return parts.slice(0, 2).join(', ');
}

function renderRecents() {
  const recents = state.recents || [];
  els.recentsRow.innerHTML = '';
  if (recents.length === 0) {
    els.recentsField.hidden = true;
    return;
  }
  els.recentsField.hidden = false;
  recents.forEach((r) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'recent-chip';
    chip.title = r.address;
    chip.textContent = shortLabel(r.address);
    chip.addEventListener('click', () => applyRecent(r));
    els.recentsRow.appendChild(chip);
  });
}

async function applyRecent(r) {
  els.address.value = r.address;
  els.lat.value = r.lat;
  els.lng.value = r.lng;
  await persistFormToState();
  if (state.activeState?.enabled) {
    const form = readForm();
    const res = await chrome.runtime.sendMessage({ type: 'ENABLE', payload: form });
    if (res?.ok) showToast(`Spoof moved to ${shortLabel(r.address)}.`);
  } else {
    showToast(`Loaded: ${shortLabel(r.address)}`);
  }
}

function setupAutocomplete() {
  let debounceTimer = null;
  let currentAbort = null;
  let activeIndex = -1;
  let items = [];
  let suppressNextInput = false;

  const close = () => {
    els.acList.innerHTML = '';
    els.acList.hidden = true;
    activeIndex = -1;
    items = [];
  };

  const render = (list) => {
    items = list;
    els.acList.innerHTML = '';
    if (list.length === 0) {
      els.acList.hidden = true;
      return;
    }
    list.forEach((item, i) => {
      const li = document.createElement('li');
      const label = document.createElement('div');
      label.className = 'ac-label';
      label.textContent = item.label;
      const meta = document.createElement('div');
      meta.className = 'ac-meta';
      meta.textContent = [item.class, item.type].filter(Boolean).join(' · ');
      li.append(label, meta);
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pick(i);
      });
      els.acList.appendChild(li);
    });
    els.acList.hidden = false;
    activeIndex = -1;
  };

  const updateActive = () => {
    Array.from(els.acList.children).forEach((li, i) =>
      li.classList.toggle('active', i === activeIndex)
    );
  };

  const pick = async (i) => {
    const item = items[i];
    if (!item) return;
    suppressNextInput = true;
    els.address.value = item.label;
    els.lat.value = item.lat;
    els.lng.value = item.lng;
    close();
    await persistFormToState();
    await pushRecent({ address: item.label, lat: item.lat, lng: item.lng });
    if (state.activeState?.enabled) {
      const form = readForm();
      const res = await chrome.runtime.sendMessage({ type: 'ENABLE', payload: form });
      if (res?.ok) {
        showToast(`Spoof moved to ${item.label.split(',')[0]}.`);
      }
    }
  };

  els.address.addEventListener('input', () => {
    if (suppressNextInput) {
      suppressNextInput = false;
      return;
    }
    const q = els.address.value.trim();
    clearTimeout(debounceTimer);
    if (q.length < 3) {
      close();
      return;
    }
    debounceTimer = setTimeout(async () => {
      if (currentAbort) currentAbort.abort();
      currentAbort = new AbortController();
      try {
        const list = await autocomplete(q, { signal: currentAbort.signal });
        render(list);
      } catch {
        /* swallowed */
      }
    }, 350);
  });

  els.address.addEventListener('keydown', (e) => {
    if (els.acList.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActive();
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      pick(activeIndex);
    } else if (e.key === 'Escape') {
      close();
    }
  });

  els.address.addEventListener('blur', () => {
    setTimeout(close, 150);
  });
}

let toastTimer = null;
function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.className = 'toast' + (isError ? ' error' : '');
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), 2800);
}
