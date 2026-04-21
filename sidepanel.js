import { geocodeAddress, reverseGeocode, GeocodeError } from './lib/geocode.js';
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
  toast: $('toast')
};

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
  }
  renderPresets();
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

  els.geocodeBtn.addEventListener('click', onGeocode);
  els.reverseBtn.addEventListener('click', onReverseGeocode);

  els.enable.addEventListener('change', onToggleChange);

  els.presetSelect.addEventListener('change', onPresetSelect);
  els.savePresetBtn.addEventListener('click', onSavePreset);
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
  }
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
    showToast('Spoofing active.');
  } else {
    const res = await chrome.runtime.sendMessage({ type: 'DISABLE' });
    if (!res?.ok) {
      showToast(res?.error || 'Failed to disable.', true);
      return;
    }
    state = await getState();
    hydrateFromState({ skipInputs: true });
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

let toastTimer = null;
function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.className = 'toast' + (isError ? ' error' : '');
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), 2800);
}
