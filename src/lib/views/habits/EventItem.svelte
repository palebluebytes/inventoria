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
<!-- role/tabindex track `isTracking` together (button+0 vs presentation+-1),
     which the static check can't follow -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
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
      class="tracking-box"
      class:confirmed={isConfirmed}
      class:missed={isMissed}
    >
      {#if isConfirmed}✓{:else if isMissed}✕{:else}!{/if}
    </div>
  {/if}

  <div class="event-content">
    <span class="event-title">
      {#if !slot.isTracking}
        {blueprint.title.toUpperCase()}
      {:else}
        {blueprint.title.toUpperCase()}{#if blueprint.description}
          <span class="event-desc">({blueprint.description})</span>{/if}
      {/if}
    </span>
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
        <span class="duration-pill">{durationLabel}</span>
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
    align-items: stretch;
    background: var(--bg-surface);
    font-family: var(--font-mono);
    user-select: none;
    outline: none;
    transition: background-color 0.1s;
    -webkit-tap-highlight-color: transparent;
    min-height: 48px;
    width: 100%;
    flex: 1;
  }

  /* Compliance Event — tappable */
  .event-item.is-tracking {
    cursor: pointer;
    background-color: var(--bg-surface);
  }
  .event-item.is-tracking:active {
    background-color: var(--bg-input);
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
    background: var(--border); /* solid grey like mockup */
    cursor: default;
  }
  .event-item.is-appointment.is-past {
    opacity: 0.5;
  }

  /* Dots / indicators */
  .tracking-box {
    width: 48px;
    min-width: 48px;
    background: var(--ink);
    border-right: var(--edge);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: var(--step-0);
    color: var(--amber-bg);
    flex-shrink: 0;
  }
  .tracking-box.confirmed {
    background: var(--ink);
    color: var(--green-bg);
  }
  .tracking-box.missed {
    background: var(--ink);
    color: var(--red-bg);
  }

  /* Content */
  .event-content {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    padding: 0 var(--space-s);
  }

  .event-title {
    font-weight: 800;
    font-size: var(--step-0);
    color: var(--ink);
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
    font-weight: 400;
    font-size: var(--step-n1);
    color: var(--text-secondary);
    margin-left: 4px;
  }

  /* Meta / badges */
  .event-meta {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding-right: var(--space-s);
    flex-shrink: 0;
  }

  .confirmed-badge {
    font-size: var(--step-n2);
    font-weight: 700;
    background: var(--ink);
    color: var(--green-bg);
    padding: 2px 6px;
    letter-spacing: 0.05em;
  }

  .missed-badge {
    font-size: var(--step-n2);
    font-weight: 700;
    background: var(--ink);
    color: var(--red-bg);
    padding: 2px 6px;
    letter-spacing: 0.05em;
  }

  .now-badge {
    font-size: var(--step-n2);
    font-weight: 700;
    background: var(--ink);
    color: var(--paper);
    padding: 2px 6px;
    letter-spacing: 0.05em;
  }

  .duration-pill {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
    border: 1px solid var(--text-muted);
    padding: 2px 6px;
    border-radius: 12px;
  }

  .appt-badge {
    font-size: var(--step-n2);
    font-weight: 700;
    background: var(--ink);
    color: var(--paper);
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.05em;
  }
</style>
