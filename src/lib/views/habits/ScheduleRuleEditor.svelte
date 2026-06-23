<script lang="ts">
  import { untrack } from "svelte";
  import { slide } from "svelte/transition";
  import type { ScheduleRule, DayOfWeek } from "../../habits/habits";

  // Two-way bound: the editor owns the widget state and writes the current
  // ScheduleRule back to `value`. Seeded once from the incoming rule so both the
  // add and edit flows share one schedule editor instead of maintaining twins.
  let { value = $bindable() }: { value: ScheduleRule } = $props();

  type SupportedType = "daily_multiple" | "weekly_days" | "weekly_flexible";

  const init: any = untrack(() => value);
  const initType: SupportedType =
    init?.type === "daily_multiple" ||
    init?.type === "weekly_days" ||
    init?.type === "weekly_flexible"
      ? init.type
      : "daily_multiple";

  let scheduleType = $state<SupportedType>(initType);

  // daily_multiple options
  let dailyCount = $state(
    initType === "daily_multiple" ? (init.count ?? 1) : 1
  );
  let dailyUseSubtargets = $state(
    initType === "daily_multiple" && !!init.targets
  );
  let dailySubtargets = $state<{ id: string; time_hint: string }[]>(
    initType === "daily_multiple" && init.targets
      ? init.targets.map((t: any) => ({
          id: t.id,
          time_hint: t.time_hint || "",
        }))
      : [
          { id: "slot_1", time_hint: "08:00" },
          { id: "slot_2", time_hint: "20:00" },
        ]
  );

  // weekly_days options
  let weeklyDaysSelected = $state<{ [key: string]: boolean }>(
    initType === "weekly_days"
      ? {
          mon: init.days.includes("mon"),
          tue: init.days.includes("tue"),
          wed: init.days.includes("wed"),
          thu: init.days.includes("thu"),
          fri: init.days.includes("fri"),
          sat: init.days.includes("sat"),
          sun: init.days.includes("sun"),
        }
      : {
          mon: true,
          tue: true,
          wed: true,
          thu: true,
          fri: true,
          sat: false,
          sun: false,
        }
  );

  // weekly_flexible options
  let weeklyFlexCount = $state(initType === "weekly_flexible" ? init.count : 3);

  const scheduleTypes = [
    { value: "daily_multiple", label: "DAILY" },
    { value: "weekly_days", label: "SPECIFIC DAYS" },
    { value: "weekly_flexible", label: "FLEXIBLE" },
  ];

  // The canonical serialization, shared by the add and edit flows. Subtargets
  // are kept only when they carry a time, and a missing id is generated.
  const built = $derived.by((): ScheduleRule => {
    if (scheduleType === "daily_multiple") {
      if (dailyUseSubtargets) {
        return {
          type: "daily_multiple",
          targets: dailySubtargets
            .filter((t) => t.time_hint.trim() !== "")
            .map((t) => ({
              id:
                t.id.trim() ||
                "slot_" + Math.random().toString(36).substring(2, 9),
              time_hint: t.time_hint.trim(),
            })),
        };
      }
      return { type: "daily_multiple", count: dailyCount };
    }
    if (scheduleType === "weekly_days") {
      const days = (Object.keys(weeklyDaysSelected) as DayOfWeek[]).filter(
        (d) => weeklyDaysSelected[d]
      );
      return { type: "weekly_days", days };
    }
    return { type: "weekly_flexible", count: weeklyFlexCount };
  });

  $effect(() => {
    value = built;
  });
</script>

<!-- Schedule Type -->
<div class="section-card">
  <h3 class="section-legend">Schedule Type</h3>
  <div class="segmented-control">
    {#each scheduleTypes as type}
      <button
        type="button"
        class="segment-btn"
        class:active={scheduleType === type.value}
        onclick={() => {
          scheduleType = type.value as any;
        }}
      >
        {type.label}
      </button>
    {/each}
  </div>
</div>

<!-- Daily Config -->
{#if scheduleType === "daily_multiple"}
  <div class="section-card" transition:slide={{ duration: 200 }}>
    <h3 class="section-legend">Daily Schedule</h3>

    <button
      type="button"
      class="specific-times-btn"
      class:active={dailyUseSubtargets}
      onclick={() => (dailyUseSubtargets = !dailyUseSubtargets)}
    >
      <span class="custom-checkbox" class:checked={dailyUseSubtargets}></span>
      <span class="toggle-label">SPECIFIC TIMES?</span>
    </button>

    {#if dailyUseSubtargets}
      <div class="subtargets-list-brutal" transition:slide={{ duration: 200 }}>
        {#each dailySubtargets as tgt, idx}
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
                dailySubtargets = dailySubtargets.filter((_, i) => i !== idx);
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
            dailySubtargets = [
              ...dailySubtargets,
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
      <div class="reps-counter-container" transition:slide={{ duration: 200 }}>
        <span class="counter-label-desc">TARGET REPS PER DAY:</span>
        <div class="reps-counter">
          <button
            type="button"
            class="counter-btn"
            onclick={() => {
              if (dailyCount > 1) dailyCount--;
            }}
          >
            -
          </button>
          <span class="counter-val"
            >{dailyCount} {dailyCount === 1 ? "REP" : "REPS"}</span
          >
          <button
            type="button"
            class="counter-btn"
            onclick={() => dailyCount++}
          >
            +
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<!-- Weekly Specific Days Config -->
{#if scheduleType === "weekly_days"}
  <div class="section-card" transition:slide={{ duration: 200 }}>
    <h3 class="section-legend">Scheduled Days</h3>
    <div class="days-grid-brutal">
      {#each ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as day}
        <button
          type="button"
          class="day-btn-brutal"
          class:selected={weeklyDaysSelected[day]}
          onclick={() => (weeklyDaysSelected[day] = !weeklyDaysSelected[day])}
        >
          {day.toUpperCase()}
        </button>
      {/each}
    </div>
  </div>
{/if}

<!-- Weekly Flexible Config -->
{#if scheduleType === "weekly_flexible"}
  <div class="section-card" transition:slide={{ duration: 200 }}>
    <h3 class="section-legend">Flexible Target</h3>
    <div class="reps-counter-container">
      <span class="counter-label-desc">COMPLETIONS PER WEEK:</span>
      <div class="reps-counter">
        <button
          type="button"
          class="counter-btn"
          onclick={() => {
            if (weeklyFlexCount > 1) weeklyFlexCount--;
          }}
        >
          -
        </button>
        <span class="counter-val">
          {weeklyFlexCount}
          {weeklyFlexCount === 1 ? "TIME" : "TIMES"} / WEEK
        </span>
        <button
          type="button"
          class="counter-btn"
          onclick={() => {
            if (weeklyFlexCount < 7) weeklyFlexCount++;
          }}
        >
          +
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
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
</style>
