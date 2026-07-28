<script lang="ts">
  import type { ScheduleRule, DayOfWeek } from "../../habits/habits";
  import { CalendarDate, parseDate } from "@internationalized/date";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import DateField from "./DateField.svelte";
  import EventRecurrenceField from "./EventRecurrenceField.svelte";
  import {
    buildEventScheduleRules,
    monthlyAnchors,
    type RecurType,
  } from "../../cal_events/event-schedule-rules";

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
  const todayIso = new Date().toISOString().slice(0, 10);
  let startDateStr = $state(todayIso);
  let startDateVal = $state<CalendarDate | undefined>(parseDate(todayIso));
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

  // Time slots (for point-in-time multi-slot events like medication). Slot 0 is
  // the start time above; the recurrence field edits only the extra slots.
  let _extraTimeSlots = $state<string[]>([]);
  let timeSlots = $derived([startTime, ..._extraTimeSlots]);

  // Recurrence
  let recurType = $state<RecurType>("none");
  let selectedDays = $state<Set<DayOfWeek>>(
    new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
  );
  let monthlyMode = $state<"fixed" | "relative">("fixed");

  // Monthly/yearly anchors derived from the start date (displayed by the
  // recurrence field, and re-derived inside buildEventScheduleRules).
  let anchors = $derived(monthlyAnchors(startDateStr));

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
        schedule_rules: buildEventScheduleRules({
          recurType,
          selectedDays,
          monthlyMode,
          startDateStr,
          until: untilDate,
          timed,
          hasEnd,
          timeSlots,
        }),
      });
      onClose();
    } finally {
      saving = false;
    }
  }
</script>

<BottomSheet isOpen title="New event" {onClose} class="add-event-sheet">
  <div class="event-fields">
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
        style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: var(--space-s);"
      >
        <span class="field-label" style="margin-bottom: 0;">
          {hasEnd ? "START & END" : "START"}
        </span>

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
      <DateField
        bind:date={startDateVal}
        bind:time={startTime}
        showTime={timed}
        onChange={() => (endError = null)}
      />

      <!-- End -->
      {#if hasEnd}
        <div style="margin-top: var(--space-s);">
          <DateField
            bind:date={endDateVal}
            bind:time={endTime}
            showTime={timed}
            onChange={() => (endError = null)}
          />
        </div>
      {/if}

      {#if endError}
        <span
          class="field-error"
          style="display: block; margin-top: var(--space-xs);">{endError}</span
        >
      {/if}
    </div>

    <!-- Schedule: Recurrence & Time slots -->
    <EventRecurrenceField
      bind:recurType
      bind:selectedDays
      bind:monthlyMode
      bind:untilDateVal
      bind:extraTimeSlots={_extraTimeSlots}
      {timed}
      {hasEnd}
      dayOfMonth={anchors.dayOfMonth}
      relativeWeek={anchors.relativeWeek}
      relativeDay={anchors.relativeDay}
    />

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
      <span class="field-label"
        >DESCRIPTION <span class="optional">(OPTIONAL)</span></span
      >
      <textarea
        class="desc-textarea"
        placeholder="NOTES..."
        rows="3"
        bind:value={description}
      ></textarea>
    </div>
  </div>

  {#snippet footer()}
    <button class="save-btn" onclick={handleSave} disabled={saving}>
      {saving ? "SAVING..." : "SAVE EVENT"}
    </button>
  {/snippet}
</BottomSheet>

<style>
  /* Body content wrapper — the sheet primitive owns the fixed-position chrome,
     scroll, padding, and max-width. This just stacks the form's cards and keeps
     the monospace type the old full-screen wrapper set for the whole screen. */
  .event-fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    width: 100%;
    font-family: var(--font-mono);
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

  .optional {
    font-weight: 400;
    color: var(--text-muted);
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
