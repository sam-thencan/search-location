/*
 * UULE v2 (ASCII) encoder for Google Search location spoofing.
 *
 * CREDIT: This encoding is based entirely on the reverse-engineering work
 * of Valentin Pletzer (@VorticonCmdr).
 *   - UULE v2 writeup: https://valentin.app/uule.html
 *   - GS Location Changer (MV2 original): https://github.com/VorticonCmdr/gslocation
 *   - Overview: https://valentin.app/gs-location-changer.html
 *
 * Format confirmed against the shipping extension source (js/background.js):
 *   prefix:  'a ' (letter 'a' followed by a literal space)
 *   body:    protobuf text-format with `latlng < ... >` submessage
 *   payload: base64(body)
 *
 * The PRD also documents a numeric/bracket variant from the UULE article
 * (role:1, producer:12, `latlng{ ... }`). Both are valid protobuf text
 * encodings, but the string-enum / angle-bracket form is what Valentin's
 * live extension emits, so we default to that.
 */

const DEFAULT_RADIUS = 65000;

const APPROX = {
  role: 'CURRENT_LOCATION',
  producer: 'DEVICE_LOCATION'
};

const EXACT = {
  role: 'USER_SPECIFIED_FOR_REQUEST',
  producer: 'LOGGED_IN_USER_SPECIFIED'
};

function b64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

export function buildUuleBody({ lat, lng, radius, role, producer }) {
  const latE7 = Math.round(Number(lat) * 1e7);
  const lngE7 = Math.round(Number(lng) * 1e7);
  return (
    `role: ${role}\n` +
    `producer: ${producer}\n` +
    `radius: ${radius}\n` +
    `latlng <\n` +
    `  latitude_e7: ${latE7}\n` +
    `  longitude_e7: ${lngE7}\n` +
    `>`
  );
}

export function encodeUuleV2({
  lat,
  lng,
  radius,
  exactMode = false,
  role,
  producer
} = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new Error('encodeUuleV2: lat/lng must be finite numbers');
  }

  const base = exactMode ? EXACT : APPROX;
  const resolvedRole = role || base.role;
  const resolvedProducer = producer || base.producer;
  const resolvedRadius =
    radius === undefined || radius === null
      ? (exactMode ? -1 : DEFAULT_RADIUS)
      : radius;

  const body = buildUuleBody({
    lat,
    lng,
    radius: resolvedRadius,
    role: resolvedRole,
    producer: resolvedProducer
  });

  return { header: 'a ' + b64(body), body };
}

export const UULE_DEFAULTS = { DEFAULT_RADIUS, APPROX, EXACT };
