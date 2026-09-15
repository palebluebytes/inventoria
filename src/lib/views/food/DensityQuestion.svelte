<script lang="ts">
  import Segmented from "../../ui/Segmented.svelte";
  import {
    isAssertableFigure,
    DENSITY_CLASS_OPTIONS,
    type FoodDensity,
  } from "../../food/density";
  import type { DensityClassId } from "../../food/density-class";

  // "What kind of liquid is this?" — the five classes, and the exit for a bottle
  // they do not cover (ADR-0105 §1/§4). It is the whole of the question and
  // none of the commit: it reports an answer and never writes one, because the
  // two screens that ask it commit at different moments. The amount field asks
  // it mid-entry and confirms with a button of its own; the capture form asks it
  // as one field among many and confirms when the food is saved.
  //
  // Each option names the thing, not the number: you pick by recognising your
  // bottle. Showing `0.92 g/ml` beside it would ask you to validate a figure you
  // have no way to check, which is exactly the trade ADR-0105 §12 refuses for a
  // model's per-food density. §9 puts the figure on the basis caption the moment
  // you choose, and the source explainer carries the account.
  let {
    prefill = undefined,
    label = "What kind of liquid is this?",
    testid = undefined,
    onAnswer,
  }: {
    /** The class the food's own source names, where it names exactly one. It
     *  seeds the row and is never an answer until the user confirms one. */
    prefill?: DensityClassId | undefined;
    /** The question, as this screen asks it. */
    label?: string;
    /** Forwarded as data-testid on the class row. */
    testid?: string | undefined;
    /** Fires whenever the answer changes, `null` while there is not one yet. */
    onAnswer: (answer: FoodDensity | null) => void;
  } = $props();

  /** The exit from the five classes, as the picker spells it. */
  const OTHER = "other";
  /** What a cell may be: a class, or the exit. Spelled out rather than widened
   *  to `string`, so `DENSITY_CLASS_OPTIONS` being keyed by `DensityClassId`
   *  still costs a sixth class a type error here — which is the whole reason it
   *  is a `Record` and not a list. */
  type Choice = DensityClassId | typeof OTHER;

  const OPTIONS: { value: Choice; label: string }[] = [
    ...(
      Object.entries(DENSITY_CLASS_OPTIONS) as [DensityClassId, string][]
    ).map(([value, label]) => ({ value, label })),
    { value: OTHER, label: "Something else" },
  ];

  // Seeded from the source's proposal and owned from there on. A proposal is not
  // an answer: it opens the row on a cell, and `onAnswer` carries it out only
  // because the screen asking is about to put a confirm under it.
  // svelte-ignore state_referenced_locally
  let chosen = $state<Choice | null>(prefill ?? null);
  // The exit's field, held as a string so a half-typed "1." survives.
  let typedFigure = $state("");
  let typedFigureValue = $derived(Number(typedFigure));

  // What the row currently amounts to, or null while it amounts to nothing. One
  // derived rather than a branch per cell, so what is reported and what a caller
  // writes cannot come apart.
  let answer = $derived<FoodDensity | null>(
    chosen === null
      ? null
      : chosen === OTHER
        ? isAssertableFigure(typedFigureValue)
          ? { g_per_ml: typedFigureValue }
          : null
        : { class: chosen }
  );
  $effect(() => onAnswer(answer));
</script>

<div class="dq">
  <!-- A Segmented and not a ToggleGroup: a class is a choice that must persist,
       and ToggleGroup's contract is that a second tap on the cell you just chose
       clears it — which here would take the density off the twin as a side
       effect of a mis-tap. Its `value` starts null, which is the ambiguous case
       and the untagged one. -->
  <Segmented options={OPTIONS} bind:value={chosen} {label} {testid} />

  {#if chosen === OTHER}
    <!-- The exit, so a bottle the five classes do not cover is not a dead end.
         It is the user's own claim about their own food and never a measurement
         the app could check (ADR-0105 §4, as amended): nobody puts a bottle on a
         scale and divides, and the figure reaching this field is a remembered or
         looked-up one far more often than a weighed one. -->
    <div class="typed">
      <label class="typed-label" for="density-figure"
        >Grams per millilitre</label
      >
      <input
        id="density-figure"
        class="typed-num"
        inputmode="decimal"
        autocomplete="off"
        spellcheck="false"
        placeholder="1.20"
        bind:value={typedFigure}
      />
    </div>
  {/if}
</div>

<style>
  .dq {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    width: 100%;
  }
  .typed {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
  }
  .typed-label {
    font-size: var(--step-n1);
    font-weight: 700;
  }
  /* Its own box rather than ui/Input: the field is one number wide and sits
     inline beside its label, where Input draws a full-width stacked field.
     Floored on the axis that could fail a finger (ADR-0093 §3). */
  .typed-num {
    width: 6rem;
    min-height: var(--tap-min);
    padding: var(--space-3xs) var(--space-2xs);
    border: var(--edge);
    background: var(--paper);
    font-family: inherit;
    font-size: var(--step-0);
    font-weight: 700;
    color: var(--text-primary);
  }
</style>
