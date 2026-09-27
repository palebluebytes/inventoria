<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { dbClient } from "./lib/db/db.client";
  import FaceHeader from "./lib/layout/FaceHeader.svelte";
  import FoodView from "./lib/views/FoodView.svelte";
  import MediaView from "./lib/views/MediaView.svelte";
  import AgendaView from "./lib/views/AgendaView.svelte";
  import SettingsView from "./lib/views/SettingsView.svelte";
  import ItemsView from "./lib/views/ItemsView.svelte";
  import RecipeLibrarySheet from "./lib/views/food/RecipeLibrarySheet.svelte";
  import Badge from "./lib/ui/Badge.svelte";
  import ReloadPrompt from "./lib/ui/ReloadPrompt.svelte";
  import FacetExit from "./lib/layout/FacetExit.svelte";
  import CarriedDeletionNotice from "./lib/views/CarriedDeletionNotice.svelte";
  // Notes is the only view whose CRDT (loro) carries a multi-megabyte WASM
  // payload. Importing it dynamically keeps that payload out of the entry chunk,
  // so a failure anywhere under Notes degrades Notes alone instead of stopping
  // the ledger, food logging and habits from mounting at all (#125). The other
  // views stay static.
  import { runStartupErrands } from "./lib/facets/startup";
  import { openAppWake } from "./lib/p2p/wake-errand";
  import { watchCarriedDeletions } from "./lib/stores/carried-deletion-notice";
  import type { OpenWake } from "./lib/p2p/wake-cadence";
  import {
    faceOf,
    facesOf,
    facetOf,
    type Facet,
    type FaceId,
  } from "./lib/facets/registry";

  /**
   * Which Facet this is, handed in by the entry point that mounted it
   * (ADR-0076 §6). Every shell takes it, so the root reads its own name off the
   * registry rather than repeating it, and neither shell is ever tempted to
   * work out which Facet it is from a URL.
   */
  let { facet }: { facet: Facet } = $props();

  // A dev/e2e-only harness: `?demo=bottomsheet` swaps the whole app for a
  // UI-primitive demo, so a Playwright spec can drive the primitive in
  // isolation without a real screen mounting it (issue #17). It is gated on
  // `import.meta.env.DEV` and dynamically imported, so it is dead-code
  // eliminated from the production build — it never ships.
  const demo =
    import.meta.env.DEV && typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("demo")
      : null;

  // ── No meal arrives here ─────────────────────────────────────────────────
  //
  // **The root reads no receive link, and there is no fallback reader**
  // (ADR-0084 §5). A meal is `event:consume_*` and food twins, which Rations
  // owns, and a hand-off belongs to the Facet that owns what it carries — so
  // the link mints at `/food/` and is read by `src/Rations.svelte`, along with
  // ADR-0082 §2's iOS handover reading of the same fragment.
  //
  // **A second reader kept here would be one arrival with two doors**, which is
  // the inverse of §2's rule about a hand-off with no owner, and it could not be
  // decided per-recipient in any case: ADR-0072 §7 stops the sender learning
  // anything about the recipient's device, including their install roster. A
  // root-only install still lands the link, because `/food/` is inside `/` by
  // prefix (ADR-0078 §3) — it opens Rations' entry inside the same app window
  // and Back returns.
  //
  // What the root does still read off its URL is `?url=`, the Web Share
  // Target's, which mints an acquisition twin and is the root's under the same
  // rule (ADR-0084 §3, §4).

  // ── DB init ──────────────────────────────────────────────────────────────
  let dbReady = $state(false);
  let dbError = $state("");

  // The ledger client, hung on `window` for the e2e suite. `db.client.ts`
  // declares the property, so this needs no cast (CODING_STANDARDS §3.2).
  if (typeof window !== "undefined") {
    window.dbClient = dbClient;
  }

  // Kick off worker creation synchronously, before any child view subscribes to
  // a ledger store. init() assigns dbClient.worker and posts its `init` message
  // before its first await, so store queries that fire during the initial render
  // are queued behind that init message (the worker processes messages in order)
  // instead of racing an unset worker and rejecting with "not initialized".
  const initPromise = dbClient.init("/inventoria.db");

  /**
   * This open's wake, kept so its triggers can be dropped with the app.
   *
   * A wake is one app-open, so there is exactly one of these and it lives as
   * long as the shell does. Unmounting is not the hide the deposit flushes on
   * — that is the browser's own signal, and this is only the teardown.
   */
  let wake: OpenWake | null = null;
  /**
   * The listener for a peer's carried deletion, which has to be attached
   * **before** the wake that applies one (ADR-0096 §12).
   *
   * It is not part of the wake: a first sync applies carried deletions too, and
   * that runs off a pairing act in Settings rather than off this open.
   */
  let watching: (() => void) | null = null;
  let unmounted = false;
  onDestroy(() => {
    unmounted = true;
    wake?.close();
    watching?.();
  });

  onMount(async () => {
    // Every entry point's errands, in one list so a second one cannot miss one
    // (#301). Here rather than at module scope so they run on a real load of
    // the app.
    runStartupErrands();
    try {
      await initPromise;
      dbReady = true;

      // Handle Web Share Target redirection
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const sharedUrl = params.get("url") || params.get("text") || "";
        if (sharedUrl) {
          face = "items";
        }
      }

      // The Wake (ADR-0096 §3): every paired device is collected from and
      // deposited to, on this open of the root Facet and then as often as there
      // is reason to — a deposit whenever the ledger grows, a collection no
      // more than hourly. Here rather than in `runStartupErrands` because a
      // wake is an open of **a Facet** and names which one (ADR-0105 §9), so
      // the one list both entry points share is the wrong place to say it —
      // and after the ledger, because a wake is a read of it and an import into
      // it. Nothing is awaited: a wake is silent, and nothing on the screen
      // waits for one.
      //
      // The root's scope is the whole Jar, so this wake serves every lane
      // wholly, which is §9's second row and is unchanged by that record.
      //
      // The notice a carried deletion leaves is listened for first, because a
      // broadcast nobody is listening to is a deletion the person is never told
      // about (ADR-0096 §12).
      watching = watchCarriedDeletions();
      wake = openAppWake("root");
      // The shell can be torn down inside the awaits above, in which case
      // `onDestroy` has already run and found nothing to close.
      if (unmounted) {
        wake.close();
        watching();
      }
    } catch (e: any) {
      dbError = e.message ?? String(e);
    }
  });

  // ── Navigation ───────────────────────────────────────────────────────────
  //
  // **Six tabs became seven faces** (ADR-0114 §2). The state is a `FaceId` off
  // the roster rather than a union written here, so the switcher, the header's
  // title and this ladder cannot disagree about what the app holds — and a face
  // added to the registry is a compile error here until it has a screen.
  //
  // `rations` is still the landing, and that is the one thing this ticket does
  // not change: [#530](https://github.com/palebluebytes/inventoria/issues/530)
  // makes the landing the grid itself, which is where the switcher's own mark
  // gets somewhere to go.
  let face = $state<FaceId>("rations");

  /** The seven, in the roster's fixed order — never this shell's own. */
  const faces = $derived(facesOf(facet));

  /**
   * The other Facet, named here only so the root can offer it (ADR-0078 §4).
   *
   * This is data and not a screen, which is the whole of why it is allowed:
   * ADR-0078 §1 binds what an entry point *mounts*, and reading the roster
   * pulls no food-only module into this bundle. The link's target and label
   * both come off the registry, so the root cannot advertise a name Rations has
   * stopped answering to.
   */
  const rations = facetOf("food");
</script>

<svelte:head>
  <title>{facet.name} — Local-first Ledger</title>
  <meta
    name="description"
    content="Track food twins and habits with an immutable append-only ledger powered by SQLite WASM and OPFS."
  />
</svelte:head>

{#if demo === "bottomsheet"}
  {#await import("./lib/ui/BottomSheetDemo.svelte") then mod}
    {@const BottomSheetDemo = mod.default}
    <BottomSheetDemo />
  {/await}
{:else}
  <!-- `data-db` is the ledger's state, and it is a **test hook rather than a
       drawing** (ADR-0114 §9). The Sidebar's badge used to say "DB Ready" in
       words, and fifteen end-to-end specs read those words to know the app had
       opened; that badge is deleted, because a permanent green label is a
       developer's affordance charging the user for it. The affordance itself is
       real, so it moves to an attribute nobody sees — the same bargain
       `window.dbClient` and `SettingsView`'s always-rendered tree already strike
       in this file. It survives #530, which takes the day off the landing
       screen: the shell knows whether the ledger is open whatever it is
       drawing. -->
  <div class="app" data-db={dbError ? "error" : dbReady ? "ready" : "opening"}>
    <!-- The app's only navigation, at the top of every face (ADR-0114 §5). It
         publishes its own measured height as `--shell-ceiling` on `<html>`,
         which is what the panel it drops reads — the deleted `Sidebar` published
         a floor from the other edge and for the same reason. -->
    <FaceHeader face={faceOf(face)} {faces} onPick={(id) => (face = id)} />

    <main class="main">
      <!-- The capped, centred column, and the whole of why it is a box of its
           own: `.main` is the scroll container, and a cap on the scroll
           container draws the scrollbar down the middle of a wide screen
           instead of at the edge of the window (`src/app.css`, ADR-0091 §2 as
           amended). The wrapper takes the cap; the scroll stays outside it. -->
      <div class="shell-column">
        <!-- Above every face, because the act it reports is about the jar rather
             than about whichever screen happens to be open (ADR-0096 §12). -->
        <CarriedDeletionNotice />

        <!-- **Error only** (ADR-0114 §9), which is what `Rations.svelte` already
             does and for the reason written beside it: a screen that silently
             never becomes ready is the one failure a user cannot read off the
             page. `● DB Ready` and `○ Connecting…` went with the `Sidebar` that
             carried them — a permanent green badge is a developer's affordance
             charging the user for it. Where the line sits on the landing screen
             is [#530](https://github.com/palebluebytes/inventoria/issues/530)'s;
             that it is error-only everywhere is settled here, because the box
             that drew the other two states is gone in this change. -->
        {#if dbError}
          <Badge class="w-full justify-center" variant="error">
            ✕ DB Error — {dbError}
          </Badge>
        {/if}

        {#if face === "rations"}
          <!-- No `receiveLink`: a meal arrives at Rations and nowhere else
               (ADR-0084 §5), so there is none for this shell to hand down. The
               Scan way in still reads a meal code, and FoodView owns that one
               end to end. -->
          <FoodView {dbReady} shell="root" onReceiveClose={() => {}} />
          <!-- Under the screen rather than in the header, because ADR-0078 §4
               keeps the Food tab otherwise unchanged: same screen, same
               components, no pointer. Turning the tab itself into one would
               reopen ADR-0077 §5, which kept `usda/search-index.json` in the
               root's precache precisely because food is the root's landing
               screen. -->
          <FacetExit facet={rations} />
        {/if}

        <!-- Recipes is a face rather than one of Rations' pages (ADR-0114 §4),
             so the root reaches the library directly instead of through a
             header control it does not have. `inline` is the same prop the page
             form passes: one surface, two hosts (#337).

             It is **not** a Facet, and the reason is a gate rather than a
             preference: `recipe:` is owned by the `food` domain, and
             `check:facets` holds a Facet to reaching every screen of every
             domain it holds, so a recipes-only Facet holding `food` is
             unbuildable. `selectedDate` is inert on this surface — nothing it
             can reach puts food on a day — and `onClose` has nothing to close,
             because a face is left by choosing another. -->
        {#if face === "recipes"}
          <RecipeLibrarySheet
            selectedDate={new Date()}
            inline
            onClose={() => {}}
          />
        {/if}

        {#if face === "media"}
          <MediaView {dbReady} />
        {/if}

        {#if face === "items"}
          <ItemsView {dbReady} />
        {/if}

        {#if face === "agenda"}
          <AgendaView {dbReady} />
        {/if}

        {#if face === "notes"}
          {#await import("./lib/views/NotesView.svelte") then mod}
            {@const NotesView = mod.default}
            <NotesView {dbReady} />
          {/await}
        {/if}

        <!-- Settings — always rendered so Playwright can find the harness elements.
             That is also why it is handed the shown signal rather than reading a
             mount: it mounts once per page load and never again, so anything on
             it that must be fresh when it is looked at has to be told when it is
             being looked at (#290). -->
        <div hidden={face !== "settings"}>
          <SettingsView {dbReady} shown={face === "settings"} />
        </div>
      </div>
    </main>

    <ReloadPrompt {facet} />
  </div>
{/if}

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100svh;
    /* `100svh` and no `var(--vv-h)`: the shell is not a consumer of the visible
       band (ADR-0089 §4). The nav is not something you use while typing, and
       making it chase the keyboard means it competes with every focused field
       on the page for space. Do not "fix" this. */
    background: var(--bg-base);
    /* **All four now, where this box used to reserve three** (ADR-0089 §2, as
       amended by ADR-0114 §5). The fourth used to be the nav's: it stood at the
       foot of the screen and reserved the home indicator itself, so reserving it
       here too would have doubled the gap. The nav is deleted, nothing stands
       between this box and the indicator, and the last row of whichever face is
       open would otherwise sit under it — which is exactly the reading
       `.rations` has always had, and the two shells now agree on every edge. */
    padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
      env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
  }

  /* `.main` is not here either — it is one rule in `src/app.css`, shared with
     Rations' shell (ADR-0091 §2). Nor is there a width query left in this file:
     the `Sidebar`'s flip from a bottom bar to a left rail was the only shape
     this shell changed at 768, and the header it was replaced by is one row at
     every width (ADR-0114 §6). */
</style>
