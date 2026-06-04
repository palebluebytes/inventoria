<script lang="ts">
  import { habitsStore } from "../../stores/habits.store";
  import { acquisitionLibraryStore } from "../../stores/acquisition.store";
  import type { ScheduleRule, DayOfWeek } from "../../habits/habits";
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";

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
  let habit_schedule_type = $state<
    "daily_multiple" | "weekly_days" | "weekly_flexible"
  >(initialScheduleType);

  // daily_multiple options:
  let daily_count = $state(1);
  let daily_use_subtargets = $state(initialUseSubtargets);
  let daily_subtargets = $state<{ id: string; time_hint: string }[]>([
    { id: "slot_1", time_hint: "08:00" },
    { id: "slot_2", time_hint: "20:00" },
  ]);

  // weekly_days options:
  let weekly_days_selected = $state<{ [key: string]: boolean }>({
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: false,
    sun: false,
  });

  // weekly_flexible options:
  let weekly_flex_count = $state(3);

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

  const scheduleTypes = [
    { value: "daily_multiple", label: "DAILY" },
    { value: "weekly_days", label: "SPECIFIC DAYS" },
    { value: "weekly_flexible", label: "FLEXIBLE" },
  ];

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

    // Construct schedule rules
    let scheduleRules: ScheduleRule;
    if (habit_schedule_type === "daily_multiple") {
      if (daily_use_subtargets) {
        scheduleRules = {
          type: "daily_multiple",
          targets: daily_subtargets
            .filter((t) => t.id.trim() !== "")
            .map((t) => ({
              id: t.id.trim(),
              time_hint: t.time_hint.trim() || undefined,
            })),
        };
      } else {
        scheduleRules = {
          type: "daily_multiple",
          count: daily_count,
        };
      }
    } else if (habit_schedule_type === "weekly_days") {
      const days = (Object.keys(weekly_days_selected) as DayOfWeek[]).filter(
        (d) => weekly_days_selected[d]
      );
      scheduleRules = {
        type: "weekly_days",
        days,
      };
    } else {
      scheduleRules = {
        type: "weekly_flexible",
        count: weekly_flex_count,
      };
    }

    try {
      await habitsStore.createHabit(
        habit_name.trim(),
        habit_category,
        scheduleRules,
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
      [X] CLOSE
    </button>
    <div class="header-blueprint-title">NEW BLUEPRINT</div>
  </div>

  <main class="form-container-scrollable">
    <!-- Hero Habit Name Input -->
    <div class="hero-name-section">
      <input
        id="habit-name-input"
        type="text"
        placeholder="WHAT WILL YOU BUILD?"
        bind:value={habit_name}
        class="input-hero"
        autocomplete="off"
        required
      />
    </div>

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
              autofocus
            />
            <button
              type="button"
              class="btn-inline-save"
              onclick={add_custom_category}
            >
              [+]
            </button>
          </div>
        {:else if custom_categories.length < 10}
          <button
            type="button"
            class="category-chip add-chip"
            onclick={() => (show_add_category_input = true)}
          >
            [+ ADD CATEGORY]
          </button>
        {/if}
      </div>
    </div>

    <!-- Schedule Type -->
    <div class="section-card">
      <h3 class="section-legend">Schedule Type</h3>
      <div class="segmented-control">
        {#each scheduleTypes as type}
          <button
            type="button"
            class="segment-btn"
            class:active={habit_schedule_type === type.value}
            onclick={() => {
              habit_schedule_type = type.value as any;
            }}
          >
            {type.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Daily Config -->
    {#if habit_schedule_type === "daily_multiple"}
      <div class="section-card" transition:slide={{ duration: 200 }}>
        <h3 class="section-legend">Daily Schedule</h3>

        <button
          type="button"
          class="specific-times-btn"
          class:active={daily_use_subtargets}
          onclick={() => (daily_use_subtargets = !daily_use_subtargets)}
        >
          <span class="toggle-icon">{daily_use_subtargets ? "[X]" : "[ ]"}</span
          >
          <span class="toggle-label">SPECIFIC TIMES?</span>
        </button>

        {#if daily_use_subtargets}
          <div
            class="subtargets-list-brutal"
            transition:slide={{ duration: 200 }}
          >
            {#each daily_subtargets as tgt, idx}
              <div class="subtarget-row-brutal">
                <input
                  type="time"
                  bind:value={tgt.time_hint}
                  class="input-brutal small-input time-input"
                />
                <button
                  type="button"
                  class="delete-subtarget-btn"
                  onclick={() => {
                    daily_subtargets = daily_subtargets.filter(
                      (_, i) => i !== idx
                    );
                  }}
                  aria-label="Delete slot"
                >
                  ✕
                </button>
              </div>
            {/each}
            <button
              type="button"
              class="add-subtarget-btn"
              onclick={() => {
                daily_subtargets = [
                  ...daily_subtargets,
                  {
                    id: "slot_" + Math.random().toString(36).substring(2, 9),
                    time_hint: "",
                  },
                ];
              }}
            >
              + ADD TIME SLOT
            </button>
          </div>
        {:else}
          <div
            class="reps-counter-container"
            transition:slide={{ duration: 200 }}
          >
            <span class="counter-label-desc">TARGET REPS PER DAY:</span>
            <div class="reps-counter">
              <button
                type="button"
                class="counter-btn"
                onclick={() => {
                  if (daily_count > 1) daily_count--;
                }}
              >
                -
              </button>
              <span class="counter-val"
                >{daily_count} {daily_count === 1 ? "REP" : "REPS"}</span
              >
              <button
                type="button"
                class="counter-btn"
                onclick={() => daily_count++}
              >
                +
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Weekly Specific Days Config -->
    {#if habit_schedule_type === "weekly_days"}
      <div class="section-card" transition:slide={{ duration: 200 }}>
        <h3 class="section-legend">Scheduled Days</h3>
        <div class="days-grid-brutal">
          {#each ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as day}
            <button
              type="button"
              class="day-btn-brutal"
              class:selected={weekly_days_selected[day]}
              onclick={() =>
                (weekly_days_selected[day] = !weekly_days_selected[day])}
            >
              {day.toUpperCase()}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Weekly Flexible Config -->
    {#if habit_schedule_type === "weekly_flexible"}
      <div class="section-card" transition:slide={{ duration: 200 }}>
        <h3 class="section-legend">Flexible Target</h3>
        <div class="reps-counter-container">
          <span class="counter-label-desc">COMPLETIONS PER WEEK:</span>
          <div class="reps-counter">
            <button
              type="button"
              class="counter-btn"
              onclick={() => {
                if (weekly_flex_count > 1) weekly_flex_count--;
              }}
            >
              -
            </button>
            <span class="counter-val">
              {weekly_flex_count}
              {weekly_flex_count === 1 ? "TIME" : "TIMES"} / WEEK
            </span>
            <button
              type="button"
              class="counter-btn"
              onclick={() => {
                if (weekly_flex_count < 7) weekly_flex_count++;
              }}
            >
              +
            </button>
          </div>
        </div>
      </div>
    {/if}

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
        <span class="toggle-icon">{use_equipment ? "[X]" : "[ ]"}</span>
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
                    <span class="twin-tag">[{twin.status.toUpperCase()}]</span>
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

  /* Segmented Control styling */
  .segmented-control {
    display: flex;
    border: 2px solid #000;
    background: #000;
    gap: 2px;
  }

  .segment-btn {
    flex: 1;
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    padding: var(--space-xs) var(--space-2xs);
    border: none;
    background: var(--bg-surface);
    color: #000;
    cursor: pointer;
    text-align: center;
    text-transform: uppercase;
    transition:
      background-color 0.1s ease,
      color 0.1s ease;
  }

  .segment-btn:hover {
    background: var(--bg-input);
  }

  .segment-btn.active {
    background: #000;
    color: #fff;
  }

  /* Daily Config styling */
  .specific-times-btn {
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
    margin-bottom: var(--space-xs);
    transition: background-color 0.1s ease;
  }

  .specific-times-btn:hover {
    background: var(--bg-input);
  }

  .specific-times-btn.active {
    background: var(--green-bg);
  }

  .toggle-icon {
    font-family: var(--font-mono);
  }

  .subtargets-list-brutal {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  .subtarget-row-brutal {
    display: flex;
    gap: var(--space-3xs);
  }

  .subtarget-row-brutal .small-input {
    flex: 2;
    border: 2px solid #000;
    padding: var(--space-xs);
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    text-transform: uppercase;
    outline: none;
    border-radius: 0;
  }

  .subtarget-row-brutal .time-input {
    flex: 1;
  }

  .delete-subtarget-btn {
    background: var(--red-bg);
    color: #fff;
    border: 2px solid #000;
    padding: var(--space-xs);
    font-family: var(--font-mono);
    font-weight: 700;
    cursor: pointer;
    width: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .add-subtarget-btn {
    width: 100%;
    background: var(--bg-surface);
    border: 2px solid #000;
    padding: var(--space-xs);
    font-family: var(--font-mono);
    font-weight: 700;
    cursor: pointer;
    text-transform: uppercase;
  }

  .add-subtarget-btn:hover {
    background: var(--bg-input);
  }

  /* Reps Counter styling */
  .reps-counter-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }

  .counter-label-desc {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
  }

  .reps-counter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 2px solid #000;
    background: var(--bg-surface);
    padding: var(--space-xs);
  }

  .counter-btn {
    width: 40px;
    height: 40px;
    border: 2px solid #000;
    background: var(--bg-input);
    font-family: var(--font-mono);
    font-size: var(--step-0);
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .counter-btn:hover {
    background: #000;
    color: #fff;
  }

  .counter-val {
    font-family: var(--font-mono);
    font-size: var(--step-0);
    font-weight: 700;
  }

  /* Days Grid styling */
  .days-grid-brutal {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3xs);
  }

  @media (min-width: 480px) {
    .days-grid-brutal {
      grid-template-columns: repeat(7, 1fr);
    }
  }

  .day-btn-brutal {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    padding: var(--space-s) var(--space-3xs);
    border: 2px solid #000;
    background: var(--bg-surface);
    color: #000;
    cursor: pointer;
    transition:
      transform 0.05s ease,
      background-color 0.1s ease;
    text-align: center;
  }

  .day-btn-brutal:hover {
    transform: translate(-1px, -1px);
    box-shadow: 2px 2px 0 #000;
  }

  .day-btn-brutal:active {
    transform: translate(1px, 1px);
    box-shadow: none;
  }

  .day-btn-brutal.selected {
    background: var(--amber-bg);
    color: #000;
    box-shadow: 2px 2px 0 #000;
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
