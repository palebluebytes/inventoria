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

  // Dev/e2e-only UI-primitive harness: `?demo=bottomsheet` swaps the whole app
  // for a component demo, so a Playwright spec can drive the primitive in
  // isolation without a real screen mounting it (issue #17). Gated on
  // `import.meta.env.DEV` and dynamically imported, so the harness is dead-code
  // eliminated from the production build — it never ships.
  const demo =
    import.meta.env.DEV && typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("demo")
      : null;

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
{:else}
  <div class="app">
    <Sidebar bind:activeTab {dbReady} {dbError} />

    <main class="main">
      {#if activeTab === "food"}
        <FoodView {dbReady} />
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
