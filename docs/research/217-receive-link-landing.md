# Research: what a receive link does when it lands on an installed PWA (#217)

**Parent map:** [#185](https://github.com/palebluebytes/inventoria/issues/185) — send a meal to another person, and let your own devices converge.
**Why this exists:** [#200](https://github.com/palebluebytes/inventoria/issues/200) §7 gave the code two carriers — a QR in the same room, a **link** everywhere else, `…/receive#…` with the secret in the fragment — and handed [#201](https://github.com/palebluebytes/inventoria/issues/201) "a routing and service-worker question this ticket does not settle". #201 §8 spun it out unanswered, because what a link _does_ when it lands is behaviour rather than design. [#201](https://github.com/palebluebytes/inventoria/issues/201) §3 then removed the inbox surface entirely, so a meal reaches you by a link you opened or by pointing the barcode scanner at their code, and there is no third door. A link that does not land correctly is half the product missing.
**Grounds:** this repo's own `vite.config.ts`, `wrangler.toml`, `worker/src/index.ts`, `src/App.svelte`, `scripts/offline-boot-check.mjs`, the generated `dist/sw.js`, and the live deployment at `inventoria.palebluebytes.workers.dev`.
**Date:** 2026-08-29. **Status:** research only — no code, no ADR, nothing under `src/` touched. Every claim carries the source that owns it; claims that could not be settled from primary sources are marked **unsourced** or **unverified here** rather than dropped, and §11 says what would settle each one.

---

## 1. The answer in one paragraph

**The link opens the browser, not the app, on both platforms — and on Android that is cosmetic, while on iOS it is fatal, because a Home Screen web app's storage is a different jar from Safari's by Apple's stated design.** On Android a WebAPK does register an `autoVerify` intent filter over the manifest's scope, so the link may open the installed app; but the WebAPK is rendered by Chrome on the user's current profile, so "app" and "tab" are the same origin, the same OPFS ledger and the same service worker, and which window it lands in changes nothing. On iOS, link capturing for Home Screen web apps does not exist — it is an open WebKit feature request filed 2026-07-05 — so the link opens Safari, and Home Screen apps "are created as isolated entities without shared state with the browser". The app that boots from an iOS receive link is therefore a _second install_ with an empty ledger, a different `device_id`, and no visible relationship to the app on the user's Home Screen; a meal accepted there is silently lost. **The link is not a working cross-network carrier on iOS for anyone who installed the app**, which is precisely the population #200 §7 wrote it for. The fragment itself is not the problem: it reaches no server by construction (RFC 9110 §7.1), it survives HTTP redirects by a normative rule (Fetch §4.5), and it survives the service worker's navigation fallback because Workbox matches on pathname and search and never touches it. The problems are all in front of that. The **deploy** is the nearest one and it is measured: `GET /receive` on the live site returns `404 Not found`, in plain text, from the Worker, **without the COOP/COEP headers**, because `not_found_handling` defaults to `"none"` and `_headers` does not apply to Worker responses — while `vite dev` and `vite preview` both fall back to `index.html`, so the whole e2e suite would pass over the hole. And the app has no router at all, so the smallest honest answer is not a route: it is a **fragment read at boot on `/`**, exactly the shape the Web Share Target already uses, which needs no Cloudflare change, no service-worker change, and passes the #125 offline gate unmodified.

---

## 2. What was read, what was measured, and what was not

**Measured, today, against the live deployment** (`curl`, 2026-08-29): the status, headers and body of `/`, `/index.html`, `/receive`, `/receive/`, `/manifest.webmanifest`, `/sw.js`, `/api/proxy` and `/.well-known/assetlinks.json`. Recorded in §8.

**Measured, today, against the repo**: `node scripts/offline-boot-check.mjs` (§9), and the byte sizes of every asset on the boot path (§9).

**Read**: the WHATWG Fetch and HTML standards, RFC 3986 and RFC 9110, the WICG Web App Launch Handler draft, four Chrome Platform Status entries, the Chromium WebAPK `AndroidManifest.xml` template, two WebKit Bugzilla records, Apple's own documentation for `SFSafariViewController` and `WKWebsiteDataStore`, Google's and Cloudflare's first-party documentation, and the Workbox 7.4.1 and vite-plugin-pwa 1.3.0 sources in this repo's `node_modules`.

**Not done**: no browser was driven and no Playwright spec was run, per AGENTS.md §1. Every timing claim in §9 is a **byte bound**, not a wall-clock measurement, and says so.

**A note on which tree.** This branch (`worktree-wayfinder-185-p2p-sync`) is 22 commits behind `main`, and two of those commits matter here: ADR-0069's boot guard (`src/main.ts`, `src/boot-guard.ts`, `src/lib/boot-recovery.ts`) and ADR-0070's single-Worker deploy (`wrangler.toml`, `worker/src/index.ts`). **Everything below describes `origin/main`**, because that is what #203 will write an ADR against and what is deployed.

---

## 3. Does a link into an installed PWA open the app or the browser?

### 3.1 Android / Chrome: yes, in principle, scoped by the manifest's `scope`

The WebAPK Chrome mints on install declares, in Chromium's own template:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW"></action>
    <category android:name="android.intent.category.DEFAULT"></category>
    <category android:name="android.intent.category.BROWSABLE"></category>
    <data android:scheme="{{{scope_url_scheme}}}" android:host="{{{scope_url_host}}}"
          {{{scope_url_path_type}}}="{{{scope_url_path}}}"></data>
</intent-filter>
```

— [`chrome/android/webapk/shell_apk/AndroidManifest.xml`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/android/webapk/shell_apk/AndroidManifest.xml). So **capture is defined by the Web App Manifest's `scope`, and by nothing else**. `dist/manifest.webmanifest` declares `"scope": "/"` and `"start_url": "/"`, so every path on the origin is in scope, `/receive` included. Google's own description matches: "When a Progressive Web App is installed on Android, it will register a set of intent filters for all URLs within the scope of the app" ([web.dev, _WebAPKs on Android_](https://web.dev/articles/webapks)).

**The `autoVerify` will not verify for this site.** Android "queries the corresponding websites for the Digital Asset Links file at `https://hostname/.well-known/assetlinks.json`" for each host in such a filter ([Android, _Verify Android App Links_](https://developer.android.com/training/app-links/verify-android-applinks)). This origin serves none — `public/` contains no `.well-known`, and `GET /.well-known/assetlinks.json` on the live site returns **404** (measured). When automatic verification does not succeed, the association is available only if the user turns it on themselves, under Settings → **Open by default** → "Links to open in this app" (same Android source). So on a modern Android the honest expectation is: **the link opens Chrome**, and opens the WebAPK only if the user has gone and said so.

### 3.2 …and on Android it does not matter

This is the finding that closes the Android half of the ticket, and it is first-party:

> "No, the site opens in the version of Chrome the user added the site from." … "Chrome uses the current profile to store any data, and it will not be segregated away. This allows a shared experience between the browser and the installed app. Cookies are shared and active, any client side storage is accessible and the service worker is installed and ready to go."
> — [web.dev, _WebAPKs on Android_](https://web.dev/articles/webapks)

A WebAPK is a shell; the Chromium manifest above carries `runtimeHost` meta-data naming the Chrome package that actually renders it. So on Android the installed app and a Chrome tab are the same origin in the same profile: **the same OPFS ledger, the same registered service worker, the same precache.** Whether the receive link opens in app chrome or tab chrome is a presentation question, not a correctness one. Nothing about the ledger depends on it.

### 3.3 iOS / WebKit: no, and there is no manifest member that changes it

Link capturing for installed Home Screen web apps **does not exist in WebKit**. It is an open feature request:

> **[WebKit Bugzilla 318623](https://bugs.webkit.org/show_bug.cgi?id=318623)** — "[PWA] Support link capturing / URL handling for installed Home Screen Web Apps, matching Chromium's `handle_links`". Status **NEW**, filed 2026-07-05, radar `rdar://181425408` filed by Alexey Proskuryakov 2026-07-06. The report states that a link to a URL inside an installed PWA's scope, tapped from email, messages or another app, opens in Safari rather than launching the web app.

iOS 26 changed installability, not link handling: "By default, every website added to the Home Screen opens as a web app… there are now zero requirements for 'installability' in Safari" ([WebKit, _WebKit Features in Safari 26.0_](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), 2025-09-15). That post says nothing about links, `launch_handler` or capturing.

### 3.4 What the manifest members buy, per browser: nothing, on either mobile platform

| Member                                       | Specified                                                                                                            | Shipped                                                                                   | Source                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `launch_handler` (`client_mode`)             | Yes — [WICG Web App Launch Handler](https://wicg.github.io/web-app-launch/), incubation in a Community Group         | Chrome **desktop 110**; Chrome **Android: none**. Firefox "no signal", Safari "no signal" | [chromestatus 5722383233056768](https://chromestatus.com/feature/5722383233056768) |
| `handle_links`                               | Explainer only ([WICG/pwa-url-handler](https://github.com/WICG/pwa-url-handler/blob/main/handle_links/explainer.md)) | **On hold** in Chrome, no milestone anywhere. Firefox "no signal", Safari "no signal"     | [chromestatus 5740751225880576](https://chromestatus.com/feature/5740751225880576) |
| `capture_links` (Declarative Link Capturing) | Withdrawn                                                                                                            | **No longer pursuing**; origin trial M91–M97, superseded by `launch_handler`              | [chromestatus 5734953453092864](https://chromestatus.com/feature/5734953453092864) |
| `url_handlers` (PWAs as URL Handlers)        | Withdrawn                                                                                                            | **No longer pursuing**. Firefox "defer"                                                   | [chromestatus 5739732661174272](https://chromestatus.com/feature/5739732661174272) |

The launch-handler spec's one relevant hard rule is a scope check: "Web application launches MUST NOT use a `targetURL` that is not within scope of the manifest" — satisfied here by `"scope": "/"`.

Desktop Chrome does now capture navigations into installed PWAs — "available from Chrome 139 for Windows, Mac, and Linux, with ChromeOS support coming in a future release" ([Chrome for Developers, _Navigation management into installed PWAs_](https://developer.chrome.com/docs/capabilities/pwa-navigation-management); the feature entry is [chromestatus 5183927385587712](https://chromestatus.com/feature/5183927385587712), "User Navigation Capturing on Desktop", dev-trial from 134, Android none). **Irrelevant to this design**, which is two phones.

**Conclusion for #203: adding `launch_handler` to the manifest is harmless and changes nothing on either platform this app is used on.** Do not write it down as a mitigation.

### 3.5 The three containers a link can land in, and what each one is

The link's whole point is that it travels through a messenger the two people already share, so the container matters more than the browser does.

| Container                          | Storage                                                                                                                                                                                                                                                      | Source                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Android, Chrome tab or WebAPK**  | The user's Chrome profile. Shared.                                                                                                                                                                                                                           | [web.dev, _WebAPKs_](https://web.dev/articles/webapks)                                                             |
| **Android, Chrome Custom Tab**     | "Shared cookie jar and permissions model"; Custom Tabs are "powered directly by the user's preferred browser, and automatically sharing the state and features offered by it"                                                                                | [Chrome for Developers, _Custom Tabs_](https://developer.chrome.com/docs/android/custom-tabs)                      |
| **Android, `WebView`**             | **Isolated.** WebViews "don't share state with the browser"                                                                                                                                                                                                  | same source                                                                                                        |
| **iOS, Safari**                    | Safari's jar — **not** the Home Screen app's                                                                                                                                                                                                                 | [WebKit Bugzilla 181849](https://bugs.webkit.org/show_bug.cgi?id=181849)                                           |
| **iOS, `WKWebView` in a host app** | The **host app's** store. "By default, [`WKWebView`] uses the default data store returned by the `default()` method, which saves website data persistently to disk" — that store belongs to the embedding app                                                | [Apple, `WKWebsiteDataStore`](https://developer.apple.com/documentation/webkit/wkwebsitedatastore)                 |
| **iOS, `SFSafariViewController`**  | Isolated from the **host app**: "Interactions with the web interface aren't visible to your app, and you can't access AutoFill data, browsing history, or website data." Whether it shares with **Safari** is **unsourced** in Apple's current documentation | [Apple, `SFSafariViewController`](https://developer.apple.com/documentation/safariservices/sfsafariviewcontroller) |

**Which container a given messenger uses is not readable from any specification** and varies by app and by version. That is a device check, not a reading task (§11).

The `SFSafariViewController` gap does not change the iOS conclusion, and this is worth stating so nobody chases it: even if it shared everything with Safari, Safari is still not the Home Screen app's jar. §4 is why.

---

## 4. The real question is storage, and iOS answers it badly

> "The current behavior (on Apple platforms) is by design. Home Screen apps are created as isolated entities without shared state with the browser."
> — Brent Fulgham, WebKit, on [WebKit Bugzilla 181849](https://bugs.webkit.org/show_bug.cgi?id=181849), _"Add to homescreen" apps don't share storage with Safari_. Status **NEW**, last activity 2022-06-14 — open for eight years and stated to be intended.

Put that beside §3.3 and the consequence is mechanical, and it is the most load-bearing sentence in this note:

**On iOS, a receive link opened by someone who has Inventoria on their Home Screen boots a different copy of Inventoria, in Safari, with an empty ledger.**

Concretely, in this app's terms:

- OPFS is per-origin **per storage partition**, and the two partitions are different, so `/inventoria.db` in the Safari instance is a fresh file.
- `getOrCreateDeviceId(db)` (`src/lib/db/db.core.ts`, via `db.worker.ts`) mints a **new device id** on that fresh database — so ADR-0020's HLC starts from nothing, and the two copies are, to the design, two devices that were never paired.
- The service worker registration is separate too, so the Safari instance may have no worker at all on first arrival — which is where §8's 404 bites.
- The failure is **silent**. The app boots, renders, shows an empty food log, and accepts the meal. #197's re-mint runs, #199 §11's arrival mark is written, and the meal lands somewhere the user cannot reach from their Home Screen icon.

This is the point where #200 §7's claim needs qualifying rather than restating. It said "the link is not a convenience, it is the remote case's only humane carrier". It is the only _proposed_ carrier, and on iOS it does not carry. §10 records the correction.

**One thing this does not break:** an iOS user who never installed the app and only ever uses Safari is entirely consistent — one jar, one ledger, link works. The break is exactly the intersection of _installed_ and _link_, which is the population #217 was asked about.

---

## 5. Does the fragment survive?

Short answer: **yes at every layer that is specified, and the two places it can die are both outside the browser's control.** A fragment silently dropped is a code silently destroyed, so each layer is taken separately.

### 5.1 It reaches no server, by construction

> "The target URI excludes the reference's fragment component, if any, since fragment identifiers are reserved for client-side processing."
> — [RFC 9110 §7.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-7.1), citing [RFC 3986 §3.5](https://www.rfc-editor.org/rfc/rfc3986.html#section-3.5)

This is the sentence #200 §7 was relying on and it holds unconditionally. It also holds for the messenger's link-preview crawler, which performs an ordinary HTTP GET and therefore never sees the secret.

### 5.2 It survives redirects, by a normative rule — including the one this site actually performs

Fetch §4.5 _HTTP-redirect fetch_: "Let `locationURL` be `internalResponse`'s **location URL** given request's current URL's fragment." And Fetch §2.2.6, the location URL algorithm: "**If `location` is a URL whose fragment is null, then set `location`'s fragment to `requestFragment`.**" ([Fetch Standard](https://fetch.spec.whatwg.org/)). So a redirect whose `Location` carries no fragment of its own inherits the request's.

That is not theoretical here. Measured on the live deployment: `GET /index.html` → **307**, `Location: /`. `html_handling` defaults to `"auto-trailing-slash"`, which normalises with 307 redirects ([Cloudflare, _HTML handling_](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)). A link written as `…/index.html#…` therefore lands on `/` **with the fragment intact**, by the rule above.

### 5.3 It survives the service worker's navigation fallback, because the fallback never sees it as routing input

`dist/sw.js` ends with, verbatim:

```js
s.registerRoute(new s.NavigationRoute(s.createHandlerBoundToURL("index.html")));
```

Three facts from the Workbox 7.4.1 sources in `node_modules`:

- `NavigationRoute` "will only match incoming Requests whose mode is set to `navigate`", and its optional `allowlist` / `denylist` regexps "are matched against the concatenated `pathname` and `search` portions of the requested URL" (`workbox-routing/NavigationRoute.js`). **The fragment is not part of route matching.** Neither list is set here anyway (§7).
- `createHandlerBoundToURL('index.html')` returns the precached `Response` for that URL (`workbox-precaching/createHandlerBoundToURL.js`). It is a _response_, not a redirect, so nothing rewrites the document's URL.
- The document's URL comes from the session history entry, not from the response: HTML's _create navigation params by fetching_ builds a request whose URL is "entry's URL". So after the fallback serves `index.html` for a navigation to `/receive#…`, `location.pathname` is `/receive` and **`location.hash` is the code**.

### 5.4 It does not leak onward

Referrer Policy §8.4, _strip url for use as a referrer_, step 5: "**Set url's fragment to `null`.**" ([W3C Referrer Policy](https://w3c.github.io/webappsec-referrer-policy/)). So no subresource the receive page loads carries the secret in a `Referer`.

### 5.5 Where it can actually die — four places, none of them HTTP

1. **A messenger's link wrapper.** When a client rewrites `https://site/receive#r=…&k=…` into `https://l.example/?u=…`, it is _constructing a new URL client-side_, not issuing an HTTP redirect. §5.2's rule does not apply, and whether the fragment is carried into the wrapper is entirely that client's choice. **Unsourced per messenger** — device check (§11).
2. **Auto-linkification.** Whether a plain-text messenger makes the whole string tappable, `#…&…` included, is per-client. **Unsourced** — device check.
3. **`history.replaceState` at the app's own hands.** `src/lib/views/items/ItemImportPanel.svelte:30` already does exactly this for the Share Target: `const cleanUrl = window.location.pathname; window.history.replaceState({}, document.title, cleanUrl);` — which discards **both** the search and the hash. Copying that pattern _after_ reading the code is desirable (see §6.4); doing it before is how the code disappears.
4. **A launch that falls back to `start_url`.** If any launch path substitutes the manifest's `start_url` for the target URL, the fragment is gone with the rest of the URL. Not observed, but it is the shape of the failure to watch for on a device.

### 5.6 One privacy nuance the ADR should carry

By specification the **service worker can see the fragment**. HTML's navigation request URL is "entry's URL", and Fetch's `Request` `url` getter is "return this's request's URL, **serialized**" — with no `exclude fragment`. So `FetchEvent.request.url` for the receive navigation may carry the key. This is on-device and same-origin, so it is not a disclosure to anyone; but it means **a service worker that logged request URLs would log the key**, and #210 §12 already asks for a `scripts/worker-closure-check.mjs`-style gate that the relay module calls no `console.*`. The same rule should cover the service worker. Whether Chromium and WebKit actually surface the fragment on `FetchEvent.request.url` is **unverified here** (§11); the rule costs nothing either way.

---

## 6. This app has no router, and the smallest honest answer is not a route

### 6.1 Confirmed: there is no path-based routing anywhere

`src/App.svelte` declares `type Tab = "food" | "agenda" | "media" | "items" | "notes" | "settings"` and `let activeTab = $state<Tab>("food")`, and every view is a `{#if activeTab === …}` block. `Sidebar` binds `activeTab`. Nothing reads `location.pathname` to decide what to render, nothing writes history on a tab change, and there is no router dependency in `package.json`.

### 6.2 The complete set of URL reads in the app

From `grep -rn "location.search\|location.hash\|URLSearchParams\|searchParams\|window.location" src/`:

| Site                                               | Reads                                                                                                              | Ships?                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `src/App.svelte:29`                                | `?demo=` (`bottomsheet`, `p2p198`)                                                                                 | **No** — gated on `import.meta.env.DEV`, dynamically imported, dead-code eliminated |
| `src/App.svelte:69`                                | `?url=` / `?text=` — the Web Share Target, read in `onMount` after `await initPromise`, sets `activeTab = "items"` | Yes                                                                                 |
| `src/lib/views/items/ItemImportPanel.svelte:21,30` | the same params, then `replaceState` to `location.pathname`                                                        | Yes                                                                                 |
| `src/lib/db/db.client.ts:74`                       | `?mem=1`, the e2e in-memory escape hatch                                                                           | Yes (inert unless set)                                                              |
| `src/lib/send-proto/proto-state.svelte.ts:409`     | `?variant=`                                                                                                        | **No** — `import.meta.env.DEV`, and branch-local to the #201 prototype              |
| `src/lib/food/open-food-facts.ts:699`              | builds a `URLSearchParams` body — not a URL read                                                                   | —                                                                                   |

**`location.hash` is read nowhere in the app.** The Web Share Target is the only precedent for "something arrived in the URL", and its manifest `action` is `"/"` — the app has never used a second path for anything.

### 6.3 The recommendation: a fragment read at boot on `/`, not a `/receive` route

**A query/fragment read at boot, on `/`, the way the Share Target already does it.** Not a route. The reasons are not aesthetic:

|                                          | `/#…` or `/?…#…`                                                              | `/receive#…`                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Served by the edge with no config change | **Yes** — `/` is a precached asset, 200, and carries COOP/COEP (measured, §8) | **No** — 404 today (measured, §8)                                                                  |
| COOP/COEP on the response                | **Yes**                                                                       | Only once the Cloudflare config is changed; **never** if the Worker answers it (§8.3)              |
| Works before the service worker exists   | **Yes**                                                                       | No                                                                                                 |
| Works after the service worker exists    | Yes                                                                           | Yes — the navigation fallback already covers it (§7)                                               |
| Survives ADR-0069's recovery reload      | **Yes** — reload lands on a 200                                               | **No** — reload lands on the 404 (§9.4)                                                            |
| Needs a Cloudflare config change         | No                                                                            | Yes, with a blast radius over the whole origin (§8.4)                                              |
| Covered by the #125 offline gate         | Yes, unchanged (§7.3)                                                         | Yes for the fallback; **no** if it becomes a second HTML entry (§7.4)                              |
| Dev/prod parity                          | Same                                                                          | **Diverges** — `vite dev` and `vite preview` fall back to `index.html`, production does not (§8.5) |

The path buys exactly one thing: a URL a human can read as "this is a receive link". That is real but small, and it is bought at the price of a deploy setting that changes how the whole origin answers every unmatched path.

**If #203 keeps `/receive` anyway**, it must write down §8.4's config change _and_ §8.3's header consequence _and_ §8.5's dev/prod divergence, because none of them is discoverable from the app code.

### 6.4 Two behaviours the read has to have, both forced by decisions already taken

- **Read once, then clear the URL.** After parsing, `history.replaceState({}, document.title, location.pathname)` — the exact call `ItemImportPanel.svelte:30` already makes. Two reasons, both upstream: #199 §6 burns the code on a refusal, so a reload must not look like a retry; and the key should not sit in the address bar, in `document.referrer` of anything, or in whatever the browser's history sync does with a URL.
- **Parse after mount, inside a `try`, never at module scope.** ADR-0069's guard treats any uncaught error or rejection from the shell as "this build cannot start" and responds by unregistering the service worker, deleting every cache, and reloading. A malformed fragment thrown at module scope would therefore wipe a working offline install (§9.4). The Share Target read is already inside `onMount`; the receive read belongs in the same place.

---

## 7. What the service worker has to do: nothing

### 7.1 The navigation fallback is already configured, by default, and it is unrestricted

`vite.config.ts`'s `workbox` block sets `maximumFileSizeToCacheInBytes`, `globPatterns`, `globIgnores` and `runtimeCaching`. It does **not** set `navigateFallback`, `navigateFallbackDenylist` or `navigateFallbackAllowlist` — and neither does anything else in the repo.

vite-plugin-pwa 1.3.0 supplies the default:

```js
const defaultWorkbox = {
  swDest,
  globDirectory: outDirRoot,
  offlineGoogleAnalytics: false,
  cleanupOutdatedCaches: true,
  dontCacheBustURLsMatching,
  mode,
  navigateFallback: "index.html",
};
```

— `node_modules/vite-plugin-pwa/dist/index.js:832–839`, merged as `Object.assign({}, defaultWorkbox, options.workbox || {})`.

workbox-build 7.4.1's `sw-template` then emits the route only when `navigateFallback` is set, and attaches an options object **only** when an allowlist or denylist exists (`workbox-build/build/templates/sw-template.js`). Neither does, so the generated worker carries the bare form — confirmed in `dist/sw.js`:

```js
s.registerRoute(new s.NavigationRoute(s.createHandlerBoundToURL("index.html")));
```

`NavigationRoute`'s constructor defaults are `allowlist = [/./]`, `denylist = []` (`workbox-routing/NavigationRoute.js`).

### 7.2 So: once the service worker is active, `/receive` already works

Every navigation on the origin, to any path, matches `mode === "navigate"`, matches `/./`, is denied by nothing, and is answered from the precached `index.html` — online or offline, at `/receive` or at `/`. **The service-worker half of #201's spun-off question needs no change at all.** That is the good news of this note, and it is worth saying plainly because the ticket assumed otherwise ("A navigation to `/receive` that is not a precached URL needs a navigation fallback").

The gap is not the service worker. It is every navigation that happens _before_ one is controlling the page: the first ever visit, a visit in a storage partition where none is registered (§4, iOS), and the reload ADR-0069's guard performs after deleting them (§9.4). All three land on the network, and §8 is what the network says.

### 7.3 The #125 offline gate: a boot-time fragment read passes it, unchanged

`scripts/offline-boot-check.mjs` runs the built entry chunk under a stubbed browser and asserts it reaches `mount(App)`. Two properties decide the answer:

- It stubs the location object as `define("location", new URL("http://localhost/"))`. A `URL` has both `.search` and `.hash`, so `new URLSearchParams(window.location.search)` and `window.location.hash` both work and both return the empty string. **A read of an absent fragment is exactly the case the gate already exercises.**
- Its source of truth for the build is `dist/index.html`'s entry chunk and `dist/sw.js`'s precache manifest. Adding a fragment read changes neither.

Measured today: `ok  the app starts offline (assets/index-D2wAyw7F.js, 40 precached URLs, 0 pre-mount requests)`.

### 7.4 Two ways to fail the gate, both avoidable and both worth naming

- **Throwing at module scope on a malformed or absent fragment.** The gate runs with an empty one, so this fails immediately — which is the gate doing its job, and is the same rule §6.4 states for a different reason.
- **Giving the receive its own HTML entry** (`receive.html`, a second Rollup input). The gate hardcodes `dist/index.html` and reads _its_ entry chunk. A second entry would be **invisible to the gate**, and could ship unable to start offline with every check green. If #203 ever considers a second entry, this is the reason not to.

---

## 8. The deploy is where the link actually breaks today, and it is measured

### 8.1 What the live site answers

`curl` against `https://inventoria.palebluebytes.workers.dev`, 2026-08-29:

| Request                            | Status  | Notable headers                                                                                                    | Body                 |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ | -------------------- |
| `GET /`                            | **200** | `cross-origin-opener-policy: same-origin`, `cross-origin-embedder-policy: require-corp`, `content-type: text/html` | the app shell        |
| `GET /index.html`                  | **307** | `location: /`, COOP + COEP present                                                                                 | —                    |
| `GET /manifest.webmanifest`        | 200     | COOP + COEP present                                                                                                | —                    |
| `GET /sw.js`                       | 200     | COOP + COEP present                                                                                                | —                    |
| `GET /api/proxy`                   | 400     | **no** `cross-origin-*`                                                                                            | `Missing target URL` |
| **`GET /receive`**                 | **404** | **no** `cross-origin-*`, `content-type: text/plain`                                                                | **`Not found`**      |
| `GET /receive/`                    | **404** | as above                                                                                                           | `Not found`          |
| `GET /.well-known/assetlinks.json` | 404     | —                                                                                                                  | —                    |

### 8.2 Why, exactly

Root `wrangler.toml` on `main` sets `main = "worker/src/index.ts"` and `[assets] directory = "dist"`, with no `not_found_handling` and no `run_worker_first`. Cloudflare's defaults are `html_handling: "auto-trailing-slash"`, **`not_found_handling: "none"`**, `run_worker_first: false` ([Cloudflare, _Wrangler configuration → Assets_](https://developers.cloudflare.com/workers/wrangler/configuration/)). So an unmatched path is not given a fallback asset; it falls through to the script, and the script says:

```ts
const PROXY_PATH = "/api/proxy";
…
if (pathname !== PROXY_PATH) {
  return errorResponse("Not found", 404);
}
```

— `worker/src/index.ts` on `origin/main`, whose own comment explains the reasoning: everything else on the origin is a static asset, "and the platform serves those before the Worker is invoked at all (`run_worker_first` defaults off)". That reasoning is correct **for today's app**, which has exactly one non-asset path. It stops being correct the moment `/receive` exists.

### 8.3 The header consequence, which is worse than the 404

> "Custom headers defined in the `_headers` file are **not applied to responses generated by your Worker code**, even if the request URL matches a rule defined in `_headers`."
> — [Cloudflare, _Headers_](https://developers.cloudflare.com/workers/static-assets/headers/)

Measured above: the `/receive` 404 and the `/api/proxy` 400 both come back **without** COOP or COEP, while every asset response carries both. So any design that has the **Worker** answer `/receive` with the app shell would serve it **without cross-origin isolation**. `src/main.ts` warns about exactly this, and the consequence is in `db.worker.ts`: no `SharedArrayBuffer` means `sqlite3_vfs_find("opfs")` fails and the worker falls back to `new sqlite3.oo1.DB()` — **an in-memory database**. A meal accepted on such a page is written to a ledger that ceases to exist when the tab closes. This is the same class of silent loss as §4, arrived at from the other direction.

**Rule for #203: the receive page must be served by the asset router, never by the Worker script.**

### 8.4 If `/receive` is kept, the config change and its blast radius

`not_found_handling = "single-page-application"` makes Workers "serve the contents of the `/index.html` file with a `200 OK` status" for any request that matches no asset ([Cloudflare, _Single Page Application_](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)). That fixes `/receive` and gives it the `_headers` treatment.

It also changes how the whole origin answers **every** unmatched path, from an honest 404 to a 200 app shell. And it raises a question this note could not settle: with `run_worker_first` false, the asset router runs first — **does an SPA fallback swallow `/api/proxy` before the Worker is ever invoked?** If it does, ADR-0070's same-origin proxy stops working. Cloudflare's routing documentation does not state the precedence between `not_found_handling` and Worker fall-through. **Unsourced; must be tested before the flag is set** (§11). The clean mitigation exists in the same config surface: `run_worker_first` also accepts an array of route patterns, so `run_worker_first = ["/api/proxy"]` pins the proxy in front of the asset router regardless.

### 8.5 The divergence that would hide all of this

Vite's `appType` defaults to `'spa'`, which means "include HTML middlewares and use SPA fallback", and configures `sirv` with `single: true` in preview ([Vite, _Shared options_](https://vite.dev/config/shared-options)). So **`pnpm dev` and `pnpm preview` both serve `index.html` for `/receive`.** Every Playwright spec runs against one or the other (`playwright.config.ts` → `http://localhost:5173`; `playwright.offline.config.ts` → `pnpm preview`). A `/receive` route would therefore be green across the entire local loop and the entire CI suite, and 404 only in production. There is no existing gate that can see this, which is itself an argument for §6.3.

---

## 9. What a cold start costs, and whether the room has to outlive it

### 9.1 Nothing is fetched before the app mounts

Measured: `0 pre-mount requests`. The entry chunk evaluates to `mount(App)` without asking the network for anything.

### 9.2 The bytes on the boot path (dist, 2026-08-29)

| Asset                                         | Raw     | Gzip    | On the mount path? |
| --------------------------------------------- | ------- | ------- | ------------------ |
| `index.html`                                  | 508     | 322     | yes                |
| `assets/index-D2wAyw7F.js`                    | 685,008 | 204,461 | yes                |
| `assets/index-a4RXSpyl.css`                   | 174,332 | 36,337  | yes                |
| `assets/db.worker-CJXLgoJ6.js`                | 229,205 | 68,502  | no — after mount   |
| `assets/sqlite3-worker1-N5XM9NUp.js`          | 210,883 | 62,513  | no                 |
| `assets/sqlite3-BVKGSWc-.wasm`                | 864,752 | 400,546 | no                 |
| `assets/sqlite3-opfs-async-proxy-D_xnb1D8.js` | 32,289  | 10,406  | no                 |

**On an installed PWA all of these come from the precache** (40 URLs), so a cold open is parse-and-execute with no network at all. On a _first_ arrival with no worker, the critical path is about **241 KB gzip** (entry + CSS + shell).

### 9.3 Joining the room does not need the database, and that is the design finding

`src/App.svelte` kicks off `dbClient.init("/inventoria.db")` at component-init time, before `onMount`; `db.client.ts` constructs the worker, and `db.worker.ts` then loads the SQLite WASM module, opens `OpfsDb`, derives the device id, ensures the ledger schema and seeds the HLC from its high-water mark. All of that is **after mount and off the render path**; `dbReady` only gates the views.

A receive surface needs a `WebSocket` and `crypto.subtle` to join the room, open the seal and render the meal. It needs the ledger **only at accept**, which is a human decision that happens later and is not on the sender's clock. So:

- **The room does not have to outlive the boot.** The relay's room lifetime is **five minutes** (#210 §5.4, which is also the number #199 §6 left open for the sender's wait). #198 measured the sender's actual wait at 10.4 s, all of it human, and the recipient's scan-to-verified-meal at 904 ms.
- **A payload can be received, seal-verified and displayed before OPFS is ready**, and #203 should say so, because the obvious implementation — hang the receive surface off `dbReady` like every other view — would put a WASM load and an OPFS open in front of a live socket for no reason.
- The one thing that _is_ needed early and is cheap: the inbox depth check (#199 §13) lives in `localStorage`, which is synchronous and available immediately.

### 9.4 The one boot hazard that is real: ADR-0069's recovery reload

ADR-0069's guard fires on any uncaught `error` or `unhandledrejection` from the shell, or on a 10-second grace period elapsing with no mount. It then unregisters every service worker, deletes every cache, and calls `location.reload()` — once per session, enforced by `sessionStorage`.

`location.reload()` re-navigates to the document's URL, so **the fragment survives the recovery**. What does not survive is the service worker. The reload lands on the network, and at `/receive` the network is §8.1's 404 — so a receive that throws early converts a bad code into _a wiped offline install and a dead end_, on a device that was working a moment earlier. On `/` the same reload lands on a 200 and the app rebuilds its precache. This is the sharpest single argument in §6.3's table.

### 9.5 What is not measured

**No wall-clock figure for a cold boot on a phone.** §9.2 is a byte bound, not a time bound. The only timings this repo owns are ADR-0047 §2's parse costs for the bundled corpus (2.91 ms for the Search index, 102.38 ms for the Nutrient store, 136.75 ms combined), and those are post-mount errands. What would measure it: `performance.mark()` around `mount(App)` and around `dbReady`, read under `playwright.offline.config.ts` — which is the one config that already builds, installs a worker and reloads — or a device trace. It should be measured before anyone designs a "connecting…" state around it.

---

## 10. What this corrects or qualifies upstream

- **#200 §7: "the link is not a convenience, it is the remote case's only humane carrier."** True as a statement of what is left after the camera; **false as a claim that it works**. On iOS it does not reach the installed app's ledger at all (§3.3, §4), and iOS is the map's floor platform by #194 §10. The ADR must either name a second cross-network carrier or record that installed iOS users have none.
- **#200 §7's URL shape, `…/receive#room=…&k=…`.** The path is not free (§8) and buys nothing the service worker does not already give a fragment on `/` (§7.2). #217 §6.3 recommends `/` and the ADR should say which it chose and why.
- **#201 §8's framing, "a routing and service-worker question".** The service-worker half is already answered and needs no change (§7.2). The routing half is a two-line boot read (§6.3). The _unanswered_ half was neither: it is a **deploy** question and a **storage-partition** question, and both were invisible from the app's own code.
- **#217's own body: "A navigation to `/receive` that is not a precached URL needs a navigation fallback."** It has one, by default, since `vite-plugin-pwa` sets `navigateFallback: "index.html"` and this repo has never overridden it (§7.1).
- **#210 §3's argument that same origin is worth something specifically because "#200 §7's receive link is same-origin"** stands, and gains a second reason: an asset-router-served same-origin page is the only way the receive page gets COOP/COEP, and therefore the only way it gets a real ledger (§8.3).
- **#209 gains one check and does not change subject.** See §11.
- **A sibling of this ticket is affected.** #201 §8 also spun off "what holds a received meal when nobody accepts it". On iOS that hold would be in the wrong storage partition too, so the two tickets share §4's premise and should be read together by #203.

---

## 11. What this note does not settle, and what would settle it

**Needs a physical iPhone.** These belong on [#209](https://github.com/palebluebytes/inventoria/issues/209), which already holds one iPhone's worth of unrun checks and is `wayfinder:paused` for want of the device. **Adding them there rather than opening a new ticket**, because they need the same hardware and the same session:

1. **The core claim, end to end.** With Inventoria on the Home Screen, tap a link to `https://<origin>/#anything` from Messages. Confirm it opens **Safari**, not the web app (predicted by WebKit Bugzilla 318623). Then confirm the Safari instance is a _different_ store: export the ledger from it (`LedgerExport`) and check it is empty and carries a different `device_id` from the Home Screen app's export. This is the one check that decides whether §4 is right, and everything downstream of it hangs on the answer.
2. **Whether the fragment reaches the page**, in Messages, WhatsApp and one Meta app — checking both that the whole string including `#…&…` is made tappable, and that `location.hash` is non-empty on arrival. §5.5 items 1 and 2.
3. **Which container each messenger uses** (Safari, `SFSafariViewController`, or an in-app `WKWebView`), which decides whether the page even has a persistent store. §3.5.
4. Not new, but relevant: #209's existing check 2, camera behaviour in a Home Screen web app versus a Safari tab, becomes _more_ load-bearing if §4 holds, because the camera becomes iOS's only working receive door.

**Needs an Android phone**, and is lower stakes because §3.2 makes the answer cosmetic: whether the WebAPK actually receives the intent with no `assetlinks.json` (predicted: no, unless the user enabled it under Open by default), and whether an in-app WebView in a messenger is used for the link.

**Needs a `wrangler dev` run, not a device.** Whether `not_found_handling = "single-page-application"` swallows `/api/proxy` before the Worker script is invoked (§8.4). Cloudflare's docs do not state the precedence. Ten minutes with `wrangler dev` settles it, and it must be settled _before_ anyone sets the flag, because getting it wrong silently breaks the scraper.

**Unverified here, cheap to make moot.** Whether Chromium and WebKit surface the fragment on `FetchEvent.request.url` for a navigation (§5.6). The specification says they may. Rather than test it, forbid the service worker from logging request URLs — the same shape as #210 §12's `console.*` gate.

**Unsourced.** Whether `SFSafariViewController` shares cookies and website data with Safari on current iOS (§3.5). Apple's current documentation states isolation from the _host app_ and says nothing about Safari. It does not change any conclusion in this note, because Safari is not the Home Screen app's jar either way (§4).

**Out of scope and deliberately not answered.** What the app should _do_ when it detects it is running in the wrong partition — an empty ledger and an unfamiliar `device_id` are detectable, so a refusal is constructible — but that is a design call for #203 and #201's voice rules, not a research finding.
