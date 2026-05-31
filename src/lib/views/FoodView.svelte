<script lang="ts">
  import { dbClient } from "../db/db.client";
  import { createQueryStore } from "../stores/datoms.store";
  import { lookupBarcode, ProductNotFoundError } from "../food/open-food-facts";
  import { searchFdc } from "../food/usda-fdc";
  import { ingestEntity } from "../ingestion/ingest";

  import Card from "../ui/Card.svelte";
  import Input from "../ui/Input.svelte";
  import Button from "../ui/Button.svelte";
  import Alert from "../ui/Alert.svelte";
  import Badge from "../ui/Badge.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

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
</script>

<header class="page-header">
  <h1>Food Twins</h1>
  <p>
    Look up food items by barcode (Open Food Facts) or name (USDA FDC) and save
    them to the ledger.
  </p>
</header>

<div class="lookup-grid">
  <!-- OFF barcode -->
  <Card>
    <h2>📷 Barcode Lookup</h2>
    <p class="card-sub">Open Food Facts — free, no key required</p>
    <div class="input-row">
      <Input
        id="barcode-input"
        placeholder="e.g. 3017620422003"
        bind:value={barcodeInput}
        onkeydown={(e) => e.key === "Enter" && lookupOFF()}
      />
      <Button
        onclick={lookupOFF}
        disabled={foodStatus === "loading" || !dbReady}
        loading={foodStatus === "loading"}
      >
        Lookup
      </Button>
    </div>
  </Card>

  <!-- USDA FDC -->
  <Card>
    <h2>🔬 USDA FDC Search</h2>
    <p class="card-sub">FoodData Central — detailed nutrient data</p>
    <div class="input-row">
      <Input
        id="fdc-input"
        placeholder="e.g. banana, oats…"
        bind:value={fdcQuery}
        onkeydown={(e) => e.key === "Enter" && lookupUSDA()}
      />
      <Button
        onclick={lookupUSDA}
        disabled={foodStatus === "loading" || !dbReady}
        loading={foodStatus === "loading"}
      >
        Search
      </Button>
    </div>
  </Card>
</div>

{#if foodStatus === "error"}
  <Alert variant="error">{foodError}</Alert>
{/if}

{#if foodResult}
  <Alert variant="success">
    ✓ Added <strong>{foodResult.name}</strong> — {foodResult.calories}, protein: {foodResult.protein}
  </Alert>
{/if}

<Card class="mt-4">
  <h2>
    Saved Food Twins <Badge variant="default" class="ml-2"
      >{$foodTwinsStore.length}</Badge
    >
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
</Card>

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
    display: flex;
    align-items: center;
  }
  p {
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }
  .card-sub {
    font-size: var(--step-n2);
    color: var(--text-muted);
    margin: calc(var(--space-xs) * -0.5) 0 var(--space-xs);
  }
  .lookup-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-m);
    margin-bottom: var(--space-m);
    animation: slideUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @media (max-width: 768px) {
    .lookup-grid {
      grid-template-columns: 1fr;
    }
  }
  .input-row {
    display: flex;
    gap: var(--space-2xs);
    margin-top: var(--space-xs);
  }
  .twin-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    margin-top: var(--space-s);
  }
  .twin-item {
    display: flex;
    align-items: center;
    gap: var(--space-m);
    padding: var(--space-2xs) 0;
    border-bottom: 1px solid var(--border);
    transition: background 0.2s;
  }
  .twin-item:hover {
    background: rgba(255, 255, 255, 0.02);
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
    color: var(--text-primary);
    font-size: var(--step-n1);
    font-weight: 500;
    flex: 1;
  }
  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: var(--space-xl) 0;
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
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
