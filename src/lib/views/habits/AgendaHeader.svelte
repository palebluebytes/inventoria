<script lang="ts">
  // The agenda's date header: a monospace ASCII box with the selected day and
  // prev/next-day arrows. Presentational — the caller owns the current date and
  // reacts to the two navigation callbacks.
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
    <div class="agenda-ascii-title-container">
      <button
        type="button"
        class="nav-arrow"
        onclick={onPrev}
        aria-label="Previous day"
      >
        &lt;
      </button>
      <div class="agenda-ascii-center">
        <div class="agenda-ascii-title">DAILY AGENDA</div>
        <div class="agenda-ascii-date">{dateLabel.toUpperCase()}</div>
      </div>
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

  .agenda-ascii-title-container {
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

  .agenda-ascii-center {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .agenda-ascii-title {
    font-size: var(--step-0);
    font-weight: 900;
    color: var(--paper);
  }

  .agenda-ascii-date {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-muted);
    margin-top: var(--space-3xs);
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
