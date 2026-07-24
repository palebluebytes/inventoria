<script lang="ts">
  import { untrack } from "svelte";
  import { habitsStore } from "../../stores/habits.store";
  import { acquisitionLibraryStore } from "../../stores/acquisition.store";
  import type { ScheduleRule } from "../../habits/habits";
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";
  import ScheduleRuleEditor from "./ScheduleRuleEditor.svelte";

  let {
    dbReady,
    onClose,
    initialScheduleType = "daily_multiple",
    initialUseSubtargets = false,
  }: {
    dbReady: boolean;
    onClose: () => void;
    initialScheduleType?: "daily_multiple" | "weekly_days" | "weekly_flexible";
    initialUseSubtargets?: boolean;
  } = $props();

  let habit_name = $state("");
  let habit_category = $state(""); // start with none selected
  // The schedule editor owns its widget state; seed it from the add flow's
  // initial type / sub-target hint and read the built rule back on save.
  let scheduleRule = $state<ScheduleRule>(
    untrack(() => initialUseSubtargets)
      ? {
          type: "daily_multiple",
          targets: [
            { id: "slot_1", time_hint: "08:00" },
            { id: "slot_2", time_hint: "20:00" },
          ],
        }
      : untrack(() => initialScheduleType) === "weekly_days"
        ? { type: "weekly_days", days: ["mon", "tue", "wed", "thu", "fri"] }
        : untrack(() => initialScheduleType) === "weekly_flexible"
          ? { type: "weekly_flexible", count: 3 }
          : { type: "daily_multiple", count: 1 }
  );

  // Equipment / Digital Twin integration
  let use_equipment = $state(false);
  let equipment_search_query = $state("");
  let selected_equipment_id = $state("");
  let selected_equipment_name = $state("");

  let habit_status = $state<"idle" | "loading" | "error">("idle");
  let habit_error = $state("");

  // Custom categories list from localStorage
  let custom_categories = $state<string[]>([]);
  let show_add_category_input = $state(false);
  let new_category_name = $state("");

  onMount(() => {
    const stored = localStorage.getItem("inventoria_habit_categories");
    if (stored) {
      try {
        custom_categories = JSON.parse(stored);
      } catch {
        custom_categories = [
          "Fitness",
          "Mind",
          "Productivity",
          "Health",
          "Other",
        ];
      }
    } else {
      custom_categories = [
        "Fitness",
        "Mind",
        "Productivity",
        "Health",
        "Other",
      ];
      localStorage.setItem(
        "inventoria_habit_categories",
        JSON.stringify(custom_categories)
      );
    }
  });

  // Search filter for Digital Twins from $acquisitionLibraryStore
  let filtered_equipment = $derived.by(() => {
    const query = equipment_search_query.trim().toLowerCase();
    if (!query) return [];
    return $acquisitionLibraryStore.filter((twin) =>
      twin.name.toLowerCase().includes(query)
    );
  });

  // Focus the inline input the moment it is revealed, without the `autofocus`
  // attribute (which a11y flags and which only applies on initial page load).
  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  function add_custom_category() {
    const name = new_category_name.trim();
    if (!name) return;
    const formatted = name.charAt(0).toUpperCase() + name.slice(1);
    if (custom_categories.length >= 10) return;
    if (!custom_categories.includes(formatted)) {
      custom_categories = [...custom_categories, formatted];
      localStorage.setItem(
        "inventoria_habit_categories",
        JSON.stringify(custom_categories)
      );
    }
    habit_category = formatted;
    new_category_name = "";
    show_add_category_input = false;
  }

  function select_equipment(twin: any) {
    selected_equipment_id = twin.id;
    selected_equipment_name = twin.name;
    equipment_search_query = "";
  }

  function clear_equipment() {
    selected_equipment_id = "";
    selected_equipment_name = "";
    equipment_search_query = "";
  }

  async function addHabit() {
    if (!habit_name.trim()) return;
    habit_status = "loading";
    habit_error = "";

    try {
      await habitsStore.createHabit(
        habit_name.trim(),
        habit_category,
        scheduleRule,
        use_equipment ? selected_equipment_id : ""
      );
      onClose();
    } catch (e: any) {
      habit_status = "error";
      habit_error = e.message ?? String(e);
    }
  }
</script>

<div class="add-screen">
  <div class="add-screen-header">
    <button
      type="button"
      class="close-btn"
      onclick={onClose}
      aria-label="Close Screen"
    >
      ✕ CLOSE
    </button>
    <div class="header-blueprint-title">NEW BLUEPRINT</div>
  </div>

  <main class="form-container-scrollable">
    <!-- Hero Habit Name Input -->
    <div class="hero-name-section">
      <input
        id="habit-name-input"
        type="text"
        placeholder="NAME"
        bind:value={habit_name}
        class="input-hero"
        autocomplete="off"
        required
      />
    </div>

    <!-- Schedule -->
    <ScheduleRuleEditor bind:value={scheduleRule} />

    <!-- Category Section -->
    <div class="section-card">
      <h3 class="section-legend">Category</h3>
      <div class="category-grid">
        {#each custom_categories as cat}
          <button
            type="button"
            class="category-chip"
            class:selected={habit_category === cat}
            onclick={() => (habit_category = cat)}
          >
            {cat.toUpperCase()}
          </button>
        {/each}

        {#if show_add_category_input}
          <div class="inline-add-category">
            <input
              type="text"
              placeholder="NEW CATEGORY..."
              bind:value={new_category_name}
              class="input-inline-cat"
              maxlength="15"
              onkeydown={(e) => {
                if (e.key === "Enter") add_custom_category();
                if (e.key === "Escape") show_add_category_input = false;
              }}
              use:focusOnMount
            />
            <button
              type="button"
              class="btn-inline-save"
              onclick={add_custom_category}
            >
              +
            </button>
          </div>
        {:else if custom_categories.length < 10}
          <button
            type="button"
            class="category-chip add-chip"
            onclick={() => (show_add_category_input = true)}
          >
            + ADD CATEGORY
          </button>
        {/if}
      </div>
    </div>

    <!-- Equipment Link Section -->
    <div class="section-card">
      <button
        type="button"
        class="equipment-toggle-btn"
        class:active={use_equipment}
        onclick={() => {
          use_equipment = !use_equipment;
          if (!use_equipment) clear_equipment();
        }}
      >
        <span class="custom-checkbox" class:checked={use_equipment}></span>
        <span class="toggle-label">EQUIPMENT REQUIRED?</span>
      </button>

      {#if use_equipment}
        <div
          class="equipment-search-container"
          transition:slide={{ duration: 200 }}
        >
          {#if selected_equipment_id}
            <div class="selected-equipment-badge">
              <span class="badge-text"
                >USING: {selected_equipment_name.toUpperCase()}</span
              >
              <button
                type="button"
                class="clear-equipment-btn"
                onclick={clear_equipment}
              >
                CHANGE
              </button>
            </div>
          {:else}
            <input
              type="text"
              placeholder="SEARCH PHYSICAL DIGITAL TWINS..."
              bind:value={equipment_search_query}
              class="input-brutal equipment-search-input"
            />
            {#if equipment_search_query.trim()}
              <div class="equipment-results">
                {#each filtered_equipment as twin}
                  <button
                    type="button"
                    class="equipment-result-item"
                    onclick={() => select_equipment(twin)}
                  >
                    <span class="twin-name">{twin.name.toUpperCase()}</span>
                    <span class="twin-tag">{twin.status.toUpperCase()}</span>
                  </button>
                {/each}
                {#if filtered_equipment.length === 0}
                  <div class="no-results">NO EQUIPMENT FOUND</div>
                {/if}
              </div>
            {/if}
          {/if}
        </div>
      {/if}
    </div>

    <!-- Error Box -->
    {#if habit_status === "error"}
      <div class="error-box-brutal" transition:slide={{ duration: 150 }}>
        ERROR: {habit_error.toUpperCase()}
      </div>
    {/if}
  </main>

  <!-- Sticky Action Footer -->
  <div class="action-footer-brutal">
    <button
      onclick={addHabit}
      disabled={habit_status === "loading" ||
        !dbReady ||
        !habit_name.trim() ||
        !habit_category}
      class="btn-submit-brutal"
    >
      {#if habit_status === "loading"}
        CREATING BLUEPRINT...
      {:else}
        SAVE BLUEPRINT
      {/if}
    </button>
  </div>
</div>

<style>
  .add-screen {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-base);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    height: 100svh;
    overflow: hidden;
    animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .add-screen-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid #000;
    background: #000;
    color: #fff;
    padding: var(--space-xs) var(--space-m);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .close-btn {
    background: var(--red-bg);
    color: #fff;
    border: 2px solid #000;
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    cursor: pointer;
    padding: var(--space-3xs) var(--space-xs);
  }

  .close-btn:hover {
    background: #fff;
    color: #000;
  }

  .header-blueprint-title {
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 800;
  }

  .form-container-scrollable {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-m);
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
    max-width: 600px;
    margin: 0 auto;
    width: 100%;
    padding-bottom: var(--space-2xl);
  }

  .hero-name-section {
    margin-bottom: var(--space-s);
  }

  .input-hero {
    font-family: var(--font-mono);
    font-size: var(--step-2);
    font-weight: 800;
    border: none;
    background: transparent;
    width: 100%;
    padding: var(--space-xs) 0;
    outline: none;
    color: var(--text-primary);
    text-transform: uppercase;
    border-radius: 0;
  }

  .input-hero::placeholder {
    color: var(--text-muted);
  }

  .section-card {
    border: 2px solid #000;
    background: var(--bg-surface);
    padding: var(--space-s);
    position: relative;
    box-shadow: 4px 4px 0 #000;
  }

  .section-legend {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 800;
    text-transform: uppercase;
    color: var(--text-secondary);
    margin-bottom: var(--space-xs);
  }

  /* Category Grid styling */
  .category-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
    margin-top: var(--space-xs);
  }

  .category-chip {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    padding: var(--space-3xs) var(--space-xs);
    border: 2px solid #000;
    background: var(--bg-surface);
    color: #000;
    cursor: pointer;
    transition:
      transform 0.05s ease,
      background-color 0.1s ease;
    text-transform: uppercase;
  }

  .category-chip:hover {
    transform: translate(-1px, -1px);
    box-shadow: 2px 2px 0 #000;
  }

  .category-chip:active {
    transform: translate(1px, 1px);
    box-shadow: none;
  }

  .category-chip.selected {
    background: var(--green-bg);
    color: #000;
    box-shadow: 2px 2px 0 #000;
  }

  .category-chip.add-chip {
    border-style: dashed;
    background: transparent;
    color: var(--text-secondary);
  }

  .inline-add-category {
    display: flex;
    gap: var(--space-3xs);
    align-items: center;
  }

  .input-inline-cat {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    padding: var(--space-3xs) var(--space-2xs);
    border: 2px solid #000;
    outline: none;
    width: 130px;
    text-transform: uppercase;
    border-radius: 0;
  }

  .btn-inline-save {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    padding: var(--space-3xs) var(--space-2xs);
    border: 2px solid #000;
    background: #000;
    color: #fff;
    cursor: pointer;
  }

  /* Equipment styling */
  .equipment-toggle-btn {
    width: 100%;
    background: var(--bg-surface);
    border: 2px solid #000;
    padding: var(--space-s);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    text-align: left;
    outline: none;
    transition: background-color 0.1s ease;
  }

  .equipment-toggle-btn:hover {
    background: var(--bg-input);
  }

  .equipment-toggle-btn.active {
    background: var(--amber-bg);
  }

  .equipment-search-container {
    margin-top: var(--space-xs);
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    position: relative;
  }

  .selected-equipment-badge {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #000;
    color: #fff;
    padding: var(--space-xs) var(--space-s);
    border: 2px solid #000;
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
  }

  .clear-equipment-btn {
    background: var(--amber-bg);
    color: #000;
    border: 2px solid #000;
    padding: var(--space-3xs) var(--space-2xs);
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    cursor: pointer;
  }

  .equipment-search-input {
    width: 100%;
    border: 2px solid #000;
    padding: var(--space-xs);
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    text-transform: uppercase;
    outline: none;
    background: var(--bg-surface);
    border-radius: 0;
  }

  .equipment-results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-surface);
    border: 2px solid #000;
    border-top: none;
    z-index: 100;
    display: flex;
    flex-direction: column;
    max-height: 200px;
    overflow-y: auto;
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.15);
  }

  .equipment-result-item {
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid #eee;
    padding: var(--space-xs) var(--space-s);
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    text-align: left;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--text-primary);
  }

  .equipment-result-item:hover {
    background: var(--bg-input);
  }

  .twin-name {
    font-weight: 700;
  }

  .twin-tag {
    font-size: var(--step-n3);
    opacity: 0.7;
    background: var(--bg-input);
    padding: 2px 4px;
    border: 1px solid #000;
  }

  .no-results {
    padding: var(--space-s);
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    color: var(--text-muted);
    text-align: center;
  }

  .error-box-brutal {
    border: 2px solid var(--red-bg);
    background: var(--red-bg);
    color: #fff;
    padding: var(--space-s);
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    box-shadow: 4px 4px 0 #000;
  }

  /* Sticky Action Footer styling */
  .action-footer-brutal {
    position: sticky;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--bg-base);
    border-top: 2px solid #000;
    padding: var(--space-s) var(--space-m);
    z-index: 10;
  }

  .btn-submit-brutal {
    width: 100%;
    background: #000;
    color: #fff;
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 800;
    border: 2px solid #000;
    padding: var(--space-s);
    text-transform: uppercase;
    cursor: pointer;
    transition:
      transform 0.05s ease,
      background-color 0.1s ease;
    box-shadow: 4px 4px 0 var(--green-bg);
  }

  .btn-submit-brutal:hover:not(:disabled) {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0 var(--green-bg);
  }

  .btn-submit-brutal:active:not(:disabled) {
    transform: translate(2px, 2px);
    box-shadow: none;
  }

  .btn-submit-brutal:disabled {
    background: var(--bg-input);
    color: var(--text-muted);
    border-color: var(--text-muted);
    box-shadow: none;
    cursor: not-allowed;
  }
</style>
