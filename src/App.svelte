<script lang="ts">
  import { onMount } from "svelte";
  import { dbClient } from "./lib/db/db.client";
  import Sidebar from "./lib/layout/Sidebar.svelte";
  import FoodView from "./lib/views/FoodView.svelte";
  import MediaView from "./lib/views/MediaView.svelte";
  import AgendaView from "./lib/views/AgendaView.svelte";
  import SettingsView from "./lib/views/SettingsView.svelte";
  import ItemsView from "./lib/views/ItemsView.svelte";
  import ReloadPrompt from "./lib/ui/ReloadPrompt.svelte";
  import FacetExit from "./lib/layout/FacetExit.svelte";
  // Notes is the only view whose CRDT (loro) carries a multi-megabyte WASM
  // payload. Importing it dynamically keeps that payload out of the entry chunk,
  // so a failure anywhere under Notes degrades Notes alone instead of stopping
  // the ledger, food logging and habits from mounting at all (#125). The other
  // views stay static.
  import { runStartupErrands } from "./lib/facets/startup";
  import { facetOf, type Facet } from "./lib/facets/registry";
  import {
    takeCodeHandover,
    takeReceiveLink,
    type ReceiveOpening,
  } from "./lib/p2p/receive-link";
  import { isIosSafariTab } from "./lib/p2p/safari-tab";
  import CodeHandover from "./lib/views/food/CodeHandover.svelte";

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

  // ── A meal, arriving by link ─────────────────────────────────────────────
  //
  // Receiving has no door of its own (ADR-0074 §4), so this is not a route and
  // there is nothing to navigate to. A receive link is `/#r=…&k=…` — the secret
  // in the fragment, so it reaches no server — and it is read here because the
  // URL belongs to the app rather than to any one screen. What it opens belongs
  // to the food screen, which is where a meal is.
  //
  // §9's rule is what this shape is bought with: **the receive page is served
  // by the asset router, never by the Worker script.** `GET /receive` on the
  // live site falls through to the script, which answers without the
  // `cross-origin-*` headers `_headers` puts on an asset — no cross-origin
  // isolation, no `SharedArrayBuffer`, and an in-memory database. `/` is a
  // precached asset served 200, and the whole hole is avoided by never leaving
  // it. Do not give receive an HTML entry of its own: the #125 offline gate
  // hardcodes `dist/index.html` and would never see one.
  let receiveLink = $state<ReceiveOpening | null>(null);

  // ── The one case that never opens the ledger ─────────────────────────────
  //
  // **A Safari tab on iOS never accepts a meal. It shows the code and says
  // where to put it** (ADR-0082 §2). The link cannot reach the installed app's
  // Ledger, so the page does not try: it hands the code to a door that already
  // exists, and mounts `CodeHandover` instead of the app.
  //
  // **This is read here, above the `init` below, and that ordering is §8.**
  //
  // > The page must not ask the browser to durably keep a jar it is in the
  // > middle of telling you is not yours.
  //
  // Both of §6's tests are synchronous property reads, so the gate is
  // affordable, and skipping is safe because this page mounts no view that
  // subscribes to a ledger store — which is the invariant the synchronous
  // kick-off below exists to protect. **Nothing else moves.** The comment on
  // that line explains what its ordering buys, and #125's offline gate and
  // ADR-0069's recovery are both tuned to it.
  //
  // The read is total: `isIosSafariTab` swallows a signal that throws, and
  // `takeCodeHandover` swallows a `replaceState` the browser refused (ADR-0082
  // §9), so nothing here can reach ADR-0069's boot guard.
  const handover: ReceiveOpening | null =
    typeof window !== "undefined" && isIosSafariTab(window.navigator)
      ? takeCodeHandover({
          href: window.location.href,
          clean: (url) => window.history.replaceState(null, "", url),
        })
      : null;
  // Only the handover page reads this, and `handover` is non-null only when
  // there was a `window` to read it from — so the empty string is unreachable
  // rather than a fallback anything renders.
  const origin = handover === null ? "" : window.location.origin;

  // ── DB init ──────────────────────────────────────────────────────────────
  let dbReady = $state(false);
  let dbError = $state("");

  if (typeof window !== "undefined") {
    (window as any).dbClient = dbClient;
  }

  // Kick off worker creation synchronously, before any child view subscribes to
  // a ledger store. init() assigns dbClient.worker and posts its `init` message
  // before its first await, so store queries that fire during the initial render
  // are queued behind that init message (the worker processes messages in order)
  // instead of racing an unset worker and rejecting with "not initialized".
  const initPromise = handover ? null : dbClient.init("/inventoria.db");

  onMount(async () => {
    // A page that is handing the code over opens nothing and asks for nothing
    // (ADR-0082 §8): no database, no persistence request, no corpus fetch and
    // no second reading of a URL it has already taken the code off. Every
    // errand below is an errand on behalf of a jar this page is telling you is
    // not yours.
    if (handover) return;
    // Every entry point's errands, in one list so a second one cannot miss one
    // (#301). Here rather than at module scope so they run on a real load of the
    // app, and after the `handover` return above for the same reason.
    runStartupErrands();
    // Before the ledger, not after it. ADR-0073 §10 measured the cold-boot
    // window out of existence on the strength of SQLite being entirely OFF the
    // mount path: waiting in the room needs a WebSocket and `crypto.subtle`,
    // not OPFS, so a meal can arrive and be shown while the database is still
    // opening — and a database that never opens must not swallow the link.
    readReceiveLink();
    try {
      await initPromise;
      dbReady = true;

      // Handle Web Share Target redirection
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const sharedUrl = params.get("url") || params.get("text") || "";
        // A link somebody opened to be handed a meal outranks it: the share
        // target is a thing you sent yourself, and this is a person waiting.
        if (sharedUrl && !receiveLink) {
          activeTab = "items";
        }
      }
    } catch (e: any) {
      dbError = e.message ?? String(e);
    }
  });

  /**
   * Takes the code off the URL, once (ADR-0074 §8).
   *
   * **After mount and inside a `try`**, both forced rather than chosen.
   * ADR-0069's boot guard reads a throw during module evaluation as "this shell
   * cannot start" and wipes the service worker and every cache, so a malformed
   * fragment must not be able to reach it. The `try` is real work rather than
   * ceremony: `takeReceiveLink` deliberately lets a refused `replaceState` out,
   * because a code still sitting in the address bar is a code a reload could
   * spend a second time, and an ordinary boot is the safe reading of that.
   *
   * The read is what cleans the URL, so a reload is never a retry.
   */
  function readReceiveLink() {
    if (typeof window === "undefined") return;
    try {
      const link = takeReceiveLink({
        href: window.location.href,
        clean: (url) => window.history.replaceState(null, "", url),
      });
      if (link.kind === "none") return;
      receiveLink = link;
      // A meal is food, and the receiving surface is the food screen's.
      activeTab = "food";
    } catch {
      // An ordinary boot, which is the safe reading of a URL that could not be
      // cleaned. The sender is still standing there and mints another code.
    }
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  type Tab = "food" | "agenda" | "media" | "items" | "notes" | "settings";
  let activeTab = $state<Tab>("food");

  // Wandering to another Tab is leaving, and leaving is declining (ADR-0073
  // §10). Unmounting the food screen already destroys the payload and the
  // socket; without this the *code* would outlive them, and coming back would
  // re-open the surface and rejoin the room on a code that is single-use. The
  // §10 clause this discharges is that the runtime cannot tell a deliberate
  // exit from a wander, so they must not behave differently — and the scan
  // door's code, which lives inside the food screen, already dies here.
  $effect(() => {
    if (activeTab !== "food") receiveLink = null;
  });

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

{#if handover}
  <!-- ADR-0082 §2. Not a route and not a service-worker change (§11.3): the
       same fragment on the same `/`, answered by a different page. The app's
       own shell is deliberately absent — no Sidebar, no views — because §8's
       skipped `init` is only safe while nothing here subscribes to a ledger
       store. -->
  <CodeHandover opening={handover} {origin} />
{:else if demo === "bottomsheet"}
  {#await import("./lib/ui/BottomSheetDemo.svelte") then mod}
    {@const BottomSheetDemo = mod.default}
    <BottomSheetDemo />
  {/await}
{:else}
  <div class="app">
    <Sidebar bind:activeTab {dbReady} {dbError} />

    <main class="main">
      {#if activeTab === "food"}
        <FoodView
          {dbReady}
          {receiveLink}
          onReceiveClose={() => (receiveLink = null)}
        />
        <!-- Under the screen rather than in the header, because ADR-0078 §4
             keeps the Food tab otherwise unchanged: same screen, same
             components, no pointer. Turning the tab itself into one would
             reopen ADR-0077 §5, which kept `usda/search-index.json` in the
             root's precache precisely because food is the root's landing
             screen. -->
        <FacetExit facet={rations} />
      {/if}

      {#if activeTab === "media"}
        <MediaView {dbReady} />
      {/if}

      {#if activeTab === "items"}
        <ItemsView {dbReady} />
      {/if}

      {#if activeTab === "agenda"}
        <AgendaView {dbReady} />
      {/if}

      {#if activeTab === "notes"}
        {#await import("./lib/views/NotesView.svelte") then mod}
          {@const NotesView = mod.default}
          <NotesView {dbReady} />
        {/await}
      {/if}

      <!-- Settings — always rendered so Playwright can find the harness elements -->
      <div hidden={activeTab !== "settings"}>
        <SettingsView {dbReady} />
      </div>
    </main>

    <ReloadPrompt {facet} />
  </div>
{/if}

<style>
  .app {
    display: flex;
    flex-direction: column-reverse;
    height: 100svh;
    background: var(--bg-base);
  }

  .main {
    flex: 1;
    padding: var(--space-m) var(--space-s);
    width: 100%;
    overflow-y: auto;
    position: relative;
  }

  @media (min-width: 768px) {
    .app {
      flex-direction: row;
    }
    .main {
      padding: var(--space-l) var(--space-xl);
      max-width: 54rem;
    }
  }
</style>
