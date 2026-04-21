# Privacy Policy — Local SERP Side Panel

**Last updated: April 2026**

This extension is designed to leave as small a data footprint as possible. This policy describes exactly what data the extension handles, where it goes, and what it doesn't do. No legalese — if anything below isn't clear, open an issue at https://github.com/sam-thencan/search-location.

---

## What the extension does not do

- Does not collect analytics, telemetry, or usage metrics.
- Does not transmit any data to servers operated by the extension's author.
- Does not read or transmit the contents of web pages you visit.
- Does not track your browsing history.
- Does not read or transmit any information from Google accounts, Google Search queries, or SERP results.
- Does not sell, share, or monetize user data in any form.

---

## What the extension stores locally

The extension uses `chrome.storage.sync` (with `chrome.storage.local` fallback if your sync quota is exceeded) to save settings on your device. Stored data:

- **Spoof location state**: the lat/lng, address, language (`hl`), country (`gl`), radius, and enabled/disabled state.
- **Saved presets**: named location presets you create via the "Save as preset" button.
- **Recent locations**: the last five addresses you successfully geocoded (auto-captured).
- **Preferences**: SERP counter toggle, theme choice (light/dark), optional Google Geocoding API key if you provide one.
- **SERP page history** (per browser session only, cleared on browser restart): maps queries → observed page-rank boundaries, used to provide continuous rank numbering across pagination.

This data is synced across your own Chrome browsers if you have Chrome Sync enabled — that sync is managed by Google between your own devices and does not pass through any server we control.

---

## What data leaves your device, and where it goes

### 1. Geocoding requests to OpenStreetMap Nominatim

When you type an address into the side panel's address field and the extension auto-suggests completions, or when you click the "Geocode" button, the address text is sent to `https://nominatim.openstreetmap.org/search` (or `/reverse` for reverse geocoding). The service returns matching locations and lat/lng coordinates.

- **What's sent**: the address text you typed, the string `LocalSERPSidePanel/1.0 (https://github.com/sam-thencan/search-location)` as a User-Agent identifier per Nominatim's usage policy, and your IP address (automatically by your browser).
- **What's received**: candidate place names with lat/lng and structured address components.
- **Provider**: OpenStreetMap Foundation. Their privacy policy: https://wiki.osmfoundation.org/wiki/Privacy_Policy.

### 2. Optional geocoding requests to Google Geocoding API

**Only if you explicitly paste your own Google Geocoding API key** into the Advanced section of the side panel. With a key set, the extension prefers Google's geocoder over Nominatim.

- **What's sent**: the address text you typed, your API key, your IP address.
- **Provider**: Google. Terms: https://cloud.google.com/maps-platform/terms. Privacy: https://policies.google.com/privacy.
- **Controlled by you**: remove the API key in the Advanced panel to disable.

### 3. Google Search requests (modified, not captured)

When the location spoof is enabled, the extension uses Chrome's `declarativeNetRequest` API to add an `X-Geo` request header and modify the `Accept-Language` header on requests to Google search domains. The header content encodes the location you picked.

- **The extension does not read or store the requests or the responses.** `declarativeNetRequest` rules are evaluated in the browser's network stack; the extension never sees the request bodies, SERP results, or any page content.
- When you disable the spoof, the header modifications stop immediately, and the `UULE` cookie (if Google set one) is deleted from the tracked Google domains.

### 4. Google Fonts (side panel UI only)

The side panel loads the **Bricolage Grotesque** font from Google Fonts (`fonts.googleapis.com` and `fonts.gstatic.com`) for brand-name styling in the footer.

- **What's sent**: your IP address and browser's default Accept-* headers, per standard web font loading.
- **What's received**: the font file.
- **Provider**: Google. Privacy policy: https://policies.google.com/privacy.
- The extension does not send any user content or identifiers to the font servers beyond what the browser normally transmits when loading a remote resource.

---

## Permissions and why each is requested

- **sidePanel** — to display the persistent side panel UI.
- **storage** — to save the settings listed above locally on your device.
- **declarativeNetRequest** — to add the `X-Geo` and `Accept-Language` headers on Google Search requests when the spoof is enabled.
- **cookies** — solely to delete the `UULE` cookie from Google domains when you disable the spoof, so no residual state remains.
- **tabs** — to read the URL of the currently-active tab, enabling the tab-aware status indicator ("active on this Google SERP tab"). URLs are not stored or transmitted.
- **commands** — to register the `Alt+Shift+L` keyboard shortcut for toggling the spoof.
- **Host permissions on Google ccTLDs** — required for `declarativeNetRequest` to match requests to those domains and for `tabs.query` to read tab URLs.
- **Host permission on `nominatim.openstreetmap.org`** — required to fetch geocoding results.
- **Host permission on `maps.googleapis.com`** — required only when you opt in to Google Geocoding with your own API key.

---

## Your rights and controls

- **Disable the spoof**: flip the toggle off in the side panel. The DNR rule is removed and the UULE cookie deleted immediately.
- **Delete your data**: uninstall the extension via `chrome://extensions` — all stored settings are removed with the uninstall. You can also manually clear settings while the extension is installed by going to the side panel, deleting each saved preset, and flipping the counter and theme toggles.
- **Opt out of Google Geocoding**: remove the API key from the Advanced section.
- **Disable Google Fonts loading**: there is no toggle for this in v1; if you are concerned, block `fonts.googleapis.com` and `fonts.gstatic.com` at the network level (the extension will fall back to the system font stack without crashing).

---

## Changes to this policy

If this policy materially changes, we will update the "Last updated" date at the top and bump the extension's minor version number. Users are encouraged to re-read the policy after any update that adds permissions.

---

## Contact

- **Support / questions**: sam@thencandesigns.com
- **Bug reports**: https://github.com/sam-thencan/search-location/issues
- **Publisher**: Sam Sarsten / thencan

---

## Third-party attributions

The UULE v2 encoding and `X-Geo` header injection technique used by this extension are derived from public research by Valentin Pletzer (https://valentin.app/uule.html, https://github.com/VorticonCmdr/gslocation).
