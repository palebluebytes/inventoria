<script lang="ts">
  import {
    getTestState,
    saveTestState,
    runTestStep,
    startTest,
    type TestState,
  } from "../db/db.test-harness";
  import { onMount } from "svelte";

  import Card from "../ui/Card.svelte";
  import Button from "../ui/Button.svelte";
  import Alert from "../ui/Alert.svelte";
  import Badge from "../ui/Badge.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

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
  <h1>Developer Mode</h1>
  <p>
    OPFS persistence survival test — verifies the ledger survives full page
    reloads.
  </p>
</header>

<Card>
  <label class="toggle-label">
    <input
      type="checkbox"
      id="dev-mode-toggle"
      checked={testState.enabled}
      onchange={toggleDevMode}
    />
    Enable OPFS Persistence Test
  </label>
</Card>

<div hidden={!testState.enabled}>
  <Card class="mt-4">
    <h2>OPFS Survival Test</h2>
    <div class="actions">
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
      <Alert variant="error">{testState.error}</Alert>
    {/if}
  </Card>
</div>

<style>
  .page-header {
    margin-bottom: var(--space-m);
    animation: fadeIn 0.4s ease-out;
  }
  h1 {
    font-size: var(--step-2);
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--space-3xs);
    letter-spacing: -0.02em;
  }
  h2 {
    font-size: var(--step-0);
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
  }
  p {
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }
  .toggle-label {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--step-n1);
    color: var(--text-primary);
    cursor: pointer;
    user-select: none;
  }
  .toggle-label input[type="checkbox"] {
    width: 1.25rem;
    height: 1.25rem;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .actions {
    display: flex;
    gap: var(--space-xs);
    margin-top: var(--space-s);
  }
  .result-display {
    display: flex;
    align-items: center;
    margin-top: var(--space-m);
  }
  :global(.mt-4) {
    margin-top: var(--space-m);
  }
  :global(.ml-2) {
    margin-left: var(--space-2xs);
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
