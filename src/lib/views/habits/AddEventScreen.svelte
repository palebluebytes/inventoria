<script lang="ts">
  import type { ScheduleRule, DayOfWeek } from "../../habits/habits";
  import { DatePicker } from "bits-ui";
  import { CalendarDate, parseDate } from "@internationalized/date";
  import CalendarBlank from "phosphor-svelte/lib/CalendarBlank";

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
      timed: boolean;
      schedule_rules?: ScheduleRule;
    }) => Promise<void>;
    onClose: () => void;
  } = $props();

  // --------------- Form state ---------------

  // Title
  let title = $state("");

  // Start date + time
  const todayDate = new Date();
  let startDateStr = $state(todayDate.toISOString().slice(0, 10));
  let startDateVal = $state<CalendarDate | undefined>(parseDate(startDateStr));
  $effect(() => {
    if (startDateVal) {
      startDateStr = startDateVal.toString();
    }
  });

  let startTime = $state("08:00");

  // Timed or untimed
  let timed = $state(true);

  // End Date/Time Toggle
  let hasEnd = $state(false);
  let endDateStr = $state("");
  let endDateVal = $state<CalendarDate | undefined>(undefined);
  $effect(() => {
    if (endDateVal) {
      endDateStr = endDateVal.toString();
    }
  });

  let endTime = $state("");
  let endError = $state<string | null>(null);

  // Tracking (default: unchecked)
  let tracking = $state(false);

  function toggleTracking() {
    tracking = !tracking;
  }

  // Time slots (for point-in-time multi-slot events like medication)
  let _extraTimeSlots = $state<string[]>([]);
  let timeSlots = $derived([startTime, ..._extraTimeSlots]);

  function addTimeSlot() {
    _extraTimeSlots = [..._extraTimeSlots, "20:00"];
  }

  function removeTimeSlot(i: number) {
    if (i === 0) {
      if (_extraTimeSlots.length > 0) {
        startTime = _extraTimeSlots[0];
        _extraTimeSlots = _extraTimeSlots.slice(1);
      }
    } else {
      _extraTimeSlots = _extraTimeSlots.filter((_, idx) => idx !== i - 1);
    }
  }

  function updateTimeSlot(i: number, val: string) {
    if (i === 0) {
      startTime = val;
    } else {
      _extraTimeSlots = _extraTimeSlots.map((t, idx) =>
        idx === i - 1 ? val : t
      );
    }
  }

  // Recurrence
  type RecurType = "none" | "specific_days" | "weekly" | "monthly" | "yearly";
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
  let selectedDays = $state<Set<DayOfWeek>>(
    new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
  );
  function toggleDay(d: DayOfWeek) {
    const next = new Set(selectedDays);
    next.has(d) ? next.delete(d) : next.add(d);
    selectedDays = next;
  }

  // monthly sub-type
  let monthlyMode = $state<"fixed" | "relative">("fixed");
  const startDateObj = $derived(new Date(startDateStr + "T00:00:00Z"));
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
  let untilDateVal = $state<CalendarDate | undefined>(undefined);
  $effect(() => {
    if (untilDateVal) {
      untilDate = untilDateVal.toString();
    } else {
      untilDate = "";
    }
  });

  // Description
  let description = $state("");

  // --------------- Derived dtstart ISO ---------------
  let dtstart = $derived(
    timed ? `${startDateStr}T${startTime}:00Z` : `${startDateStr}T00:00:00Z`
  );
  let dtend = $derived(
    hasEnd && endDateStr
      ? timed && endTime
        ? `${endDateStr}T${endTime}:00Z`
        : `${endDateStr}T00:00:00Z`
      : undefined
  );

  // --------------- Build schedule_rules ---------------
  function buildScheduleRules(): ScheduleRule | undefined {
    const until = untilDate || undefined;

    let targets: { id: string; time_hint?: string }[] | undefined = undefined;
    if (timed && !hasEnd && timeSlots.length > 1) {
      targets = timeSlots.map((t, i) => ({
        id: `slot_${i}`,
        time_hint: t,
      }));
    }

    switch (recurType) {
      case "none":
        return undefined;
      case "specific_days":
        if (selectedDays.size === 7) {
          return { type: "daily_multiple", count: 1, targets, until };
        }
        return {
          type: "weekly_days",
          days: Array.from(selectedDays),
          targets,
          until,
        };
      case "weekly":
        return { type: "weekly_flexible", count: 1, targets, until };
      case "monthly":
        if (monthlyMode === "fixed") {
          return {
            type: "monthly_fixed",
            day_of_month: dayOfMonth,
            targets,
            until,
          };
        } else {
          return {
            type: "monthly_relative",
            week: relativeWeek,
            day: relativeDay,
            targets,
            until,
          };
        }
      case "yearly":
        return {
          type: "yearly_fixed",
          month: monthOfYear,
          day_of_month: dayOfMonth,
          targets,
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

    if (hasEnd) {
      if (!endDateStr) {
        endError = "END DATE IS REQUIRED";
        return;
      }
      if (timed && !endTime) {
        endError = "END TIME IS REQUIRED";
        return;
      }
      let startMs: number;
      let endMs: number;
      if (timed) {
        startMs = new Date(`${startDateStr}T${startTime}:00Z`).getTime();
        endMs = new Date(`${endDateStr}T${endTime}:00Z`).getTime();
      } else {
        startMs = new Date(`${startDateStr}T00:00:00Z`).getTime();
        endMs = new Date(`${endDateStr}T00:00:00Z`).getTime();
      }
      if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
        endError = timed
          ? "END TIME MUST BE LATER THAN START TIME"
          : "END DATE MUST BE LATER THAN START DATE";
        return;
      }
    }
    endError = null;

    saving = true;
    try {
      await onSave({
        title: title.trim(),
        dtstart,
        dtend,
        description: description.trim() || undefined,
        tracking,
        timed,
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
  {#snippet calendarContent()}
    <DatePicker.Portal>
      <DatePicker.Content sideOffset={4} align="start" class="bits-calendar">
        <DatePicker.Calendar class="bits-calendar-wrapper">
          {#snippet children({ months, weekdays })}
            <DatePicker.Header class="bits-calendar-header">
              <DatePicker.PrevButton class="bits-nav-btn"
                >◀</DatePicker.PrevButton
              >
              <DatePicker.Heading class="bits-heading" />
              <DatePicker.NextButton class="bits-nav-btn"
                >▶</DatePicker.NextButton
              >
            </DatePicker.Header>
            {#each months as month}
              <DatePicker.Grid class="bits-grid">
                <DatePicker.GridHead>
                  <DatePicker.GridRow class="bits-weekdays">
                    {#each weekdays as weekday}
                      <DatePicker.HeadCell class="bits-weekday-cell">
                        {weekday.slice(0, 2)}
                      </DatePicker.HeadCell>
                    {/each}
                  </DatePicker.GridRow>
                </DatePicker.GridHead>
                <DatePicker.GridBody>
                  {#each month.weeks as weekDates}
                    <DatePicker.GridRow class="bits-grid-row">
                      {#each weekDates as date}
                        <DatePicker.Cell
                          {date}
                          month={month.value}
                          class="bits-cell"
                        >
                          <DatePicker.Day class="bits-day"
                            >{date.day}</DatePicker.Day
                          >
                        </DatePicker.Cell>
                      {/each}
                    </DatePicker.GridRow>
                  {/each}
                </DatePicker.GridBody>
              </DatePicker.Grid>
            {/each}
          {/snippet}
        </DatePicker.Calendar>
      </DatePicker.Content>
    </DatePicker.Portal>
  {/snippet}

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

    <!-- Date/Time Selection -->
    <div class="field-card" class:error={!!endError}>
      <div
        class="field-header"
        style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: var(--space-sm);"
      >
        <label class="field-label" style="margin-bottom: 0;">
          {hasEnd ? "START & END" : "START"}
        </label>

        <div style="display: flex; align-items: center; gap: var(--space-s);">
          <button
            type="button"
            style="display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 0.75rem; font-weight: 700; background: none; border: none; cursor: pointer; color: var(--text-primary); padding: 0;"
            onclick={() => {
              timed = !timed;
              endError = null;
            }}
          >
            <div class="inline-checkbox" class:checked={timed}>
              {#if timed}✓{/if}
            </div>
            TIMED
          </button>

          <button
            type="button"
            class="text-btn"
            style="font-family: var(--font-mono); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; background: none; border: none; cursor: pointer; color: var(--text-primary); text-decoration: underline; padding: 0;"
            onclick={() => {
              if (!hasEnd) {
                // Auto-fill end = start + 1 hour
                endDateVal = startDateVal;
                if (timed && startTime) {
                  const [hh, mm] = startTime.split(":").map(Number);
                  const newHh = hh + 1;
                  if (newHh >= 24) {
                    endTime = `${String(newHh - 24).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
                    if (endDateVal) endDateVal = endDateVal.add({ days: 1 });
                  } else {
                    endTime = `${String(newHh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
                  }
                } else {
                  endTime = "";
                }
              } else {
                endDateVal = undefined;
                endTime = "";
              }
              hasEnd = !hasEnd;
              endError = null;
            }}
          >
            {hasEnd ? "✕ REMOVE END" : "+ ADD END"}
          </button>
        </div>
      </div>

      <!-- Start -->
      <DatePicker.Root
        bind:value={startDateVal}
        onValueChange={() => (endError = null)}
      >
        <div class="date-time-row">
          <DatePicker.Input class="date-input">
            {#snippet children({ segments })}
              {#each segments as { part, value }}
                <DatePicker.Segment {part}>{value}</DatePicker.Segment>
              {/each}
            {/snippet}
          </DatePicker.Input>
          <DatePicker.Trigger class="bits-trigger" aria-label="Open calendar"
            ><CalendarBlank size={16} /></DatePicker.Trigger
          >
          {#if timed}
            <input
              class="time-input"
              type="time"
              bind:value={startTime}
              oninput={() => (endError = null)}
            />
          {/if}
        </div>
        {@render calendarContent()}
      </DatePicker.Root>

      <!-- End -->
      {#if hasEnd}
        <DatePicker.Root
          bind:value={endDateVal}
          onValueChange={() => (endError = null)}
        >
          <div class="date-time-row" style="margin-top: var(--space-sm);">
            <DatePicker.Input class="date-input">
              {#snippet children({ segments })}
                {#each segments as { part, value }}
                  <DatePicker.Segment {part}>{value}</DatePicker.Segment>
                {/each}
              {/snippet}
            </DatePicker.Input>
            <DatePicker.Trigger class="bits-trigger" aria-label="Open calendar"
              ><CalendarBlank size={16} /></DatePicker.Trigger
            >
            {#if timed}
              <input
                class="time-input"
                type="time"
                bind:value={endTime}
                oninput={() => (endError = null)}
              />
            {/if}
          </div>
          {@render calendarContent()}
        </DatePicker.Root>
      {/if}

      {#if endError}
        <span
          class="field-error"
          style="display: block; margin-top: var(--space-xs);">{endError}</span
        >
      {/if}
    </div>

    <!-- Schedule: Recurrence & Time slots -->
    <div class="field-card">
      <label class="field-label">RECURRENCE</label>
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
            <DatePicker.Root bind:value={untilDateVal}>
              <div class="date-time-row">
                <DatePicker.Input class="date-input">
                  {#snippet children({ segments })}
                    {#each segments as { part, value }}
                      <DatePicker.Segment {part}>{value}</DatePicker.Segment>
                    {/each}
                  {/snippet}
                </DatePicker.Input>
                <DatePicker.Trigger
                  class="bits-trigger"
                  aria-label="Open calendar"
                  ><CalendarBlank size={14} /></DatePicker.Trigger
                >
              </div>
              {@render calendarContent()}
            </DatePicker.Root>
          </div>
        </div>
      {/if}

      <!-- Time slots: shown for any point-in-time event without a block end -->
      {#if timed && !hasEnd}
        <div
          class="time-slots-section"
          style={recurType !== "none"
            ? "border-top: 2px dashed var(--border-accent); padding-top: var(--space-sm); margin-top: var(--space-sm);"
            : "padding-top: var(--space-sm); margin-top: var(--space-sm);"}
        >
          {#if _extraTimeSlots.length > 0}
            <label
              class="field-sublabel"
              style="margin-bottom: var(--space-xs); display: block;"
              >ADDITIONAL TIMES</label
            >
            {#each _extraTimeSlots as slot, i}
              <div class="slot-row" style="margin-bottom: var(--space-xs);">
                <div class="input-wrapper">
                  <input
                    class="time-input flex-1"
                    type="time"
                    value={slot}
                    oninput={(e) =>
                      updateTimeSlot(
                        i + 1,
                        (e.target as HTMLInputElement).value
                      )}
                  />
                </div>
                <button
                  class="remove-btn"
                  onclick={() => removeTimeSlot(i + 1)}
                  aria-label="Remove">✕</button
                >
              </div>
            {/each}
          {/if}
          <button
            class="add-slot-btn"
            style="display: block; margin: 0 auto; {_extraTimeSlots.length === 0
              ? ''
              : 'margin-top: var(--space-xs);'}"
            onclick={addTimeSlot}>+ ADD ANOTHER TIME</button
          >
        </div>
      {/if}
    </div>

    <!-- Requires confirmation -->
    <div class="field-card">
      <button
        type="button"
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
    position: relative;
  }
  .field-card.error {
    border-color: var(--red-bg);
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

  /* Date + trigger + optional time input row */
  .date-time-row {
    display: flex;
    align-items: stretch;
    gap: 0;
    width: 100%;
  }

  /* Input wrapper & icons */
  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
  }

  .input-wrapper input {
    width: 100%;
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
  .seg-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 2px;
    background: #000;
    border: 2px solid #000;
  }
  .seg-grid .seg-btn {
    border: none !important;
  }
  .seg-grid .span-2 {
    grid-column: span 2;
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

  /* Inline checkbox for Timed */
  .inline-checkbox {
    width: 14px;
    height: 14px;
    border: 2px solid #000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 900;
  }
  .inline-checkbox.checked {
    background: #000;
    color: #fff;
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

  /* Bits UI Calendar Brutalist Styles */
  :global(.bits-calendar) {
    background: #fff;
    border: 2px solid #000;
    box-shadow: 4px 4px 0 #000;
    padding: var(--space-s);
    font-family: var(--font-mono);
    z-index: 100;
    /* Suppress any background bits-ui adds to the floating element itself */
    color: #000;
  }
  /* bits-ui wraps Content in a data-bits-* div — reset any inherited bg */
  :global([data-bits-date-picker-content]) {
    background: transparent !important;
  }
  :global(.bits-calendar-header) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-s);
    padding-bottom: var(--space-xs);
    border-bottom: 2px solid #000;
  }
  :global(.bits-nav-btn) {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: var(--step-0);
    padding: var(--space-xs);
  }
  :global(.bits-trigger) {
    background: transparent;
    border: none;
    border-left: 2px solid #000;
    cursor: pointer;
    padding: 0 var(--space-xs);
    margin-left: auto;
    display: flex;
    align-items: center;
    height: 100%;
    color: var(--text-secondary, #666);
  }
  :global(.bits-trigger:hover) {
    background: var(--bg-input, #f5f5f5);
  }
  :global(.bits-nav-btn:hover) {
    background: var(--bg-input);
  }
  :global(.bits-heading) {
    font-weight: 700;
    text-transform: uppercase;
  }
  :global(.bits-weekdays) {
    display: flex;
  }
  :global(.bits-weekday-cell) {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: var(--step-n1);
  }
  :global(.bits-grid-row) {
    display: flex;
  }
  :global(.bits-cell) {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  :global(.bits-day) {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--step-n1);
  }
  :global(.bits-day:hover) {
    background: var(--bg-input);
  }
  :global(.bits-day[data-selected]) {
    background: var(--green-bg);
    border: 2px solid #000;
    font-weight: 900;
  }
  :global(.bits-day[data-today]) {
    text-decoration: underline;
    font-weight: 700;
  }
  :global(.date-input[data-invalid]) {
    border-color: red;
  }

  /* Native time input clock icon color */
  ::-webkit-calendar-picker-indicator {
    filter: invert(0);
    cursor: pointer;
  }
</style>
