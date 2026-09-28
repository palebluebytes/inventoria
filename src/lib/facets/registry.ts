/**
 * The Facet registry (ADR-0076 §6), holding what is true today and nothing else.
 *
 * ADR-0076 §6 named this module and deliberately did not write it, because "an
 * entry pointing at an entry point that has not been built would be a lie in
 * code". That refusal is narrow and it is about entry points. Who owns `gtin:`
 * is true today, checkable today, and ADR-0079 §3 derives a delete button's
 * predicate from it — so ownership was written first, and scope, name, icon and
 * `start_url` were **absent rather than stubbed**, to arrive with the entry
 * point that makes them true.
 *
 * #301 built that entry point, so scope, name and start URL are here, and #302
 * minted an icon Rations is allowed to ship, so the icon is here too. Both
 * arrived the same way: the field was **absent rather than stubbed** until a
 * file it could name was in the build, because a path to a file that is not
 * there would be the lie this module was written to avoid. #305 wrote both
 * Facets a manifest off these fields, which is what made the icon required
 * rather than optional and brought the three that describe an install —
 * `description`, `themeColor`, `backgroundColor` — in beside it.
 *
 * **The owner is a Tracked Domain** (ADR-0086 §1). It cannot be a Facet: ADR-0076
 * §3 has Facets overlap rather than partition, and the root holds all six content
 * domains, so under Facet-ownership every content prefix has two owners and
 * "exactly one owner" is unstatable — while the Jar domain's, which no Facet
 * holds at all, would have none. A Facet's prefix set is therefore **derived**
 * from the domains it holds, never authored beside them, which is also what keeps
 * a second Facet an application of the mechanism rather than a second list to
 * maintain.
 *
 * `docs/eavt-vocabulary.md` stays canonical for the reader; this is canonical for
 * the code. `scripts/entity-ownership-check.mjs` is what keeps them honest, and
 * more importantly what keeps this file honest about `src/`: ADR-0076 §4 already
 * documented the one-owner rule and `isbn:` collided anyway, because every defect
 * ADR-0086 found was a place where the code minted something the documentation
 * did not know about.
 */

import {
  TRACKED_DOMAINS,
  entityPrefixesOfDomains,
  type TrackedDomain,
} from "./domains";

/**
 * The domain half of the registry, re-exported so this module stays the one
 * import every caller writes (ADR-0076 §6).
 *
 * The split is `domains.ts`'s own header: a module holding only data keeps the
 * Facet roster out of any bundle that needs a prefix. Nothing about *what the
 * registry is* changed, so neither did anybody's import.
 */
export {
  TRACKED_DOMAINS,
  ENTITY_PREFIXES,
  CONTENT_DOMAINS,
  ownerOfEntity,
  entityPrefixesOfDomains,
  ownerOfViewModule,
  type TrackedDomain,
  type TrackedDomainId,
  type ContentDomain,
  type ContentDomainId,
  type EntityPrefix,
} from "./domains";

/**
 * One entry in a manifest's `icons`, in the member names the manifest spec
 * gives them. snake_case would be wrong here and camelCase would be wrong in a
 * datom: these are somebody else's field names, written the way the reader of
 * the file expects to find them (CODING_STANDARDS §1.3 governs the ledger, and
 * a manifest is not one).
 */
export interface ManifestIcon {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  /** Absent means `any`, which is the spec's own default. */
  readonly purpose?: "maskable";
}

/**
 * A named, icon-bearing face onto the Jar that can be installed on its own. The
 * roster is two and the root is one of them (ADR-0076 §2).
 */
export interface Facet {
  readonly id: string;
  /** What it is called on a home screen. Never the id, which is build vocabulary. */
  readonly name: string;
  /**
   * The URL prefix this Facet's pages live under: its manifest's `scope` and
   * its service worker's (ADR-0077 §1). Every Facet's scope contains its own
   * start URL, and the root's contains every other Facet's — which is why the
   * root may link to Rations without leaving itself while the reverse would
   * eject a user into a browser (ADR-0078 §3).
   */
  readonly scope: string;
  /**
   * Where an install opens. The manifest member is spelled `start_url`, and it
   * is spelled `startUrl` here on purpose: snake_case in this codebase means a
   * ledger field (CODING_STANDARDS §1.3), a Facet is never written to a datom
   * (ADR-0076 §2), and the one rename happens where the manifest is built.
   */
  readonly startUrl: string;
  /**
   * What it says about itself on a home screen, verbatim in its manifest.
   *
   * These four are here rather than in `src/lib/facets/manifest.ts` for the
   * same reason `name` and `startUrl` are: they are facts about a Facet, and
   * the builder is a shape. Nothing else in the app reads them — a Facet's
   * manifest is the only consumer — which is why they arrived with #305 and not
   * before.
   */
  readonly description: string;
  /** The colour the OS tints its chrome with while the install is open. */
  readonly themeColor: string;
  /** What a splash screen paints behind the icon before the app draws. */
  readonly backgroundColor: string;
  /**
   * The icons its manifest enumerates, `any`-purpose mark first.
   *
   * #302 left this one URL on purpose: which files a manifest enumerates, at
   * what `sizes` and with what `purpose`, was **#305's to decide**, and a list
   * written before that decision would have been the decision made early. #305
   * decides, and it decides here, because the build is what reads it.
   *
   * The list is the *manifest's*, not the Facet's whole set. `rations-32.png`
   * and `rations-180.png` are a tab favicon and an `apple-touch-icon`, declared
   * by `food/index.html` with `<link>` because that is where a browser looks
   * for them; a manifest that also listed them would be claiming they are
   * install icons. Nor is it yet the declaration ADR-0077 §2 asks for, which
   * names "the Rations icon set" among the static assets a Facet declares so
   * its own service worker can precache them: that set is the five files and is
   * #306's.
   *
   * Every entry sits **inside the Facet's own scope**, which is not a style
   * rule — a service worker scoped to `/food/` cannot precache a URL above it
   * (`docs/icon-provenance.md`).
   */
  readonly icons: readonly ManifestIcon[];
  readonly domains: readonly string[];
  /**
   * Everything this Facet's service worker precaches that no chunk imports:
   * emitted file names, `*` matching a run of characters inside one path
   * segment (ADR-0077 §3).
   *
   * **The code half is not here**, and that is the point. JavaScript and CSS are
   * *derived* — `src/lib/facets/precache.ts` walks the chunks reachable from
   * this Facet's entry, so adding a view costs nothing here and cannot be
   * forgotten. What is left is everything the walk cannot see: the DB worker and
   * SQLite's WASM are emitted beside the module graph rather than inside it, and
   * `usda/`, `fonts/` and `food/icons/` are copied verbatim out of `public/`.
   *
   * Every Facet names a **complete** set — a shared base plus its own additions,
   * never a subset of the root's. ADR-0076 §2 has Facets overlap rather than
   * nest, and ADR-0077 §5 has these two declare *different* USDA artifacts, so
   * root-as-superset is not merely untidy: it is unstatable.
   *
   * It is an allowlist and never a denylist. The `globIgnores` this replaced
   * had to name the four font subsets the app does not draw, which meant a
   * Fontsource release adding a fifth put it in the install silently; naming the
   * two Latin subsets it *does* draw cannot fail that way.
   *
   * **Measured on 2026-09-01, building #306 against `807233e`**, which is the
   * number these declarations exist to defend. The baseline is this repo's at
   * that commit and **not** ADR-0077's 13,723,556 B: that came off the #269
   * research prototype rather than a named commit here, and what moved between
   * them is a stretch of the arc rather than one addition, so the gap is left
   * unattributed rather than guessed at.
   *
   * | install                       |  urls |      bytes |
   * | ----------------------------- | ----: | ---------: |
   * | one precache, everything      |    44 | 14,539,436 |
   * | Inventoria                    |    31 |  9,341,846 |
   * | Rations                       |    36 |  9,975,828 |
   * | both, as stored               |       | 19,317,674 |
   *
   * A 35.7% saving for the root and 31.4% for Rations, and installing both
   * costs 33% more than installing everything does today. That last is accepted
   * rather than mitigated (ADR-0077 §1): 4,783,558 B is shared between the two
   * and stored twice, because a precache `Cache` is named after
   * `registration.scope`. Whoever installs Rations installs nothing else.
   */
  readonly precache: readonly string[];
  /**
   * What that precache weighed when it was last measured, in bytes: the centre
   * of the band `pnpm check:facets` holds it inside (ADR-0083 §3).
   *
   * **A band, never a ceiling.** A ceiling catches the regression the `precache`
   * declaration above exists to prevent — a hand-written entry re-inflating a
   * Facet — and passes a manifest that has *collapsed*. The derived half failing
   * open ships a Facet that installs and then cannot work, and the offline gate
   * cannot see it: `usda/nutrient-store.json` is read seconds after `mount()`,
   * so a manifest that dropped it boots perfectly and then finds no food. A
   * floor is the only thing looking at that.
   *
   * It sits **here**, beside the declarations whose editing moves it, because a
   * measured byte range is not a conclusion reached by argument — which is the
   * one thing ADR-0080 §8's surviving rule keeps out of this registry. A
   * reviewer changing one is looking at the other.
   *
   * There is deliberately **no `--update` flag**. Moving these numbers is a
   * reviewable diff in the same commit as whatever moved them, because 450 KB of
   * precache is always a decision.
   */
  readonly precacheBytes: number;
  /**
   * Whether it exists as a thing you can install. **Installability is
   * definitional** (ADR-0076 §1), so an entry point alone does not flip this:
   * Rations had a screen of its own from #301 and became `built` at #305, which
   * is where it got a manifest. ADR-0076 §2's own table carried this column
   * until then; the amendment at that record's foot hands it here, so a third
   * entry can be decided in an ADR and declared here before it is built.
   */
  readonly status: "built" | "decided";
}

/**
 * What every Facet precaches, because every Facet is a face onto the same Jar
 * (ADR-0076 §1) drawn in the same faces.
 *
 * Named once and spread into each Facet's own declaration rather than looked up
 * from one: ADR-0077 §3 wants each Facet's set to read as complete where it is
 * declared, and a copy in two places is the thing that drifts.
 *
 * The DB worker and its three SQLite artifacts are the reason a second Facet
 * cannot be free — 1.31 MB of them, stored once per scope, because a precache
 * `Cache` is named after `registration.scope` and no option changes that
 * (ADR-0077 §1). The Latin font subsets are the rest of that floor.
 */
const JAR_PRECACHE = [
  // The ledger. Emitted beside the module graph rather than inside it — the
  // worker is started from a `new Worker(new URL(…))`, so no chunk imports it
  // and no walk can reach it.
  "assets/db.worker-*.js",
  "assets/sqlite3-*.wasm",
  "assets/sqlite3-worker1-*.js",
  "assets/sqlite3-opfs-async-proxy-*.js",
  // The two subsets the app draws, of the seven Fontsource ships. Precaching is
  // the exception to a browser fetching only the subsets a rendered character
  // needs: it pulls everything up front, so an install would otherwise carry
  // Cyrillic, Greek and Vietnamese it never renders.
  "assets/*-latin-wght-*.woff2",
  "assets/*-latin-ext-wght-*.woff2",
  // OFL 1.1 clause 2 asks its notice to travel with every copy of the work, and
  // an offline install *is* a copy. Precaching the font subsets while leaving
  // the licence on the network would distribute the faces without their notice.
  "fonts/OFL.txt",
  // The QR writer, which is how a meal leaves a device (ADR-0072 §9). Both
  // Facets can hand a meal off, so both owe it offline. The root draws a
  // Pairing code with it too (ADR-0096 §8), which needs a relay and therefore a
  // network — so that second reader is not what puts this here.
  "assets/zxing_writer-*.wasm",
] as const;

export const FACETS = [
  {
    id: "root",
    name: "Inventoria",
    scope: "/",
    startUrl: "/",
    description: "Local-first item and habit tracking",
    themeColor: "#863bff",
    backgroundColor: "#000000",
    // One file, and `sizes` says two because an SVG is every size. The mark's
    // own provenance is unrecorded and `docs/icon-provenance.md` says so
    // rather than implying a clearance; #302's subject was Rations.
    icons: [
      { src: "/favicon.svg", sizes: "192x192 512x512", type: "image/svg+xml" },
    ],
    domains: ["food", "media", "items", "habits", "calendar", "notes"],
    precache: [
      ...JAR_PRECACHE,
      // The mark its own manifest enumerates. `includeManifestIcons` puts it in
      // the precache anyway, after every transform; naming it here is what stops
      // the roster and the plugin from disagreeing about the same file.
      "favicon.svg",
      // **The search index, and neither of the other two USDA artifacts**
      // (ADR-0077 §5). Food is this Facet's landing screen, so the index is what
      // the user is looking at before they do anything, and a cold offline
      // install that opened on a search box finding nothing would read as "no
      // such food" rather than "no data yet". The Nutrient store and the scanner
      // are read several seconds later, in answer to an action, and #307 is why
      // those two now say they need a network instead of failing like a broken
      // build — `src/lib/food/bundled-artifact.ts`.
      "usda/search-index.json",
    ],
    // Re-measured at #186, and it is the first time this number has gone DOWN.
    // Build to build as always: HEAD already weighed 8,585,132 B before #186
    // touched anything, so this line was 831,399 B below its own band and the
    // floor had been failing for eleven days. #186's own cost is -5,440 B.
    //
    // What removed the weight is the uncooked-corpus arc rather than anything
    // structural. `usda/search-index.json` is the only USDA artifact the root
    // precaches, and it weighed 1,715,082 B when this line was last re-declared
    // on 2026-09-04; ADR-0103 and ADR-0104 took the corpus from 4,238 rows to
    // 2,025 and it now weighs 812,920 B. That is -902,162 B against -831,399 B
    // of drift, so roughly 70,763 B of feature work grew back into the gap.
    //
    // **The manifest did not collapse**, which is the reading this floor exists
    // to force somebody to check (ADR-0083 §3). The build emits 31 URLs and the
    // search index is among them; the declaration was stale, not the derivation.
    //
    // The root has no pages at any width and can never show a report, and it
    // pays for one anyway: `FoodView` imports `ReportsPage` statically, so the
    // range picker's calendar is in this bundle whether or not anything mounts
    // it. That is the shape ADR-0091 §5 chose — one screen, told by its shell
    // what it may hold — and a dynamic import to dodge the bytes would buy a
    // loading state on the one Facet that has the surface.
    //
    // The same sharing is why the root paid for the rail's month calendar at
    // #344 (+8,502 B, +0.09%) without ever drawing one: it renders
    // `DailyDashboard` in its Food tab and therefore builds it, and it paid
    // only the component, because `habits` already carried
    // `@internationalized/date` into this bundle (ADR-0091, Consequences).
    // Re-measured against the corpus consolidation that landed on main while
    // the UI-vocabulary branch was in flight (ADR-0101): 4,238 rows became
    // 2,484, and `1cd5b006` was still dropping more when this was taken. It is
    // **not** this branch's arc — the gate asks for the number to move in the
    // commit that removed the weight, and that commit landed without it, so
    // both Facets were below their floor and every build since has been red.
    //
    // −669,239 B (−653.6 KiB, −7.11%). The root precaches the search index and
    // neither of the other two USDA artifacts (ADR-0077 §5), so it only feels
    // that file: 1,715,082 B → 981,462 B, which is −733,620. The 64,381 B
    // difference is growth the other way — main's own new food-search code and
    // this branch's four `ui/` primitives.
    //
    // Re-measured at #422, which put a Facet's own wake behind each shell. Build
    // to build, not against the figure this line used to hold: HEAD already
    // weighed 9,483,696 B before #422 touched anything, so this number also
    // takes up 67,165 B of drift from the rest of the ADR-0105 arc, which
    // re-measured nothing. #422's own cost to the root is +363 B, because the
    // root already carried the whole p2p stack.
    //
    // Re-measured at #423, which gave Rations the pairing surface. Build to
    // build with nothing else on the branch moving, and the root **loses
    // 324 B** (−0.003%). It gains one line on a Devices row and nothing else,
    // and that is outweighed by what a second entry importing `views/pairing/`
    // does to the chunking: modules this entry used to inline are now shared,
    // so their wrappers are emitted once rather than twice. A Facet paying
    // slightly *less* because its sibling started reading the same code is what
    // sharing looks like from this side.
    //
    // Re-measured again when §1's reading was settled on the **shell** (the
    // amendment at ADR-0105's foot): the card is drawn under Rations alone, and
    // the per-copy DOM id scheme that a second card in one document had needed
    // is deleted with it. **−52 B**, on both Facets, because what went is a
    // helper in the one module they share.
    //
    // **Re-measured whole when the arc was rebased onto main**, for the reason
    // the root's entry gives: the per-ticket figures were taken against a base
    // 56 commits behind this one and are kept as each ticket's account rather
    // than as this number's derivation. Against `dec25f50`, which precaches
    // 7,659,060 B: **+34,833 B (+34.0 KiB, +0.45%)**, against a ±5% band that
    // is ~374 KiB wide either side. It is larger than the +32,616 B the three
    // tickets add up to, and the difference is chunking rather than new code:
    // this arc arrives into a bundle main reshaped, so what the two entries
    // share is not what they shared before.
    //
    // **Re-measured whole when the arc was rebased onto main**, which had moved
    // 56 commits under it — the corpus consolidation above among them. The
    // figures each ticket recorded were build-to-build against a base that no
    // longer exists, so they are kept as the account of what that ticket cost
    // and this is the one the gate reads. Against `dec25f50`, which precaches
    // 8,747,291 B with none of this arc in it: **+3,704 B (+0.042%)**. The root
    // already carried the whole p2p stack, so what it pays here is the second
    // axis on the vector and the lane scope beside it.
    //
    // +6 B on each when the registry split its domain half into `domains.ts`,
    // which is the module boundary and nothing else.
    //
    // **Re-declared when the #186 branch was merged into main.** Both sides had
    // re-measured against a corpus the other did not have: main's figure was
    // taken over 2,418 rows and this branch's over 2,023, so neither number
    // described the tree they now share. The comment above keeps both accounts
    // because each is the true record of what its own arc cost; this is the one
    // the gate reads. Against the merge build: **8,618,886 B**, over 31 URLs.
    //
    // **The manifest did not collapse**, checked rather than assumed for the
    // reason a floor exists at all (ADR-0083 §3): the build emits 31 URLs and
    // `usda/search-index.json` is among them.
    precacheBytes: 8_618_886,
    status: "built",
  },
  {
    id: "food",
    name: "Rations",
    scope: "/food/",
    startUrl: "/food/",
    description:
      "Log what you eat against an immutable append-only ledger that stays on your device.",
    // Ink on paper, the app's own frame (ADR-0038), rather than the root's
    // purple on black. The background is the one that has to match something,
    // and since the icons here clear their ground outside the drawing
    // (`docs/icon-provenance.md`) it is load-bearing rather than merely
    // agreeable: an installed icon is composited onto this colour, and it is
    // what now shows around the tin. Paper is the colour the drawing was made
    // for, so the splash reads as one surface; black would put a line drawing
    // meant for paper onto a dark screen.
    themeColor: "#000000",
    backgroundColor: "#ffffff",
    icons: [
      {
        src: "/food/icons/rations-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/food/icons/rations-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/food/icons/rations-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    domains: ["food"],
    precache: [
      ...JAR_PRECACHE,
      // **ADR-0047 §11 binds this Facet** (ADR-0077 §4). That promise — "an app
      // whose case rests on keyless offline search must not need a network for
      // its first search" — was written when there was one app; there are two
      // now and only one of them has a case that rests on offline food. So
      // Rations owes all three artifacts whole, and never reaches the state
      // #307 built for the root: it has the files, so nothing fetches them.
      "usda/search-index.json",
      "usda/nutrient-store.json",
      "assets/zxing_reader-*.wasm",
      // Its own mark, at every size the manifest and `food/index.html` name,
      // plus the CC BY 3.0 clause 4(a) notice the drawing's licence asks to
      // travel with every copy of it (`docs/icon-provenance.md`).
      "food/icons/rations-*.png",
      "food/icons/CREDITS.txt",
    ],
    // Re-measured at #346, which gave Rations its third page. Build to build,
    // not against the figure this line used to hold: HEAD already weighed
    // 10,091,653 B, so this number also takes up 1,857 B of drift from #345.
    // #346's own cost is +85,448 B (+83.4 KiB, +0.85%), against a ±5% band that
    // is 497 KiB wide either side. Nearly all of it is bits-ui's range picker — the
    // popover, the range calendar and the two-ended date field — which was new
    // to this bundle the way `@internationalized/date` was new at #344
    // (+58,485 B, +0.58%). The three readings themselves are folds over events
    // the app already had and cost almost nothing.
    // Re-measured for the same corpus consolidation as the root above, and
    // Rations feels nearly four times as much of it, for the reason its
    // `precache` list states: it owes all three artifacts whole (ADR-0047 §11,
    // ADR-0077 §4) where the root takes only the index.
    //
    // −2,518,040 B (−2.40 MiB, −24.74%). The two precached artifacts account
    // for −2,574,389 of it — `nutrient-store.json` 4,015,520 B → 2,174,751 B
    // and `search-index.json` 1,715,082 B → 981,462 B — against 56,349 B of
    // growth the other way.
    //
    // **This number will move again.** The arc that shrank the corpus is still
    // open, so a later drop puts this back under its floor; the band is ±5%,
    // which is 383 KiB either side at this weight.
    //
    // Re-measured at #422, and this is the number ADR-0105 §12 says the
    // implementing ticket owes before anything claims the p2p stack fits.
    // Build to build: HEAD already weighed 10,233,011 B before #422 touched
    // anything, so this figure also takes up 55,910 B of drift from the rest of
    // the arc. **#422's own cost is +15,972 B (+15.6 KiB, +0.16%)**, against a
    // ±5% band that is 497 KiB wide either side — small because §12 guessed
    // right about which half was already paid: Rations precaches the QR writer
    // and already reached the store, the lane chain and the sealed deposit
    // through the meal hand-off, so what a wake adds is the cadence, the errand,
    // the counter and the lock.
    //
    // Re-measured at #423, which is ADR-0105 §10's surface: Rations mounts the
    // root's own `PairedDevicesSection`, and with it the code reader, the code
    // writer and the two §11 states. Build to build with nothing else on the
    // branch moving, so there is no drift to take up this time.
    // **#423's own cost is +16,696 B (+16.3 KiB, +0.16%)**, against the same
    // ±5% band that is 497 KiB wide either side. Small for the same reason
    // #422's was: the camera, the symbol reader and the QR writer were already
    // here for the barcode scanner and the meal hand-off, so what the surface
    // adds is the section itself and the act around it.
    //
    // Re-measured again when §1's reading was settled on the **shell** (the
    // amendment at ADR-0105's foot): the card is drawn under Rations alone, and
    // the per-copy DOM id scheme that a second card in one document had needed
    // is deleted with it. **−52 B**, on both Facets, because what went is a
    // helper in the one module they share.
    //
    // +6 B on each when the registry split its domain half into `domains.ts`,
    // which is the module boundary and nothing else.
    //
    // Re-measured at #186, and down hard. Build to build: HEAD already weighed
    // 7,071,373 B before #186 touched anything, so this line was 3,105,728 B
    // below a band only 497 KiB wide either side. #186's own cost is -17,320 B.
    //
    // Rations owes all three artifacts whole, so it carries the whole of the
    // uncooked corpus's shrinkage. Against the 2026-09-04 declaration the search
    // index fell 1,715,082 B to 812,920 B and the Nutrient store 4,015,520 B to
    // 1,751,028 B, then to 1,739,148 B here: -3,161,214 B between them, against
    // -3,105,728 B of drift, so about 55,486 B of feature work grew back.
    //
    // **The manifest did not collapse.** Checked rather than assumed, because a
    // Facet that installs and then finds no food is exactly what a floor and not
    // a ceiling is for: the build emits 36 URLs, and both USDA artifacts and all
    // three WASM binaries are among them.
    //
    // The saving ADR-0077 §1 accepted gets larger for free — a corpus this arc
    // shrank for retrieval reasons is 3.1 MB nobody installs twice any more.
    //
    // **Re-declared when the #186 branch was merged into main**, for the reason
    // the root's entry gives and by a larger margin: Rations owes all three
    // USDA artifacts whole (ADR-0047 §11, ADR-0077 §4) where the root takes
    // only the index, so it feels the whole of the corpus arc. Against the
    // merge build: **7,124,621 B**, over 36 URLs. The declaration main carried
    // was 7,693,899 B and this landed 184,583 B under its floor, which is the
    // gate doing its job — the weight went and the number had not followed it.
    //
    // **The manifest did not collapse.** The build emits 36 URLs, and both USDA
    // artifacts and all three WASM binaries are among them.
    precacheBytes: 7_124_621,
    // Installability is definitional (ADR-0076 §1) and #305 is where Rations
    // gets a manifest of its own, so this is the ticket that flips it.
    status: "built",
  },
] as const satisfies readonly Facet[];

/**
 * The id of a Facet on the roster. A literal union rather than `string`, so an
 * entry point naming a Facet that does not exist is a compile error and
 * {@link facetOf} is total.
 */
export type FacetId = (typeof FACETS)[number]["id"];

/**
 * The Facet an entry point is. **This is how a Facet's runtime identity is a
 * build-time constant** (ADR-0076 §6): each entry module names its own Facet as
 * a literal, and nothing anywhere reads `location.pathname` to decide. That is
 * not tidiness — a path check would make every Facet's screens reachable from
 * every entry, the bundler would keep them all, and #272's entire saving (4.23
 * MB of it `NotesView`) would go with it.
 */
export function facetOf(id: FacetId): Facet {
  const facet = FACETS.find((f) => f.id === id);
  // Unreachable while `id` is typed: the union is the roster's own ids. It is a
  // throw rather than a `!` so the day someone widens the parameter, the
  // failure says what happened.
  if (!facet) throw new Error(`no Facet '${id}' on the roster`);
  return facet;
}

/**
 * The Tracked Domains a Facet holds, or none if nothing on the roster is that
 * Facet.
 *
 * Everything a Facet owns is the union of what its domains own — its entity
 * prefixes, its `localStorage` prefixes, its screens — so this is the one lookup
 * all of them go through. **Derived, never stored**: ADR-0080 §8's surviving
 * rule is that the registry carries no field re-recording a conclusion whose
 * reason is discarded, and a stored copy of any of these would drift the first
 * time a domain gained a prefix.
 */
export function domainsOf(facetId: string): TrackedDomain[] {
  const facet = FACETS.find((f) => f.id === facetId);
  if (!facet) return [];
  return TRACKED_DOMAINS.filter((d) =>
    (facet.domains as readonly string[]).includes(d.id)
  );
}

/** The entity prefixes a Facet owns: the union of its domains'. */
export function entityPrefixesOf(facetId: string): string[] {
  return entityPrefixesOfDomains(domainsOf(facetId).map((d) => d.id));
}

/** The `localStorage` prefixes a Facet owns. Derived the same way, same reason. */
export function storagePrefixesOf(facetId: string): string[] {
  return domainsOf(facetId).flatMap((d) => [...d.storagePrefixes]);
}

/**
 * How far either side of {@link Facet.precacheBytes} a build may land before
 * `pnpm check:facets` fails it (ADR-0083 §3).
 *
 * **±5%**, which is about 450 KB at the 8–9 MiB the two Facets sit at. Measured
 * drift over a day of ordinary commits is 0.14%, so the band has roughly thirty
 * times the slack real movement needs while a 4 MB regression clears it by an
 * order of magnitude.
 *
 * One width for every Facet rather than a floor and a ceiling written out per
 * entry: the width is a single judgement about how much movement is ordinary,
 * not a fact about either Facet, and stating it twice is how the two come apart.
 * ADR-0083 §3 phrases it as each Facet declaring both edges; what each Facet
 * declares is the number a reviewer has to re-measure, and the edges are read
 * off it here.
 *
 * The weak joint is this number. A dependency bump can legitimately move more
 * than 450 KB — a font family, a WASM upgrade — and the response is to move the
 * Facet's measured figure in the same commit as the change that moved it.
 */
export const PRECACHE_BAND = 0.05;

/** The byte range a Facet's precache must land in. Derived, never declared. */
export function precacheBandOf(facet: Facet): {
  floor: number;
  ceiling: number;
} {
  return {
    floor: Math.round(facet.precacheBytes * (1 - PRECACHE_BAND)),
    ceiling: Math.round(facet.precacheBytes * (1 + PRECACHE_BAND)),
  };
}

/**
 * Where every screen and its components live, so a module outside it is not the
 * containment check's business at all.
 */
export const VIEWS_ROOT = "src/lib/views/";

/**
 * A domain's screen: the lead entry of what it owns under {@link VIEWS_ROOT}.
 *
 * **Only ever asked of a domain some Facet declares**, which is every domain
 * with views and no others (ADR-0096 §13). The Jar domain owns no view module
 * and no Facet names it, so `screensOf` never reaches it; a build that put it in
 * a Facet would yield `[undefined]` here and fail the containment check as a
 * missing screen, which is why the biconditional in
 * `scripts/entity-ownership-check.mjs` refuses that arrangement outright rather
 * than leaving it to be discovered as a broken build.
 */
export function screenOf(domain: TrackedDomain): string {
  return domain.views[0];
}

/**
 * The screens a Facet's declared domains imply: what its built entry must reach,
 * all of them (ADR-0083 §5).
 *
 * Two domains may name one screen — habits and calendar events both draw through
 * `AgendaView` — so this deduplicates, and a Facet with six domains can imply
 * five screens.
 */
export function screensOf(facetId: string): string[] {
  return [...new Set(domainsOf(facetId).map(screenOf))].sort();
}

/**
 * The Facets whose scope sits inside this one's, which is the asymmetry every
 * nesting consequence turns on (ADR-0077 §1).
 *
 * A Facet with something nested inside it may not clean up outdated caches —
 * workbox filters cache names with a substring test, so the root would delete
 * the whole Rations install on every activation — and it needs a navigation
 * fallback denylist. Both are read off this rather than written down against
 * `root`, so a third Facet costs no edit (ADR-0083 §1).
 */
export function nestedFacetsOf(facetId: string): Facet[] {
  const facet = FACETS.find((f) => f.id === facetId);
  if (!facet) return [];
  return FACETS.filter(
    (f) => f.id !== facet.id && f.scope.startsWith(facet.scope)
  );
}
