<script lang="ts">
  import type { ScheduleRule, DayOfWeek } from "../../habits/habits";

  let {
    onSave,
    onClose,
  }: {
    onSave: (payload: {
      title: string;
      dtstart: string;
      dtend?: string;
      description?: string;
      tracking: boolean;
      schedule_rules?: ScheduleRule;
    }) => Promise<void>;
    onClose: () => void;
  } = $props();

  // --------------- Form state ---------------

  // Title
  let title = $state("");

  // Start date + time
  const today = new Date();
  let startDate = $state(today.toISOString().slice(0, 10));
  let startTime = $state("08:00");

  // Duration mode
  let durationMode = $state<"point" | "block">("point");
  let endTime = $state("09:00");

  // Tracking (smart default: point → true, block → false)
  let trackingOverridden = $state(false);
  let tracking = $derived.by(() => {
    if (trackingOverridden) return _trackingManual;
    return durationMode === "point";
  });
  let _trackingManual = $state(true);

  function handleDurationChange(mode: "point" | "block") {
    durationMode = mode;
    trackingOverridden = false; // reset override so smart default kicks in
  }

  function toggleTracking() {
    _trackingManual = !tracking;
    trackingOverridden = true;
  }

  // Time slots (for point-in-time multi-slot events like medication)
  let timeSlots = $state<string[]>([startTime]);

  function addTimeSlot() {
    timeSlots = [...timeSlots, "20:00"];
  }

  function removeTimeSlot(i: number) {
    timeSlots = timeSlots.filter((_, idx) => idx !== i);
  }

  function updateTimeSlot(i: number, val: string) {
    timeSlots = timeSlots.map((t, idx) => (idx === i ? val : t));
  }

  // Recurrence
  type RecurType =
    | "none"
    | "daily"
    | "specific_days"
    | "weekly"
    | "monthly"
    | "yearly";
  let recurType = $state<RecurType>("none");

  // weekly: specific days
  const ALL_DAYS: DayOfWeek[] = [
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun",
  ];
  let selectedDays = $state<Set<DayOfWeek>>(new Set());
  function toggleDay(d: DayOfWeek) {
    const next = new Set(selectedDays);
    next.has(d) ? next.delete(d) : next.add(d);
    selectedDays = next;
  }

  // monthly sub-type
  let monthlyMode = $state<"fixed" | "relative">("fixed");
  const startDateObj = $derived(new Date(startDate + "T00:00:00Z"));
  const dayOfMonth = $derived(startDateObj.getUTCDate());
  const monthOfYear = $derived(startDateObj.getUTCMonth() + 1);

  // monthly relative: compute from startDate
  const DOW_NAMES: DayOfWeek[] = [
    "sun",
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
  ];
  const relativeDay = $derived(DOW_NAMES[startDateObj.getUTCDay()]);
  // Calculate which nth occurrence of that weekday this date is
  const relativeWeek = $derived.by((): -1 | 1 | 2 | 3 | 4 => {
    const d = startDateObj.getUTCDate();
    const lastDay = new Date(
      Date.UTC(startDateObj.getUTCFullYear(), startDateObj.getUTCMonth() + 1, 0)
    ).getUTCDate();
    const dow = startDateObj.getUTCDay();
    // Check if it's the last occurrence
    let last = lastDay;
    while (
      new Date(
        Date.UTC(
          startDateObj.getUTCFullYear(),
          startDateObj.getUTCMonth(),
          last
        )
      ).getUTCDay() !== dow
    )
      last--;
    if (d === last) return -1;
    return Math.ceil(d / 7) as 1 | 2 | 3 | 4;
  });

  // Until
  let untilDate = $state("");

  // Description
  let description = $state("");

  // --------------- Derived dtstart ISO ---------------
  let dtstart = $derived(`${startDate}T${startTime}:00Z`);
  let dtend = $derived(
    durationMode === "block" ? `${startDate}T${endTime}:00Z` : undefined
  );

  // --------------- Build schedule_rules ---------------
  function buildScheduleRules(): ScheduleRule | undefined {
    const until = untilDate || undefined;
    switch (recurType) {
      case "none":
        return undefined;
      case "daily":
        if (durationMode === "point" && timeSlots.length > 1) {
          return {
            type: "daily_multiple",
            targets: timeSlots.map((t, i) => ({
              id: `slot_${i}`,
              time_hint: t,
            })),
            until,
          };
        }
        return { type: "daily_multiple", count: 1, until };
      case "specific_days":
        return { type: "weekly_days", days: Array.from(selectedDays), until };
      case "weekly":
        return { type: "weekly_flexible", count: 1, until };
      case "monthly":
        if (monthlyMode === "fixed") {
          return { type: "monthly_fixed", day_of_month: dayOfMonth, until };
        } else {
          return {
            type: "monthly_relative",
            week: relativeWeek,
            day: relativeDay,
            until,
          };
        }
      case "yearly":
        return {
          type: "yearly_fixed",
          month: monthOfYear,
          day_of_month: dayOfMonth,
          until,
        };
      default:
        return undefined;
    }
  }

  // --------------- Submission ---------------
  let saving = $state(false);
  let titleError = $state(false);

  async function handleSave() {
    if (!title.trim()) {
      titleError = true;
      return;
    }
    titleError = false;
    saving = true;
    try {
      await onSave({
        title: title.trim(),
        dtstart,
        dtend,
        description: description.trim() || undefined,
        tracking,
        schedule_rules: buildScheduleRules(),
      });
      onClose();
    } finally {
      saving = false;
    }
  }

  const DAY_LABELS: Record<DayOfWeek, string> = {
    mon: "M",
    tue: "T",
    wed: "W",
    thu: "T",
    fri: "F",
    sat: "S",
    sun: "S",
  };
</script>

<div class="add-event-screen">
  <!-- Header -->
  <div class="screen-header">
    <button class="close-btn" onclick={onClose} aria-label="Close"
      >✕ CLOSE</button
    >
    <span class="screen-title">NEW EVENT</span>
    <span></span>
  </div>

  <div class="screen-body">
    <!-- Title -->
    <div class="field-hero" class:error={titleError}>
      <input
        class="hero-input"
        type="text"
        placeholder="EVENT TITLE"
        bind:value={title}
        oninput={() => (titleError = false)}
        maxlength={60}
        autocomplete="off"
        spellcheck={false}
      />
      {#if titleError}<span class="field-error">REQUIRED</span>{/if}
    </div>

    <!-- Start -->
    <div class="field-card">
      <label class="field-label">START</label>
      <div class="field-row">
        <input class="date-input" type="date" bind:value={startDate} />
        <input class="time-input" type="time" bind:value={startTime} />
      </div>
    </div>

    <!-- Duration mode -->
    <div class="field-card">
      <label class="field-label">DURATION</label>
      <div class="seg-control">
        <button
          class="seg-btn"
          class:active={durationMode === "point"}
          onclick={() => handleDurationChange("point")}>POINT IN TIME</button
        >
        <button
          class="seg-btn"
          class:active={durationMode === "block"}
          onclick={() => handleDurationChange("block")}>BLOCK</button
        >
      </div>
      {#if durationMode === "block"}
        <div class="field-row" style="margin-top: var(--space-xs);">
          <span class="field-sublabel">END TIME</span>
          <input class="time-input" type="time" bind:value={endTime} />
        </div>
      {:else}
        <p class="field-hint">No end time — tap to confirm each occurrence</p>
      {/if}
    </div>

    <!-- Requires confirmation -->
    <div class="field-card">
      <button
        class="toggle-row"
        onclick={toggleTracking}
        aria-pressed={tracking}
      >
        <div class="checkbox" class:checked={tracking}>
          {#if tracking}✓{/if}
        </div>
        <div class="toggle-text">
          <span class="toggle-label">REQUIRES CONFIRMATION</span>
          <span class="toggle-hint">
            {tracking
              ? "Will show as MISSED if not tapped in time"
              : "Informational — auto-fades when time passes"}
          </span>
        </div>
      </button>
    </div>

    <!-- Time slots (only for point-in-time + daily or none) -->
    {#if durationMode === "point" && (recurType === "none" || recurType === "daily")}
      <div class="field-card">
        <label class="field-label">TIME SLOTS</label>
        {#each timeSlots as slot, i}
          <div class="slot-row">
            <input
              class="time-input flex-1"
              type="time"
              value={slot}
              oninput={(e) =>
                updateTimeSlot(i, (e.target as HTMLInputElement).value)}
            />
            {#if timeSlots.length > 1}
              <button
                class="remove-btn"
                onclick={() => removeTimeSlot(i)}
                aria-label="Remove">✕</button
              >
            {/if}
          </div>
        {/each}
        <button class="add-slot-btn" onclick={addTimeSlot}
          >+ ADD TIME SLOT</button
        >
      </div>
    {/if}

    <!-- Recurrence -->
    <div class="field-card">
      <label class="field-label">RECURRENCE</label>
      <div class="seg-control seg-wrap">
        {#each [["none", "NONE"], ["daily", "DAILY"], ["specific_days", "DAYS"], ["weekly", "WEEKLY"], ["monthly", "MONTHLY"], ["yearly", "YEARLY"]] as [val, label]}
          <button
            class="seg-btn"
            class:active={recurType === val}
            onclick={() => {
              recurType = val as RecurType;
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
        <div class="seg-control" style="margin-top: var(--space-xs);">
          <button
            class="seg-btn"
            class:active={monthlyMode === "fixed"}
            onclick={() => (monthlyMode = "fixed")}>DAY {dayOfMonth}</button
          >
          <button
            class="seg-btn"
            class:active={monthlyMode === "relative"}
            onclick={() => (monthlyMode = "relative")}
          >
            {relativeWeek === -1
              ? "LAST"
              : ["", "1ST", "2ND", "3RD", "4TH"][relativeWeek]}
            {relativeDay.toUpperCase()}
          </button>
        </div>
      {/if}

      {#if recurType !== "none"}
        <div class="field-row until-row">
          <span class="field-sublabel">UNTIL (OPTIONAL)</span>
          <input class="date-input" type="date" bind:value={untilDate} />
        </div>
      {/if}
    </div>

    <!-- Description -->
    <div class="field-card">
      <label class="field-label"
        >DESCRIPTION <span class="optional">(OPTIONAL)</span></label
      >
      <textarea
        class="desc-textarea"
        placeholder="NOTES..."
        rows="3"
        bind:value={description}
      ></textarea>
    </div>
  </div>

  <!-- Footer -->
  <div class="screen-footer">
    <button class="save-btn" onclick={handleSave} disabled={saving}>
      {saving ? "SAVING..." : "SAVE EVENT"}
    </button>
  </div>
</div>

<style>
  .add-event-screen {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-base);
    z-index: 100;
    font-family: var(--font-mono);
  }

  /* Header */
  .screen-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #000;
    padding: var(--space-s) var(--space-s);
    flex-shrink: 0;
  }

  .close-btn {
    background: var(--red-bg);
    color: #fff;
    border: none;
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: var(--step-n2);
    padding: 4px 10px;
    cursor: pointer;
    letter-spacing: 0.05em;
  }

  .screen-title {
    color: #fff;
    font-weight: 700;
    font-size: var(--step-0);
    letter-spacing: 0.08em;
  }

  /* Body */
  .screen-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-s);
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }

  /* Hero title */
  .field-hero {
    border: 2px solid #000;
    padding: var(--space-s);
    position: relative;
  }
  .field-hero.error {
    border-color: var(--red-bg);
  }

  .hero-input {
    font-family: var(--font-mono);
    font-size: var(--step-3);
    font-weight: 700;
    color: var(--text-primary);
    background: transparent;
    border: none;
    outline: none;
    width: 100%;
    text-transform: uppercase;
    caret-color: #000;
  }
  .hero-input::placeholder {
    color: var(--text-muted);
  }

  .field-error {
    font-size: var(--step-n2);
    color: var(--red-bg);
    font-weight: 700;
    position: absolute;
    bottom: 4px;
    right: 8px;
  }

  /* Card */
  .field-card {
    border: 2px solid #000;
    padding: var(--space-s);
    background: var(--bg-surface);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    box-shadow: 3px 3px 0 #000;
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

  .field-hint {
    font-size: var(--step-n2);
    color: var(--text-muted);
  }

  .optional {
    font-weight: 400;
    color: var(--text-muted);
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  /* Inputs */
  .date-input,
  .time-input {
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
    background: var(--bg-input);
    border: 2px solid #000;
    padding: var(--space-2xs) var(--space-xs);
    outline: none;
    flex: 1;
  }
  .time-input {
    max-width: 120px;
  }

  /* Segmented control */
  .seg-control {
    display: flex;
    border: 2px solid #000;
  }
  .seg-wrap {
    flex-wrap: wrap;
  }

  .seg-btn {
    flex: 1;
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 700;
    background: var(--bg-surface);
    color: var(--text-primary);
    border: none;
    border-right: 2px solid #000;
    padding: var(--space-2xs) var(--space-xs);
    cursor: pointer;
    white-space: nowrap;
    letter-spacing: 0.05em;
  }
  .seg-btn:last-child {
    border-right: none;
  }
  .seg-btn.active {
    background: #000;
    color: #fff;
  }

  /* Toggle row */
  .toggle-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-s);
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    font-family: var(--font-mono);
    width: 100%;
  }

  .checkbox {
    width: 24px;
    height: 24px;
    min-width: 24px;
    border: 2px solid #000;
    background: var(--bg-input);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--step-n1);
    font-weight: 900;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .checkbox.checked {
    background: #000;
    color: #fff;
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-label {
    font-weight: 700;
    font-size: var(--step-n1);
    color: var(--text-primary);
    letter-spacing: 0.05em;
  }

  .toggle-hint {
    font-size: var(--step-n2);
    color: var(--text-muted);
  }

  /* Time slots */
  .slot-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .flex-1 {
    flex: 1;
    max-width: none;
  }

  .remove-btn {
    background: var(--red-bg);
    color: #fff;
    border: 2px solid #000;
    font-family: var(--font-mono);
    font-weight: 900;
    font-size: var(--step-n2);
    width: 32px;
    height: 32px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .add-slot-btn {
    border: 2px dashed #000;
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

  /* Day grid */
  .day-grid {
    display: flex;
    gap: var(--space-2xs);
    margin-top: var(--space-2xs);
  }

  .day-btn {
    width: 36px;
    height: 36px;
    border: 2px solid #000;
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
    background: #000;
    color: #fff;
  }

  /* Until row */
  .until-row {
    margin-top: var(--space-xs);
  }

  /* Description */
  .desc-textarea {
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    color: var(--text-primary);
    background: var(--bg-input);
    border: 2px solid #000;
    padding: var(--space-xs);
    outline: none;
    resize: vertical;
    width: 100%;
    text-transform: uppercase;
  }
  .desc-textarea::placeholder {
    color: var(--text-muted);
  }

  /* Footer */
  .screen-footer {
    padding: var(--space-s);
    border-top: 2px solid #000;
    background: var(--bg-base);
    flex-shrink: 0;
  }

  .save-btn {
    width: 100%;
    background: #000;
    color: #fff;
    border: none;
    font-family: var(--font-mono);
    font-size: var(--step-0);
    font-weight: 700;
    padding: var(--space-s);
    cursor: pointer;
    letter-spacing: 0.1em;
    transition: opacity 0.1s;
  }
  .save-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .save-btn:active:not(:disabled) {
    background: #333;
  }
</style>
