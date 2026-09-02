<script lang="ts">
  import type { CalendarDate } from "@internationalized/date";
  import type { DayOfWeek } from "../../recurrence/rules";
  import type { RecurType } from "../../cal_events/event-schedule-rules";
  import DateField from "./DateField.svelte";
  import Card from "../../ui/Card.svelte";
  import Button from "../../ui/Button.svelte";

  // The add-event form's RECURRENCE card: how often the event repeats (daily /
  // weekly / monthly / yearly), an optional until date, and — for a timed,
  // endless event — extra times of day. State is bound back to the sheet, which
  // owns the derived schedule_rules; the read-only anchors come from the chosen
  // start date.
  let {
    recurType = $bindable<RecurType>("none"),
    selectedDays = $bindable<Set<DayOfWeek>>(new Set()),
    monthlyMode = $bindable<"fixed" | "relative">("fixed"),
    untilDateVal = $bindable<CalendarDate | undefined>(undefined),
    extraTimeSlots = $bindable<string[]>([]),
    timed,
    hasEnd,
    dayOfMonth,
    relativeWeek,
    relativeDay,
  }: {
    recurType: RecurType;
    selectedDays: Set<DayOfWeek>;
    monthlyMode: "fixed" | "relative";
    untilDateVal: CalendarDate | undefined;
    /** Extra times of day beyond the start time (slot 0 lives in the sheet). */
    extraTimeSlots: string[];
    timed: boolean;
    hasEnd: boolean;
    dayOfMonth: number;
    relativeWeek: -1 | 1 | 2 | 3 | 4;
    relativeDay: DayOfWeek;
  } = $props();

  const ALL_DAYS: DayOfWeek[] = [
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun",
  ];
  const DAY_LABELS: Record<DayOfWeek, string> = {
    mon: "M",
    tue: "T",
    wed: "W",
    thu: "T",
    fri: "F",
    sat: "S",
    sun: "S",
  };

  function toggleDay(d: DayOfWeek) {
    const next = new Set(selectedDays);
    next.has(d) ? next.delete(d) : next.add(d);
    selectedDays = next;
  }

  function addTimeSlot() {
    extraTimeSlots = [...extraTimeSlots, "20:00"];
  }

  function removeTimeSlot(i: number) {
    extraTimeSlots = extraTimeSlots.filter((_, idx) => idx !== i);
  }

  function updateTimeSlot(i: number, val: string) {
    extraTimeSlots = extraTimeSlots.map((t, idx) => (idx === i ? val : t));
  }
</script>

<Card class="field-card">
  <span class="field-label">RECURRENCE</span>
  <div class="seg-control seg-grid" style="margin-bottom: var(--space-s);">
    {#each [["specific_days", "DAILY"], ["weekly", "WEEKLY"], ["monthly", "MONTHLY"], ["yearly", "YEARLY"]] as [val, label]}
      <button
        class="seg-btn"
        class:active={recurType === val}
        onclick={() => {
          recurType = recurType === val ? "none" : (val as RecurType);
        }}>{label}</button
      >
    {/each}
  </div>

  {#if recurType === "specific_days"}
    <div class="day-grid">
      {#each ALL_DAYS as day}
        <button
          class="day-btn"
          class:selected={selectedDays.has(day)}
          onclick={() => toggleDay(day)}
          aria-label={day}>{DAY_LABELS[day]}</button
        >
      {/each}
    </div>
  {/if}

  {#if recurType === "monthly"}
    <div class="seg-control seg-grid" style="margin-top: 2px;">
      <button
        class="seg-btn"
        class:active={monthlyMode === "fixed"}
        onclick={() => (monthlyMode = "fixed")}>ON DAY {dayOfMonth}</button
      >
      <button
        class="seg-btn"
        class:active={monthlyMode === "relative"}
        onclick={() => (monthlyMode = "relative")}
      >
        ON {relativeWeek === -1
          ? "LAST"
          : ["", "1ST", "2ND", "3RD", "4TH"][relativeWeek]}
        {relativeDay.toUpperCase()}
      </button>
    </div>
  {/if}

  {#if recurType !== "none"}
    <div
      class="field-row until-row"
      style="margin-top: var(--space-s); margin-bottom: var(--space-s);"
    >
      <span class="field-sublabel">UNTIL (OPTIONAL)</span>
      <div class="input-wrapper">
        <DateField bind:date={untilDateVal} iconSize={14} />
      </div>
    </div>
  {/if}

  <!-- Time slots: shown for any point-in-time event without a block end -->
  {#if timed && !hasEnd}
    <div
      class="time-slots-section"
      style={recurType !== "none"
        ? "border-top: 2px dashed var(--ink); padding-top: var(--space-s); margin-top: var(--space-s);"
        : "padding-top: var(--space-s); margin-top: var(--space-s);"}
    >
      {#if extraTimeSlots.length > 0}
        <span
          class="field-sublabel"
          style="margin-bottom: var(--space-xs); display: block;"
          >ADDITIONAL TIMES</span
        >
        {#each extraTimeSlots as slot, i}
          <div class="slot-row" style="margin-bottom: var(--space-xs);">
            <div class="input-wrapper">
              <input
                class="time-input flex-1"
                type="time"
                value={slot}
                oninput={(e) =>
                  updateTimeSlot(i, (e.target as HTMLInputElement).value)}
              />
            </div>
            <Button
              variant="danger"
              size="sm"
              class="remove-btn"
              onclick={() => removeTimeSlot(i)}
              aria-label="Remove">✕</Button
            >
          </div>
        {/each}
      {/if}
      <button
        class="add-slot-btn"
        style="display: block; margin: 0 auto; {extraTimeSlots.length === 0
          ? ''
          : 'margin-top: var(--space-xs);'}"
        onclick={addTimeSlot}>+ ADD ANOTHER TIME</button
      >
    </div>
  {/if}
</Card>

<style>
  /* The panel frame is now the shared Card (ADR-0039); its edge, shadow and bg
     tokens are identical to the old bespoke ones, so this keeps only the compact
     padding, column layout and positioning context, reached via `:global` under
     the doubled `.card` class so they win over Card's base. */
  :global(.card.field-card) {
    padding: var(--space-s);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    position: relative;
  }
  .field-label {
    font-size: var(--step-n2);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--text-secondary);
  }

  .field-sublabel {
    font-size: var(--step-n2);
    color: var(--text-muted);
    white-space: nowrap;
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
  }
  .input-wrapper input {
    width: 100%;
  }

  .time-input {
    font-family: var(--font-mono);
    font-size: var(--step-0);
    font-weight: 700;
    color: var(--text-primary);
    background: var(--bg-input);
    border: var(--edge);
    padding: var(--space-2xs) var(--space-xs);
    outline: none;
    flex: 1;
    max-width: 120px;
  }

  /* Segmented control */
  .seg-control {
    display: flex;
    border: var(--edge);
  }
  .seg-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 2px;
    background: var(--ink);
    border: var(--edge);
  }
  .seg-grid .seg-btn {
    border: none !important;
  }

  .seg-btn {
    flex: 1;
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    background: var(--bg-surface);
    color: var(--text-primary);
    border: none;
    border-right: var(--edge);
    padding: var(--space-2xs) var(--space-xs);
    cursor: pointer;
    white-space: nowrap;
    letter-spacing: 0.05em;
  }
  .seg-btn:last-child {
    border-right: none;
  }
  .seg-btn.active {
    background: var(--ink);
    color: var(--paper);
  }

  /* Day grid */
  .day-grid {
    display: flex;
    gap: var(--space-2xs);
    margin-top: var(--space-2xs);
  }

  .day-btn {
    width: 36px;
    height: 36px;
    border: var(--edge);
    background: var(--bg-input);
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: var(--step-n1);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .day-btn.selected {
    background: var(--ink);
    color: var(--paper);
  }

  .until-row {
    margin-top: var(--space-xs);
  }

  /* Time slots */
  .slot-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    width: 100%;
  }

  .flex-1 {
    flex: 1;
    max-width: none;
  }

  /* The ✕ slot-remove is a small destructive action → Button (danger, sm); the
     red fill, edge, shadow and press are the primitive's (ADR-0039). This keeps
     only the fixed square size and heavier glyph weight, reached via the doubled
     `.btn` class so they win over Button's sm padding/weight. */
  :global(.btn.remove-btn) {
    width: 32px;
    height: 32px;
    padding: 0;
    flex-shrink: 0;
    font-weight: 900;
  }

  .add-slot-btn {
    border: 2px dashed var(--ink);
    background: transparent;
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    padding: var(--space-2xs) var(--space-xs);
    cursor: pointer;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    text-align: center;
  }
</style>
