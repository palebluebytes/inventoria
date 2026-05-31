<script lang="ts">
  import { onMount } from "svelte";
  import { dbClient } from "./lib/db/db.client";
  import { createQueryStore } from "./lib/stores/datoms.store";
  import {
    lookupBarcode,
    ProductNotFoundError,
  } from "./lib/food/open-food-facts";
  import { searchFdc } from "./lib/food/usda-fdc";
  import { ingestEntity } from "./lib/ingestion/ingest";
  import { logExecution, computeStreak } from "./lib/habits/habits";
  import {
    getTestState,
    saveTestState,
    runTestStep,
    startTest,
    type TestState,
  } from "./lib/db/db.test-harness";

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
    testState = await runTestStep();
  });

  // ── Navigation ───────────────────────────────────────────────────────────
  type Tab = "food" | "habits" | "ledger" | "dev";
  let activeTab = $state<Tab>("food");

  // ── Food tab ─────────────────────────────────────────────────────────────
  let barcodeInput = $state("");
  let fdcQuery = $state("");
  let foodStatus = $state<"idle" | "loading" | "error">("idle");
  let foodError = $state("");
  let foodResult = $state<{
    name: string;
    calories: string;
    protein: string;
  } | null>(null);

  const foodTwinsStore = createQueryStore<{
    entity: string;
    attribute: string;
    value: string;
  }>(
    "SELECT entity, attribute, value FROM datoms WHERE attribute = 'food/name' ORDER BY time DESC LIMIT 20"
  );

  async function lookupOFF() {
    if (!barcodeInput.trim()) return;
    foodStatus = "loading";
    foodError = "";
    foodResult = null;
    try {
      const payload = await lookupBarcode(barcodeInput.trim());
      const datoms = ingestEntity(payload);
      await dbClient.append(datoms);
      foodResult = {
        name: payload.attributes["food/name"],
        calories: payload.attributes["food/calories"],
        protein: payload.attributes["food/protein"],
      };
      barcodeInput = "";
      foodStatus = "idle";
    } catch (e: any) {
      foodStatus = "error";
      foodError =
        e instanceof ProductNotFoundError
          ? "Product not found for that barcode."
          : (e.message ?? String(e));
    }
  }

  async function lookupUSDA() {
    if (!fdcQuery.trim()) return;
    foodStatus = "loading";
    foodError = "";
    foodResult = null;
    try {
      const payloads = await searchFdc(fdcQuery.trim());
      if (!payloads.length) throw new Error("No results found.");
      const payload = payloads[0];
      const datoms = ingestEntity(payload);
      await dbClient.append(datoms);
      foodResult = {
        name: payload.attributes["food/name"],
        calories: payload.attributes["food/calories"],
        protein: payload.attributes["food/protein"],
      };
      fdcQuery = "";
      foodStatus = "idle";
    } catch (e: any) {
      foodStatus = "error";
      foodError = e.message ?? String(e);
    }
  }

  // ── Habits tab ───────────────────────────────────────────────────────────
  let habitName = $state("");
  let habitInstrument = $state("");
  let habitStatus = $state<"idle" | "loading" | "error">("idle");
  let habitError = $state("");

  const habitsStore = createQueryStore<{ entity: string; value: string }>(
    "SELECT entity, value FROM datoms WHERE attribute = 'habit/name' ORDER BY time DESC LIMIT 20"
  );

  const execsStore = createQueryStore<{
    entity: string;
    value: string;
    time: number;
  }>(
    "SELECT entity, value, time FROM datoms WHERE attribute = 'event/type' AND value = '\"ExerciseAction\"' ORDER BY time DESC LIMIT 50"
  );

  let streak = $derived(
    computeStreak($execsStore.map((r) => ({ time: r.time })))
  );

  async function addHabit() {
    if (!habitName.trim()) return;
    habitStatus = "loading";
    habitError = "";
    try {
      const payload = {
        entity: `habit:${habitName.trim().toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`,
        attributes: {
          "habit/name": habitName.trim(),
          ...(habitInstrument.trim()
            ? { "habit/instrument": habitInstrument.trim() }
            : {}),
        },
      };
      await dbClient.append(ingestEntity(payload));
      habitName = "";
      habitInstrument = "";
      habitStatus = "idle";
    } catch (e: any) {
      habitStatus = "error";
      habitError = e.message ?? String(e);
    }
  }

  async function logHabitExecution(habitId: string) {
    try {
      await dbClient.append(logExecution(habitId, ""));
    } catch (e: any) {
      habitError = e.message ?? String(e);
    }
  }

  // ── Ledger tab ───────────────────────────────────────────────────────────
  const ledgerStore = createQueryStore<{
    entity: string;
    attribute: string;
    value: string;
    time: number;
  }>(
    "SELECT entity, attribute, value, time FROM datoms ORDER BY time DESC LIMIT 100"
  );

  function formatTime(ms: number): string {
    return new Date(ms).toLocaleString();
  }

  // ── Dev mode ─────────────────────────────────────────────────────────────
  let testState = $state<TestState>({
    stage: "none",
    enabled: false,
    entityId: "",
    value: "",
    time: 0,
    result: "idle",
    error: "",
  });

  function toggleDevMode(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    testState.enabled = checked;
    if (!checked) {
      testState.stage = "none";
      testState.result = "idle";
      testState.error = "";
    }
    saveTestState(testState);
  }

  async function handleStartTest() {
    testState.enabled = true;
    saveTestState(testState);
    await startTest();
  }

  function handleResetTest() {
    localStorage.removeItem("inventoria_test_state");
    testState = {
      stage: "none",
      enabled: testState.enabled,
      entityId: "",
      value: "",
      time: 0,
      result: "idle",
      error: "",
    };
    saveTestState(testState);
  }
</script>

<svelte:head>
  <title>Inventoria — Local-first Ledger</title>
  <meta
    name="description"
    content="Track food twins and habits with an immutable append-only ledger powered by SQLite WASM and OPFS."
  />
</svelte:head>

<div class="app">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="logo">
      <span class="logo-icon">⬡</span>
      <span class="logo-text">Inventoria</span>
    </div>
    <nav>
      {#each [["food", "🥦", "Food Twins"], ["habits", "🔥", "Habits"], ["ledger", "📒", "Ledger"], ["dev", "🧪", "Dev"]] as [id, icon, label]}
        <button
          class="nav-item {activeTab === id ? 'active' : ''}"
          onclick={() => (activeTab = id as Tab)}>{icon} {label}</button
        >
      {/each}
    </nav>
    <div class="sidebar-footer">
      <span class="db-badge {dbReady ? 'ok' : dbError ? 'err' : 'wait'}">
        {dbReady ? "● DB Ready" : dbError ? "✕ DB Error" : "○ Connecting…"}
      </span>
    </div>
  </aside>

  <!-- Main -->
  <main class="main">
    <!-- Food Twins -->
    {#if activeTab === "food"}
      <header class="page-header">
        <h1>Food Twins</h1>
        <p>
          Look up food items by barcode (Open Food Facts) or name (USDA FDC) and
          save them to the ledger.
        </p>
      </header>

      <div class="lookup-grid">
        <!-- OFF barcode -->
        <div class="card">
          <h2>📷 Barcode Lookup</h2>
          <p class="card-sub">Open Food Facts — free, no key required</p>
          <div class="input-row">
            <input
              id="barcode-input"
              type="text"
              placeholder="e.g. 3017620422003"
              bind:value={barcodeInput}
              onkeydown={(e) => e.key === "Enter" && lookupOFF()}
            />
            <button
              id="barcode-btn"
              onclick={lookupOFF}
              disabled={foodStatus === "loading" || !dbReady}
            >
              {foodStatus === "loading" ? "…" : "Lookup"}
            </button>
          </div>
        </div>

        <!-- USDA FDC -->
        <div class="card">
          <h2>🔬 USDA FDC Search</h2>
          <p class="card-sub">FoodData Central — detailed nutrient data</p>
          <div class="input-row">
            <input
              id="fdc-input"
              type="text"
              placeholder="e.g. banana, oats…"
              bind:value={fdcQuery}
              onkeydown={(e) => e.key === "Enter" && lookupUSDA()}
            />
            <button
              id="fdc-btn"
              onclick={lookupUSDA}
              disabled={foodStatus === "loading" || !dbReady}
            >
              {foodStatus === "loading" ? "…" : "Search"}
            </button>
          </div>
        </div>
      </div>

      {#if foodStatus === "error"}
        <div class="alert error" id="food-error">{foodError}</div>
      {/if}

      {#if foodResult}
        <div class="alert success" id="food-result">
          ✓ Added <strong>{foodResult.name}</strong> — {foodResult.calories},
          protein: {foodResult.protein}
        </div>
      {/if}

      <section class="card mt">
        <h2>
          Saved Food Twins <span class="count">{$foodTwinsStore.length}</span>
        </h2>
        {#if $foodTwinsStore.length === 0}
          <p class="empty">
            No food twins yet. Look up a barcode or search USDA above.
          </p>
        {:else}
          <ul class="twin-list">
            {#each $foodTwinsStore as row}
              <li class="twin-item">
                <span class="twin-entity">{row.entity}</span>
                <span class="twin-name">{JSON.parse(row.value)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    <!-- Habits -->
    {#if activeTab === "habits"}
      <header class="page-header">
        <h1>Habits</h1>
        <p>
          Define Habit Blueprints and log Execution Events to track your streak.
        </p>
      </header>

      <div class="streak-banner">
        <span class="streak-num">{streak}</span>
        <span class="streak-label">day streak 🔥</span>
      </div>

      <div class="card mt">
        <h2>New Habit Blueprint</h2>
        <div class="form-group">
          <input
            id="habit-name-input"
            type="text"
            placeholder="Habit name (e.g. 1-Arm Swings)"
            bind:value={habitName}
          />
          <input
            id="habit-instrument-input"
            type="text"
            placeholder="Instrument (optional, e.g. twin:kettlebell_16kg)"
            bind:value={habitInstrument}
          />
          <button
            id="add-habit-btn"
            onclick={addHabit}
            disabled={habitStatus === "loading" || !dbReady}
          >
            {habitStatus === "loading" ? "Saving…" : "Add Habit"}
          </button>
        </div>
        {#if habitStatus === "error"}
          <div class="alert error">{habitError}</div>
        {/if}
      </div>

      <section class="card mt">
        <h2>
          Habit Blueprints <span class="count">{$habitsStore.length}</span>
        </h2>
        {#if $habitsStore.length === 0}
          <p class="empty">No habits yet. Add one above.</p>
        {:else}
          <ul class="twin-list">
            {#each $habitsStore as row}
              <li class="twin-item">
                <span class="twin-entity">{row.entity}</span>
                <span class="twin-name">{JSON.parse(row.value)}</span>
                <button
                  class="log-btn"
                  onclick={() => logHabitExecution(row.entity)}>Log ✓</button
                >
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="card mt">
        <h2>
          Recent Executions <span class="count">{$execsStore.length}</span>
        </h2>
        {#if $execsStore.length === 0}
          <p class="empty">No executions logged yet.</p>
        {:else}
          <ul class="twin-list">
            {#each $execsStore.slice(0, 10) as row}
              <li class="twin-item">
                <span class="twin-entity">{row.entity}</span>
                <span class="twin-name muted">{formatTime(row.time)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    <!-- Ledger -->
    {#if activeTab === "ledger"}
      <header class="page-header">
        <h1>Ledger</h1>
        <p>Complete append-only EAVT log — most recent first. Read-only.</p>
      </header>
      <section class="card">
        <h2>Datoms <span class="count">{$ledgerStore.length}</span></h2>
        {#if $ledgerStore.length === 0}
          <p class="empty">The ledger is empty.</p>
        {:else}
          <div class="table-wrap">
            <table>
              <thead
                ><tr
                  ><th>Entity</th><th>Attribute</th><th>Value</th><th>Time</th
                  ></tr
                ></thead
              >
              <tbody>
                {#each $ledgerStore as row}
                  <tr>
                    <td class="mono small">{row.entity}</td>
                    <td class="attr">{row.attribute}</td>
                    <td class="small">{row.value}</td>
                    <td class="muted small">{formatTime(row.time)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    {/if}

    <!-- Dev — always rendered so Playwright can find the harness elements -->
    <div hidden={activeTab !== "dev"}>
      <header class="page-header">
        <h1>Developer Mode</h1>
        <p>
          OPFS persistence survival test — verifies the ledger survives full
          page reloads.
        </p>
      </header>
      <div class="card">
        <label class="toggle-label">
          <input
            type="checkbox"
            id="dev-mode-toggle"
            checked={testState.enabled}
            onchange={toggleDevMode}
          />
          Enable OPFS Persistence Test
        </label>
      </div>
      <div class="card mt" hidden={!testState.enabled}>
        <h2>OPFS Survival Test</h2>
        <div class="actions">
          <button
            id="run-test-btn"
            onclick={handleStartTest}
            disabled={!dbReady || testState.result === "running"}
          >
            Run Test
          </button>
          <button
            id="reset-test-btn"
            class="secondary"
            onclick={handleResetTest}
            disabled={!dbReady}>Reset</button
          >
        </div>
        <p>
          <strong>Result:</strong>
          <span id="test-result" class="badge status-{testState.result}">
            {testState.result.toUpperCase()}
          </span>
        </p>
        {#if testState.error}
          <div class="alert error" id="test-error">{testState.error}</div>
        {/if}
      </div>
    </div>
  </main>
</div>

<style>
  .app {
    display: flex;
    min-height: 100svh;
  }

  /* ── Sidebar ──────────────────────────────────────────────────────────── */
  .sidebar {
    width: clamp(11rem, 10rem + 4.5455vw, 14rem);
    flex-shrink: 0;
    background: #0e1018;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: var(--space-m) 0;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 0 var(--space-s) var(--space-m);
  }
  .logo-icon {
    font-size: var(--step-1);
  }
  .logo-text {
    font-weight: 700;
    font-size: var(--step-n1);
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    padding: 0 var(--space-2xs);
    flex: 1;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-2xs) var(--space-xs);
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--step-n1);
    text-align: left;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .nav-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-primary);
  }
  .nav-item.active {
    background: rgba(139, 92, 246, 0.15);
    color: var(--accent-light);
    font-weight: 600;
  }
  .sidebar-footer {
    padding: var(--space-s) var(--space-s) 0;
  }
  .db-badge {
    font-size: var(--step-n2);
    font-weight: 500;
  }
  .db-badge.ok {
    color: var(--green);
  }
  .db-badge.err {
    color: var(--red);
  }
  .db-badge.wait {
    color: var(--amber);
  }

  /* ── Main ─────────────────────────────────────────────────────────────── */
  .main {
    flex: 1;
    padding: var(--space-l) var(--space-xl);
    max-width: 54rem;
    overflow-y: auto;
  }
  .page-header {
    margin-bottom: var(--space-m);
  }
  h1 {
    font-size: var(--step-2);
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--space-3xs);
  }
  h2 {
    font-size: var(--step-0);
    font-weight: 600;
    color: #c4c8e0;
    margin-bottom: var(--space-xs);
  }
  .page-header p,
  p {
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }
  .card-sub {
    font-size: var(--step-n2);
    color: var(--text-muted);
    margin: calc(var(--space-xs) * -0.5) 0 var(--space-xs);
  }
  .mt {
    margin-top: var(--space-s);
  }

  /* ── Card ─────────────────────────────────────────────────────────────── */
  .card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: var(--space-m) var(--space-l);
  }

  /* ── Lookup grid ──────────────────────────────────────────────────────── */
  .lookup-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-s);
    margin-bottom: var(--space-s);
  }
  @media (max-width: 600px) {
    .lookup-grid {
      grid-template-columns: 1fr;
    }
  }

  /* ── Inputs ───────────────────────────────────────────────────────────── */
  .input-row {
    display: flex;
    gap: var(--space-2xs);
  }
  input[type="text"] {
    flex: 1;
    background: var(--bg-input);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: var(--space-2xs) var(--space-xs);
    color: var(--text-primary);
    font-size: var(--step-n1);
    outline: none;
    transition: border-color 0.15s;
    font-family: inherit;
  }
  input[type="text"]:focus {
    border-color: var(--border-accent);
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  button {
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: var(--space-2xs) var(--space-s);
    font-size: var(--step-n1);
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
  }
  button:hover:not(:disabled) {
    background: #6d28d9;
  }
  button:disabled {
    background: #2d2f3d;
    color: var(--text-muted);
    cursor: not-allowed;
  }
  button.secondary {
    background: #1e2235;
    border: 1px solid var(--border);
    color: var(--text-secondary);
  }
  button.secondary:hover {
    background: #252840;
  }
  .log-btn {
    padding: var(--space-3xs) var(--space-xs);
    font-size: var(--step-n2);
    background: #065f46;
  }
  .log-btn:hover {
    background: #047857;
  }

  /* ── Alerts ───────────────────────────────────────────────────────────── */
  .alert {
    padding: var(--space-2xs) var(--space-xs);
    border-radius: 8px;
    font-size: var(--step-n1);
    margin-top: var(--space-xs);
  }
  .alert.error {
    background: var(--red-bg);
    color: var(--red);
    border: 1px solid rgba(248, 113, 113, 0.2);
  }
  .alert.success {
    background: var(--green-bg);
    color: var(--green);
    border: 1px solid rgba(52, 211, 153, 0.2);
  }

  /* ── Lists ────────────────────────────────────────────────────────────── */
  .twin-list {
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  .twin-item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-2xs) 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .twin-item:last-child {
    border-bottom: none;
  }
  .twin-entity {
    font-family: monospace;
    font-size: var(--step-n2);
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .twin-name {
    color: #c4c8e0;
    font-size: var(--step-n1);
    flex: 1;
  }
  .twin-name.muted {
    color: var(--text-muted);
  }
  .count {
    background: rgba(139, 92, 246, 0.15);
    color: var(--accent-light);
    font-size: var(--step-n2);
    padding: var(--space-3xs) var(--space-2xs);
    border-radius: 99px;
    margin-left: var(--space-2xs);
    font-weight: 500;
  }
  .empty {
    color: #3d4058;
    font-size: var(--step-n1);
    text-align: center;
    padding: var(--space-m) 0;
  }

  /* ── Streak ───────────────────────────────────────────────────────────── */
  .streak-banner {
    display: flex;
    align-items: baseline;
    gap: var(--space-xs);
    background: var(--amber-bg);
    border: 1px solid rgba(251, 191, 36, 0.2);
    border-radius: 12px;
    padding: var(--space-s) var(--space-l);
    margin-bottom: var(--space-s);
  }
  .streak-num {
    font-size: var(--step-4);
    font-weight: 800;
    color: var(--amber);
    line-height: 1;
  }
  .streak-label {
    font-size: var(--step-0);
    color: var(--text-secondary);
  }

  /* ── Ledger table ─────────────────────────────────────────────────────── */
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--step-n2);
  }
  th {
    text-align: left;
    color: var(--text-muted);
    font-weight: 500;
    padding: var(--space-3xs) var(--space-2xs);
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: var(--space-3xs) var(--space-2xs);
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    color: #c4c8e0;
    vertical-align: top;
  }
  .mono {
    font-family: monospace;
  }
  .attr {
    color: var(--accent-light);
  }
  .muted {
    color: var(--text-muted);
  }

  /* ── Dev mode ─────────────────────────────────────────────────────────── */
  .toggle-label {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    cursor: pointer;
    color: #c4c8e0;
    font-size: var(--step-n1);
  }
  .actions {
    display: flex;
    gap: var(--space-2xs);
    margin: var(--space-xs) 0;
  }
  .badge {
    padding: var(--space-3xs) var(--space-2xs);
    border-radius: 4px;
    font-size: var(--step-n2);
    font-weight: 700;
  }
  .status-idle {
    background: #1e2235;
    color: var(--text-secondary);
  }
  .status-running {
    background: #451a03;
    color: var(--amber);
  }
  .status-passed {
    background: #022c22;
    color: var(--green);
  }
  .status-failed {
    background: #450a0a;
    color: var(--red);
  }
</style>
