<script lang="ts">
  import { settingsStore, saveSettings } from "../stores/settings.store";
  import { createQueryStore } from "../stores/datoms.store";
  import { dbClient } from "../db/db.client";
  import {
    saveTestState,
    runTestStep,
    startTest,
    type TestState,
  } from "../db/db.test-harness";

  import Card from "../ui/Card.svelte";
  import Button from "../ui/Button.svelte";
  import Alert from "../ui/Alert.svelte";
  import Badge from "../ui/Badge.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

  async function wipeDatabase() {
    if (
      confirm(
        "Are you sure you want to completely wipe the database? This cannot be undone."
      )
    ) {
      try {
        await dbClient.clear();
        alert("Database wiped successfully!");
      } catch (err) {
        console.error(err);
        alert("Failed to wipe database");
      }
    }
  }

  // Local state variables for forms
  let usdaKey = $state("");
  let tmdbKey = $state("");
  let scraperProxy = $state("");

  let showUsda = $state(false);
  let showTmdb = $state(false);

  let isSaving = $state(false);
  let saveSuccess = $state(false);

  // Initialize form state once settings store loads
  let initialized = $state(false);
  $effect(() => {
    if (!initialized && $settingsStore) {
      usdaKey = $settingsStore.usda_api_key;
      tmdbKey = $settingsStore.tmdb_api_key;
      scraperProxy = $settingsStore.scraper_proxy_url;
      initialized = true;
    }
  });

  // Save handler
  async function handleSave(e: Event) {
    e.preventDefault();
    isSaving = true;
    saveSuccess = false;
    try {
      await saveSettings({
        usda_api_key: usdaKey.trim(),
        tmdb_api_key: tmdbKey.trim(),
        scraper_proxy_url: scraperProxy.trim(),
      });
      saveSuccess = true;
      setTimeout(() => {
        saveSuccess = false;
      }, 3000);
    } catch (err) {
      console.error("Failed to save settings", err);
    } finally {
      isSaving = false;
    }
  }

  // Raw ledger view toggling
  let showLedger = $state(false);
  const ledgerStore = createQueryStore<{
    entity: string;
    attribute: string;
    value: string;
    time: number;
  }>(
    "SELECT entity, attribute, value, time FROM datoms ORDER BY time DESC LIMIT 100"
  );

  // OPFS persistence test harness state
  let testState = $state<TestState>({
    stage: "none",
    enabled: false,
    entityId: "",
    value: "",
    time: 0,
    result: "idle",
    error: "",
  });

  $effect(() => {
    if (dbReady) {
      runTestStep().then((state) => {
        testState = state;
      });
    }
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

<header class="page-header">
  <h1>Settings</h1>
  <p>Manage secure API credentials, database ledger, and developer tests.</p>
</header>

<Card>
  <h2>API Credentials</h2>
  <form onsubmit={handleSave} class="settings-form mt-4">
    <div class="form-group">
      <label for="usda-api-key">USDA FoodData Central API Key</label>
      <div class="input-wrapper">
        <input
          id="usda-api-key"
          type={showUsda ? "text" : "password"}
          bind:value={usdaKey}
          placeholder="USDA FDC API key..."
          class="retro-input"
        />
        <Button
          type="button"
          variant="secondary"
          onclick={() => (showUsda = !showUsda)}
        >
          {showUsda ? "Hide" : "Show"}
        </Button>
      </div>
      <span class="help-text"
        >Used for searching ingredients in recipes and food logging.</span
      >
    </div>

    <div class="form-group">
      <label for="tmdb-api-key">TMDB API Key</label>
      <div class="input-wrapper">
        <input
          id="tmdb-api-key"
          type={showTmdb ? "text" : "password"}
          bind:value={tmdbKey}
          placeholder="TMDB API key..."
          class="retro-input"
        />
        <Button
          type="button"
          variant="secondary"
          onclick={() => (showTmdb = !showTmdb)}
        >
          {showTmdb ? "Hide" : "Show"}
        </Button>
      </div>
      <span class="help-text"
        >Used for importing movie and TV digital twins.</span
      >
    </div>

    <div class="form-group">
      <label for="scraper-proxy-url">Scraper Proxy URL</label>
      <input
        id="scraper-proxy-url"
        type="text"
        bind:value={scraperProxy}
        placeholder="https://your-cf-worker.workers.dev/?url="
        class="retro-input full-width"
      />
      <span class="help-text"
        >Your custom Cloudflare CORS scraping proxy. If empty, scraping is
        disabled.</span
      >
    </div>

    <div class="actions-row mt-4">
      <Button type="submit" loading={isSaving}>Save Settings</Button>
      {#if saveSuccess}
        <Badge variant="success" class="saved-badge">SETTINGS SAVED</Badge>
      {/if}
    </div>
  </form>
</Card>

<Card class="mt-4">
  <div class="card-header">
    <h2>Database Ledger</h2>
    <div style="display: flex; gap: var(--space-xs);">
      <Button
        variant="secondary"
        id="toggle-ledger-btn"
        onclick={() => (showLedger = !showLedger)}
      >
        {showLedger ? "Hide Ledger" : "View Raw Ledger"}
      </Button>
      <Button
        variant="danger"
        id="wipe-db-btn"
        onclick={wipeDatabase}
        disabled={!dbReady}
      >
        Wipe Database
      </Button>
    </div>
  </div>

  {#if showLedger}
    <div class="table-wrap mt-4">
      {#if $ledgerStore.length === 0}
        <p class="empty">The ledger is empty.</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Attribute</th>
              <th>Value</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {#each $ledgerStore as row}
              <tr>
                <td class="mono small">{row.entity}</td>
                <td class="attr">{row.attribute}</td>
                <td class="small">{row.value}</td>
                <td class="muted small"
                  >{new Date(row.time).toLocaleString()}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
</Card>

<Card class="mt-4">
  <h2>Developer Options</h2>
  <label class="toggle-label mt-4">
    <input
      type="checkbox"
      id="dev-mode-toggle"
      checked={testState.enabled}
      onchange={toggleDevMode}
    />
    Enable OPFS Persistence Test
  </label>

  <div hidden={!testState.enabled} class="mt-4 border-top">
    <h3 class="mt-4">OPFS Survival Test</h3>
    <div class="actions mt-2">
      <Button
        id="run-test-btn"
        onclick={handleStartTest}
        disabled={!dbReady || testState.result === "running"}
      >
        Run Test
      </Button>
      <Button
        id="reset-test-btn"
        variant="secondary"
        onclick={handleResetTest}
        disabled={!dbReady}
      >
        Reset
      </Button>
    </div>

    <div class="result-display mt-4">
      <strong>Result:</strong>
      <Badge
        id="test-result"
        variant={testState.result === "passed"
          ? "success"
          : testState.result === "failed"
            ? "error"
            : testState.result === "running"
              ? "warning"
              : "default"}
        class="ml-2"
      >
        {testState.result.toUpperCase()}
      </Badge>
    </div>

    {#if testState.error}
      <Alert variant="error" class="mt-4">{testState.error}</Alert>
    {/if}
  </div>
</Card>

<style>
  .page-header {
    margin-bottom: var(--space-m);
    animation: fadeIn 0.4s ease-out;
  }
  h1 {
    font-size: var(--step-2);
    font-weight: 900;
    color: var(--text-primary);
    margin-bottom: var(--space-3xs);
    letter-spacing: -0.02em;
    text-transform: uppercase;
  }
  h2 {
    font-size: var(--step-1);
    font-weight: 800;
    color: #000;
    text-transform: uppercase;
    margin: 0;
  }
  h3 {
    font-size: var(--step-0);
    font-weight: 700;
    text-transform: uppercase;
    margin: 0;
  }
  p {
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }
  .settings-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }
  .form-group label {
    font-weight: 700;
    font-size: var(--step-n1);
    text-transform: uppercase;
  }
  .input-wrapper {
    display: flex;
    gap: var(--space-xs);
  }
  .input-wrapper input {
    flex: 1;
  }
  .retro-input {
    border: 2px solid #000;
    padding: var(--space-s);
    font-size: var(--step-0);
    font-family: monospace;
    font-weight: 700;
    border-radius: 0;
    background: #fff;
    box-shadow: inset 2px 2px 0 #e4e4e7;
    transition: all 0.1s step-end;
  }
  .retro-input:focus {
    outline: none;
    background: #000;
    color: #fff;
    box-shadow: none;
  }
  .full-width {
    width: 100%;
  }
  .help-text {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    font-style: italic;
  }
  .actions-row {
    display: flex;
    align-items: center;
    gap: var(--space-m);
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .table-wrap {
    overflow-x: auto;
    border: 2px solid #000;
    box-shadow: 4px 4px 0 #000;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--step-n2);
    text-align: left;
    background: #fff;
  }
  th {
    padding: var(--space-xs);
    border-bottom: 2px solid #000;
    background: #000;
    color: #fff;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.75rem;
  }
  td {
    padding: var(--space-xs);
    border-bottom: 1px solid #000;
    color: #000;
  }
  tr:hover td {
    background: #f4f4f5;
  }
  .mono {
    font-family: monospace;
    font-weight: bold;
  }
  .attr {
    color: #2563eb;
    font-weight: 700;
  }
  .small {
    font-size: 0.85em;
  }
  .muted {
    color: var(--text-secondary);
  }
  .empty {
    color: var(--text-secondary);
    text-align: center;
    padding: var(--space-xl) 0;
    font-family: monospace;
    font-style: italic;
  }
  .toggle-label {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--step-n1);
    font-weight: 700;
    color: #000;
    cursor: pointer;
    user-select: none;
    text-transform: uppercase;
  }
  .toggle-label input[type="checkbox"] {
    width: 1.25rem;
    height: 1.25rem;
    accent-color: #000;
    cursor: pointer;
  }
  .border-top {
    border-top: 2px solid #000;
  }
  .actions {
    display: flex;
    gap: var(--space-xs);
  }
  .result-display {
    display: flex;
    align-items: center;
  }
  .mt-2 {
    margin-top: var(--space-xs);
  }
  .mt-4 {
    margin-top: var(--space-m);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes pulse {
    from {
      transform: scale(1);
    }
    to {
      transform: scale(1.05);
    }
  }
</style>
