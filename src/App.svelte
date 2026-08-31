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
  // Notes is the only view whose CRDT (loro) carries a multi-megabyte WASM
  // payload. Importing it dynamically keeps that payload out of the entry chunk,
  // so a failure anywhere under Notes degrades Notes alone instead of stopping
  // the ledger, food logging and habits from mounting at all (#125). The other
  // views stay static.
  import { warmUsdaCorpus } from "./lib/food/usda-corpus";
  import { clearRetiredSecrets } from "./lib/stores/secrets";
  import { ensurePersistentStorage } from "./lib/storage/persistent-storage";
  import { takeReceiveLink, type ReceiveOpening } from "./lib/p2p/receive-link";

  // Dev/e2e-only harnesses: `?demo=<name>` swaps the whole app for a throwaway
  // page. `bottomsheet` is a UI-primitive demo, so a Playwright spec can drive
  // the primitive in isolation without a real screen mounting it (issue #17);
  // `p2p198` is the peer-to-peer transport probe (#198), which needs the whole
  // viewport and a camera and has no business inside a tab. Both are gated on
  // `import.meta.env.DEV` and dynamically imported, so they are dead-code
  // eliminated from the production build — they never ship.
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
  const initPromise = dbClient.init("/inventoria.db");

  onMount(async () => {
    // Food is the app's first screen and its search reads the bundled corpus, so
    // warm both artifacts here rather than on the first keystroke: the Search
    // index straight away (~30 ms to fetch, parse and read into words), the
    // Nutrient store at idle (~100 ms to parse, and nothing reads it until a
    // food is staged) — ADR-0047 §2.
    warmUsdaCorpus();
    // Take the retired USDA API key off the device (ADR-0047 §1). Here rather
    // than at module scope so it runs on a real load of the app, and beside the
    // warm because both are the same kind of startup errand.
    clearRetiredSecrets();
    // Ask the browser to keep the ledger rather than leaving it evictable
    // (ADR-0065). Not awaited: the answer changes nothing about the load, and
    // the request is memoised, so the Settings readout reaches this same
    // decision instead of asking a second time.
    void ensurePersistentStorage();
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
</script>

<svelte:head>
  <title>Inventoria — Local-first Ledger</title>
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
{:else if demo === "p2p198"}
  {#await import("./lib/p2p-probe/P2pProbe.svelte") then mod}
    {@const P2pProbe = mod.default}
    <P2pProbe />
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

    <ReloadPrompt />
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
