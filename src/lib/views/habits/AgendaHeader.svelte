<script lang="ts">
  // The agenda's date bar: a monospace ASCII box with the selected day and
  // prev/next-day arrows. Presentational — the caller owns the current date and
  // reacts to the two navigation callbacks.
  //
  // **It said `DAILY AGENDA` above the date until the face took a header**
  // (ADR-0114 §3). This box is the fourth thing that was calling a face by a
  // name of its own, alongside the three titles §3 names by hand — the record
  // reads "`AgendaView` has no header at all and gains one", which was true of
  // the `.page-header` idiom and never of this box. The name is the roster's
  // now, drawn once in the pinned header above; what is left here is the job
  // this bar actually has, which is moving a day.
  let {
    dateLabel,
    onPrev,
    onNext,
  }: {
    dateLabel: string;
    onPrev: () => void;
    onNext: () => void;
  } = $props();
</script>

<header class="agenda-view-header">
  <div class="agenda-ascii-box">
    <div class="agenda-ascii-row">
      <button
        type="button"
        class="nav-arrow"
        onclick={onPrev}
        aria-label="Previous day"
      >
        &lt;
      </button>
      <div class="agenda-ascii-date">{dateLabel.toUpperCase()}</div>
      <button
        type="button"
        class="nav-arrow"
        onclick={onNext}
        aria-label="Next day"
      >
        &gt;
      </button>
    </div>
  </div>
</header>

<style>
  .agenda-view-header {
    margin-bottom: var(--space-m);
    animation: fadeIn 0.4s ease-out;
  }

  .agenda-ascii-box {
    padding: var(--space-s) var(--space-m);
    background: var(--ink);
    color: var(--paper);
    font-family: var(--font-mono);
    text-align: center;
  }

  .agenda-ascii-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .nav-arrow {
    background: none;
    border: none;
    font-family: var(--font-mono);
    font-size: var(--step-3);
    font-weight: 900;
    color: var(--text-muted);
    cursor: pointer;
    padding: var(--space-2xs) var(--space-xs);
  }
  .nav-arrow:hover {
    color: var(--paper);
  }

  /* The date is what the box is for now, so it takes the weight the retired
     title carried and sits on the row's centre line rather than under it. */
  .agenda-ascii-date {
    font-size: var(--step-0);
    font-weight: 900;
    color: var(--paper);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
