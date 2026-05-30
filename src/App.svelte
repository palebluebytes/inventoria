<script lang="ts">
  import { onMount } from "svelte";
  import {
    getTestState,
    saveTestState,
    runTestStep,
    startTest,
    type TestState,
  } from "./lib/db/db.test-harness";

  // Svelte 5 state rune for reactive test state
  let testState = $state<TestState>({
    stage: "none",
    enabled: false,
    entityId: "",
    value: "",
    time: 0,
    result: "idle",
    error: "",
  });

  onMount(async () => {
    testState = await runTestStep();
  });

  async function handleStart() {
    testState.enabled = true;
    saveTestState(testState);
    await startTest();
  }

  function toggleDevMode(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    testState.enabled = checked;
    if (!checked) {
      testState.stage = "none";
      testState.result = "idle";
      testState.error = "";
    }
    saveTestState(testState);
  }

  function handleReset() {
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

<main class="container">
  <h1>Inventoria Storage Engine</h1>
  <p class="subtitle">Append-only ledger on SQLite WASM & OPFS</p>

  <div class="card toggle-card">
    <label class="toggle-label">
      <input
        type="checkbox"
        id="dev-mode-toggle"
        checked={testState.enabled}
        onchange={toggleDevMode}
      />
      Enable Developer / Testing Mode
    </label>
  </div>

  {#if testState.enabled}
    <div class="card test-card">
      <h2>OPFS Persistence Test</h2>
      <p>
        Asserts that database handles and ledger entries survive browser
        refreshes.
      </p>

      <div class="actions">
        <button
          id="run-test-btn"
          onclick={handleStart}
          disabled={testState.result === "running"}
        >
          Run OPFS Survival Test
        </button>
        <button id="reset-test-btn" class="secondary" onclick={handleReset}>
          Reset Test State
        </button>
      </div>

      <div class="status-box">
        <h3>Test Metrics</h3>
        <p>
          <strong>Stage:</strong> <span id="test-stage">{testState.stage}</span>
        </p>
        {#if testState.entityId}
          <p>
            <strong>Target Entity:</strong>
            <code id="test-entity">{testState.entityId}</code>
          </p>
          <p>
            <strong>Written Value:</strong>
            <code id="test-value">{testState.value}</code>
          </p>
        {/if}

        <p>
          <strong>Result:</strong>
          <span id="test-result" class="badge status-{testState.result}">
            {testState.result.toUpperCase()}
          </span>
        </p>

        {#if testState.error}
          <div id="test-error" class="error-msg">
            <strong>Error:</strong>
            {testState.error}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</main>

<style>
  :global(body) {
    background-color: #0f172a;
    color: #f1f5f9;
    font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      Oxygen,
      Ubuntu,
      Cantarell,
      sans-serif;
    margin: 0;
    padding: 2rem;
    display: flex;
    justify-content: center;
  }

  .container {
    max-width: 500px;
    width: 100%;
  }

  h1 {
    font-size: 1.8rem;
    margin-bottom: 0.2rem;
    color: #38bdf8;
  }

  .subtitle {
    color: #94a3b8;
    margin-top: 0;
    margin-bottom: 2rem;
    font-size: 0.95rem;
  }

  .card {
    background-color: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1rem;
  }

  .toggle-card {
    display: flex;
    align-items: center;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    font-weight: 500;
  }

  .toggle-label input {
    width: 1.2rem;
    height: 1.2rem;
    cursor: pointer;
  }

  h2 {
    font-size: 1.3rem;
    margin-top: 0;
    margin-bottom: 0.5rem;
    color: #e2e8f0;
  }

  p {
    color: #94a3b8;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.5rem;
    margin-bottom: 1.5rem;
  }

  button {
    background-color: #0284c7;
    color: #ffffff;
    border: none;
    padding: 0.6rem 1.2rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background-color 0.15s;
  }

  button:hover:not(:disabled) {
    background-color: #0369a1;
  }

  button:disabled {
    background-color: #475569;
    cursor: not-allowed;
  }

  button.secondary {
    background-color: #334155;
    color: #cbd5e1;
    border: 1px solid #475569;
  }

  button.secondary:hover {
    background-color: #475569;
  }

  .status-box {
    background-color: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 1rem;
    font-size: 0.9rem;
  }

  .status-box h3 {
    margin-top: 0;
    font-size: 1rem;
    margin-bottom: 0.75rem;
    color: #94a3b8;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 0.5rem;
  }

  .status-box p {
    margin: 0.5rem 0;
    color: #cbd5e1;
  }

  code {
    background-color: #1e293b;
    padding: 0.1rem 0.3rem;
    border-radius: 4px;
    font-family: monospace;
    color: #f472b6;
  }

  .badge {
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-weight: bold;
    font-size: 0.8rem;
  }

  .status-idle {
    background-color: #334155;
    color: #cbd5e1;
  }

  .status-running {
    background-color: #ca8a04;
    color: #fef08a;
  }

  .status-passed {
    background-color: #16a34a;
    color: #bbf7d0;
  }

  .status-failed {
    background-color: #dc2626;
    color: #fecaca;
  }

  .error-msg {
    margin-top: 1rem;
    background-color: #450a0a;
    border: 1px solid #7f1d1d;
    padding: 0.75rem;
    border-radius: 4px;
    color: #fca5a5;
    font-size: 0.85rem;
    word-break: break-all;
  }
</style>
