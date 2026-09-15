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

  // THROWAWAY — variant A, "the card unfolds".
  //
  // **The claim: a logged recipe is a food with more inside it.** So the row
  // keeps its place, its frame and its ✕, and gains one mark — a caret — that
  // grows the card downward into its own ingredients. Nothing else on the day
  // moves sideways; the meals below are pushed down, which is what a list does.
  //
  // The editing affordance is the SMALL one, deliberately: a ± pair either side
  // of a narrow number, because the card is as wide as a phone's column minus
  // its padding and a serious editor does not fit there. That is the variant's
  // cost, and it is the thing to look at — whether an ingredient list is usable
  // at this width, or whether it wants the room B and C give it.
  let { item }: { item: ConsumptionEvent } = $props();

  // Seeded once, on purpose: the draft is this occasion's edit buffer and
  // must not be rebuilt under the user's fingers.
  // svelte-ignore state_referenced_locally
  let draft = $state(draftFromEvent(item));
  let open = $state(false);
  let adding = $state(false);
  let saved = $state(false);
  let bodyId = $derived(`proto-unfold-${item.id}`);

  let total = $derived(totalCalories(draft));
  let dirty = $derived(isDirty(draft));
</script>

<div class="unfold" class:open>
  <!-- The head IS the logged row: same frame, same padding, same two lines. It
       is written out rather than reusing `FoodItemRow` because the frame has to
       be able to lose its bottom edge when the body opens under it. -->
  <div class="head">
    <button
      type="button"
      class="head-btn"
      aria-expanded={open}
      aria-controls={bodyId}
      onclick={() => (open = !open)}
    >
      <span class="caret" class:open aria-hidden="true">›</span>
      <span class="head-text">
        <span class="head-name"
          >{draft.name}{#if item.id === DEMO_ID}<span class="demo">DEMO</span
            >{/if}</span
        >
        <span class="head-sub"
          >{draft.servings} serving{draft.servings === 1 ? "" : "s"} · {draft
            .rows.length} ingredients</span
        >
      </span>
      <span class="head-cals">{total} kcal</span>
    </button>
    <button class="head-remove" type="button" aria-label="Remove {draft.name}"
      >✕</button
    >
  </div>

  {#if open}
    <div class="body" id={bodyId}>
      {#each draft.rows as row (row.key)}
        <div class="ing">
          <span class="ing-name">{row.name}</span>
          <span class="stepper">
            <button
              type="button"
              aria-label="Less {row.name}"
              onclick={() => stepRowAmount(draft, row.key, -1)}>−</button
            >
            <input
              class="amt"
              inputmode="decimal"
              value={row.amount}
              onchange={(e) =>
                setRowAmount(draft, row.key, Number(e.currentTarget.value))}
            />
            <span class="unit">{row.unit === "serving" ? "srv" : row.unit}</span
            >
            <button
              type="button"
              aria-label="More {row.name}"
              onclick={() => stepRowAmount(draft, row.key, 1)}>+</button
            >
          </span>
          <span class="ing-cals">{Math.round(row.calories)}</span>
          <button
            type="button"
            class="ing-x"
            aria-label="Remove {row.name}"
            onclick={() => removeRow(draft, row.key)}>✕</button
          >
        </div>
      {/each}

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
          <button
            type="button"
            class="pantry-x"
            onclick={() => (adding = false)}>cancel</button
          >
        </div>
      {:else}
        <button type="button" class="add" onclick={() => (adding = true)}
          >＋ Add ingredient</button
        >
      {/if}

      <div class="foot">
        <label class="servings">
          Servings
          <input
            inputmode="decimal"
            value={draft.servings}
            onchange={(e) => setServings(draft, Number(e.currentTarget.value))}
          />
        </label>
        <span class="foot-total">{total} kcal</span>
      </div>

      <div class="acts">
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty}
          onclick={() => {
            pretendCommit(draft);
            saved = true;
            setTimeout(() => (saved = false), 1400);
          }}>{saved ? "Saved" : "Save"}</Button
        >
        <Button
          variant="secondary"
          size="sm"
          disabled={!dirty}
          onclick={() => (draft = draftFromEvent(item))}>Revert</Button
        >
      </div>

      <DebugStrip {draft} />
    </div>
  {/if}
</div>

<style>
  /* The logged row's own frame, lifted off `ui/Row` so the body can share it:
     thin edge, paper, square, with the shadow reach the day reserves on every
     row. */
  .unfold {
    background: var(--paper);
    border: var(--edge-thin);
    margin-right: var(--shadow-2-reach);
    margin-bottom: var(--shadow-2-reach);
  }
  .head {
    position: relative;
    display: flex;
    align-items: stretch;
  }
  .head-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    min-width: 0;
    min-height: var(--tap-min);
    padding: var(--space-xs) var(--space-s);
    background: none;
    border: 0;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  /* One shape rotated, not two glyphs swapped — the house caret (ADR-0100). */
  .caret {
    flex-shrink: 0;
    display: inline-block;
    font-size: var(--step-0);
    line-height: 1;
    transition: transform 0.15s var(--ease-snap);
  }
  .caret.open {
    transform: rotate(90deg);
  }
  .head-text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .head-name {
    font-size: var(--step-n1);
    font-weight: 600;
    line-height: 1.25;
  }
  .head-sub {
    font-size: var(--step-n2);
    font-weight: 700;
    line-height: 1.25;
    color: var(--text-secondary);
  }
  .head-cals {
    flex-shrink: 0;
    align-self: flex-end;
    font-size: var(--step-n1);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .head-remove {
    flex-shrink: 0;
    width: 1.5rem;
    min-height: var(--tap-min);
    background: none;
    border: 0;
    padding: 0 var(--space-2xs) 0 0;
    align-self: flex-start;
    color: var(--text-muted);
    cursor: pointer;
  }

  /* Inside the same frame, under a hairline. Not a second card — the whole
     point of A is that there is ONE box. */
  .body {
    border-top: var(--edge-thin);
    padding: var(--space-2xs) var(--space-s) var(--space-xs);
  }
  .ing {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    min-height: var(--tap-min);
    border-bottom: 1px solid var(--border);
  }
  .ing-name {
    flex: 1;
    min-width: 0;
    font-size: var(--step-n2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stepper {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    border: var(--edge-thin);
  }
  .stepper button {
    width: 2rem;
    height: 2rem;
    background: none;
    border: 0;
    font-size: var(--step-0);
    line-height: 1;
    cursor: pointer;
  }
  /* The cost of A, stated in CSS: 3.2rem is what is left for a number once the
     name, the two steppers, the kcal and the ✕ have taken the column. */
  .amt {
    width: 3.6rem;
    border: 0;
    border-left: 1px solid var(--border);
    border-right: 0;
    padding: 0 var(--space-3xs);
    font: inherit;
    /* A field a phone will not zoom into on focus: under 16px iOS Safari
       scales the page, which on a card this narrow throws the day sideways.
       `--step-0` is the smallest step that clears it
       (`tests/unit/field-size.test.ts`). */
    font-size: var(--step-0);
    font-variant-numeric: tabular-nums;
    text-align: right;
    background: none;
  }
  .unit {
    font-size: var(--step-n3);
    color: var(--text-secondary);
    padding-right: var(--space-3xs);
    border-right: 1px solid var(--border);
  }
  .ing-cals {
    flex-shrink: 0;
    min-width: 3em;
    font-size: var(--step-n2);
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .ing-x {
    flex-shrink: 0;
    width: 1.5rem;
    background: none;
    border: 0;
    color: var(--text-muted);
    cursor: pointer;
  }
  .add,
  .pantry button {
    min-height: var(--tap-min);
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    font-size: var(--step-n2);
    font-weight: 700;
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
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    border-top: var(--edge-thin);
    padding-top: var(--space-2xs);
    font-size: var(--step-n2);
    font-weight: 700;
  }
  .servings {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }
  .servings input {
    width: 3rem;
    min-height: var(--tap-min);
    border: var(--edge-thin);
    padding: 0 var(--space-3xs);
    font: inherit;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .foot-total {
    font-variant-numeric: tabular-nums;
  }
  .acts {
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
