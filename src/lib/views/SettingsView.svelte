<script lang="ts">
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
  import Checkbox from "../ui/Checkbox.svelte";

  let {
    dbReady,
    shown,
  }: {
    dbReady: boolean;
    /**
     * Whether this screen is the one being looked at. This screen is rendered
     * under every tab and merely hidden, so it mounts once per page load and
     * nothing here can use a mount to mean "opened" — see `StorageStatus`,
     * which is why the prop exists (#290).
     */
    shown: boolean;
  } = $props();

  /**
   * The storage readout below, so the wipe can tell it to take a fresh reading
   * (#290). It normally re-reads when this screen becomes the one being looked
   * at, and a wipe is the case that defeats: the button is on that same card,
   * so the screen is already being looked at and nothing about it changes.
   */
  let storage = $state<ReturnType<typeof StorageStatus> | undefined>(undefined);

  async function wipeDatabase() {
    if (
      !confirm(
        "Are you sure you want to completely wipe the database? This cannot be undone."
      )
    ) {
      return;
    }
    try {
      await dbClient.clear();
    } catch (err) {
      console.error(err);
      alert("Failed to wipe database");
      return;
    }
    // The delete has committed; the reclaim is attempted after it and is
    // best-effort (ADR-0079 §4). `VACUUM` cannot run inside a transaction, so
    // "both or neither" is not expressible — a vacuum that fails leaves the
    // rows gone and the storage figure above unmoved, and the message has to be
    // able to say exactly that. The emptiness is unconditional because it is
    // true either way; only the space is conditional, because only the space
    // can fail.
    let reclaimed = true;
    try {
      await dbClient.vacuum();
    } catch (err) {
      console.error(err);
      reclaimed = false;
    }
    // Asked before the alert rather than after it: `alert` blocks, so either
    // way the new figure lands when it is dismissed, and asking first leaves
    // the browser the length of the dialogue to answer in. Quota accounting is
    // not promised to keep step with the file behind it, so that is worth
    // having.
    storage?.read();
    alert(
      reclaimed
        ? "The ledger is empty, and the space it was using has been reclaimed."
        : "The ledger is empty. The space it was using could not be reclaimed, so the storage figure may not have changed."
    );
  }

  // **This screen carries no credentials and no form** (ADR-0080 §2, §4). A
  // setting lives beside the thing it configures: the TMDB key went to the
  // Media screen's own gear, the food credentials and targets have been on
  // Rations settings since before Facets existed, and the scraper proxy was
  // deleted rather than moved — `device-settings.ts` has carried a working
  // default since ADR-0070, so the field overrode a default that already works.
  // With both gone the API Credentials card had nothing left in it and
  // dissolved. What is left here is what fails ADR-0080 §1's two clauses and is
  // therefore the root's: inspection, the jar-wide ledger controls, and the
  // developer tests.

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

  function toggleDevMode(checked: boolean) {
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
  <p>Manage the database ledger, local logs, and developer tests.</p>
</header>

<Card>
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

  <StorageStatus bind:this={storage} {shown} />

  <LedgerExport {dbReady} />

  <LedgerImport {dbReady} />
</Card>

<!-- The jar-wide card: the root holds all six Tracked Domains, so it lists every
     channel and its Review and Export is jar-wide (ADR-0080 §2). Its switch is
     the root's own door and no longer the only one food's channel has. -->
<LogSettingsSection facetId="root" />

<Card class="mt-4">
  <h2>Developer Options</h2>
  <div class="dev-toggle mt-4">
    <Checkbox
      id="dev-mode-toggle"
      class="dev-toggle-row"
      label="Enable OPFS Persistence Test"
      checked={testState.enabled}
      onCheckedChange={toggleDevMode}
    />
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
  /* The row is the shared Checkbox (ADR-0068); only this label's measured font
     ramp stays here, reached via :global as the class rides the primitive's
     label. Full size when the card is wide, shrinking with the container so the
     whole row stays on one line on narrow screens. Everything on the row is
     em-proportional, so a single cqi ramp keeps it on one line — 5.3cqi was
     measured against this fixed label text (row ≈ 18.9em wide). */
  .dev-toggle :global(.dev-toggle-row) {
    font-size: min(var(--step-n1), 5.3cqi);
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
