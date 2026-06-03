<script lang="ts">
  import { onMount } from "svelte";
  import { dbClient } from "./lib/db/db.client";
  import Sidebar from "./lib/layout/Sidebar.svelte";
  import FoodView from "./lib/views/FoodView.svelte";
  import MediaView from "./lib/views/MediaView.svelte";
  import HabitsView from "./lib/views/HabitsView.svelte";
  import SettingsView from "./lib/views/SettingsView.svelte";
  import ItemsView from "./lib/views/ItemsView.svelte";
  import ReloadPrompt from "./lib/ui/ReloadPrompt.svelte";

  // ── DB init ──────────────────────────────────────────────────────────────
  let dbReady = $state(false);
  let dbError = $state("");

  onMount(async () => {
    if (typeof window !== "undefined") {
      (window as any).dbClient = dbClient;
    }
    try {
      await dbClient.init("/inventoria.db");
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
  type Tab = "food" | "habits" | "media" | "items" | "settings";
  let activeTab = $state<Tab>("food");
</script>

<svelte:head>
  <title>Inventoria — Local-first Ledger</title>
  <meta
    name="description"
    content="Track food twins and habits with an immutable append-only ledger powered by SQLite WASM and OPFS."
  />
</svelte:head>

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

    {#if activeTab === "habits"}
      <HabitsView {dbReady} />
    {/if}

    <!-- Settings — always rendered so Playwright can find the harness elements -->
    <div hidden={activeTab !== "settings"}>
      <SettingsView {dbReady} />
    </div>
  </main>

  <ReloadPrompt />
</div>

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
