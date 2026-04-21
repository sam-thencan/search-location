# Local SERP Side Panel

A Chrome (Manifest V3) extension that lets you spoof your Google Search location from a **persistent side panel**, so you can audit local SERPs, the local pack, and map results from any lat/lng without switching VPNs. Built for local SEO practitioners who need to hop between client cities quickly.

The panel stays open alongside the SERP — tweak address / language / country on the fly and see results update. Saved presets make agency workflows fast.

## Credit

This extension is built directly on the reverse-engineering work of **Valentin Pletzer** ([@VorticonCmdr](https://seocommunity.social/@vorticoncmdr)). The UULE v2 encoding and the `X-Geo` header injection technique are his research.

- **UULE v2 writeup:** https://valentin.app/uule.html
- **GS Location Changer (original MV2 extension):** https://github.com/VorticonCmdr/gslocation
- **Overview:** https://valentin.app/gs-location-changer.html

What this extension adds on top is primarily UX: the MV3 Side Panel API for persistence, saved location presets for agency workflows, an active-state visual cue, and cleanup of UULE cookies on disable.

## Install (unpacked)

1. Clone this repo.
2. Open `chrome://extensions` and toggle **Developer mode** on.
3. Click **Load unpacked** and pick this directory.
4. Click the extension's toolbar icon to open the side panel.

Requires Chrome 116+ (Side Panel API GA).

## Usage

1. Open a Google Search tab (`google.com` or any supported ccTLD).
2. Click the extension icon — the side panel opens.
3. Type an address and click **Geocode**, or paste a lat/lng directly.
4. Pick `hl` (interface language) and `gl` (country).
5. Flip **Spoof Location** on. The panel's top border turns teal and the status pill reads **ACTIVE**.
6. Search as usual — requests to Google now carry an `X-Geo` header that pins them to your chosen coordinates.
7. Flip it off when done. The UULE cookie is deleted and headers stop being injected.

**Saving presets.** Fill the form, click **Save as preset**, give it a name (e.g. `Client — Portland Dentist`). Switch clients in one click from the **Load preset…** dropdown.

**SERP counter.** Flip the **Number organic results on Google SERPs** toggle to overlay rank badges on each organic result. Numbering uses observed continuity — if page 1 had 8 organic results (AI Overview, featured snippets, etc. eat some slots), page 2 starts at `#9`, not `#11`. The counter stores per-query page history in `chrome.storage.session` so natural `1 → 2 → 3` walks carry forward.

If you jump straight into a later page with no prior history, badges switch to an amber `pN#M` format (e.g. `p3#1, p3#2`) to signal that only the within-page position is trustworthy. Once you visit earlier pages, subsequent loads of the later page auto-heal to the confident `#N` format. Ads, local pack, AI Overview, featured snippets, and "People also ask" blocks are skipped.

**Address autocomplete.** Start typing in the address field — suggestions from Nominatim appear after ~350 ms. Arrow keys to navigate, `Enter` to pick, `Esc` to dismiss. If spoof is already on, picking a suggestion re-applies immediately.

**Recent locations.** Every successful geocode / autocomplete pick is captured as a chip (last 5, deduped). Click a chip to restore that location — if spoof is active it re-applies in place.

**Share URL.** The **Share** section builds a `google.com/search?uule=…&hl=…&gl=…&q=…` URL you can copy and send to a client. Recipients don't need the extension; Google honors the `uule` URL param on its own. If you're currently on a Google search tab, the URL inherits that tab's query; otherwise you can append `&q=` yourself.

**Keyboard shortcut.** `Alt+Shift+L` toggles the spoof on/off (configurable at `chrome://extensions/shortcuts`). Requires lat/lng already configured.

**Tab-aware status.** A small chip below the toggle tells you whether the currently-focused tab is a Google SERP. Teal = spoof is reaching that tab; amber = you're on a non-Google tab, spoof isn't doing anything there.

**Advanced.** Expand the Advanced section to:

- Adjust the `radius` (default `65000`, matching Valentin's shipping extension).
- Toggle exact-coordinate mode (`role: USER_SPECIFIED_FOR_REQUEST`, `radius: -1`).
- Override `role` and `producer` strings.
- Paste a Google Geocoding API key to prefer Google over Nominatim.
- View the raw `X-Geo` header and decoded UULE body being injected.

## Supported Google hosts

`google.com`, `google.co.uk`, `google.de`, `google.fr`, `google.ca`, `google.com.au`, `google.es`, `google.it`, `google.com.mx`, `google.com.br`, `google.co.in`, `google.co.jp`, `google.co.nz`.

Add more by editing `host_permissions` in `manifest.json` and `GOOGLE_DOMAINS` in `background.js`.

## How it works (short)

- **UULE encoder** (`lib/uule.js`): pure function, no Chrome API dependency. Builds the UULE v2 protobuf text body and returns `'a ' + btoa(body)` — the exact format Valentin's extension ships.
- **DNR rule** (`background.js`): a single dynamic `declarativeNetRequest` rule sets `X-Geo` and `Accept-Language` on Google requests while spoofing is enabled.
- **Cookie cleanup**: on disable, the `UULE` cookie is removed from every tracked Google host.
- **Side panel UI** (`sidepanel.html/js/css`): vanilla ES modules, no framework, dark mode via `prefers-color-scheme`.

## Known limitations

- **Signed-in Google accounts** may partially override the spoof with account location history. Sign out (or use a guest profile) for the cleanest results.
- **ccTLDs outside the list above** aren't rewritten — add them to `host_permissions` and `GOOGLE_DOMAINS`.
- **Nominatim rate limit** is 1 req/sec. The Geocode button is debounced. For heavy use, add a Google Geocoding API key in Advanced.
- **Firefox** isn't supported in v1 — MV3 side panels behave differently there.

## File structure

```
search-location/
├── manifest.json
├── background.js          # service worker: DNR rules, cookies, side panel lifecycle
├── sidepanel.html
├── sidepanel.js
├── sidepanel.css
├── lib/
│   ├── uule.js            # pure UULE v2 encoder (credit comment at top)
│   ├── geocode.js         # Nominatim + optional Google Geocoding
│   ├── acceptLanguage.js  # hl/gl -> Accept-Language header
│   └── storage.js         # chrome.storage.sync with .local fallback
├── icons/
└── scripts/
    └── make_icons.py      # regenerates the icons
```

## License

MIT (see `LICENSE`). Valentin's own repo is the reference implementation; please respect his license there if you copy any code directly rather than reimplementing from the public articles.

## Not included / out of scope (v1)

- Firefox port
- User-agent / device spoofing
- Automated batch SERP capture / scraping
- SERP side-by-side comparison view
- Shared team preset sync
