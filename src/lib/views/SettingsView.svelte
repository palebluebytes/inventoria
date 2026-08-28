<script lang="ts">
  import {
    setScraperProxyUrl,
    scraperProxyUrl,
  } from "../stores/device-settings";
  import { secretsStore, setSecret } from "../stores/secrets";
  import { get } from "svelte/store";
  import { createQueryStore } from "../stores/datoms.store";
  import { dbClient } from "../db/db.client";
  import { HLC_ORDER_DESC } from "../db/hlc";
  import {
    saveTestState,
    runTestStep,
    startTest,
    type TestState,
  } from "../db/db.test-harness";

  import Card from "../ui/Card.svelte";
  import LedgerExport from "./ledger/LedgerExport.svelte";
  import LedgerImport from "./ledger/LedgerImport.svelte";
  import StorageStatus from "./storage/StorageStatus.svelte";
  import LogSettingsSection from "./logs/LogSettingsSection.svelte";
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

  // Local state variables for forms. Both fields on this screen are per-device
  // `localStorage` now: the TMDB key as a secret (ADR-0034 §8) and the scraper
  // proxy as a device setting (ADR-0063). Neither waits on the ledger, so both
  // seed at construction rather than from an effect. The food-specific settings
  // (USDA/OFF credentials, contribution consent, nutrition targets) live on the
  // Food screen's own settings sheet, not here.
  let tmdbKey = $state(get(secretsStore).tmdb_api_key);
  let scraperProxy = $state(get(scraperProxyUrl));

  let showTmdb = $state(false);

  let isSaving = $state(false);
  let saveSuccess = $state(false);

  // Save handler
  async function handleSave(e: Event) {
    e.preventDefault();
    isSaving = true;
    saveSuccess = false;
    try {
      // The TMDB key is a secret — straight to localStorage, never a datom
      // (ADR-0034 §8), trimmed like any pasted credential.
      setSecret("tmdb_api_key", tmdbKey.trim());
      // The proxy is a device setting now (ADR-0063), so this screen writes no
      // datom at all: nothing here rides the ledger, and there is nothing left to
      // read through to avoid clobbering it.
      setScraperProxyUrl(scraperProxy.trim());
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
    `SELECT entity, attribute, value, time FROM datoms ORDER BY ${HLC_ORDER_DESC} LIMIT 100`
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

{#snippet revealToggle(revealed: boolean, toggle: () => void, label: string)}
  <button
    type="button"
    class="reveal-toggle"
    aria-label={label}
    aria-pressed={revealed}
    onclick={toggle}
  >
    {#if revealed}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        ><path
          d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        ></path><line x1="1" y1="1" x2="23" y2="23"></line></svg
      >
    {:else}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        ><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle
          cx="12"
          cy="12"
          r="3"
        ></circle></svg
      >
    {/if}
  </button>
{/snippet}

<header class="page-header">
  <h1>Settings</h1>
  <p>
    Manage secure API credentials, database ledger, local logs, and developer
    tests.
  </p>
</header>

<Card>
  <h2>API Credentials</h2>
  <form onsubmit={handleSave} class="settings-form mt-4">
    <div class="form-group">
      <label for="tmdb-api-key">TMDB API Key</label>
      <div class="input-wrapper">
        <input
          id="tmdb-api-key"
          type={showTmdb ? "text" : "password"}
          bind:value={tmdbKey}
          placeholder="TMDB API key..."
          class="retro-input has-reveal"
        />
        {@render revealToggle(
          showTmdb,
          () => (showTmdb = !showTmdb),
          showTmdb ? "Hide TMDB API key" : "Show TMDB API key"
        )}
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
    <div class="header-actions">
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

  <StorageStatus />

  <LedgerExport {dbReady} />

  <LedgerImport {dbReady} />
</Card>

<LogSettingsSection />

<Card class="mt-4">
  <h2>Developer Options</h2>
  <div class="dev-toggle mt-4">
    <label class="toggle-label">
      <input
        type="checkbox"
        id="dev-mode-toggle"
        checked={testState.enabled}
        onchange={toggleDevMode}
      />
      <span class="toggle-text">Enable OPFS Persistence Test</span>
    </label>
  </div>

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
    color: var(--ink);
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
    position: relative;
    display: flex;
  }
  .input-wrapper input {
    flex: 1;
    /* Allow the input to shrink below its intrinsic (monospace placeholder)
       width so it never overflows the card. */
    min-width: 0;
  }
  /* Leave room for the reveal toggle so masked text never runs under it. */
  .retro-input.has-reveal {
    padding-right: 2.75rem;
  }
  .reveal-toggle {
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
    width: 2.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--ink);
    cursor: pointer;
  }
  .reveal-toggle svg {
    width: 1.25rem;
    height: 1.25rem;
  }
  .reveal-toggle:hover {
    color: var(--text-secondary);
  }
  .reveal-toggle:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
  }
  /* Only the input flips to a black background on focus, so flip the icon to
     white just for that case. Scoped to the input (not :focus-within) so that
     focusing the toggle button itself — e.g. clicking it — keeps the icon dark
     and visible on the still-white input. */
  .input-wrapper:has(.retro-input:focus) .reveal-toggle {
    color: var(--paper);
  }
  .input-wrapper:has(.retro-input:focus) .reveal-toggle:hover {
    color: var(--text-muted);
  }
  .retro-input {
    border: var(--edge);
    padding: var(--space-s);
    font-size: var(--step-0);
    font-family: var(--font-mono);
    font-weight: 700;
    border-radius: var(--radius);
    background: var(--paper);
    box-shadow: inset 2px 2px 0 var(--border);
    transition: all 0.1s step-end;
  }
  .retro-input:focus {
    outline: none;
    background: var(--ink);
    color: var(--paper);
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
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-s);
  }
  /* Buttons live below the header on every viewport and wrap instead of
     overflowing the card on narrow screens. */
  .header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
  .table-wrap {
    overflow-x: auto;
    border: var(--edge);
    box-shadow: var(--shadow-2);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--step-n2);
    text-align: left;
    background: var(--paper);
  }
  th {
    padding: var(--space-xs);
    border-bottom: var(--edge);
    background: var(--ink);
    color: var(--paper);
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.75rem;
  }
  td {
    padding: var(--space-xs);
    border-bottom: var(--edge-thin);
    color: var(--ink);
  }
  tr:hover td {
    background: var(--bg-input);
  }
  .mono {
    font-family: var(--font-mono);
    font-weight: bold;
  }
  .attr {
    color: var(--text-primary);
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
    font-family: var(--font-mono);
    font-style: italic;
  }
  /* Container context so the label font can respond to the card's width
       (not the viewport), keeping the all-caps label on one line even in a
       narrow card. */
  .dev-toggle {
    container-type: inline-size;
  }
  .toggle-label {
    display: flex;
    align-items: center;
    /* em-based so the checkbox, gap and text scale together as one unit. */
    gap: 0.65em;
    /* Full size when the card is wide; shrink with the container so the whole
       row stays on one line on narrow screens. Everything on the row is
       em-proportional, so a single cqi ramp keeps it on one line — 5.3cqi was
       measured against this fixed label text (row ≈ 18.9em wide). */
    font-size: min(var(--step-n1), 5.3cqi);
    font-weight: 700;
    line-height: 1.4;
    color: var(--ink);
    cursor: pointer;
    user-select: none;
    text-transform: uppercase;
  }
  /* The caps sit ~0.08em above the line-box centre (Epilogue's ascent is taller
     than its cap height), so flex centring alone leaves them floating high.
     Fallback for engines without text-box-trim: nudge the text down optically. */
  .toggle-text {
    position: relative;
    top: 0.08em;
  }
  /* Preferred: trim the text box to the cap height so it hugs the glyphs. The
     box then *is* the caps, so flex centring aligns it exactly against the
     checkbox at every font size — no magic nudge, symmetric top and bottom. */
  @supports (text-box-trim: trim-both) {
    .toggle-text {
      text-box-trim: trim-both;
      text-box-edge: cap alphabetic;
      top: 0;
    }
  }
  /* Custom retro checkbox: a native checkbox forced to 1.25rem only enlarges its
     hit box, leaving the ~13px glyph top-left inside it, which reads as
     misaligned with the label. appearance:none lets the control fill its own box
     so it centers cleanly against the text, and matches the 2px black borders
     used elsewhere on this page. */
  .toggle-label input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    flex: 0 0 auto;
    display: grid;
    place-content: center;
    width: 1.35em;
    height: 1.35em;
    margin: 0;
    border: var(--edge);
    background: var(--paper);
    cursor: pointer;
  }
  .toggle-label input[type="checkbox"]::before {
    content: "";
    width: 0.62em;
    height: 0.62em;
    background: var(--ink);
    transform: scale(0);
  }
  .toggle-label input[type="checkbox"]:checked::before {
    transform: scale(1);
  }
  .toggle-label input[type="checkbox"]:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .border-top {
    border-top: var(--edge);
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
