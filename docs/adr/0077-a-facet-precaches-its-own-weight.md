# ADR 0077: A Facet precaches its own weight, and the root gives up offline food data to pay for it

**Status:** Accepted  
**Date:** 2026-08-31

## Context

[ADR-0076](0076-a-facet-is-an-installable-face-onto-one-jar.md) made installability
definitional and left the roster at two: `root` (Inventoria, scope `/`) and `food`
(scope `/food/`, named **Rations** by [#271](https://github.com/palebluebytes/inventoria/issues/271)).
It deliberately did not decide what an installed Facet costs. This record does.

The parent map's decision 10 set the goal — "an installable food app that silently costs
14 MB is a bad promise" — and licensed this ticket to come back with _too expensive_, in
which case one root service worker was the survivable fallback. The research commissioned
by [#269](https://github.com/palebluebytes/inventoria/issues/269)
(`docs/research/269-two-installable-apps-one-origin.md`) priced it, and the numbers below
are that document's unless marked otherwise.

Three facts framed the decision and are not re-derived here.

**Per-scope precaching is not free, and its cost lands on the wrong person.** The precache
`Cache` name is `workbox-precache-v2-<registration.scope>` — `workbox-core@7.4.1`'s
`_private/cacheNames.js` builds it from the scope and no `generateSW` option changes the
suffix. Two scopes are therefore two `Cache` objects and **every shared byte is stored
twice**, with a floor of 1,841,164 B (1.76 MiB — SQLite WASM, the DB worker, the latin
font subsets) that survives even a food-less root. ADR-0076 §2 says Facets **overlap**, so
as built the Rations precache is a strict _subset_ of the root's: installing both is the
worst case, not a corner.

**The per-Facet precache has no per-Facet input.** Rolldown knows the reachability
partition — root-only modules land in `main-*.js`, shared ones in a shared chunk both
entries load, and the split costs +2,803 B of JS in total with nothing duplicated. But
workbox globs a _directory_, both plugin instances default `globDirectory` to the same
`dist/`, and emitted chunks are flat hashed names in `assets/`. Nothing about
`NotesView-BcUEn7sh.js` says "root-only". The research's prototype narrowed the food
precache by naming chunks in `globIgnores`; that is a denylist which must be re-derived
every time a view is added, and its cell in the research's workaround table was never
priced.

**Food is the root's landing screen.** `App.svelte:80` is
`let activeTab = $state<Tab>("food")` and `warmUsdaCorpus()` runs unconditionally at
`App.svelte:51`. [ADR-0047](0047-bundle-the-usda-archives-and-retire-the-api.md) §2 gives
that as its reason for warming the search index at boot rather than at idle: "the food
screen is the app's first and a search must not wait on a fetch."

**Scope.** This record decides what each Facet precaches, how that set is computed, which
service worker serves which scope, and what the root gives up. It does **not** decide how
the verification roster proves any of it ([#277](https://github.com/palebluebytes/inventoria/issues/277)),
what a Facet does when asked to leave itself ([#273](https://github.com/palebluebytes/inventoria/issues/273)),
or which Facet owns the Web Share Target ([#278](https://github.com/palebluebytes/inventoria/issues/278)).
It builds nothing: the registry module ADR-0076 §6 names still does not exist.

## Decision

### 1. One service worker per Facet scope

Each Facet registers its own service worker at its own scope. Service worker registration
matches on the **longest scope prefix**, per client, so `/food/` resolves to the Rations
registration and `/` to the root's, unambiguously; `Clients.claim()` re-runs the same match
and skips clients that do not resolve to the calling registration, so the two can never
fight over a page.

This is decision 10 answered as its goal rather than its fallback. Rations installs at
**9,179,816 B (8.75 MiB)** against today's **13,723,556 B (13.09 MiB)**, a 33% saving —
and to within 7% that saving is one thing: `NotesView-*.js`, 4,233,270 B of base64-inlined
Loro WASM the food app has no use for.

The cost is that **installing both Facets costs more than installing everything does
today**. That is accepted rather than mitigated. The driver for the split is identity, not
payload — Rations is the thing you send someone a link to, and that person installs
Rations and nothing else. Somebody who wants everything installs Inventoria and gets food
inside it. Installing both is redundant _by design_ under the map's decision 3, which keeps
all six tabs in the root; it is not a defect in the split.

Two consequences of nesting the scopes, both one-directional:

- **The root sets `cleanupOutdatedCaches: false`.** `workbox-precaching@7.4.1`'s
  `deleteOutdatedCaches` filters cache names on `cacheName.includes(self.registration.scope)`,
  a substring test. The root's scope `https://host/` is a substring of the Rations cache name
  `workbox-precache-v2-https://host/food/`, so **the root service worker would delete the
  entire Rations offline install on every activation**. Rations keeps the option on: its own
  scope is not a substring of the root's cache name, so it deletes nothing.

  Nothing is bought back to replace it. The option only ever removed precaches left by an
  _older workbox precache version_ — the name is stable across every deploy within a major,
  and workbox prunes stale entries inside the current cache regardless. Turning it off
  orphans one cache if workbox ever bumps `precache-v2` to `v3`, and costs nothing before
  that.

- **The root sets `navigateFallbackDenylist: [/^\/food\//]`.** Without it the root's
  `NavigationRoute` answers a `/food/` navigation with Inventoria's shell, so on a device
  that already has Inventoria installed the Rations page could never boot at all.

### 2. A Facet's precache manifest is derived from its entry, not globbed from `dist/`

The code half of each manifest is computed by walking the transitive imports of that
Facet's entry HTML out of the bundle, and supplied as explicit manifest entries rather
than left to a directory glob. A hand-maintained `globIgnores` denylist is refused: it
rots on every new view, silently re-inflating a Facet's precache with every gate green,
and the thing this record exists to defend is a number.

The static half — `usda/`, `fonts/`, the Rations icon set — is copied verbatim from
`public/` and appears in no module graph. It is **declared**, per Facet, in the ADR-0076 §6
registry. This is the build half of that registry earning its keep, and it makes the asset
split a stated fact in one file rather than an emergent property of a glob.

The `json` and `woff2` comments now in `vite.config.ts` move with the declarations they
explain. They are the reasons those extensions are precached at all, and splitting the glob
without them is how a later reader deletes one.

### 3. Each Facet declares a complete set, never a subset of the root's

A Facet's declaration names everything it precaches: a shared base, named by every Facet,
plus its own additions. The alternative — the root declares everything and Rations declares
a subset — encodes root-as-superset, which is exactly the assumption ADR-0076 §2 forbids
and which stops being true the moment any Facet holds something the root does not. It also
cannot express §5 below, where the two Facets declare _different_ USDA artifacts.

### 4. ADR-0047 §11 binds the Food Facet, not the root

**This amends [ADR-0047](0047-bundle-the-usda-archives-and-retire-the-api.md) §11**, which
reads: "They are precached at install, not fetched on first use. An app whose case rests on
keyless offline search must not need a network for its first search."

That sentence was written when there was one app. There are now two, and only one of them
has a case that rests on keyless offline food search. **§11 binds Rations**, which
precaches `search-index.json`, `nutrient-store.json` and `zxing_reader.wasm` and owes the
promise whole. Inventoria-the-everything-app's case rests on being everything.

ADR-0047 §2 is untouched: the search index is still warmed at boot rather than at idle, in
both Facets, and §5 below is why it still can be.

### 5. The root keeps the search index, and gives up the nutrient store and the scanner

The three heavy food assets are three different promises, and the root treats them
differently:

| Asset                      | bytes     | read when          | root    |
| -------------------------- | --------- | ------------------ | ------- |
| `usda/search-index.json`   | 1,715,082 | the landing screen | kept    |
| `usda/nutrient-store.json` | 4,015,520 | a food is staged   | dropped |
| `zxing_reader-*.wasm`      | 1,065,634 | Scan is tapped     | dropped |

The two dropped ones are read in response to a user's action, several seconds of typing and
choosing after launch. The search index is what the user is _looking at_ before they do
anything — dropping it means a cold offline Inventoria opens on a search box that silently
finds nothing, which reads as "no such food" rather than "no data yet". 1,715,082 B is what
an honest landing screen costs and it is the cheapest of the three.

The root install becomes **8,642,402 B (8.24 MiB)** — 13,723,556 − 4,015,520 − 1,065,634 —
a 37% saving that keeps every tab. That figure is arithmetic over measured file sizes, not
a build; the measured food-less root, which the map's decision 3 forbids, was 6,550,071 B
(6.25 MiB). Both Facets installed come to **17,822,218 B (17.00 MiB)**.

**In the root, a staging or scan attempt that fails for want of an un-precached artifact
must say it needs a network, once, and not surface a fetch error.** Both paths already fail
non-fatally — `loadNutrientStore` forgets its rejection so the next attempt retries — but
they surface `Failed to load /usda/nutrient-store.json (0)` under a comment in
`usda-corpus.ts` asserting that a miss "is a broken build or a broken service worker rather
than an offline user". After this record that is routinely false in the root, and the
comment is corrected in the same change as the config: the next person to debug it reads the
comment before the ADR. Rations, precaching all three, must not be able to reach that state
at all.

### 6. A Facet's scope is not served by another Facet's service worker

`dist/food/index.html` sits in the root's precache, because the root globs everything — but
§1's denylist sends `/food/` navigations to the network, so on a device with Inventoria and
not Rations, a `/food/` link is dead offline. That is correct and deliberate. Serving
Rations' shell from the root registration would produce a Rations app running on the root's
precache, updating on the root's prompt and wiping with the root's cache — un-buying the
scope hygiene §1 pays for. `/food/` is Rations' scope; a device without Rations does not
have it.

### 7. The runtime image cache is shared; the precaches are not

`cacheNames.getRuntimeName` returns a user-supplied name verbatim, with **no scope suffix**.
`external-image-cache` is user-supplied, so both service workers write to literally the same
`Cache` — and both Facets populate it, Rations with Open Food Facts product photos
(`open-food-facts.ts:130`-`137`), the root with those and TMDB posters.

It stays shared. This is the one place in the design where two Facets do not duplicate
bytes. The hazard is recorded rather than fixed: two `ExpirationPlugin` instances keep
**independent** IndexedDB bookkeeping over one store, so `maxEntries: 500` is enforced twice
against a set neither fully knows and each can evict entries the other believes it owns.
The failure mode is over-eviction of a `CacheFirst` cache that re-fetches on miss. Naming it
per Facet would restore correct bookkeeping and duplicate every cached image; that trade is
available if the eviction ever bites.

### 8. One deploy prompts twice

`registerType` stays `prompt`, and neither built service worker carries `clientsClaim()`, so
each registration prompts its own clients independently. A user with both Facets installed
sees "New update available" in Inventoria and again in Rations for one deploy.

Accepted. They are two installs with two precaches; a single prompt updating both would
claim an authority the registration model does not grant, and dismissing it in one app while
the other stayed stale is worse than being asked twice.

## Consequences

**What it costs, plainly.** Rations 8.75 MiB, the root 8.24 MiB, both 17.00 MiB against
13.09 MiB for everything today. The root's saving is the larger one, which is easy to lose
sight of in a ticket named after the food app. The 1.76 MiB duplication floor has no remedy
short of a single service worker, which is §1's rejected fallback.

**What the root gives up.** Keyless offline food _staging_ and offline barcode scanning on a
cold install. Search survives. This is a narrowing of a shipped promise and it is declared
in ADR-0047's header as well as here — the backlink gate reads only an ADR's body
([#261](https://github.com/palebluebytes/inventoria/issues/261)), so until that is fixed the
body is the only declaration anything checks.

**[#277](https://github.com/palebluebytes/inventoria/issues/277) inherits two claims, not
one.** First, each Facet's precache is a separate offline claim and each must be proved:
`scripts/offline-boot-check.mjs` reads `dist/index.html` and `dist/sw.js` by hard-coded name
and would pass a build whose `/food/` shell cannot start offline — silently, which is the
#125 failure mode it exists to stop. One target standing for both is not available, because
§2 makes the two manifests genuinely different. Second, a **per-Facet precache budget** that
fails the build on regression. §2's derived manifest is self-maintaining for code, but §3's
declared statics are hand-written, and a stray `usda/**` re-entering the root's declaration
would put 4 MB back with every gate green. It is also the tripwire for §2 silently degrading
to a superset.

**What is hand-rolled, and what the plugin still does.** Four things: the Rations manifest
and its `<link>` in `food/index.html` (both plugin instances inject their `<link>` into both
HTML files and the HTML spec says only the first counts, so the plugin-emitted one is dead);
a scope-parameterised service worker registration, because `virtual:pwa-register` resolves to
the first plugin instance only and its hard-coded `/sw.js` sits in the chunk both entries
share; and §1's two root options. Everything else — the second manifest file, the second
service worker, the second precache manifest, the nested output directory — the plugin does.

**What is free.** `public/_headers` is `/*`, so COOP/COEP, and therefore
`crossOriginIsolated` and SQLite's `SharedArrayBuffer`, cover `/food/` unchanged.
`maximumFileSizeToCacheInBytes` stays 5 MiB on both: the root's largest precached asset
becomes `NotesView-*.js` at 4,233,270 B, still above the 4 MiB that failed the build once.

**What it forecloses.** A Rations install below about 8.7 MiB. 5,730,602 B of its 8.75 MiB is
the two USDA JSON artifacts, precached deliberately under ADR-0047 §11, which §4 leaves
binding on exactly this Facet. Anything smaller is a USDA-corpus question, not a
build-splitting one.

**What was never verified.** No browser was driven and nothing was deployed. Real Cache
Storage occupancy, the controller a `/food/` page actually ends up with, and whether
Cloudflare's `[assets]` serves `dist/food/index.html` for `/food/` are all inferred from spec
text and emitted artifacts. Each is cheap to check once a `/food/` entry exists and each is an
acceptance criterion for the implementation ticket.
