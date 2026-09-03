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
          activeTab = "items";
        }
      }
    } catch (e: any) {
      dbError = e.message ?? String(e);
    }
  });

  // ── Navigation ───────────────────────────────────────────────────────────
  type Tab = "food" | "agenda" | "media" | "items" | "notes" | "settings";
  let activeTab = $state<Tab>("food");

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
  <div class="app">
    <Sidebar bind:activeTab {dbReady} {dbError} />

    <main class="main">
      {#if activeTab === "food"}
        <!-- No `receiveLink`: a meal arrives at Rations and nowhere else
             (ADR-0084 §5), so there is none for this shell to hand down. The
             Scan way in still reads a meal code, and FoodView owns that one
             end to end. -->
        <FoodView {dbReady} onReceiveClose={() => {}} />
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

      <!-- Settings — always rendered so Playwright can find the harness elements.
           That is also why it is handed the active-tab signal rather than
           reading a mount: it mounts once per page load and never again, so
           anything on it that must be fresh when it is looked at has to be told
           when it is being looked at (#290). -->
      <div hidden={activeTab !== "settings"}>
        <SettingsView {dbReady} shown={activeTab === "settings"} />
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
    /* `100svh` and no `var(--vv-h)`: the shell is not a consumer of the visible
       band (ADR-0089 §4). The nav is not something you use while typing, and
       making it chase the keyboard means it competes with every focused field
       on the page for space. Do not "fix" this. */
    background: var(--bg-base);
    /* Three of the four safe areas, because `viewport-fit=cover` moved the
       layout viewport's origin under the notch and this box starts at its top
       corner (ADR-0089 §2). The fourth is the nav's: it is the thing at the
       foot of the screen and reserves the home indicator itself, so reserving
       it here too would double the gap. */
    padding-top: env(safe-area-inset-top, 0px);
    padding-right: env(safe-area-inset-right, 0px);
    padding-left: env(safe-area-inset-left, 0px);
  }

  /* `.main` is not here either — it is one rule in `src/app.css`, shared with
     Rations' shell (ADR-0091 §2). What stays is the Sidebar's flip, which is
     this shell's own shape and nobody else's. */
  @media (min-width: 768px) {
    .app {
      flex-direction: row;
    }
  }
</style>
