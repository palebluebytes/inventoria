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
  type ContentDomainId,
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
   * Every entry sits **inside the Facet's own scope**, and the reason is the
   * install rather than the precache. A manifest describes an application whose
   * `scope` is a prefix, so an icon named from outside it is describing a
   * different app's asset; and an icon URL is the one thing here an OS fetches
   * *without* a controlled client, so nothing guarantees a service worker is
   * even consulted for it.
   *
   * **It is not because a worker cannot cache above its scope** — that claim
   * stood in `docs/icon-provenance.md` and here, and ADR-0114 §12's amendment
   * records it as refuted by what already ships: scope decides which clients a
   * worker controls, not which URLs it may store, and 25 of Rations' 36
   * precached URLs sit above `/food/`. The face marks are declared from `/icons/`
   * in both `precache` lists on the strength of that.
   */
  readonly icons: readonly ManifestIcon[];
  readonly domains: readonly string[];
  /**
   * The faces this shell holds — the roster its switcher draws (ADR-0114 §8).
   *
   * **A declaration, and deliberately not a discovery.** To find out at runtime
   * that a face's module is present, the switcher would have to reference it,
   * which puts every face in every bundle and costs ADR-0077 its 4.23 MB — the
   * saving ADR-0076 §6 made Facet identity a build-time constant to protect. So
   * what keeps the roster honest is a gate: `checkViewContainment` holds each
   * declared face's screens to what this Facet's built entry actually reaches,
   * and a shell cannot name a face whose modules are absent.
   *
   * It is also where ADR-0078 §1 survives **as the mechanism rather than as the
   * obstacle**. A roster drawn from what the build holds cannot offer a crossing,
   * so nothing is suppressed at runtime and no `display-mode` test appears
   * anywhere: Rations' faces are all inside `/food/` and the root's are all
   * inside `/`. §2 of that record falls — Rations gains a switcher — and §1 does
   * not.
   *
   * Membership only. The order is {@link FACES}' and is read through
   * {@link facesOf}, so this array cannot re-sort a grid.
   */
  readonly faces: readonly FaceId[];
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
    // The triquetra (ADR-0114 §12), cut with the tin's own recipe and carrying
    // the same author and the same licence. It replaces `/favicon.svg`, whose
    // provenance `docs/icon-provenance.md` recorded as untraceable rather than
    // implying a clearance — #302's subject was Rations, and this mark is now
    // the trigger on every screen, which is what made the gap worth closing.
    //
    // Three, in Rations' shape: an `any` at 512 and at 192, and a maskable 512
    // whose art is re-laid inside Android's safe circle. The 32 and the 180 are
    // `index.html`'s `<link>`s and are deliberately not here — a manifest that
    // listed them would be claiming they are install marks.
    icons: [
      { src: "/icons/inventoria-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/inventoria-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icons/inventoria-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    domains: ["food", "media", "items", "habits", "calendar", "notes"],
    // **All seven** (ADR-0114 §8). The root holds every content domain, so every
    // face's screen is in this build and the switcher can offer the lot.
    faces: [
      "rations",
      "recipes",
      "media",
      "items",
      "agenda",
      "notes",
      "settings",
    ],
    precache: [
      ...JAR_PRECACHE,
      // Its own mark, at every size the manifest and `index.html` name, plus the
      // CC BY 3.0 clause 4(a) notice the drawing's licence asks to travel with
      // every copy of it — the same declaration Rations makes one line of scope
      // down (ADR-0114 §12).
      "icons/inventoria-*.png",
      // **The seven face marks**, because this shell's switcher draws all seven
      // (§8) and a switcher whose tiles are blank offline is an install that
      // cannot navigate. One file each at 256; the five-file ladder is owed only
      // where something is installable.
      "icons/faces/*-256.png",
      "icons/CREDITS.txt",
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
    //
    // **Re-measured at #529**, which deleted the `Sidebar`, gave every face a
    // pinned header and swapped the app's mark. Build to build against this
    // branch's tip (`2e6732b0`), which precaches **8,633,475 B over 31 URLs** —
    // and note that is 14,589 B above the line this comment used to hold, so
    // that much is drift from #527, #528 and #531, none of which re-measured. It
    // is left attributed rather than folded in: #528's roster is one shared
    // module and Rations gained the same 14,592 B from it.
    //
    // **+254,749 B (+248.8 KiB, +2.95%), 31 URLs to 43**, and all but 3,802 B of
    // it is files rather than code:
    //
    // | what                        | urls |   bytes |
    // | --------------------------- | ---: | ------: |
    // | `icons/faces/*-256.png`     |    7 | 164,530 |
    // | `icons/inventoria-*.png`    |    5 |  93,697 |
    // | `icons/CREDITS.txt`         |    1 |   2,242 |
    // | `favicon.svg`, gone         |   -1 |  -9,522 |
    // | the header, panel and grid  |      |   3,802 |
    //
    // The seven marks are the switcher's, and this shell draws all seven
    // (ADR-0114 §8): a cold offline install whose tiles were blank is an install
    // that cannot navigate. The five `inventoria-*.png` and the notice beside
    // them are §12's swap — the triquetra in, `/favicon.svg` out, because a mark
    // nothing in the repository can trace cannot be the trigger on every screen.
    //
    // **The manifest did not collapse**, checked rather than assumed: the build
    // emits 43 URLs and `usda/search-index.json` is still among them. It leaves
    // at [#535](https://github.com/palebluebytes/inventoria/issues/535), which is
    // the next commit to move this number and the one that moves it *down*.
    precacheBytes: 8_888_224,
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
    // **Three**, and the shape of a prefix of the root's. Rations and Recipes
    // both draw `food`, which is the one domain this Facet holds, and Settings is
    // in every Facet's roster because a door in the same place everywhere is the
    // whole of ADR-0114 §10. The other four are not merely hidden here: their
    // screens are not in this build, which is what makes ADR-0078 §1 the
    // mechanism rather than a rule anything has to enforce at runtime.
    faces: ["rations", "recipes", "settings"],
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
      // **The three faces this shell holds, and the app's mark above them**
      // (ADR-0114 §8). They serve from `/icons/`, which is above this Facet's
      // scope, and that is not the obstacle `docs/icon-provenance.md` expected
      // it to be: a service worker's scope decides which **clients** it
      // controls, not which URLs it may cache, and this precache has always held
      // `assets/`, `fonts/` and `usda/` — 25 of its 36 URLs sit above `/food/`.
      // So the marks are named here rather than copied under `public/food/`, and
      // `Face.mark` stays one served URL with one cut output behind it.
      //
      // Only three, where the root names seven: a precache is per Facet and this
      // one draws the faces this build holds. The clause 4(a) notice travels
      // with them, so the root's `CREDITS.txt` comes too — the copy is a copy
      // whichever install made it.
      "icons/faces/rations-256.png",
      "icons/faces/recipes-256.png",
      "icons/faces/settings-256.png",
      "icons/inventoria-192.png",
      "icons/CREDITS.txt",
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
    //
    // **Re-measured at #529**, which gave Rations a switcher (ADR-0114 §8,
    // overturning ADR-0078 §2). Build to build against this branch's tip
    // (`2e6732b0`), which precaches **7,139,213 B over 36 URLs** — 14,592 B
    // above the line this comment used to hold, which is #528's shared roster
    // module and is left attributed rather than folded in, exactly as on the
    // root.
    //
    // **+104,579 B (+102.1 KiB, +1.47%), 36 URLs to 41**:
    //
    // | what                                   | urls |  bytes |
    // | -------------------------------------- | ---: | -----: |
    // | the three faces this shell holds       |    3 | 81,201 |
    // | `icons/inventoria-192.png`             |    1 | 14,482 |
    // | `icons/CREDITS.txt`                    |    1 |  2,242 |
    // | the header, panel and grid             |      |  6,654 |
    //
    // **Three marks and not seven**, which is the whole of what a per-Facet
    // precache buys here: Media, Items, Agenda and Notes are not in this build
    // and their tiles are not in this switcher. The app's own mark comes too,
    // because the panel's masthead draws it in both shells — as a control on the
    // root and as a drawing here, since home is the root's landing grid and that
    // is outside this scope.
    //
    // **The manifest did not collapse**: 41 URLs, and all three USDA artifacts
    // are still among them (ADR-0077 §4).
    precacheBytes: 7_243_792,
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
 * A named, mark-bearing screen of the app the switcher can reach (ADR-0114 §1).
 *
 * **A face is not a {@link Facet}, and the two words are kept apart because the
 * costs are not comparable.** A face is a name, a mark, a maturity and a screen.
 * A Facet is a manifest, a service worker, a precache declaration with a
 * measured byte band, an arm on the offline-boot gate, and an install that
 * shares no bytes with its siblings. Collapsing them would price every new name
 * at nine megabytes.
 *
 * **This roster is authored, where a Facet's prefix set is derived**, and the
 * asymmetry is the one thing about this type worth arguing. A Facet's domains
 * decide what it *owns*, and ownership must be derivable or it drifts
 * (ADR-0086 §1). A face's domains decide only what it *draws*, which is a
 * presentation choice no gate can infer: Agenda draws two domains, Rations and
 * Recipes both draw `food`, and Settings draws none at all.
 */
export interface Face {
  /** Build vocabulary, and never written to a datom. */
  readonly id: string;
  /**
   * **The one canonical name** (ADR-0114 §3), read by the switcher tile, the
   * pinned header, the accessible name and the `<h1>`. `src/lib/food/pages.ts`
   * already takes this route with `pageLabel()`, which reads Rations' name off
   * `FACETS` rather than spelling it.
   *
   * A switcher is the first surface that puts every name beside every other,
   * which is what retires `Media Tracker`, `Physical Digital Twins` and
   * `Notes & Checklist`: until now the same face could be called three things.
   */
  readonly name: string;
  /**
   * The mark the switcher draws, served from `public/`.
   *
   * One file per face at 256, because a tile is 64 and the five-file ladder is
   * owed only where something is installable (ADR-0114 §12). Declared rather
   * than derived from the id for {@link Facet.icons}' reason: this is a path to
   * a committed file, and the registry's header refuses a field naming a file
   * that is not there.
   *
   * **They serve from `/icons/faces/`, which is above `/food/`**, so Rations'
   * service worker cannot precache the three its own switcher draws — a
   * precached URL must sit inside the Facet's own scope. Copy or inline is
   * #529's call; nothing reads this field yet, so no manifest moves here.
   */
  readonly mark: string;
  /**
   * The Tracked Domains this face draws, or none.
   *
   * **Plural, and that is not a hedge.** ADR-0114 §1 states a face is not
   * one-to-one with a Tracked Domain in either direction, and every arm of that
   * is live on today's roster: Agenda draws Habits and Calendar events, which
   * have no face of their own; Rations and Recipes both draw `food`; and
   * Settings draws nothing, being jar-wide. A singular field would be a lie
   * about two of the seven.
   *
   * A **content** domain, so the Jar domain cannot be named here: it has no
   * screen (ADR-0096 §13), and a face onto it would be a tile that opens onto
   * nothing.
   *
   * This is what {@link screensOfFace} reads, and through it the half of
   * `checkViewContainment` that holds a shell's declaration to its own build.
   */
  readonly domains: readonly ContentDomainId[];
  /**
   * What the face claims about itself, drawn as a band under the switcher tile's
   * mark and as a `Badge` beside the title in its own header (ADR-0114 §11).
   *
   * **Declared, never derived from an id.** Rations and Settings ship; the other
   * five are beta. Settings is exempt although it is not Rations, and that is a
   * decision rather than an oversight: its contents are the oldest surfaces in
   * the app, and a badge that is visibly wrong once teaches people to ignore it
   * everywhere. What earns `shipped` is in that record — a face's screens do the
   * whole job its name claims, and it works with the network off — so the five
   * have a stated way out rather than a permanent label.
   */
  readonly maturity: "shipped" | "beta";
  /**
   * Whether this face is also a Facet, which is **a sparse property of a face**
   * (ADR-0114 §1) and the one stored field on this roster.
   *
   * **It is stored, and {@link domainsOf}'s rule in this module says a registry
   * carries no field re-recording a conclusion whose reason is discarded
   * (ADR-0080 §8). This is the answer to that rule rather than an exception to
   * it.** There is no join to derive it through: a face id and a Facet id name
   * different things — `rations` the face draws `food` the Facet — the root Facet
   * is not a face at all, and the only handle the two rosters share is the
   * canonical name, which is a *coincidence of today's roster* and not something
   * either record promises. Deriving through it would mean renaming what Rations
   * calls itself on a home screen silently made a face uninstallable, which is a
   * wrong answer arrived at quietly. ADR-0114 §4 asks for the flag for the other
   * half of the same reason: promotion should cost a flag plus the install, and
   * never a restructure of the navigation.
   *
   * So the coherence is asserted rather than derived —
   * `tests/unit/facet-registry.test.ts` holds this field to the Facet roster by
   * that shared name, which is a **staleness guard and not a derivation**: it
   * fails loudly on the day the two disagree, where a derivation would just
   * change its answer.
   *
   * Recipes is `false` on purpose, and the reason is a gate rather than a
   * preference (ADR-0114 §4): `recipe:` is owned by the `food` domain and
   * `pnpm check:facets` holds a Facet to reaching *every* screen of *every*
   * domain it holds, so a recipes-only Facet holding `food` is unbuildable.
   * Promoting it is a domain split plus an install's own costs, and **no
   * navigation code changes** — which is what this field being one flag buys.
   */
  readonly installable: boolean;
}

/**
 * The seven faces, in the one fixed order (ADR-0114 §2).
 *
 * `Rations · Recipes · Media · Items · Agenda · Notes · Settings` — today's
 * deleted `Sidebar` order with Recipes inserted after Rations, because Recipes
 * lives inside Rations' scope and each Facet's roster is then a **prefix** of
 * the root's.
 *
 * **The order is fixed and nothing re-sorts it**, ever. Ordering by frequency of
 * use was considered at length and refused: seven destinations are learned by
 * position within a week, and a grid whose tiles move spends that and gives back
 * adaptation nobody asked for (ADR-0114 §7). Settings is last here *and* pinned
 * to the grid's last column, because a list is a poor thing to trust with a
 * right edge once faces can be hidden.
 *
 * It is **not** the six Tracked Domains re-listed: Agenda holds two of them and
 * Settings holds none.
 */
export const FACES = [
  {
    id: "rations",
    name: "Rations",
    mark: "/icons/faces/rations-256.png",
    domains: ["food"],
    maturity: "shipped",
    installable: true,
  },
  {
    id: "recipes",
    name: "Recipes",
    mark: "/icons/faces/recipes-256.png",
    // The same domain Rations draws, which is the arm of ADR-0114 §1 that keeps
    // this roster authored: `food` has one screen and two faces read it.
    domains: ["food"],
    maturity: "beta",
    installable: false,
  },
  {
    id: "media",
    name: "Media",
    mark: "/icons/faces/media-256.png",
    domains: ["media"],
    maturity: "beta",
    installable: false,
  },
  {
    id: "items",
    name: "Items",
    mark: "/icons/faces/items-256.png",
    domains: ["items"],
    maturity: "beta",
    installable: false,
  },
  {
    id: "agenda",
    name: "Agenda",
    mark: "/icons/faces/agenda-256.png",
    // Two domains, one screen. The root has six tabs and six domains and they
    // are not the same six, and this is where that has always been true.
    domains: ["habits", "calendar"],
    maturity: "beta",
    installable: false,
  },
  {
    id: "notes",
    name: "Notes",
    mark: "/icons/faces/notes-256.png",
    domains: ["notes"],
    maturity: "beta",
    installable: false,
  },
  {
    id: "settings",
    name: "Settings",
    mark: "/icons/faces/settings-256.png",
    // **None, and it is the field saying so.** Settings is jar-wide, so it draws
    // no Tracked Domain and its contents vary by Facet (ADR-0114 §10) — the root
    // holds `SettingsView` and Rations holds `FoodSettingsSheet`, and there is no
    // module both shells could be held to. That is the same surface ADR-0083 §10
    // declined to gate, and an empty list here is what keeps the gate honest
    // about not looking at it rather than quietly excusing it.
    domains: [],
    maturity: "shipped",
    installable: false,
  },
] as const satisfies readonly Face[];

/**
 * The id of a face on the roster. A literal union rather than `string`, so a
 * shell declaring a face that does not exist is a compile error and
 * {@link faceOf} is total — the same reason {@link FacetId} is one.
 */
export type FaceId = (typeof FACES)[number]["id"];

/**
 * A member of {@link FACES}, which is a narrower thing than a {@link Face}.
 *
 * `Face.id` is declared `string` because the interface is written above the
 * roster and cannot refer to it; the roster's own members carry literal ids. The
 * two lookups below hand this back rather than `Face` so a caller can do the one
 * thing a switcher exists to do — pass a face's id to something that takes a
 * {@link FaceId} — without a cast. Nothing is widened: every `RosteredFace` is a
 * `Face`, which is what `satisfies` above already proves.
 */
export type RosteredFace = (typeof FACES)[number];

/** The face a {@link FaceId} names. */
export function faceOf(id: FaceId): RosteredFace {
  const face = FACES.find((f) => f.id === id);
  // Unreachable while `id` is typed, and a throw rather than a `!` so the day
  // someone widens the parameter the failure says what happened.
  if (!face) throw new Error(`no face '${id}' on the roster`);
  return face;
}

/**
 * The faces a shell holds, **in the roster's order rather than the shell's**.
 *
 * The ordering is the point of routing through here. {@link Facet.faces} is a
 * membership list, and a shell that declared its three backwards would still
 * draw them in ADR-0114 §2's one order with Settings last. It is also what makes
 * each Facet's roster a *prefix* of the root's without either list having to say
 * so.
 *
 * **It takes the Facet and not its id**, which is the seam `checks.ts` needs:
 * every rule there is handed the thing it judges so it can be handed one that
 * does not exist, and a lookup by id inside the rule would quietly judge the
 * roster instead of the declaration it was given. {@link domainsOf} takes a
 * string because a lane's scope arrives from a peer as one; nothing hands this
 * function a name it might not know.
 *
 * It **filters** where {@link faceOf} throws, and the asymmetry is the field's
 * type rather than a difference of nerve: {@link Facet.faces} is
 * `readonly FaceId[]`, so a declaration naming a face off the roster does not
 * compile and a runtime guard here would be unreachable. It also must not throw
 * — its one non-app caller is a `checks.ts` rule, and a rule that raises instead
 * of returning a verdict exits the gate with a stack trace where a claim belongs.
 */
export function facesOf(facet: Facet): RosteredFace[] {
  const declared: readonly string[] = facet.faces;
  return FACES.filter((face) => declared.includes(face.id));
}

/**
 * The face hiding is undone on, and therefore **the one face that cannot be
 * hidden** (ADR-0114 §10).
 *
 * A named constant rather than a field on {@link Face}, and rather than a
 * derivation. A field would re-record a conclusion whose reason is discarded,
 * which is the rule {@link domainsOf} states below; and the two derivations
 * available are both coincidences of today's roster — Settings is the only face
 * with no domains and the only one that is not `installable` either, and neither
 * of those is *why* it stays. The reason is that the toggles live on it, so
 * hiding it would be the one setting in the app that cannot be taken back.
 *
 * It is read by {@link hideableFaces}, which offers the toggles, and by
 * {@link shownFaces}, which honours them — so the rule is stated once and both
 * halves of it agree by construction.
 */
export const UNHIDEABLE_FACE: FaceId = "settings";

/**
 * The faces a visibility section offers a toggle for: everything a shell holds
 * except {@link UNHIDEABLE_FACE}.
 *
 * It takes a list rather than a Facet so it composes with {@link facesOf}
 * without knowing which shell is asking — Rations offers two rows and the root
 * six, off the same call.
 */
export function hideableFaces(faces: readonly RosteredFace[]): RosteredFace[] {
  return faces.filter((face) => face.id !== UNHIDEABLE_FACE);
}

/**
 * The faces a shell's switcher draws: what it holds, minus what this device has
 * hidden (ADR-0114 §10).
 *
 * **Hiding is a drawing and never a reach.** A hidden face keeps its screen, its
 * URL and its share target — §10's whole promise is that a deep link or a shared
 * meal still lands — so this is called by the two hosts of `FaceGrid` and by
 * nothing that routes.
 *
 * **{@link UNHIDEABLE_FACE} survives a stored value naming it**, which is the
 * only defensive clause here and it is load-bearing: {@link hideableFaces} can
 * never produce one, but `localStorage` is a text file a person can edit, and a
 * jar whose Settings tile is gone is a jar with no way to put anything back.
 *
 * Pure, and it takes the hidden set rather than reading the store: the roster is
 * a build-time constant (ADR-0076 §6) and this module must stay free of a
 * `localStorage` read, both so the unit tier can exercise the rule directly and
 * so `scripts/facet-checks.mjs` can import the registry under Node.
 */
export function shownFaces(
  faces: readonly RosteredFace[],
  hidden: readonly string[]
): RosteredFace[] {
  return faces.filter(
    (face) => face.id === UNHIDEABLE_FACE || !hidden.includes(face.id)
  );
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
 * The screens a set of Tracked Domains imply, named by id.
 *
 * **Deduplicated**, because two domains may name one screen: habits and calendar
 * events both draw through `AgendaView`, so a Facet with six domains implies five
 * screens and a count of one screen per domain would never be satisfiable.
 *
 * It is the pair {@link entityPrefixesOfDomains} and {@link entityPrefixesOf}
 * already are, and for the same reason: two callers need this over two different
 * domain sets — a Facet's own, and a face's, which is neither a Facet's nor
 * derivable from one — and one derivation is what keeps them from becoming two
 * lists of the same thing. A domain id this build does not know contributes
 * nothing.
 */
export function screensOfDomains(ids: readonly string[]): string[] {
  const named = new Set(ids);
  return [
    ...new Set(TRACKED_DOMAINS.filter((d) => named.has(d.id)).map(screenOf)),
  ].sort();
}

/**
 * The screens a Facet's declared domains imply: what its built entry must reach,
 * all of them (ADR-0083 §5).
 */
export function screensOf(facetId: string): string[] {
  return screensOfDomains(domainsOf(facetId).map((d) => d.id));
}

/**
 * The screens a face draws: what a shell declaring it must reach.
 *
 * Empty for a face that draws no domain, which is Settings — and an empty answer
 * is what makes `checkViewContainment` count it as unjudged rather than proved.
 */
export function screensOfFace(face: Face): string[] {
  return screensOfDomains(face.domains);
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
