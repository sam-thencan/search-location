/*
 * Geocoding client.
 * - Default: Nominatim (OpenStreetMap). Free, no key. 1 req/sec policy.
 * - Optional: Google Geocoding API when a key is configured in settings.
 */

const NOMINATIM_USER_AGENT =
  'LocalSERPSidePanel/1.0 (https://github.com/sam-thencan/search-location)';

export class GeocodeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function extractNominatimComponents(addr) {
  if (!addr) return { city: '', state: '', country: '' };
  return {
    city:
      addr.city ||
      addr.town ||
      addr.village ||
      addr.hamlet ||
      addr.municipality ||
      addr.suburb ||
      '',
    state: addr.state || addr.region || addr.province || '',
    country: addr.country || ''
  };
}

function extractGoogleComponents(components = []) {
  const find = (type) =>
    components.find((c) => (c.types || []).includes(type))?.long_name || '';
  return {
    city:
      find('locality') ||
      find('sublocality') ||
      find('postal_town') ||
      find('administrative_area_level_3') ||
      '',
    state: find('administrative_area_level_1') || '',
    country: find('country') || ''
  };
}

export async function geocodeAddress(address, { googleApiKey } = {}) {
  const q = (address || '').trim();
  if (!q) throw new GeocodeError('EMPTY', 'Enter an address first.');

  if (googleApiKey) {
    return geocodeWithGoogle(q, googleApiKey);
  }
  return geocodeWithNominatim(q);
}

export async function autocomplete(query, { limit = 5, signal } = {}) {
  const q = (query || '').trim();
  if (q.length < 3) return [];
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=${limit}&q=` +
    encodeURIComponent(q);
  let res;
  try {
    res = await fetch(url, {
      signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': NOMINATIM_USER_AGENT
      }
    });
  } catch (err) {
    if (err?.name === 'AbortError') return [];
    return [];
  }
  if (!res.ok) return [];
  const list = await res.json();
  if (!Array.isArray(list)) return [];
  return list.map((hit) => ({
    label: hit.display_name,
    lat: parseFloat(hit.lat),
    lng: parseFloat(hit.lon),
    type: hit.type,
    class: hit.class,
    components: extractNominatimComponents(hit.address)
  }));
}

export async function reverseGeocode(lat, lng, { googleApiKey } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new GeocodeError('BAD_COORDS', 'Invalid lat/lng.');
  }
  if (googleApiKey) {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?latlng=${lat},${lng}&key=${encodeURIComponent(googleApiKey)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' || !data.results?.length) {
      throw new GeocodeError('NO_RESULTS', 'No address found for those coordinates.');
    }
    const hit = data.results[0];
    return {
      address: hit.formatted_address,
      lat,
      lng,
      components: extractGoogleComponents(hit.address_components)
    };
  }
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1` +
    `&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': NOMINATIM_USER_AGENT }
  });
  if (res.status === 429) {
    throw new GeocodeError('RATE_LIMIT', 'Rate limited, wait a few seconds.');
  }
  const data = await res.json();
  if (!data?.display_name) {
    throw new GeocodeError('NO_RESULTS', 'No address found for those coordinates.');
  }
  return {
    address: data.display_name,
    lat,
    lng,
    components: extractNominatimComponents(data.address)
  };
}

async function geocodeWithNominatim(q) {
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=` +
    encodeURIComponent(q);
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': NOMINATIM_USER_AGENT
      }
    });
  } catch (err) {
    throw new GeocodeError('NETWORK', 'Network error reaching Nominatim.');
  }
  if (res.status === 429) {
    throw new GeocodeError('RATE_LIMIT', 'Rate limited, wait a few seconds.');
  }
  if (!res.ok) {
    throw new GeocodeError('HTTP', `Nominatim error (${res.status}).`);
  }
  const list = await res.json();
  if (!Array.isArray(list) || list.length === 0) {
    throw new GeocodeError('NO_RESULTS', 'Address not found.');
  }
  const hit = list[0];
  return {
    address: hit.display_name,
    lat: parseFloat(hit.lat),
    lng: parseFloat(hit.lon),
    components: extractNominatimComponents(hit.address),
    source: 'nominatim'
  };
}

async function geocodeWithGoogle(q, key) {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=` +
    encodeURIComponent(q) +
    `&key=` +
    encodeURIComponent(key);
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new GeocodeError('NETWORK', 'Network error reaching Google Geocoding.');
  }
  const data = await res.json();
  if (data.status === 'OVER_QUERY_LIMIT') {
    throw new GeocodeError('RATE_LIMIT', 'Google Geocoding quota exceeded.');
  }
  if (data.status === 'REQUEST_DENIED') {
    throw new GeocodeError('AUTH', data.error_message || 'Google Geocoding: request denied (check API key).');
  }
  if (data.status !== 'OK' || !data.results?.length) {
    throw new GeocodeError('NO_RESULTS', 'Address not found.');
  }
  const hit = data.results[0];
  return {
    address: hit.formatted_address,
    lat: hit.geometry.location.lat,
    lng: hit.geometry.location.lng,
    components: extractGoogleComponents(hit.address_components),
    source: 'google'
  };
}
