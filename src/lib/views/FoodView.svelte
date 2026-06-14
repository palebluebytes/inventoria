<script lang="ts">
  import { createQueryStore } from "../stores/datoms.store";
  import DailyDashboard from "./food/DailyDashboard.svelte";
  import FoodSearchModal from "./food/FoodSearchModal.svelte";
  import AddPhotoModal from "./food/AddPhotoModal.svelte";
  import RecipeModal from "./food/RecipeModal.svelte";

  import Card from "../ui/Card.svelte";
  import Badge from "../ui/Badge.svelte";
  import Button from "../ui/Button.svelte";
  import { dismissable } from "../ui/dismissable";

  let { dbReady }: { dbReady: boolean } = $props();

  let selectedDate = $state(new Date());
  let activeModal = $state<"menu" | "search" | "photo" | "recipe" | null>(null);
  let active_meal_type = $state<"breakfast" | "lunch" | "dinner" | "snack">(
    "breakfast"
  );

  let entityName = "Food";

  // Keep query of raw twins for debugging/viewing all stored twins
  const foodTwinsStore = createQueryStore<{
    entity: string;
    attribute: string;
    value: string;
  }>(
    "SELECT entity, attribute, value FROM datoms WHERE attribute = 'food/name' ORDER BY time DESC LIMIT 20"
  );

  function openMenu(meal_type: "breakfast" | "lunch" | "dinner" | "snack") {
    active_meal_type = meal_type;
    activeModal = "menu";
  }
</script>

<header class="page-header">
  <h1>{entityName}</h1>
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
    {entityName}
    <Badge id="saved-twins-count" variant="default" class="ml-2"
      >{$foodTwinsStore.length}</Badge
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
    use:dismissable={() => (activeModal = null)}
    role="presentation"
  >
    <div class="menu-modal-card" role="dialog" aria-modal="true" tabindex="-1">
      <div class="menu-header">
        <h3>Log {active_meal_type.toUpperCase()}</h3>
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
    meal_type={active_meal_type}
    {selectedDate}
    onClose={() => (activeModal = null)}
  />
{/if}

{#if activeModal === "photo"}
  <AddPhotoModal
    meal_type={active_meal_type}
    {selectedDate}
    onClose={() => (activeModal = null)}
  />
{/if}

{#if activeModal === "recipe"}
  <RecipeModal
    {dbReady}
    meal_type={active_meal_type}
    {selectedDate}
    onClose={() => (activeModal = null)}
  />
{/if}

<style>
  .page-header {
    margin-bottom: var(--space-m);
    animation: fadeIn 0.4s ease-out;
    border-bottom: 2px solid #000;
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
  h2 {
    font-size: var(--step-0);
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
    display: flex;
    align-items: center;
    text-transform: uppercase;
    letter-spacing: -0.02em;
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
    padding: var(--space-s) 0;
    border-bottom: 1px solid #000;
    transition: background 0.2s;
  }
  .twin-item:hover {
    background: #f4f4f5;
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
    word-break: break-word;
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
    background: rgba(255, 255, 255, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 998;
  }
  .menu-modal-card {
    background: #fff;
    border: 2px solid #000;
    border-radius: 0;
    width: 90%;
    max-width: 450px;
    padding: var(--space-m);
    box-shadow: 8px 8px 0 rgba(0, 0, 0, 1);
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #000;
    padding-bottom: var(--space-xs);
  }
  .menu-header h3 {
    font-size: var(--step-0);
    font-weight: 700;
    color: #000;
    text-transform: uppercase;
  }
  .close-btn {
    background: none;
    border: none;
    color: #000;
    font-size: var(--step-2);
    cursor: pointer;
    line-height: 1;
  }
  .close-btn:hover {
    transform: scale(1.1);
  }

  .menu-options {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .menu-option-btn {
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 1px solid #000;
    border-radius: 0;
    padding: var(--space-s) var(--space-xs);
    display: flex;
    align-items: center;
    gap: var(--space-s);
    cursor: pointer;
    text-align: left;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .menu-option-btn:last-child {
    border-bottom: none;
  }
  .menu-option-btn:hover {
    background: #f4f4f5;
  }
  .menu-icon {
    font-size: var(--step-2);
    filter: grayscale(100%);
  }
  .menu-text {
    display: flex;
    flex-direction: column;
  }
  .menu-title {
    font-size: var(--step-n1);
    font-weight: 700;
    color: #000;
    text-transform: uppercase;
  }
  .menu-desc {
    font-size: var(--step-n3);
    color: var(--text-secondary);
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
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
