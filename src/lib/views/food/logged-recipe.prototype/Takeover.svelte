<script lang="ts">
  import type { ConsumptionEvent } from "../../../stores/calorie.store";
  import Button from "../../../ui/Button.svelte";
  import DebugStrip from "./DebugStrip.svelte";
  import {
    DEMO_ID,
    PANTRY,
    addRow,
    draftFromEvent,
    isDirty,
    pretendCommit,
    removeRow,
    setRowAmount,
    setServings,
    stepRowAmount,
    totalCalories,
  } from "./draft";

  // THROWAWAY — variant C, "expanding takes the meal".
  //
  // **The claim: what the sheet was buying is WIDTH, not a second surface.** So
  // the editor gets the whole meal section — the list of that meal's rows steps
  // aside for it — and the rest of the day stays exactly where it was. No
  // backdrop, no portal, no scroll lock, nothing dimmed: the day's totals, the
  // other meals and the Way-in bar are all still on screen and still readable,
  // which is the one thing a bottom sheet over a phone cannot offer.
  //
  // Two states, and the component draws both: the closed row (a `›`, because
  // tapping it goes somewhere rather than growing something) and the pane. The
  // dashboard owns WHICH of a meal's recipes is open, because opening one has
  // to hide that meal's other rows — a fact no single row can know.
  //
  // With the room, the affordances are the sheet's: a line per ingredient at
  // the tap floor, its own amount field, ± either side, and a dock at the foot
  // carrying Save.
  let {
    item,
    open,
    onOpen,
    onBack,
  }: {
    item: ConsumptionEvent;
    open: boolean;
    onOpen: () => void;
    onBack: () => void;
  } = $props();

  // Seeded once, on purpose: see `Unfold`.
  // svelte-ignore state_referenced_locally
  let draft = $state(draftFromEvent(item));
  let adding = $state(false);
  let saved = $state(false);

  let total = $derived(totalCalories(draft));
  let dirty = $derived(isDirty(draft));
</script>

{#if !open}
  <!-- The closed state is today's row plus a chevron. A caret would promise the
       card grows; this one goes somewhere. -->
  <button type="button" class="closed" onclick={onOpen}>
    <span class="closed-text">
      <span class="closed-name"
        >{draft.name}{#if item.id === DEMO_ID}<span class="demo">DEMO</span
          >{/if}</span
      >
      <span class="closed-sub"
        >{draft.servings} serving{draft.servings === 1 ? "" : "s"} · {draft.rows
          .length} ingredients · {total} kcal</span
      >
    </span>
    <span class="chev" aria-hidden="true">›</span>
  </button>
{:else}
  <section class="pane" aria-label="{draft.name} — logged ingredients">
    <header class="pane-head">
      <button
        type="button"
        class="back"
        onclick={onBack}
        aria-label="Back to meal">‹</button
      >
      <span class="pane-name">{draft.name}</span>
      <span class="pane-total">{total} kcal</span>
    </header>

    <div class="rows">
      {#each draft.rows as row (row.key)}
        <div class="line">
          <div class="line-top">
            <span class="line-name">{row.name}</span>
            <button
              type="button"
              class="line-x"
              aria-label="Remove {row.name}"
              onclick={() => removeRow(draft, row.key)}>✕</button
            >
          </div>
          <div class="line-bottom">
            <button
              type="button"
              class="pm"
              aria-label="Less {row.name}"
              onclick={() => stepRowAmount(draft, row.key, -1)}>−</button
            >
            <input
              class="line-amt"
              inputmode="decimal"
              value={row.amount}
              aria-label="Amount of {row.name}"
              onchange={(e) =>
                setRowAmount(draft, row.key, Number(e.currentTarget.value))}
            />
            <span class="line-unit">{row.unit}</span>
            <button
              type="button"
              class="pm"
              aria-label="More {row.name}"
              onclick={() => stepRowAmount(draft, row.key, 1)}>+</button
            >
            <span class="line-cals">{Math.round(row.calories)} kcal</span>
          </div>
        </div>
      {/each}
    </div>

    {#if adding}
      <div class="pantry">
        {#each PANTRY as p (p.ref)}
          <button
            type="button"
            onclick={() => {
              addRow(draft, p);
              adding = false;
            }}>{p.name}</button
          >
        {/each}
        <button type="button" class="pantry-x" onclick={() => (adding = false)}
          >cancel</button
        >
      </div>
    {:else}
      <button type="button" class="add" onclick={() => (adding = true)}
        >＋ Add ingredient</button
      >
    {/if}

    <div class="servings">
      <label for="proto-servings-{item.id}">Servings this occasion</label>
      <input
        id="proto-servings-{item.id}"
        inputmode="decimal"
        value={draft.servings}
        onchange={(e) => setServings(draft, Number(e.currentTarget.value))}
      />
    </div>

    <div class="dock">
      <Button
        variant="primary"
        disabled={!dirty}
        onclick={() => {
          pretendCommit(draft);
          saved = true;
          setTimeout(() => (saved = false), 1400);
        }}>{saved ? "Saved" : `Save — ${total} kcal`}</Button
      >
      <Button variant="secondary" onclick={onBack}>Close</Button>
    </div>

    <DebugStrip {draft} />
  </section>
{/if}

<style>
  /* ── Closed ─────────────────────────────────────────────────────────────── */
  .closed {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    width: 100%;
    min-height: var(--tap-min);
    background: var(--paper);
    border: var(--edge-thin);
    padding: var(--space-xs) var(--space-s);
    margin-right: var(--shadow-2-reach);
    margin-bottom: var(--shadow-2-reach);
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .closed-text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .closed-name {
    font-size: var(--step-n1);
    font-weight: 600;
    line-height: 1.25;
  }
  .closed-sub {
    font-size: var(--step-n2);
    font-weight: 700;
    line-height: 1.25;
    color: var(--text-secondary);
  }
  .chev {
    flex-shrink: 0;
    font-size: var(--step-1);
    line-height: 1;
  }

  /* ── Open ───────────────────────────────────────────────────────────────── */
  /* The pane takes the meal's whole list area. Heavy edge, because it is the
     one box on the day that has replaced something rather than joined it. */
  .pane {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    background: var(--paper);
    border: var(--edge);
    padding: var(--space-2xs) var(--space-s) var(--space-xs);
    margin-right: var(--shadow-2-reach);
  }
  .pane-head {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    border-bottom: var(--edge-thin);
  }
  .back {
    width: var(--tap-min);
    min-height: var(--tap-min);
    margin-left: calc(var(--space-2xs) * -1);
    background: none;
    border: 0;
    font-size: var(--step-2);
    line-height: 1;
    cursor: pointer;
  }
  .pane-name {
    flex: 1;
    min-width: 0;
    font-size: var(--step-0);
    font-weight: 800;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pane-total {
    font-size: var(--step-n1);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  /* Two lines per ingredient, because the room is there: the name owns its own
     line and never competes with the controls under it. */
  .line {
    padding: var(--space-3xs) 0;
    border-bottom: 1px solid var(--border);
  }
  .line-top {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }
  .line-name {
    flex: 1;
    min-width: 0;
    font-size: var(--step-n1);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .line-x {
    width: 1.75rem;
    min-height: var(--tap-min);
    background: none;
    border: 0;
    color: var(--text-muted);
    cursor: pointer;
  }
  .line-bottom {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }
  .pm {
    width: var(--tap-min);
    height: var(--tap-min);
    background: none;
    border: var(--edge-thin);
    font-size: var(--step-0);
    line-height: 1;
    cursor: pointer;
  }
  .line-amt {
    width: 5rem;
    min-height: var(--tap-min);
    border: var(--edge-thin);
    padding: 0 var(--space-2xs);
    font: inherit;
    /* 16px floor, or a phone zooms the page on focus — see `Unfold`. */
    font-size: var(--step-0);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .line-unit {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
  }
  .line-cals {
    flex: 1;
    font-size: var(--step-n2);
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .add,
  .pantry button {
    align-self: flex-start;
    min-height: var(--tap-min);
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    font-size: var(--step-n2);
    font-weight: 700;
    text-align: left;
    color: var(--text-primary);
    cursor: pointer;
  }
  .pantry {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-s);
  }
  .pantry-x {
    color: var(--text-muted);
  }
  .servings {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    border-top: var(--edge-thin);
    padding-top: var(--space-2xs);
    font-size: var(--step-n2);
    font-weight: 700;
  }
  .servings input {
    width: 4rem;
    min-height: var(--tap-min);
    border: var(--edge-thin);
    padding: 0 var(--space-2xs);
    font: inherit;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  /* The sheet's dock, in the page. */
  .dock {
    display: flex;
    gap: var(--space-2xs);
    padding-top: var(--space-2xs);
  }
  .demo {
    margin-left: var(--space-3xs);
    padding: 0 var(--space-3xs);
    background: var(--highlight-bg);
    font-size: var(--step-n3);
    font-weight: 800;
  }
</style>
