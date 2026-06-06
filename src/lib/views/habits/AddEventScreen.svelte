<script lang="ts">
  import type { ScheduleRule, DayOfWeek } from "../../habits/habits";
  import AirDatepicker from "air-datepicker";
  import "air-datepicker/air-datepicker.css";
  import localeEn from "air-datepicker/locale/en";

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
  const today = new Date();
  let startDate = $state(today.toISOString().slice(0, 10));
  let startTime = $state("08:00");

  // Timed or untimed
  let timed = $state(true);

  // End Date/Time Toggle
  let hasEnd = $state(false);
  let endDate = $state(today.toISOString().slice(0, 10));
  let endTime = $state("09:00");
  let endError = $state<string | null>(null);

  // Tracking (default: unchecked)
  let tracking = $state(false);

  function toggleTracking() {
    tracking = !tracking;
  }

  // Svelte Pickers Actions
  function datePicker(
    node: HTMLInputElement,
    options: { value: string; onChange: (val: string) => void }
  ) {
    const dp = new AirDatepicker(node, {
      locale: localeEn,
      selectedDates: options.value
        ? [new Date(options.value + "T00:00:00")]
        : [],
      dateFormat: "yyyy-MM-dd",
      autoClose: true,
      onSelect({ date }) {
        if (date) {
          const d = Array.isArray(date) ? date[0] : date;
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          options.onChange(`${yyyy}-${mm}-${dd}`);
        }
      },
    });
    return {
      update(newOptions: { value: string; onChange: (val: string) => void }) {
        if (newOptions.value) {
          dp.selectDate(new Date(newOptions.value + "T00:00:00"), {
            updateTime: false,
            silent: true,
          });
        } else {
          dp.clear();
        }
      },
      destroy() {
        dp.destroy();
      },
    };
  }

  // Timepicker configuration and action
  function timePicker(
    node: HTMLInputElement,
    options: { value: string; onChange: (val: string) => void }
  ) {
    const [hours, minutes] = (options.value || "08:00").split(":").map(Number);
    const initialDate = new Date();
    initialDate.setHours(hours, minutes, 0, 0);

    const dp = new AirDatepicker(node, {
      locale: localeEn,
      timepicker: true,
      onlyTimepicker: true,
      timeFormat: "HH:mm",
      selectedDates: [initialDate],
      onSelect({ date }) {
        if (date) {
          const d = Array.isArray(date) ? date[0] : date;
          const hh = String(d.getHours()).padStart(2, "0");
          const mm = String(d.getMinutes()).padStart(2, "0");
          options.onChange(`${hh}:${mm}`);
        }
      },
    });
    return {
      update(newOptions: { value: string; onChange: (val: string) => void }) {
        if (newOptions.value) {
          const [hh, mm] = newOptions.value.split(":").map(Number);
          const d = new Date();
          d.setHours(hh, mm, 0, 0);
          dp.selectDate(d, { updateTime: true, silent: true });
        }
      },
      destroy() {
        dp.destroy();
      },
    };
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
  let dtstart = $derived(
    timed ? `${startDate}T${startTime}:00Z` : `${startDate}T00:00:00Z`
  );
  let dtend = $derived(
    hasEnd
      ? timed
        ? `${endDate}T${endTime}:00Z`
        : `${endDate}T00:00:00Z`
      : undefined
  );

  // --------------- Build schedule_rules ---------------
  function buildScheduleRules(): ScheduleRule | undefined {
    const until = untilDate || undefined;
    switch (recurType) {
      case "none":
        return undefined;
      case "daily":
        if (timed && !hasEnd && timeSlots.length > 1) {
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

    if (hasEnd) {
      let startMs: number;
      let endMs: number;
      if (timed) {
        startMs = new Date(`${startDate}T${startTime}:00Z`).getTime();
        endMs = new Date(`${endDate}T${endTime}:00Z`).getTime();
      } else {
        startMs = new Date(`${startDate}T00:00:00Z`).getTime();
        endMs = new Date(`${endDate}T00:00:00Z`).getTime();
      }
      if (endMs <= startMs) {
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

    <!-- Timed Toggle -->
    <div class="field-card">
      <button
        type="button"
        class="toggle-row"
        onclick={() => {
          timed = !timed;
          endError = null;
        }}
        aria-pressed={timed}
      >
        <div class="checkbox" class:checked={timed}>
          {#if timed}✓{/if}
        </div>
        <div class="toggle-text">
          <span class="toggle-label">TIMED EVENT</span>
          <span class="toggle-hint">
            {timed
              ? "Occurs at a specific time of day"
              : "All-day event — displays at the top of the schedule"}
          </span>
        </div>
      </button>
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
        <button
          type="button"
          class="text-btn"
          style="font-family: var(--font-mono); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; background: none; border: none; cursor: pointer; color: var(--text-primary); text-decoration: underline; padding: 0;"
          onclick={() => {
            hasEnd = !hasEnd;
            endError = null;
          }}
        >
          {hasEnd ? "✕ REMOVE END" : "+ ADD END"}
        </button>
      </div>

      <!-- Start -->
      <div class="field-row">
        <div class="input-wrapper">
          <input
            class="date-input"
            type="text"
            use:datePicker={{
              value: startDate,
              onChange: (val) => {
                startDate = val;
                endError = null;
              },
            }}
          />
          <span class="input-icon">📅</span>
        </div>
        {#if timed}
          <div class="input-wrapper">
            <input
              class="time-input"
              type="text"
              use:timePicker={{
                value: startTime,
                onChange: (val) => {
                  startTime = val;
                  endError = null;
                },
              }}
            />
            <span class="input-icon">🕒</span>
          </div>
        {/if}
      </div>

      <!-- End -->
      {#if hasEnd}
        <div
          class="field-row end-row"
          style="margin-top: var(--space-sm); padding-top: var(--space-sm); border-top: 2px dashed var(--border-accent);"
        >
          <div class="input-wrapper">
            <input
              class="date-input"
              type="text"
              use:datePicker={{
                value: endDate,
                onChange: (val) => {
                  endDate = val;
                  endError = null;
                },
              }}
            />
            <span class="input-icon">📅</span>
          </div>
          {#if timed}
            <div class="input-wrapper">
              <input
                class="time-input"
                type="text"
                use:timePicker={{
                  value: endTime,
                  onChange: (val) => {
                    endTime = val;
                    endError = null;
                  },
                }}
              />
              <span class="input-icon">🕒</span>
            </div>
          {/if}
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
    <div class="field-card">
      <label class="field-label">RECURRENCE</label>
      <div class="seg-control seg-grid" style="margin-bottom: var(--space-s);">
        {#each [["daily", "DAILY"], ["weekly", "WEEKLY"], ["monthly", "MONTHLY"], ["yearly", "YEARLY"], ["specific_days", "DAYS"]] as [val, label]}
          <button
            class="seg-btn"
            class:active={recurType === val}
            class:span-2={val === "specific_days"}
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
        <div
          class="field-row until-row"
          style="margin-top: var(--space-s); margin-bottom: var(--space-s);"
        >
          <span class="field-sublabel">UNTIL (OPTIONAL)</span>
          <div class="input-wrapper">
            <input
              class="date-input"
              type="text"
              use:datePicker={{
                value: untilDate,
                onChange: (val) => {
                  untilDate = val;
                },
              }}
            />
            <span class="input-icon">📅</span>
          </div>
        </div>
      {/if}

      <!-- Time slots (only for point-in-time + daily or none) -->
      {#if timed && !hasEnd && (recurType === "none" || recurType === "daily")}
        <div
          class="time-slots-section"
          style={recurType !== "none"
            ? "border-top: 2px dashed var(--border-accent); padding-top: var(--space-sm); margin-top: var(--space-sm);"
            : ""}
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
                    type="text"
                    use:timePicker={{
                      value: slot,
                      onChange: (val) => updateTimeSlot(i + 1, val),
                    }}
                  />
                  <span class="input-icon">🕒</span>
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
            style={_extraTimeSlots.length === 0 ? "margin-top: 0;" : ""}
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

  /* Input wrapper & icons */
  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
  }

  .input-wrapper .input-icon {
    position: absolute;
    right: var(--space-xs);
    pointer-events: none;
    font-size: var(--step-n1);
    color: var(--text-secondary);
  }

  .input-wrapper input {
    padding-right: calc(var(--space-xs) + 24px) !important;
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

  /* Air Datepicker Brutalist Overrides */
  :global(.air-datepicker) {
    --adp-font-family: var(--font-mono) !important;
    --adp-font-size: var(--step-n1) !important;
    --adp-border-color: #000 !important;
    --adp-border-radius: 0 !important;
    --adp-background-color: var(--bg-surface) !important;
    --adp-background-color-hover: var(--bg-input) !important;
    --adp-color: var(--text-primary) !important;
    --adp-color-secondary: var(--text-secondary) !important;
    --adp-color-current-date: #000 !important;
    --adp-cell-border-radius: 0 !important;
    --adp-cell-background-color-selected: var(--green-bg) !important;
    --adp-cell-background-color-selected-hover: var(--green-bg) !important;
    --adp-accent-color: #000 !important;
    --adp-day-name-color: #000 !important;

    border: 2px solid #000 !important;
    box-shadow: 4px 4px 0 #000 !important;
  }

  :global(.air-datepicker-nav) {
    border-bottom: 2px solid #000 !important;
    background: #000 !important;
    color: #fff !important;
  }

  :global(.air-datepicker-nav--title),
  :global(.air-datepicker-nav--title i) {
    color: #fff !important;
    font-weight: 700 !important;
    font-family: var(--font-mono) !important;
  }

  :global(.air-datepicker-nav--action) {
    color: #fff !important;
  }
  :global(.air-datepicker-nav--action:hover) {
    background: var(--text-secondary) !important;
    color: #000 !important;
  }

  :global(.air-datepicker-body--day-name) {
    font-weight: 700 !important;
    color: #000 !important;
  }

  :global(.air-datepicker-cell.-current-) {
    border: 2px solid #000 !important;
    font-weight: 700 !important;
    text-decoration: underline !important;
  }

  :global(.air-datepicker-cell.-selected-) {
    background: var(--green-bg) !important;
    color: #000 !important;
    border: 2px solid #000 !important;
    font-weight: 900 !important;
  }

  /* Time Picker styling overrides */
  :global(.air-datepicker-time) {
    --adp-time-track-height: 4px !important;
    --adp-time-track-color: #000 !important;
    --adp-time-track-color-hover: #000 !important;
    --adp-time-thumb-size: 16px !important;
    border-top: 2px solid #000 !important;
    padding: var(--space-s) !important;
    background: var(--bg-surface) !important;
  }

  /* Target the native range inputs of the timepicker */
  :global(.air-datepicker-time--row input[type="range"]) {
    -webkit-appearance: none !important;
    appearance: none !important;
    background: transparent !important;
    width: 100% !important;
  }

  /* Focus outline */
  :global(.air-datepicker-time--row input[type="range"]:focus) {
    outline: none !important;
  }

  /* Webkit thumb (Chrome, Safari, Edge) */
  :global(.air-datepicker-time--row input[type="range"]::-webkit-slider-thumb) {
    -webkit-appearance: none !important;
    appearance: none !important;
    height: 18px !important;
    width: 18px !important;
    border: 2px solid #000 !important;
    background: var(--green-bg) !important;
    cursor: pointer !important;
    margin-top: -7px !important; /* Center the thumb on track */
    border-radius: 0 !important; /* Brutalist square */
  }

  /* Firefox thumb */
  :global(.air-datepicker-time--row input[type="range"]::-moz-range-thumb) {
    height: 18px !important;
    width: 18px !important;
    border: 2px solid #000 !important;
    background: var(--green-bg) !important;
    cursor: pointer !important;
    border-radius: 0 !important; /* Brutalist square */
  }

  /* Webkit track */
  :global(
    .air-datepicker-time--row input[type="range"]::-webkit-slider-runnable-track
  ) {
    width: 100% !important;
    height: 4px !important;
    cursor: pointer !important;
    background: #000 !important;
    border: none !important;
  }

  /* Firefox track */
  :global(.air-datepicker-time--row input[type="range"]::-moz-range-track) {
    width: 100% !important;
    height: 4px !important;
    cursor: pointer !important;
    background: #000 !important;
    border: none !important;
  }
</style>
