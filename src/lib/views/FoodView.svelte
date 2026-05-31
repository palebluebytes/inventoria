<script lang="ts">
  import { createQueryStore } from "../stores/datoms.store";
  import DailyDashboard from "./food/DailyDashboard.svelte";
  import FoodSearchModal from "./food/FoodSearchModal.svelte";
  import AddPhotoModal from "./food/AddPhotoModal.svelte";
  import RecipeModal from "./food/RecipeModal.svelte";

  import Card from "../ui/Card.svelte";
  import Badge from "../ui/Badge.svelte";
  import Button from "../ui/Button.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

  let selectedDate = $state(new Date());
  let activeModal = $state<"menu" | "search" | "photo" | "recipe" | null>(null);
  let activeMealType = $state<"breakfast" | "lunch" | "dinner" | "snack">(
    "breakfast"
  );

  // Keep query of raw twins for debugging/viewing all stored twins
  const foodTwinsStore = createQueryStore<{
    entity: string;
    attribute: string;
    value: string;
  }>(
    "SELECT entity, attribute, value FROM datoms WHERE attribute = 'food/name' ORDER BY time DESC LIMIT 20"
  );

  function openMenu(mealType: "breakfast" | "lunch" | "dinner" | "snack") {
    activeMealType = mealType;
    activeModal = "menu";
  }
</script>

<header class="page-header">
  <h1>Food Tracker</h1>
  <p>
    Track your daily nutritional intake, build custom recipes, and log food
    photos locally.
  </p>
</header>

<!-- Main Dashboard -->
<DailyDashboard {dbReady} bind:selectedDate onOpenLogFlow={openMenu} />

<!-- Secondary: Saved Digital Twins Ledger -->
<Card class="mt-6">
  <h2>
    Saved Food Twins <Badge
      id="saved-twins-count"
      variant="default"
      class="ml-2">{$foodTwinsStore.length}</Badge
    >
  </h2>
  {#if $foodTwinsStore.length === 0}
    <p class="empty">
      No digital twins created yet. Try searching or scanning a food above.
    </p>
  {:else}
    <ul id="saved-twins-list" class="twin-list">
      {#each $foodTwinsStore as row}
        <li class="twin-item">
          <span class="twin-entity">{row.entity}</span>
          <span class="twin-name">{JSON.parse(row.value)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</Card>

<!-- Overlay menu modal -->
{#if activeModal === "menu"}
  <div
    class="menu-modal-overlay"
    onclick={() => (activeModal = null)}
    role="dialog"
    aria-modal="true"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="menu-modal-card" onclick={(e) => e.stopPropagation()}>
      <div class="menu-header">
        <h3>Log {activeMealType.toUpperCase()}</h3>
        <button class="close-btn" onclick={() => (activeModal = null)}
          >&times;</button
        >
      </div>
      <div class="menu-options mt-4">
        <button
          class="menu-option-btn"
          onclick={() => (activeModal = "search")}
        >
          <span class="menu-icon">🔍</span>
          <div class="menu-text">
            <span class="menu-title">Search FDC / scan Barcode</span>
            <span class="menu-desc"
              >Query USDA foods or Open Food Facts barcode</span
            >
          </div>
        </button>

        <button class="menu-option-btn" onclick={() => (activeModal = "photo")}>
          <span class="menu-icon">📷</span>
          <div class="menu-text">
            <span class="menu-title">Add Photo / Custom Entry</span>
            <span class="menu-desc">Take a photo and log custom nutrition</span>
          </div>
        </button>

        <button
          class="menu-option-btn"
          onclick={() => (activeModal = "recipe")}
        >
          <span class="menu-icon">🍲</span>
          <div class="menu-text">
            <span class="menu-title">Build Recipe</span>
            <span class="menu-desc"
              >Combine multiple ingredients into a recipe twin</span
            >
          </div>
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Sub-Modals -->
{#if activeModal === "search"}
  <FoodSearchModal
    {dbReady}
    mealType={activeMealType}
    {selectedDate}
    onClose={() => (activeModal = null)}
  />
{/if}

{#if activeModal === "photo"}
  <AddPhotoModal
    mealType={activeMealType}
    {selectedDate}
    onClose={() => (activeModal = null)}
  />
{/if}

{#if activeModal === "recipe"}
  <RecipeModal
    {dbReady}
    mealType={activeMealType}
    {selectedDate}
    onClose={() => (activeModal = null)}
  />
{/if}

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

  /* Log Menu Modal */
  .menu-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 998;
    backdrop-filter: blur(8px);
  }
  .menu-modal-card {
    background: var(--bg-card, #121214);
    border: 1px solid var(--border);
    border-radius: 20px;
    width: 90%;
    max-width: 450px;
    padding: var(--space-m);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
    animation: zoomIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--space-xs);
  }
  .menu-header h3 {
    font-size: var(--step-0);
    font-weight: 700;
    color: var(--text-primary);
  }
  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: var(--step-2);
    cursor: pointer;
  }
  .close-btn:hover {
    color: var(--text-primary);
  }

  .menu-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }
  .menu-option-btn {
    width: 100%;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: var(--space-s);
    display: flex;
    align-items: center;
    gap: var(--space-s);
    cursor: pointer;
    text-align: left;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .menu-option-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--accent);
    transform: translateY(-2px);
  }
  .menu-icon {
    font-size: var(--step-2);
  }
  .menu-text {
    display: flex;
    flex-direction: column;
  }
  .menu-title {
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
  }
  .menu-desc {
    font-size: var(--step-n3);
    color: var(--text-muted);
    margin-top: 2px;
  }

  :global(.mt-6) {
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
  @keyframes zoomIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
