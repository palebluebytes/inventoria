# Research: how one Vite build produces two independently installable PWAs on one origin (#269)

**Parent map:** [#267](https://github.com/palebluebytes/inventoria/issues/267) — the food app becomes an app of its own; one origin, many installable Facets.
**Grounds:** the single `VitePWA({…})` call in `vite.config.ts`, the absent `build.rollupOptions.input`, and the built `dist/` at HEAD `0660da0`.
**Date:** 2026-08-31. **Status:** research only — a throwaway prototype was built and measured, then reverted. No production config changed.

**Toolchain actually installed** (read off `node_modules`, not `package.json` ranges): `vite@8.0.14` (whose bundler is `rolldown@1.0.2`, not Rollup), `vite-plugin-pwa@1.3.0`, `workbox-build@7.4.1`, `workbox-window@7.4.1`, `@sveltejs/vite-plugin-svelte@7.1.2`, `svelte@5.55.10`, node `v26.2.0`.

**Evidence classes used throughout.** Every claim below is tagged:

- **[measured]** — I built it in this worktree and read the emitted bytes.
- **[source]** — read out of the installed `node_modules` implementation.
- **[spec]** — quoted verbatim from the owning specification.
- **[unverified]** — could not be exercised here (real browser install, OS share sheet, a Cloudflare deploy). Said so explicitly, never dressed up.

---

## TL;DR — the six answers

| #   | Question                       | Answer                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Two HTML entry points          | **Works, and shares.** Rolldown emits one shared chunk both entries load. Total JS grew **+2,803 B (+0.4 %)**, CSS **+36 B**. Nothing is duplicated. **[measured]**                                                                                                                                                                                                                                 |
| 2   | A second manifest at `/food/`  | `vite-plugin-pwa` **can emit it** (`manifestFilename: "food/manifest.webmanifest"`), but it also injects **both** `<link rel="manifest">` tags into **both** HTML files, and HTML says only the **first** is used — so the plugin-emitted food manifest is dead. The fix is to hand-declare the link in `food/index.html` (source order beats the plugin's append-before-`</head>`). **[measured]** |
| 3   | Two SWs at nested scopes       | Legal and unambiguous — longest-scope-prefix wins, per client. But three practical bites: the root SW **serves `index.html` for `/food/`** until the food SW exists; the two precaches are **separate Cache buckets** (8.75 MiB stored twice); and the root SW's `cleanupOutdatedCaches()` **deletes the food precache** on every activation. **[spec + source + measured]**                        |
| 4   | Plugin support vs hand-rolling | Two `VitePWA()` instances coexist and both emit. Four things must be hand-rolled: the manifest `<link>`, the food SW's registration, the root's `navigateFallbackDenylist`, and turning `cleanupOutdatedCaches` off. **[measured]**                                                                                                                                                                 |
| 5   | `share_target`                 | Spec-legal: each manifest's `action` **must be within its own `scope`**, and differing `start_url` gives differing `id`, which the manifest spec says a UA "SHOULD treat … as a distinct application". Whether two entries actually appear in an OS share sheet is UA discretion — the spec explicitly declines to define registration. Chromium-only feature. **[spec]** + **[unverified]**        |
| 6   | Size of the prize              | `/food/` install **8.75 MiB** (vs 13.09 today, **−4.34 MiB / −33 %**). A food-less root **6.25 MiB** (**−6.84 MiB / −52 %**). Installing both costs **21.85 MiB** on disk as built. **[measured]**                                                                                                                                                                                                  |

---

## 0. The prototype, so the numbers are reproducible

Four builds were run in a worktree off `research/269-two-installable-apps-one-origin`. All are `npx vite build` (no `offline-boot-check`), same machine, same day.

- **A — baseline.** HEAD untouched: one `index.html`, one `VitePWA()`.
- **B — two entries, one PWA.** Added `food/index.html` → `src/food-main.ts` → `src/FoodApp.svelte` (mounts `FoodView` + `ReloadPrompt`, inits `dbClient`), and `build.rollupOptions.input = { main, food }`. One `VitePWA()`.
- **C — food-less root.** `FoodView` and `warmUsdaCorpus` stripped from `App.svelte`; `usda/**` added to `globIgnores`. One entry, one `VitePWA()`.
- **D — two entries, two PWAs.** B plus a second `VitePWA()` at `filename: "food/sw.js"`, `scope: "/food/"`, and (final form) `manifest: false` + `injectRegister: false`, with the food manifest hand-written into `public/food/` and hand-linked from `food/index.html`. Root instance gained `navigateFallbackDenylist: [/^\/food\//]` and `cleanupOutdatedCaches: false`.

Precache totals were computed by parsing the `precacheAndRoute([…])` array out of each emitted `sw.js` and `stat`ing every URL against `dist/`. Sizes are **raw bytes on disk**, which is what workbox weighs — not the gzip the CDN serves.

**A vocabulary note before the numbers.** `build.rollupOptions` still exists in Vite 8 but its own `.d.ts` marks it `@deprecated Use rolldownOptions instead` and types it as `RolldownOptions` (`node_modules/vite/dist/node/index.d.ts:2088–2097`). It works — build B used it — but a Facet ticket writing new config should probably write `build.rolldownOptions`. **[source]**

---

## 1. Multiple HTML entry points — one shared chunk, no duplication

**The question the map asked is whether `db/`, `stores/`, `ui/` land once or twice. They land once.** **[measured]**

Adding `food/index.html` as a second input produced three JS chunks where there had been one:

| Build A (one entry)        | bytes       | Build B (two entries)             | bytes       | reached from |
| -------------------------- | ----------- | --------------------------------- | ----------- | ------------ |
| `assets/index-D5xp3mOn.js` | **674,830** | `assets/main-CNyB5UQ_.js`         | 246,639     | root only    |
|                            |             | `assets/ReloadPrompt-BcUEn7sh.js` | **430,354** | **both**     |
|                            |             | `assets/food-rDw0B-Qz.js`         | 640         | food only    |
| **total**                  | **674,830** | **total**                         | **677,633** | **+2,803 B** |

CSS split the same way and cost **+36 B** in total (173,131 → 62,896 + 110,271 = 173,167).

Both emitted HTML files reference the _same_ shared chunk file: **[measured]**

```html
<!-- dist/index.html -->
<script type="module" crossorigin src="/assets/main-CNyB5UQ_.js"></script>
<link rel="modulepreload" crossorigin href="/assets/ReloadPrompt-BcUEn7sh.js" />

<!-- dist/food/index.html -->
<script type="module" crossorigin src="/assets/food-rDw0B-Qz.js"></script>
<link rel="modulepreload" crossorigin href="/assets/ReloadPrompt-BcUEn7sh.js" />
```

**The chunking rule Rolldown applied** is reachability-set partitioning: a module reachable from _both_ entries goes to a shared chunk; a module reachable from exactly one goes into that entry's chunk. That is why `MediaView`/`ItemsView`/`AgendaView`/`SettingsView` (root-only) make up the 246 kB `main` chunk, why the food entry's own chunk is a rounding error (640 B — just the `mount()` call), and why _all_ of `db/`, `stores/`, `ui/`, `food/` sit in the 430 kB shared chunk — the root reaches them too, via `App.svelte`'s static `import FoodView`.

**Two consequences the map should carry forward.**

1. **The shared chunk is not "food's cost" and not "the root's cost" — it is both.** If decision 3 holds (the root keeps all six tabs), the 430 kB is loaded by both installs, and a `/food/`-scoped precache cannot shrink it. If the root ever dropped food, the partition would change and the food code would move into the food chunk.
2. **`dist/food/index.html` is emitted automatically** at the path implied by the input file's location relative to root. No config, no copy step. **[measured]**

---

## 2. A second manifest — the plugin emits it, then poisons it

### It emits

`manifestFilename` is a first-class option (`dist/index.d.ts:301–303`, default `manifest.webmanifest`) and it is used verbatim as an `emitFile({ fileName })` in `_generateBundle` **[source]**. Setting `manifestFilename: "food/manifest.webmanifest"` on a second `VitePWA()` produced exactly the wanted file **[measured]**:

```json
{"name":"Food Facet","short_name":"Food","description":"…","start_url":"/food/","display":"standalone","background_color":"#000000","theme_color":"#3bff86","lang":"en","scope":"/food/","icons":[…],"share_target":{"action":"/food/",…}}
```

So the _file_ is not the problem.

### Then it poisons it

`BuildPlugin`'s `transformIndexHtml` is unconditional and per-instance — it has no notion of _which_ HTML it is looking at **[source]**:

```js
// vite-plugin-pwa/dist/index.js — BuildPlugin
transformIndexHtml: { order: "post", handler(html) { return transformIndexHtmlHandler2(html); } }
// → injectServiceWorker(html, options, false)
// → checkForHtmlHead(html).replace("</head>", `${manifest}${script}</head>`)
```

With two instances, **both HTML files got both links** **[measured]**:

```html
<!-- dist/food/index.html, two-instance build -->
<link rel="manifest" href="/manifest.webmanifest"><link rel="manifest" href="/food/manifest.webmanifest"></head>
```

And the HTML spec settles it, verbatim (§4.6.8.11, Link type "manifest"):

> In any case, only the **first** `link` element in tree order whose `rel` attribute contains the token `manifest` may be used.

— [html.spec.whatwg.org/multipage/links.html#link-type-manifest](https://html.spec.whatwg.org/multipage/links.html#link-type-manifest)

So the `/food/` page would be installed as **Inventoria**. The correct manifest is emitted, served, precached — and never read. There is no plugin option to scope `transformIndexHtml` to one entry.

### The fix is source order, and it is measured

The plugin **appends** before `</head>`. A `<link rel="manifest">` written into the _source_ `food/index.html` therefore lands earlier in tree order and wins. Build D confirms it **[measured]**:

```html
<!-- dist/food/index.html, build D -->
<link rel="manifest" href="/food/manifest.webmanifest" />   <!-- hand-written, first, wins -->
<meta name="viewport" …>
<title>Food Facet</title>
<script type="module" crossorigin src="/assets/food-rDw0B-Qz.js"></script>
…
<link rel="manifest" href="/manifest.webmanifest"></head>   <!-- plugin's, second, ignored -->
```

Setting `manifest: false` on the second instance suppresses that instance's own link and file entirely (`generateWebManifest` returns `""` when `options.manifest` is falsy **[source]**), so the food manifest becomes a hand-written `public/food/manifest.webmanifest`. That is a plain JSON file that Vite copies and workbox precaches — no build machinery at all.

**Two manifest gotchas worth writing into the ADR:**

- **Relative icon `src` resolves against the manifest URL, not the origin.** The root manifest ships `"src": "favicon.svg"`, which is fine at `/manifest.webmanifest`. Copied into `/food/manifest.webmanifest` unchanged it would resolve to `/food/favicon.svg` — 404. Use `/favicon.svg`.
- **Set `id` explicitly.** The manifest spec processes `id` by defaulting it to `start_url`, and says a UA "SHOULD treat that manifest as a description of a **distinct application**" when the identity does not match an installed app ([w3c.github.io/manifest §`id` member](https://w3c.github.io/manifest/#id-member)). Different `start_url` already yields different identity, so two apps is the default outcome — but `id` is what pins it against a future `start_url` change.

---

## 3. Two service workers at nested scopes

### The spec is unambiguous: longest prefix wins, per client

_Match Service Worker Registration_ (Service Worker spec, Appendix A), verbatim:

> Set **matchingScopeString** to the **longest** value in scopeStringSet which the value of clientURLString **starts with**, if it exists.
>
> Note: The URL string matching in this step is **prefix-based rather than path-structural**. E.g. a client URL string with `https://example.com/prefix-of/resource.html` will match a registration for a scope with `https://example.com/prefix`.

— [w3c.github.io/ServiceWorker](https://w3c.github.io/ServiceWorker/#scope-match-algorithm)

Two notes fall straight out. **Scope must end in `/`** — a scope of `/food` would also capture `/foodstuff.html`. And **no `Service-Worker-Allowed` header is needed** here, because §6.5 _Path restriction_ (non-normative) says a script at `.../~bob/sw.js` "can be registered for the scope url `https://www.example.com/~bob/`". A SW emitted at `dist/food/sw.js` may claim `/food/` and — usefully — may **not** claim `/`.

### Can a `/food/` page be controlled by the root SW first? Yes.

_Handle Fetch_, for a non-subresource request, verbatim:

> Set **registration** to the result of running **Match Service Worker Registration** given storage key and **request's url**. […] If request's destination is not "report", set reservedClient's active service worker to registration's active worker.
>
> Note: From this point, the service worker client starts to use its active service worker's containing service worker registration.

So on a device that already has Inventoria installed, the very first navigation to `/food/` matches the only registration that exists — `/` — and the root SW handles it.

**And the root SW as built today would answer it with the wrong page.** `dist/sw.js` at HEAD contains **[measured]**:

```js
s.registerRoute(new s.NavigationRoute(s.createHandlerBoundToURL("index.html")));
```

No allowlist, no denylist. A `/food/` navigation served by that route returns Inventoria's shell, so the Food page could never boot on such a device. The fix is a workbox option and it lands correctly **[measured]** — build D's `dist/sw.js` reads:

```js
new s.NavigationRoute(s.createHandlerBoundToURL("index.html"), {
  denylist: [/^\/food\//],
});
```

`navigateFallbackDenylist?: Array<RegExp>` is a supported `generateSW` option in `workbox-build@7.4.1` (`build/types.d.ts:286`, templated at `build/templates/sw-template.js:54`) **[source]**.

### Do the two precaches duplicate shared assets on disk? Yes — by construction.

`workbox-core@7.4.1`'s `_private/cacheNames.js` **[source]**:

```js
const _cacheNameDetails = {
  precache: "precache-v2",
  prefix: "workbox",
  suffix: typeof registration !== "undefined" ? registration.scope : "",
};
```

The precache Cache name is `workbox-precache-v2-<registration.scope>`. Two different scopes → two different `Cache` objects → **every shared byte is stored twice**. There is no `generateSW` knob that fixes this: `cacheId` changes the _prefix_, not the scope suffix.

Measured on build D: the food precache (9,179,816 B) is a strict **subset** of the root precache (13,727,750 B) — zero food-only entries, because the root globs `**/*` and picks up the food page's assets too. Installing both therefore stores **22,907,566 B = 21.85 MiB**, of which **8.75 MiB is a straight duplicate**.

Even with a perfectly food-less root, a floor remains: `sqlite3.wasm` (864,752), `sqlite3-worker1` (210,883), `sqlite3-opfs-async-proxy` (32,289), `db.worker` (229,205), the zxing `ponyfill` (43,185), `workbox-window` (5,653), twelve latin/latin-ext `woff2` (440,644), `favicon.svg` (9,522), `icons.svg` (5,031) — **1,841,164 B = 1.76 MiB duplicated no matter what** **[measured]**.

### The sharp edge: the root SW eats the food SW's precache

`workbox-precaching@7.4.1`'s `utils/deleteOutdatedCaches.js` **[source]**:

```js
const SUBSTRING_TO_FIND = "-precache-";
const cacheNamesToDelete = cacheNames.filter((cacheName) => {
  return (
    cacheName.includes(substringToFind) &&
    cacheName.includes(self.registration.scope) &&
    cacheName !== currentPrecacheName
  );
});
```

The second clause is a **substring** test against the SW's own scope. The root scope `https://host/` is a substring of the food cache name `workbox-precache-v2-https://host/food/`. So:

- root SW activates → deletes `workbox-precache-v2-https://host/food/` — **the entire Food offline install**;
- food SW activates → deletes nothing (its scope is not a substring of the root's cache name).

Simulated against the real filter predicate **[measured]**:

```
root SW activating deletes: [ 'workbox-precache-v2-https://inventoria.example/food/' ]
food SW activating deletes: []
```

`cleanupOutdatedCaches: true` is `vite-plugin-pwa`'s **default** (`defaultWorkbox` in `resolveOptions`) and this repo relies on it. **The root instance must set `cleanupOutdatedCaches: false`** — verified absent from build D's `dist/sw.js` — and whatever that option was buying has to be bought some other way. This is a nested-scope hazard, not a two-instance hazard: it would bite equally with a hand-rolled food SW.

### What happens on update when both want to claim clients? Nothing — they cannot fight.

`Clients.claim()`, verbatim (§4.3.4):

> Let **registration** be the result of running **Match Service Worker Registration** given storage key and client's **creation URL**. **If registration is not the service worker's containing service worker registration, continue.**

`claim()` re-runs the same longest-prefix match per client and skips any client that does not resolve to _this_ registration. A `/food/` page can never be claimed by the root SW, and vice versa.

Moot here anyway: this repo is `registerType: "prompt"`, and `resolveOptions` only sets `workbox.skipWaiting`/`clientsClaim` when `registerType === "autoUpdate"` **[source]**. Both built SWs carry only the `SKIP_WAITING` message listener and no `clientsClaim()` **[measured]**. Each Facet's update prompt is therefore independent — which is also to say **the user gets two "New update available" prompts**, one per installed Facet, for the same deploy.

---

## 4. What the plugin supports vs what must be hand-rolled

**Two `VitePWA()` instances in one config do not stamp on each other for file emission.** Build D emitted `dist/sw.js` + `dist/workbox-35e397ac.js` and `dist/food/sw.js` + `dist/food/workbox-2fbc6a65.js`, each with its own precache manifest and its own `navigateFallback` (`index.html` and `food/index.html` respectively) **[measured]**. Both `closeBundle` hooks run; `resolveSwPaths` resolves a `filename` containing a directory to `dist/food/sw.js` and workbox creates the directory.

They collide in four places, all measured:

| Collision                                                 | Mechanism                                                                                                                                                                                  | Workaround                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **Both manifest links injected into both HTML files**     | `BuildPlugin.transformIndexHtml` is per-instance and entry-blind                                                                                                                           | `manifest: false` on the food instance; hand-write the file and the `<link>` (§2)  |
| **`virtual:pwa-register/*` resolves to instance #1 only** | `MainPlugin.resolveId` filters on the same prefix in both; first non-null wins                                                                                                             | The food entry must register its SW itself                                         |
| **Instance #2 emits a stray `/registerSW.js`**            | Its `ctx.useImportRegister` stays `false` (it never saw the `load`), so `injectRegister: "auto"` resolves to `"script"` and it injects `<script src="/registerSW.js">` **into both pages** | `injectRegister: false` on the food instance                                       |
| **Each instance globs the whole `dist/`**                 | `globDirectory` defaults to `outDirRoot` for both                                                                                                                                          | Narrow `globPatterns` per instance; accept that the root still sees the food files |

The `virtual:pwa-register` collision is the structurally interesting one, because it is not really a plugin bug — it is **the shared chunk**. `src/lib/ui/ReloadPrompt.svelte` imports `virtual:pwa-register/svelte`, `ReloadPrompt` is reachable from both entries, so it lands in the shared chunk, and that one module instance carries a **hard-coded** SW URL **[measured]**:

```js
new e(`/sw.js`, { scope: `/`, type: `classic` });
```

Left as-is, the `/food/` page registers the **root** service worker. Meanwhile the stray `/registerSW.js` on the root page registers `/food/sw.js` with scope `/food/` — a SW that can never control the page that registered it. Both are backwards.

**So the hand-rolled surface is exactly four items:**

1. The food manifest (`public/food/manifest.webmanifest`) and its `<link>` in `food/index.html`.
2. A **scope-parameterised** SW registration, so `ReloadPrompt` (or a replacement) can register `/sw.js` or `/food/sw.js` depending on which entry mounted it. `workbox-window@7.4.1` is already a direct dependency and is what the virtual module wraps, so this is a small component, not a new dependency.
3. `navigateFallbackDenylist: [/^\/food\//]` on the root instance.
4. `cleanupOutdatedCaches: false` on the root instance.

Everything else — second manifest file, second SW file, second precache manifest, second `navigateFallback`, nested output directory — the plugin does.

### Two verification gates that will not notice a second entry

- `scripts/offline-boot-check.mjs` reads `dist/index.html` and `dist/sw.js` **by hard-coded name** (lines 58 and 148) and `import()`s the single entry chunk it finds there. It would pass a build whose `/food/` entry cannot start offline, silently. **[source]**
- `public/_headers` is `/*`, so COOP/COEP — and therefore `crossOriginIsolated`, and therefore SQLite/OPFS's `SharedArrayBuffer` — apply to `/food/` with no change. That one is free. **[source]**
- Whether Cloudflare's `[assets] directory = "dist"` serves `dist/food/index.html` for a request to `/food/` is **[unverified]** — it is the documented directory-index behaviour, but nothing here deployed it.

---

## 5. `share_target` — spec-legal, UA-discretionary, Chromium-only

**Each manifest's `action` is confined to its own `scope`.** Web Share Target, _Processing a share target_, verbatim:

> Let **action** be the result of parsing `share target["action"]` relative to the manifest URL […] **If `action` is not within scope of the `manifest["scope"]`, return.**

— [w3c.github.io/web-share-target](https://w3c.github.io/web-share-target/#share_target-member)

So `/food/manifest.webmanifest` with `scope: "/food/"` can declare `action: "/food/"` and **cannot** declare `action: "/"`. The two targets are structurally forced to be distinct and non-overlapping — which is the behaviour the map wants, arrived at by constraint rather than by choice.

**Do both show up in the share sheet?** The spec refuses to say, verbatim:

> How and when web share targets are "registered" is at the discretion of the user agent and/or the end user. In fact, "registration" is a user-agent-specific concept that is not formally defined here; **user agents are NOT REQUIRED to "register" web share targets at all**.
>
> […] it is RECOMMENDED that more discretion is applied, to avoid overwhelming the user with the choice of a large number of targets.

Nothing in the spec de-duplicates by origin, and the manifest spec's `id` rule (§2) says two differing identities SHOULD be treated as distinct applications. The reasonable expectation is therefore **two entries, one per installed app** — but that is an inference from two specs, not an observation. **[unverified]**: no browser install was performed and no share sheet was opened. A Facet ticket that depends on this should verify it on a real Android install before committing to it.

**Browser support**, from MDN's browser-compat-data (`manifests/webapp/share_target.json`, the data behind the MDN table) **[source]**:

| Browser          | `share_target`                                              |
| ---------------- | ----------------------------------------------------------- |
| Chrome           | **89**                                                      |
| Chrome Android   | **76**                                                      |
| Edge             | mirrors Chrome                                              |
| Opera / Android  | **76** / **63**                                             |
| Samsung Internet | mirrors Chrome Android                                      |
| Firefox          | **No** ([bugzil.la/1476515](https://bugzil.la/1476515))     |
| Firefox Android  | **No** — "The property parses, but has no effect."          |
| Safari / iOS     | **No** ([webkit.org/b/194593](https://webkit.org/b/194593)) |
| WebView Android  | **No**                                                      |

Status: `experimental: true`, `standard_track: true`. Safari's absence is already priced in — iOS is out of scope for this project (#226).

---

## 6. Size of the prize

All figures are **raw bytes** of the files named in each `sw.js` precache manifest, deduplicated (the plugin emits `manifest.webmanifest` and `favicon.svg` twice in every build; counted once).

| Build                                          | entries (unique) | bytes          | KiB       | MiB       |
| ---------------------------------------------- | ---------------- | -------------- | --------- | --------- |
| **A** — today's `/` install                    | 31 (29)          | **13,723,556** | 13,401.91 | **13.09** |
| **B** — two entries, one root SW covering both | 35 (33)          | 13,727,197     | 13,405.47 | 13.09     |
| **D-root** — two PWAs, root still all-six-tabs | 36 (34)          | 13,727,750     | 13,406.01 | 13.09     |
| **D-food** — the `/food/`-scoped precache      | 28 (28)          | **9,179,816**  | 8,964.66  | **8.75**  |
| **C** — a food-less root                       | 27 (25)          | **6,550,071**  | 6,396.55  | **6.25**  |

### A `/food/` install weighs 8.75 MiB — saving 4.34 MiB (33 %)

What it drops, exactly, is the six root-only entries totalling **4,547,934 B** — and 4,233,270 of those are `NotesView-*.js`, the base64-inlined Loro WASM. Put plainly: **the `/food/` split is, to within 7 %, "the food app does not ship Notes".**

What it keeps, and why it cannot go much lower:

| kept in `/food/`           | bytes     |
| -------------------------- | --------- |
| `usda/nutrient-store.json` | 4,015,520 |
| `usda/search-index.json`   | 1,715,082 |
| `zxing_reader-*.wasm`      | 1,065,634 |
| `sqlite3-*.wasm`           | 864,752   |
| shared JS chunk            | 430,354   |
| `db.worker-*.js`           | 229,205   |
| `sqlite3-worker1-*.js`     | 210,883   |
| shared CSS                 | 110,271   |
| 12 latin/latin-ext `woff2` | 440,644   |
| everything else            | ~97,471   |

**5.73 MB of that 8.75 MiB is the two USDA JSON artifacts**, precached deliberately under ADR-0047 §11. Nothing in the Facet mechanism touches them. A `/food/` install below ~8.7 MiB is a USDA-corpus question, not a build-splitting question.

### A food-less root weighs 6.25 MiB — saving 6.84 MiB (52 %)

This is the map's "big winner", and the measurement confirms it: dropping `FoodView`'s import from `App.svelte` and `usda/**` from the precache took the entry chunk from 674,830 → 414,030 B (**−260,800**), the CSS from 173,131 → 99,876 (**−73,255**), and **removed `zxing_reader.wasm` from `dist/` entirely** — 1,065,634 B that were never a precache-policy question, just an unreferenced import.

**But decision 3 says the root keeps all six tabs**, so 6.25 MiB is a measurement of a road the map has explicitly not taken. The number worth having beside it is the middle path — root keeps every tab, but stops _precaching_ food's three heavy data assets and lets them fall to runtime caching:

> 13,723,556 − 4,015,520 − 1,715,082 − 1,065,634 = **6,927,320 B = 6.61 MiB**

That is arithmetic over measured file sizes, **not a fifth build** — flagged as derived. It buys 6.48 MiB of the 6.84, keeps all six tabs, and costs the root install its keyless-offline-first-search promise (ADR-0047 §11). That trade is a decision, and this is a facts ticket, so it is only recorded here.

### Installing both Facets costs 21.85 MiB

Measured on build D: **22,907,566 B**. As built, the food set is entirely contained in the root set, so 8.75 MiB is pure duplication. Even with a food-less root, §3's floor of **1.76 MiB** of genuinely-shared assets (SQLite, the DB worker, the fonts) is duplicated with no available remedy, because the precache Cache name is keyed on `registration.scope`.

**A user who installs both today's root and the Food Facet stores more than a user who installs only the root.** That is the arithmetic the map's decision 10 ("an installable food app that silently costs 14 MB is a bad promise") should be weighed against: the Facet makes the _food_ install cheap, and makes _owning both_ dearer.

---

## What I could not verify

- **No browser was driven.** Install prompts, two icons on a home screen, the OS share sheet, real Cache Storage occupancy, and the actual controller a `/food/` page ends up with are all inferred from spec text and emitted artifacts. Every one of them is cheap to check once a `/food/` entry exists, and each is a good acceptance criterion for the implementation ticket.
- **No deploy.** Whether Cloudflare Workers Assets serves `dist/food/index.html` for `/food/` (and what `not_found_handling` does with `/food/anything`) is untested.
- **The prototype's `FoodApp.svelte` is a stub** — it mounts `FoodView` and inits the DB, nothing else. The chunk-partition result (§1) depends only on _which modules each entry reaches_, so it holds for any real food shell that imports the same views; the absolute byte figures for the food entry chunk (640 B) would grow with a real sidebar, router and settings surface.
- **`registerType: "prompt"` was kept throughout.** An `autoUpdate` Facet would set `skipWaiting`/`clientsClaim` and re-open the claim question §3 closes here.
