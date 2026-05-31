<script lang="ts">
  import { onMount } from "svelte";
  import { dbClient } from "./lib/db/db.client";
  import Sidebar from "./lib/layout/Sidebar.svelte";
  import FoodView from "./lib/views/FoodView.svelte";
  import HabitsView from "./lib/views/HabitsView.svelte";
  import LedgerView from "./lib/views/LedgerView.svelte";
  import DevView from "./lib/views/DevView.svelte";

  // ── DB init ──────────────────────────────────────────────────────────────
  let dbReady = $state(false);
  let dbError = $state("");

  onMount(async () => {
    try {
      await dbClient.init("/inventoria.db");
      dbReady = true;
    } catch (e: any) {
      dbError = e.message ?? String(e);
    }
  });

  // ── Navigation ───────────────────────────────────────────────────────────
  type Tab = "food" | "habits" | "ledger" | "dev";
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

    {#if activeTab === "habits"}
      <HabitsView {dbReady} />
    {/if}

    {#if activeTab === "ledger"}
      <LedgerView />
    {/if}

    <!-- Dev — always rendered so Playwright can find the harness elements -->
    <div hidden={activeTab !== "dev"}>
      <DevView {dbReady} />
    </div>
  </main>
</div>

<style>
  .app {
    display: flex;
    min-height: 100svh;
    background: var(--bg-base);
  }

  .main {
    flex: 1;
    padding: var(--space-l) var(--space-xl);
    max-width: 54rem;
    overflow-y: auto;
    position: relative;
  }
</style>
