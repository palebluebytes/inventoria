<script lang="ts">
  import type {
    CalEventBlueprint,
    OccurrenceRecord,
    ProjectedSlot,
  } from "../../cal_events/cal_events";

  let {
    blueprint,
    slot,
    occurrence,
    nowMs,
    onConfirm,
  }: {
    blueprint: CalEventBlueprint;
    slot: ProjectedSlot;
    occurrence: OccurrenceRecord | undefined;
    nowMs: number;
    onConfirm: (calEventId: string, slotId?: string) => Promise<void>;
  } = $props();

  // Derive temporal state
  let slotMs = $derived.by(() => {
    const [h, m] = slot.scheduledTime.split(":").map(Number);
    const today = new Date(nowMs);
    return Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
      h,
      m
    );
  });

  let missedWindowMs = 60 * 60 * 1000; // 1 hour window

  let isConfirmed = $derived(!!occurrence);
  let isPast = $derived(nowMs > slotMs);
  let isMissed = $derived(
    slot.isTracking && !isConfirmed && nowMs > slotMs + missedWindowMs
  );
  let isImminent = $derived(
    !isConfirmed && !isPast && nowMs >= slotMs - 30 * 60 * 1000
  );

  let confirmedTimeLabel = $derived.by(() => {
    if (!occurrence) return "";
    const d = new Date(occurrence.time);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  });

  let durationLabel = $derived.by(() => {
    if (!slot.dtendTime) return "";
    const [sh, sm] = slot.scheduledTime.split(":").map(Number);
    const [eh, em] = slot.dtendTime.split(":").map(Number);
    const totalMin = eh * 60 + em - (sh * 60 + sm);
    if (totalMin <= 0) return "";
    if (totalMin < 60) return `${totalMin} MIN`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}H ${m}M` : `${h} HR`;
  });

  async function handleClick() {
    if (!slot.isTracking || isConfirmed || isMissed) return;
    await onConfirm(slot.calEventId, slot.slotId);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="event-item"
  class:is-tracking={slot.isTracking}
  class:is-appointment={!slot.isTracking}
  class:is-confirmed={isConfirmed}
  class:is-missed={isMissed}
  class:is-past={isPast && !isConfirmed && !isMissed}
  class:is-imminent={isImminent}
  onclick={handleClick}
  role={slot.isTracking ? "button" : "presentation"}
  tabindex={slot.isTracking ? 0 : -1}
>
  {#if slot.isTracking}
    <div
      class="tracking-dot"
      class:confirmed={isConfirmed}
      class:missed={isMissed}
    >
      {#if isConfirmed}✓{:else if isMissed}✕{:else}!{/if}
    </div>
  {:else}
    <div class="appt-dot"></div>
  {/if}

  <div class="event-content">
    <span class="event-title">{blueprint.title.toUpperCase()}</span>
    {#if blueprint.description}
      <span class="event-desc">{blueprint.description}</span>
    {/if}
  </div>

  <div class="event-meta">
    {#if isConfirmed}
      <span class="confirmed-badge">DONE {confirmedTimeLabel}</span>
    {:else if isMissed}
      <span class="missed-badge">MISSED</span>
    {:else if isImminent}
      <span class="now-badge">● NOW</span>
    {:else if !slot.isTracking && slot.hasEnd}
      {#if durationLabel}
        <span class="duration-badge">{durationLabel}</span>
      {/if}
      <span class="appt-badge">APPT</span>
    {:else if !slot.isTracking}
      <span class="appt-badge">APPT</span>
    {/if}
  </div>
</div>

<style>
  .event-item {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    padding: var(--space-xs) var(--space-s);
    background: var(--bg-surface);
    font-family: var(--font-mono);
    user-select: none;
    outline: none;
    transition: background-color 0.1s;
    -webkit-tap-highlight-color: transparent;
    min-height: 48px;
    width: 100%;
  }

  /* Compliance Event — tappable */
  .event-item.is-tracking {
    cursor: pointer;
    background-color: #fffbea;
  }
  .event-item.is-tracking:active {
    background-color: var(--amber-bg);
  }
  .event-item.is-tracking.is-imminent {
    background-color: #fff8d6;
  }

  /* Confirmed */
  .event-item.is-confirmed {
    background-color: var(--green-bg);
    cursor: default;
  }

  /* Missed */
  .event-item.is-missed {
    background-color: var(--red-bg);
    cursor: default;
  }

  /* Appointment — informational */
  .event-item.is-appointment {
    background: repeating-linear-gradient(
      -45deg,
      #f4f4f5,
      #f4f4f5 4px,
      #e4e4e7 4px,
      #e4e4e7 8px
    );
    cursor: default;
  }
  .event-item.is-appointment.is-past {
    opacity: 0.5;
  }

  /* Dots / indicators */
  .tracking-dot {
    width: 24px;
    height: 24px;
    min-width: 24px;
    background: var(--amber-bg);
    border: 2px solid #000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: var(--step-n2);
    color: #000;
    flex-shrink: 0;
  }
  .tracking-dot.confirmed {
    background: var(--green-bg);
  }
  .tracking-dot.missed {
    background: var(--red-bg);
    color: #fff;
  }

  .appt-dot {
    width: 8px;
    height: 8px;
    min-width: 8px;
    background: var(--text-muted);
    flex-shrink: 0;
  }

  /* Content */
  .event-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .event-title {
    font-weight: 700;
    font-size: var(--step-n1);
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .event-item.is-appointment .event-title {
    color: var(--text-secondary);
  }
  .event-item.is-past .event-title {
    color: var(--text-muted);
  }

  .event-desc {
    font-size: var(--step-n2);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Meta / badges */
  .event-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    flex-shrink: 0;
  }

  .confirmed-badge {
    font-size: var(--step-n2);
    font-weight: 700;
    background: #000;
    color: var(--green-bg);
    padding: 2px 6px;
    letter-spacing: 0.05em;
  }

  .missed-badge {
    font-size: var(--step-n2);
    font-weight: 700;
    background: #000;
    color: var(--red-bg);
    padding: 2px 6px;
    letter-spacing: 0.05em;
  }

  .now-badge {
    font-size: var(--step-n2);
    font-weight: 700;
    background: #000;
    color: #fff;
    padding: 2px 6px;
    letter-spacing: 0.05em;
  }

  .duration-badge {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    padding: 1px 4px;
  }

  .appt-badge {
    font-size: var(--step-n2);
    font-weight: 700;
    background: var(--text-secondary);
    color: #fff;
    padding: 2px 6px;
    letter-spacing: 0.05em;
  }
</style>
