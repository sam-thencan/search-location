# Publishing to the Chrome Web Store

End-to-end guide for getting this extension on the Chrome Web Store. Read the whole file first before starting — the order matters because some steps gate others.

Realistic first-submission timeline: **2–4 hours of your time + 1–7 days of review**.

---

## 0. One-time setup (15 min, $5)

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Sign in with the Google account you want to publish under. (If this is for business, create/use a dedicated account — you can't rename it later, and it's what users will see as the publisher.)
3. Pay the **$5 one-time developer registration fee**.
4. Verify your account (email, possibly phone).
5. Optional but recommended: register a **group publisher** so the extension isn't tied to one person's account. Settings → Group publishers.

---

## 1. Pre-submission checklist

Work through this before zipping. Each miss is a review delay.

- [ ] `manifest.json` version bumped from any previously-uploaded version (CWS rejects re-uploads of the same version number).
- [ ] Load the unpacked extension in `chrome://extensions` and walk through:
  - [ ] Toggle spoof on → SERPs show the spoofed city
  - [ ] Toggle off → UULE cookie cleared, `X-Geo` header gone (verify in DevTools Network tab)
  - [ ] Side panel opens on action click
  - [ ] SERP counter numbers results correctly on page 1 and continues to page 2
  - [ ] Recents + presets save and restore
  - [ ] Light/dark toggle persists across panel close
  - [ ] Keyboard shortcut `Alt+Shift+L` toggles
- [ ] No console errors in the service worker or side panel across 10 toggle cycles.
- [ ] Icon variants in toolbar swap correctly on enable/disable.
- [ ] Privacy policy hosted at a public HTTPS URL (see `PRIVACY.md` — host as GitHub Pages, Notion public page, your own site, etc.).
- [ ] Screenshots captured (1280×800 PNGs, see §4).
- [ ] Version control clean — tag the release after submission: `git tag v1.0.0 && git push --tags`.

---

## 2. Build the submission zip

```bash
./scripts/build.sh
```

Outputs `dist/local-serp-side-panel-<version>.zip`. The script includes only runtime files — no `.git`, no `scripts/`, no dev docs.

**Verify the zip.** Unzip it into a scratch directory, load it in `chrome://extensions` as an unpacked extension, and walk the checklist in §1 again. If anything is broken because a file was excluded, fix `scripts/build.sh` before submitting.

---

## 3. Store listing content (paste-ready)

Open the Dev Dashboard → "New item" → upload the zip. Fill in these fields:

### Product details

**Name** (45 chars max)
```
Local SERP Side Panel
```

**Summary** (132 chars — this is the blurb users see in search results)
```
Spoof Google Search location from a side panel. For local SEO auditors — see SERPs, local pack, and maps from any city.
```

**Category**: Developer Tools
**Language**: English (United States)

**Description** (detailed, supports line breaks; no HTML)

```
Local SERP Side Panel lets you audit Google Search results from anywhere. Pick a city, flip a toggle, and the current tab's SERP shows what searchers in that location see. Built for local SEO practitioners, agencies, and anyone verifying rankings without a VPN.

KEY FEATURES

Persistent side panel, not a popup. Stays open alongside your SERPs while you work — no re-opening on every tab switch.

Address autocomplete. Start typing a city, pick from Nominatim (OpenStreetMap) suggestions. Arrow keys to navigate, Enter to pick, Escape to dismiss.

Saved location presets. Name them per client ("Client — Portland Dentist", "Client — Bend Roofer") and switch in one click from the dropdown.

Recent locations. The last five addresses you geocoded are captured as chips for one-click reuse.

SERP rank counter. Numbers each organic result on Google search pages, with continuous numbering across pagination. Page 1's last rank carries into page 2's first rank (since AI Overview, featured snippets, etc. often mean fewer than 10 organics per page).

Tab-aware status. A small indicator shows whether the currently-focused tab is a Google SERP where spoofing applies.

Light and dark themes with a one-click toggle that persists.

Keyboard shortcut (Alt+Shift+L, rebindable at chrome://extensions/shortcuts) for quick on/off.

PRIVACY

All settings (presets, recents, preferences) are stored locally in chrome.storage and never transmitted to any server. Geocoding requests go to Nominatim (OpenStreetMap) and optionally to Google Geocoding if you provide your own API key. No analytics, no tracking.

See our privacy policy for details.

CREDIT

Built directly on the UULE v2 / X-Geo header research by Valentin Pletzer (https://valentin.app/uule.html). The original MV2 extension is GS Location Changer (https://github.com/VorticonCmdr/gslocation) — this is a Manifest V3 rewrite with a persistent side panel, saved presets, recent locations, a SERP rank counter, and agency-focused UX.

SUPPORT

Source code + issue tracker: https://github.com/sam-thencan/search-location

Built by Sam Sarsten at thencan (https://thencandesigns.com). Training local SEO agency staff at Local SEO Academy (https://localseoacademy.co).
```

---

## 4. Screenshots

Required: at least one. Recommended: 3–5. Each is 1280×800 PNG.

Best shots to capture (in this order of importance):

1. **Side panel next to a spoofed SERP.** Search `[pizza near me]` with spoof pointing at somewhere the user clearly isn't (e.g. you're in Oregon, spoof is Miami). Panel visible on the right, SERP showing Miami pizza places with Miami map.
2. **Panel close-up.** The whole side panel in full, spoof ACTIVE, showing the status pill, address field populated, recent chips, presets dropdown.
3. **SERP rank counter.** A SERP with the counter enabled — organic results have `#1`, `#2`, `#3…` badges visible.
4. **Page 2 continuity.** Same search on page 2 — show counter reading `#9, #10, #11…` (or similar), demonstrating the carry-forward.
5. **Dark mode panel.** Same as #2 but in dark mode.

Use a clean Chrome profile (no other extensions visible in the toolbar) and a real-looking client city if possible. Crop the browser chrome appropriately.

Save to `screenshots/` (gitignored).

---

## 5. Privacy practices (the part that delays reviews)

This is the form on the Dev Dashboard that trips up most first-time publishers. Answer honestly.

### Single purpose statement (one sentence)

```
Lets users override the Google Search perceived location via a persistent Chrome side panel, so local SEO practitioners can audit SERPs and local results from arbitrary cities.
```

### Data usage disclosures

For each category, click the answer that matches:

- **Personally identifiable information**: Not collected
- **Health information**: Not collected
- **Financial information**: Not collected
- **Authentication information**: Not collected (we never handle Google login or any other credentials)
- **Personal communications**: Not collected
- **Location**: **Yes — handled locally and sent to geocoding services on user request.** Specifically: city/address text the user types is sent to OpenStreetMap Nominatim (and optionally Google Geocoding, if the user provides their own API key) to resolve coordinates. Coordinates are stored locally in `chrome.storage`. Never transmitted elsewhere.
- **Web history**: Not collected
- **User activity**: Not collected
- **Website content**: **Yes — the extension reads the URL of the active tab** (via `chrome.tabs.query`) to decide whether the panel's status indicator should say "active on this Google SERP tab." URLs are not stored or transmitted.

Check the three certification boxes:
- [x] I do not sell or transfer user data to third parties outside of the approved use cases
- [x] I do not use or transfer user data for purposes unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**: paste the public URL where you've hosted `PRIVACY.md`.

---

## 6. Permission justifications (CWS required)

Chrome Web Store requires a justification per permission. Paste these verbatim into each field:

**`sidePanel`**
```
Primary UI surface. The extension runs as a persistent Chrome Side Panel so users can keep location controls visible alongside the Google SERP they're auditing.
```

**`storage`**
```
Persists the user's saved location presets, recent addresses, language/country settings, SERP counter toggle, and theme preference locally in chrome.storage. Nothing is transmitted to any server.
```

**`declarativeNetRequest`**
```
Used to set the X-Geo and Accept-Language request headers on Google Search requests when the user has enabled the location spoof. This is the mechanism that makes Google return results for the user-selected location.
```

**`cookies`**
```
Used exclusively to delete the UULE cookie from Google domains when the user disables the spoof, to ensure no residual location-spoof state remains in the browser.
```

**`tabs`**
```
Reads the URL of the currently-active tab to show a tab-aware status indicator in the side panel (e.g. "active on this Google SERP tab"). URLs are not stored or transmitted.
```

**Host permissions — `*://*.google.com/*` and other ccTLDs**
```
Required for the declarativeNetRequest rule to match Google Search requests and for tabs.query to read the URL of a Google tab to update the status indicator. No other use.
```

**Host permission — `*://nominatim.openstreetmap.org/*`**
```
Address autocomplete and geocoding. Nominatim is the default (free, no key) provider. User-typed address text is sent to this endpoint to resolve lat/lng.
```

**Host permission — `*://maps.googleapis.com/*`**
```
Optional alternative geocoding. Only used when the user explicitly pastes their own Google Geocoding API key into the Advanced panel settings.
```

---

## 7. Submit + review

1. Click **Save draft** and **Review all details** on the dashboard.
2. Fix any validation errors (missing fields, screenshot size, etc.).
3. Click **Submit for review**.
4. Review typically takes 1–3 business days for a first-time extension with modest permissions. Extensions with host permissions on `google.*` may trigger a manual reviewer pass (up to 7 days).
5. You'll get an email on approval or rejection. Rejections usually cite a specific policy — read carefully, address it, and resubmit (no re-review fee).

### Common rejection reasons to pre-empt

- **"Uses broad host permissions without sufficient justification"** — make sure your justification explicitly names the function (e.g. "declarativeNetRequest header modification on Google Search").
- **"Content security policy violation / remote code"** — the manifest CSP is set correctly already. Do not introduce any `<script src="https://…">` references.
- **"Metadata does not match functionality"** — the description should describe what the extension actually does, not aspirational features.
- **"Missing or inadequate privacy policy"** — the policy URL must be reachable (no 404), must reference the extension by name, and must address every data category you ticked "yes" to in §5.

---

## 8. After approval — ongoing

### Publishing updates

1. Bump `manifest.json` version (semver: bug fix → patch, feature → minor, breaking change → major).
2. `./scripts/build.sh`
3. Dev Dashboard → item → **Package** → **Upload new package**.
4. If permissions changed, CWS re-triggers a full review. Permission additions are scrutinized — add only what you need.
5. Updates without permission changes usually publish within hours.

### Monitoring

- Dev Dashboard → **Stats**: installs, users, ratings.
- User reviews and support emails show up on the item's public listing. Reply to at least the first few — it helps social proof.
- If users report bugs, reproduce them against the listed version before shipping a fix.

### Version history / rollback

CWS keeps a version history. You can revert to a previous version from the Dev Dashboard if a bad update ships. Users who already updated will only downgrade on the next extension auto-update (typically within 24 hours).

### Policy compliance audits

Google occasionally sweeps for policy violations (broad-match remote code, deceptive descriptions, tracking without disclosure). Keep the extension honest and you won't hear from them.

---

## Appendix A — publisher contact info

For the Dev Dashboard account profile:

- **Publisher name**: thencan (or your personal name)
- **Support email**: sam@thencandesigns.com
- **Website**: https://thencandesigns.com
- **Privacy policy URL**: (your hosted PRIVACY.md URL)

## Appendix B — what's NOT in the zip

The build script explicitly excludes:
- `.git/` and git metadata
- `scripts/` (build + icon generation tools)
- `node_modules/`, `dist/`
- `README.md`, `PUBLISHING.md`, `PRIVACY.md`
- `screenshots/`
- `.DS_Store`, `__pycache__`

If you ever need to include one of these (unlikely), edit `scripts/build.sh`.
