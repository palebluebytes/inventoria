<script lang="ts">
  import { acquisitionLibraryStore } from "../stores/acquisition.store";
  import { getProxyImageUrl } from "../ingestion/fetcher";
  import Badge from "../ui/Badge.svelte";
  import Alert from "../ui/Alert.svelte";

  // Sub-components
  import ItemImportPanel from "./items/ItemImportPanel.svelte";
  import ItemManualForm from "./items/ItemManualForm.svelte";
  import ItemInspector from "./items/ItemInspector.svelte";
  import ItemEditModal from "./items/ItemEditModal.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

  // Tab state within the view
  let activeViewTab = $state<"owned" | "wanted">("owned");

  // Manual entry toggle
  let showManualForm = $state(false);

  // Manual save status messages
  let manualSuccess = $state("");
  let manualError = $state("");

  // Edit details modal states
  let showEditModal = $state(false);
  let editingItem = $state<any>(null);

  function openEditModal(item: any) {
    editingItem = item;
    showEditModal = true;
  }

  // Computed lists based on derived store
  let items = $derived($acquisitionLibraryStore || []);
  let ownedItems = $derived(items.filter((i) => i.status === "owned"));
  let wantedItems = $derived(items.filter((i) => i.status === "wanted"));
  let activeList = $derived(
    activeViewTab === "owned" ? ownedItems : wantedItems
  );

  // Filter and Selection State
  let activeFilterTag = $state<string | null>(null);
  let selectedItemId = $state<string | null>(null);
  let selectedItem = $derived(
    selectedItemId ? items.find((i) => i.id === selectedItemId) || null : null
  );

  // Derived available tags from the active list
  let availableTags = $derived(
    Array.from(new Set(activeList.flatMap((item) => item.tags || []))).sort()
  );

  // Filtered list based on active tag
  let filteredList = $derived(
    activeFilterTag
      ? activeList.filter(
          (item) => item.tags && item.tags.includes(activeFilterTag!)
        )
      : activeList
  );

  // Clear selection if switching tabs makes it invalid
  $effect(() => {
    if (selectedItem && selectedItem.status !== activeViewTab) {
      selectedItemId = null;
    }
  });

  function handleSaveSuccess(msg: string) {
    manualSuccess = msg;
    manualError = "";
  }

  function handleSaveError(msg: string) {
    manualError = msg;
    manualSuccess = "";
  }
</script>

<header class="page-header">
  <h1>Physical Digital Twins</h1>
  <p>
    Track your physical belongings and wanted list offline via append-only
    ledger.
  </p>
</header>

<!-- Share Target / Scraper Panel -->
<ItemImportPanel bind:showManualForm />

<!-- Manual Creation Form -->
{#if showManualForm}
  <ItemManualForm
    bind:showManualForm
    onSaveSuccess={handleSaveSuccess}
    onSaveError={handleSaveError}
  />
{/if}

{#if manualSuccess}
  <div class="mt-4">
    <Alert variant="success">{manualSuccess}</Alert>
  </div>
{/if}
{#if manualError}
  <div class="mt-4">
    <Alert variant="error">{manualError}</Alert>
  </div>
{/if}

<!-- View Tabs (Owned vs Wanted) -->
<div class="view-tabs mt-6">
  <button
    id="tab-owned-btn"
    class="view-tab-btn {activeViewTab === 'owned' ? 'active' : ''}"
    onclick={() => {
      activeViewTab = "owned";
      activeFilterTag = null;
      selectedItemId = null;
    }}
  >
    Owned
    <Badge variant="default" class="ml-2">{ownedItems.length}</Badge>
  </button>
  <button
    id="tab-wanted-btn"
    class="view-tab-btn {activeViewTab === 'wanted' ? 'active' : ''}"
    onclick={() => {
      activeViewTab = "wanted";
      activeFilterTag = null;
      selectedItemId = null;
    }}
  >
    Wanted
    <Badge variant="default" class="ml-2">{wantedItems.length}</Badge>
  </button>
</div>

<!-- Tag Filter Bar -->
{#if availableTags.length > 0}
  <div class="tag-filter-bar">
    <button
      class="tag-btn {activeFilterTag === null ? 'active' : ''}"
      onclick={() => (activeFilterTag = null)}
    >
      All
    </button>
    {#each availableTags as tag}
      <button
        class="tag-btn {activeFilterTag === tag ? 'active' : ''}"
        onclick={() => (activeFilterTag = activeFilterTag === tag ? null : tag)}
      >
        {tag}
      </button>
    {/each}
  </div>
{/if}

<!-- Inventory Layout -->
<div class="inventory-layout mt-4">
  <div class="inventory-grid">
    {#if filteredList.length === 0}
      <div class="empty-inventory">
        <div class="empty-icon">🎒</div>
        <p>No items found. Your inventory is empty.</p>
      </div>
    {:else}
      {#each filteredList as item}
        <button
          class="inventory-slot {selectedItemId === item.id ? 'selected' : ''}"
          onclick={() =>
            (selectedItemId = selectedItemId === item.id ? null : item.id)}
          aria-label={item.name}
          title={item.name}
        >
          {#if item.image}
            <img
              src={getProxyImageUrl(item.image)}
              alt={item.name}
              crossorigin="anonymous"
            />
          {:else}
            <span class="placeholder-icon">📦</span>
          {/if}

          {#if item.note}
            <div class="slot-indicator note-indicator" title="Has Note"></div>
          {/if}
        </button>
      {/each}
    {/if}
  </div>

  <!-- Inspector Panel -->
  <ItemInspector
    {selectedItem}
    onClose={() => (selectedItemId = null)}
    onEdit={openEditModal}
  />
</div>

<!-- Edit Modal -->
<ItemEditModal bind:editingItem bind:showEditModal />

<style>
  .page-header {
    margin-bottom: var(--space-m);
    border-bottom: var(--edge);
    padding-bottom: var(--space-s);
  }
  h1 {
    font-size: var(--step-2);
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--space-3xs);
    letter-spacing: -0.05em;
    text-transform: uppercase;
  }
  p {
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }

  /* Tabs */
  .view-tabs {
    display: flex;
    border-bottom: var(--edge);
    gap: 2px;
  }
  .view-tab-btn {
    padding: var(--space-s) var(--space-m);
    border: var(--edge);
    border-bottom: none;
    background: #f4f4f5;
    font-weight: 700;
    text-transform: uppercase;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    transition: all 0.2s ease;
  }
  .view-tab-btn:hover {
    background: #e4e4e7;
  }
  .view-tab-btn.active {
    background: var(--ink);
    color: var(--paper);
  }

  /* Tag Filter Bar */
  .tag-filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding: var(--space-xs) 0;
    border-bottom: var(--edge);
  }
  .tag-btn {
    padding: 4px 12px;
    border: var(--edge);
    background: var(--paper);
    font-weight: 600;
    font-size: var(--step-n2);
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: var(--shadow-1);
    transition: all 0.1s ease;
  }
  .tag-btn:hover {
    transform: translate(-1px, -1px);
    box-shadow: var(--shadow-2);
  }
  .tag-btn:active {
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 var(--ink);
  }
  .tag-btn.active {
    background: var(--ink);
    color: var(--paper);
  }

  /* Inventory Layout */
  .inventory-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
    align-items: flex-start;
  }
  @media (min-width: 800px) {
    .inventory-layout {
      flex-direction: row;
    }
  }

  /* Inventory Grid */
  .inventory-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: var(--space-xs);
    width: 100%;
    align-content: start;
    min-height: 300px;
  }
  @media (min-width: 600px) {
    .inventory-grid {
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: var(--space-s);
    }
  }

  .empty-inventory {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
    border: 2px dashed var(--ink);
    background: rgba(0, 0, 0, 0.02);
    text-align: center;
  }
  .empty-icon {
    font-size: 3rem;
    margin-bottom: var(--space-s);
    opacity: 0.5;
  }

  /* Inventory Slot */
  .inventory-slot {
    aspect-ratio: 1;
    border: var(--edge);
    background: var(
      --paper
    ); /* White background to blend with product images */
    padding: 0;
    position: relative;
    cursor: pointer;
    box-shadow: var(--shadow-1);
    transition: all 0.1s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .inventory-slot:hover {
    transform: translate(-2px, -2px);
    box-shadow: var(--shadow-2);
    background: #e4e4e7;
  }
  .inventory-slot.selected {
    background: var(--ink);
    border-color: var(--ink);
    box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.2);
    transform: translate(-1px, -1px);
  }
  .inventory-slot img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: opacity 0.2s;
  }
  .inventory-slot.selected img {
    opacity: 0.8;
  }
  .placeholder-icon {
    font-size: 2rem;
    opacity: 0.6;
  }
  .slot-indicator {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: var(--edge-thin);
  }
  .note-indicator {
    background: #fef08a; /* Yellow for notes */
  }

  /* Utility Classes Re-added */
  :global(.mt-4) {
    margin-top: var(--space-s);
  }
  :global(.mt-6) {
    margin-top: var(--space-m);
  }
  :global(.ml-2) {
    margin-left: var(--space-xs);
  }
</style>
