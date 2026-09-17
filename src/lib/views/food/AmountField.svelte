<script lang="ts">
  import { tick } from "svelte";
  import Button from "../../ui/Button.svelte";
  import Segmented from "../../ui/Segmented.svelte";
  import DensityQuestion from "./DensityQuestion.svelte";
  import {
    convertAmount,
    densityGramsPerMl,
    type FoodDensity,
  } from "../../food/density";
  import type { DensityClassId } from "../../food/density-class";
  import {
    evaluateAmount,
    AMOUNT_EXPRESSION_CHARS,
  } from "../../food/amount-expression";
  import {
    measuredUnitName,
    roundFood,
    portionPresets,
    resolvePortionAmount,
    type MeasuredUnit,
    type Portion,
  } from "../../food/nutrition";

  // The app's one amount control: a boxed field — you type a plain number *or* a
  // little sum like `65 / 2` and the field logs the result — with the − + × ÷
  // keys the number pad omits. They ride the head row above the box, opposite
  // the basis caption, which was empty on its right-hand side and is the one row
  // in the control that is never about the number itself.
  // When the food carries household portions (ADR-0030, ticket #27) they render
  // as a chip row below: tapping "1 medium — 118 g" fills the resolved amount.
  // A portion-less food shows just the field. Only the
  // portions stated in THIS field's unit become chips — a 330 ml can offers its
  // "1 can" back (ADR-0060 §6), and a gram serving on a millilitre food offers
  // nothing, because filling it in would convert by pretending not to.
  //
  // The unit is a property of the CONTROL, never of the input: every keystroke is
  // filtered to `AMOUNT_EXPRESSION_CHARS`, so a unit can't be typed even if we
  // wanted it to be. It comes from the food's panel basis and nothing converts
  // (ADR-0060 §1/§2) — which is why this is `AmountField` rather than the
  // `QuantityGrams` it used to be: the label was a millilitre field wearing a
  // gram name, and "quantity" is the ledger's word for the frozen `event/quantity`
  // string, not for a live input.
  //
  // On a food published by volume the control also carries the `g`/`ml` toggle
  // that CHOOSES the unit, and that toggle is the only door to the Density Class
  // question (ADR-0108 §1/§6): on a classified food it switches units, and on an
  // unclassified one tapping `g` is what asks. The capability is offered by the
  // same control that earns it, so there is deliberately no separate "weigh this
  // instead?" prompt — a prompt that exists only to be a prompt is a worse
  // surface than a control that does something.
  //
  // `amount` and `unit` travel together, and both are bindable: on a food with
  // a density the two can differ from the panel's own basis, so an amount that
  // left here as a bare number would be re-derived wrongly by every reader that
  // read its unit back off the food (`CONTEXT.md`, **Amount unit**). Switching
  // the toggle converts the amount rather than relabelling it.
  //
  // One known gap while #431 is open: a 330 ml can toggled to grams loses its
  // "1 can" chip, because `portionPresets` correctly drops a portion stated in
  // the unit the field does not take (ADR-0060 §6). §8 is what closes it.
  let {
    amount = $bindable(),
    unit = $bindable(),
    panelUnit = undefined,
    portions = [],
    caption = null,
    density = undefined,
    prefill = undefined,
    onAssertDensity = undefined,
  }: {
    amount: number;
    /**
     * The unit this amount is entered in, and the unit `amount` is measured in.
     * Bindable, because on a food carrying a density it is a choice the user
     * makes here and every reader downstream has to hear about (the **Amount
     * unit**, `CONTEXT.md`). On every other food it is the panel's own and never
     * moves.
     */
    unit: MeasuredUnit;
    /** The panel's own UNIT, which is what makes this a volume food and so the
     *  one that can be weighed. Defaults to `unit` for a caller with no panel in
     *  hand, which is a food that offers no choice.
     *
     *  Not spelled `basis`: the **Panel basis** is the `serving_size` string
     *  (`FoodResult.basis`), and one word for two types is how a reader comes to
     *  hand `"100 ml"` to something expecting `"ml"`. */
    panelUnit?: MeasuredUnit | undefined;
    portions?: Portion[];
    /** What the panel's figures are measured against ("Per 100 g"), rendered on
     *  the head row that the sum keys share. Null on a panel-less food, and
     *  then the keys have that row to themselves. */
    caption?: string | null;
    /** What this food's twin asserts about its density (ADR-0108 §4). Absent on
     *  every food nobody has classified, which is the standing state. */
    density?: FoodDensity | undefined;
    /** The class the food's own source names, where it names exactly one — the
     *  picker opens on it, and it is never written until the user has seen it. */
    prefill?: DensityClassId | undefined;
    /** The user has said what kind of liquid this is. The host owns where that
     *  lands — a twin already in the ledger takes a datom, a staged one carries
     *  it to its commit — so this control never writes one itself. */
    onAssertDensity?: (density: FoodDensity) => void;
  } = $props();

  // Whether this food can answer in both units at all: a volume panel plus a
  // density to bridge them. A gram panel is already weighed and has nothing to
  // ask (ADR-0108's curated stand-in amendment turns on exactly this).
  let offeredIn = $derived<MeasuredUnit>(panelUnit ?? unit);
  // The figure this food's class resolves to, read once: it decides whether the
  // toggle can switch at all, whether a portion stated in the other unit still
  // offers a chip (ADR-0108 §8), and what the basis caption weighs (§9).
  let gPerMl = $derived(densityGramsPerMl(density));
  let weighable = $derived(gPerMl !== undefined);
  // Whether the toggle is drawn at all. A volume food that can already be
  // weighed always offers it; one that cannot offers it only where the host can
  // take the answer, because a question with nowhere to put its answer is a
  // control that does nothing — which is the surface ADR-0108 §1 rejects, read
  // the other way round.
  let offersUnits = $derived(
    offeredIn === "ml" && (weighable || onAssertDensity !== undefined)
  );

  // The unit's own spelling, resolved in one place so the label, the aria-label
  // and the box suffix cannot name three things.
  let unitName = $derived(measuredUnitName(unit));

  // The chip view-models are derived once from the raw portions by the food
  // domain helper; the .svelte file holds no portion mapping of its own.
  let portionOptions = $derived(portionPresets(portions, unit, gPerMl));

  // Tapping a portion chip fills its resolved amount — via the shared resolver so
  // the picker and any downstream reader agree — falling back to the preset's
  // pre-rounded amount if the label somehow can't be resolved. The unit rides
  // along, so a chip resolves against the portion the field can actually hold —
  // and, on a classified food, against the one it can reach across to (§8).
  function pickPortion(label: string, fallback: number) {
    amount = resolvePortionAmount(portions, label, unit, 1, gPerMl) ?? fallback;
  }

  // The four keys, in the order they are drawn. Each pairs the glyph the user
  // sees with the character the parser reads — `−` (U+2212) and `×` are
  // typographic marks, not the ASCII `-` and `*` that go into the expression —
  // and the roster is stated once here so the order lives in one place rather
  // than in four hand-written buttons. It is the whole of the grammar
  // `amount-expression.ts` accepts between two numbers (ADR-0023), which is why
  // there is no fifth: parentheses need a matching pair and a key cannot know
  // where the other one goes.
  const OPERATOR_KEYS = [
    { glyph: "−", op: "-", label: "Subtract" },
    { glyph: "+", op: "+", label: "Add" },
    { glyph: "×", op: "*", label: "Multiply" },
    { glyph: "÷", op: "/", label: "Divide" },
  ] as const;

  const HARD_MAX = 10000;
  // Held to the food precision (`roundFood`) so a typed sum like `65 / 2` keeps
  // its `32.5` instead of being rounded away to a whole gram; a value with no
  // fractional part still shows whole (the result is a number, never padded).
  const clamp = (v: number) => Math.max(0, Math.min(HARD_MAX, roundFood(v)));

  // The field keeps its own raw string so typing (and a transient empty field)
  // isn't clobbered; `amount` is the source of truth everything else drives.
  let raw = $state(String(amount));
  let focused = $state(false);
  let inputEl = $state<HTMLInputElement>();
  $effect(() => {
    if (!focused) raw = String(amount);
  });

  // ── the unit toggle, and the question behind it ──────────────────────────

  /** The two units the toggle offers, in the order they are drawn. */
  const UNIT_OPTIONS = [
    { value: "g" as const, label: "Grams" },
    { value: "ml" as const, label: "Millilitres" },
  ];

  // The cell the unit toggle shows. It mirrors `unit` — the effect is what keeps
  // it honest when the amount screen is handed another food — except in one
  // state, which is deliberate: while the class question is open the user has
  // ASKED for grams and the field has not moved yet, so the toggle shows the tap
  // they made and the question below it says why nothing has happened. The label
  // still reads millilitres, because that is still what the box takes.
  //
  // A mirror rather than the prop itself, because a Segmented owns its own
  // selection: handed `value={unit}` unbound it would move on a tap this control
  // then declined to act on, and the two would silently disagree from then on.
  // svelte-ignore state_referenced_locally
  let unitCell = $state<MeasuredUnit>(unit);
  $effect(() => {
    unitCell = unit;
  });

  // Whether the class question is on screen. It opens by tapping `g` on a food
  // nobody has classified — no separate prompt — and closes the moment the
  // question is answered or the user goes back to millilitres.
  let asking = $state(false);
  // What the question currently amounts to, or null while it amounts to nothing.
  // Seeded from the source's proposal when the question opens, because a
  // pre-filled row IS an answer waiting to be confirmed — and never a written
  // class until it is (ADR-0108's pre-fill amendment).
  let answer = $state<FoodDensity | null>(null);

  // Switching units keeps the same quantity of food in the box: 250 ml of olive
  // oil becomes 230 g, not 250 g. It is the one conversion in the app and it is
  // licensed by the class the user asserted (ADR-0108 §1), so it cannot run
  // until there is one — which is why tapping `g` on an unclassified food asks
  // rather than switches.
  function switchTo(next: MeasuredUnit) {
    if (next === unit) return;
    amount = convertAmount(amount, unit, next, density) ?? amount;
    unit = next;
  }

  function chooseUnit(next: MeasuredUnit) {
    if (next === "ml") {
      asking = false;
      switchTo("ml");
      return;
    }
    if (weighable) {
      switchTo("g");
      return;
    }
    // The tap on `g` IS the question. The control that offers the capability is
    // the one that earns it.
    answer = prefill ? { class: prefill } : null;
    asking = true;
  }

  function assert(next: FoodDensity) {
    onAssertDensity?.(next);
    asking = false;
    // The host has the assertion but this control still holds the old prop, so
    // the conversion runs against what was just said rather than against what
    // has come back. Waiting for the round trip would leave the field in grams
    // holding a millilitre figure for a frame.
    amount = convertAmount(amount, unit, "g", next) ?? amount;
    unit = "g";
  }

  function confirm() {
    if (answer) assert(answer);
  }

  // The number pad has no operator keys, so the sums we support ride four
  // on-screen ones. Each inserts its operator at the caret, keeps the field
  // focused (the key's pointerdown is prevented so it never steals focus and
  // triggers a blur/commit), and re-evaluates live like a keystroke would.
  async function insertOp(op: (typeof OPERATOR_KEYS)[number]["op"]) {
    const el = inputEl;
    if (!el) return;
    const start = el.selectionStart ?? raw.length;
    const end = el.selectionEnd ?? raw.length;
    focused = true; // hold the $effect off while we rewrite `raw`
    const next = raw.slice(0, start) + op + raw.slice(end);
    raw = [...next].filter((ch) => AMOUNT_EXPRESSION_CHARS.test(ch)).join("");
    const result = evaluateAmount(raw);
    if (result !== null) amount = clamp(result);
    await tick(); // let Svelte push the new value before we place the caret
    el.focus();
    const caret = start + op.length;
    el.setSelectionRange(caret, caret);
  }

  // Keep only characters a sum can be built from; evaluate live so any macro
  // preview tracks a complete expression as it's typed. While the
  // field is mid-expression (`65 /`) or otherwise not yet a number, `evaluateAmount`
  // returns null and `amount` simply holds its last good value — never clobbered.
  function onInput(e: Event & { currentTarget: HTMLInputElement }) {
    raw = [...e.currentTarget.value]
      .filter((ch) => AMOUNT_EXPRESSION_CHARS.test(ch))
      .join("");
    const result = evaluateAmount(raw);
    if (result !== null) amount = clamp(result);
  }
  // On blur/Enter, collapse whatever was typed to its computed value: a valid
  // sum becomes its result, anything unparseable falls back to the last `amount`.
  function commit() {
    focused = false;
    const result = evaluateAmount(raw);
    amount = clamp(result ?? amount);
    raw = String(amount);
  }
</script>

<div class="af">
  <!-- Head row: what the figures are measured against on the left — the amount
       box below names the unit being typed, not the divisor — and the − + × ÷
       sum keys on the right, filling a half-row the caption left empty. The row is
       drawn whenever either half has something to say. -->
  <div class="af-head">
    {#if caption}
      <p class="basis">{caption}</p>
    {/if}

    <!-- Each key inserts its operator (what the parser reads, not the glyph on
         the key) at the caret; `pointerdown` is prevented so tapping one never
         blurs the field mid-expression.

         There was a slider skimming the amount here, and it is gone. It carried
         a whole-unit step and wrote its position back through `onValueChange`,
         so a typed 12.34 was re-reported as 12 and the field silently lost what
         the user had entered — the number they typed being overruled by a
         control they had not touched. Typing is the primary way an amount is
         entered and the sums these keys build are the secondary one; neither
         needs a coarse skim beside them. -->
    <div class="ops">
      {#each OPERATOR_KEYS as key (key.op)}
        <button
          type="button"
          class="op"
          aria-label={key.label}
          onpointerdown={(e) => e.preventDefault()}
          onclick={() => insertOp(key.op)}>{key.glyph}</button
        >
      {/each}
    </div>
  </div>

  <!-- Amount box: the unit-naming label inline-left, the value right-aligned.
       One bordered card (ADR-0043 §2 relayout).

       The row IS the <label>. It was a <div> holding a smaller <label> around
       just the number, which made the 32px value the tap target while the 54px
       row around it took nothing — and flooring that inner box would have grown
       the row to 70px to reach a size the row already had (ADR-0093, #338).
       Naming the row instead costs one element and no pixels, and the "Amount
       (g)" text joins the target rather than sitting outside it.

       That is also why the unit toggle below is below and not inside: a
       <label> may contain only the one labelable element it names, so a second
       control in this row would cost it the tap it carries. -->
  <label class="af-row">
    <span class="af-label">Amount ({unitName})</span>
    <span class="value">
      <input
        bind:this={inputEl}
        class="num"
        inputmode="decimal"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        aria-label="Amount in {unitName} — a number, or a sum with the − + × ÷ keys"
        value={raw}
        oninput={onInput}
        onfocus={(e) => {
          focused = true;
          e.currentTarget.select();
        }}
        onblur={commit}
        onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <span class="unit">{unit}</span>
    </span>
  </label>

  {#if offersUnits}
    <!-- The unit toggle: the door to the Density Class question, and on a
         classified food the switch between the two units (ADR-0108 §1). It sits
         under the amount box rather than inside it, and the reason is
         structural: that box IS the <label> that takes the tap (ADR-0093, #338)
         and a <label> may hold only the one labelable element it names, so a
         second control inside it would cost the row its label. The toggle is
         part of this control either way, which is the whole of §1's claim that
         the capability is offered by the control that earns it.

         A Segmented rather than a ToggleGroup: a unit is a choice that must
         persist, and ToggleGroup's contract is that a second tap on the cell you
         just chose clears it. -->
    <Segmented
      options={UNIT_OPTIONS}
      bind:value={unitCell}
      onValueChange={chooseUnit}
      label="Amount unit"
      testid="amount-units"
    />
  {/if}

  {#if asking}
    <!-- The class question, inline under the field it is about. A BottomSheet
         would put the amount you were typing behind a backdrop to answer a
         question about that amount, and five short options is a row of cells
         rather than a screen (ADR-0108 §1).

         Segmented again, and here the contract matters more: on a ToggleGroup a
         mis-tap on the class you had just chosen would clear the density off the
         twin as a side effect. Its `value` starts null, which is the ambiguous
         and the untagged case. -->
    <div class="asking" data-testid="density-picker">
      <DensityQuestion
        {prefill}
        testid="density-classes"
        onAnswer={(next) => (answer = next)}
      />
      <!-- One confirm for every answer, including the one the source proposed.
           A cell-tap cannot be the confirm: a RadioGroup fires nothing when the
           cell you tap is the cell already checked, so on the 35.76% of
           millilitre products whose tags name exactly one class — the very case
           the pre-fill exists for — tapping the highlighted option would do
           nothing at all. It is also what "the source pre-fills, and the user
           confirms" (ADR-0108's pre-fill amendment) literally asks for. -->
      <Button
        variant="primary"
        disabled={answer === null}
        data-testid="density-confirm"
        onclick={confirm}>Weigh in grams</Button
      >
    </div>
  {/if}

  {#if portionOptions.length > 0}
    <!-- Portion chips, taking the control's full width (the NOVA badge that used
         to share this row now rides the head with the other tags, which is also
         what gives a long portion label room to sit on its own line). A food's
         portions arrive with it now (ADR-0047 §6), so the row is either there or
         it is not — there is no loading state left to hold space for. -->
    <div class="portions" data-testid="portion-presets">
      {#each portionOptions as p (p.label)}
        <Button
          variant={amount === p.amount ? "primary" : "secondary"}
          class="portion-chip"
          onclick={() => pickPortion(p.label, p.amount)}>{p.display}</Button
        >
      {/each}
    </div>
  {/if}
</div>

<style>
  .af {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    width: 100%;
    margin-top: var(--space-m);
  }
  /* When the control leads a padded body it would double its own top margin up
     on that body's padding, so collapse it there. A basis caption above the
     control collapses the same margin from its own side (FoodAmountPanel). */
  .af:first-child {
    margin-top: 0;
  }
  /* Amount box: the label inline-left, the value right-aligned. One
     bordered card that frames the value (which carries no border of its own). */
  .af-row {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    padding: var(--space-2xs) var(--space-xs);
    border: var(--edge);
    box-shadow: var(--shadow-1);
    /* Already 54.4px drawn, and declared anyway: a box whose height comes from
       its children cannot be measured out of its own declarations, so the floor
       is what makes a true thing provable rather than incidental. */
    min-height: var(--tap-min);
    cursor: text;
  }
  .af-row:focus-within {
    outline: var(--edge-thick);
    outline-offset: 3px;
  }
  .af-label {
    font-weight: 700;
  }
  /* The value rides flush right in the amount box, right-aligned. */
  .value {
    margin-left: auto;
    display: flex;
    align-items: baseline;
    gap: var(--space-3xs);
  }
  .num {
    width: 5rem;
    border: none;
    outline: none;
    text-align: right;
    font-family: inherit;
    font-size: var(--step-1);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    background: none;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .unit {
    font-size: var(--step-n1);
    font-weight: 700;
  }

  /* The class question, inline under the field. */
  .asking {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    width: 100%;
    padding: var(--space-xs);
    border: var(--edge);
    background: var(--paper);
  }
  /* Head row: caption left, sum keys right. `margin-left: auto` rather than
     `space-between`, so a caption-less panel still parks the keys on the right
     instead of stranding them under the label. It wraps because four keys and a
     long caption ("Per serving (30 g)") can outgrow a narrow phone between
     them: the keys then drop to a line of their own, still right-aligned, which
     is the one degradation here that costs nothing — a key that shrank instead
     would be a smaller tap target on exactly the screen that can least afford
     one. */
  .af-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
    width: 100%;
  }
  /* The basis caption, which used to be a paragraph of its own above the
     control (FoodAmountPanel) and now shares this row. */
  .basis {
    margin: 0;
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-secondary);
  }

  /* The − + × ÷ keys, which the number pad omits. They sat in two auto columns
     beside a slider, then owned a whole row of their own; now there are four of
     them and they share the caption's. */
  .ops {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    margin-left: auto;
  }
  /* Square, and floored on both axes by `--tap-min` rather than by a width
     picked to look right beside a glyph: the keys used to be 41.6 × 40px, which
     is under the floor on both counts, and a sum key is pure touch — there is
     no keyboard route to it and nothing else on the row to hit by mistake if
     you miss. A floor rather than a fixed size, so the box can only ever grow
     to whatever the glyph and the border need. */
  .op {
    flex: none;
    min-width: var(--tap-min);
    min-height: var(--tap-min);
    display: flex;
    align-items: center;
    justify-content: center;
    border: var(--edge);
    box-shadow: var(--shadow-1);
    background: var(--paper);
    font-family: inherit;
    font-size: var(--step-1);
    font-weight: 800;
    line-height: 1;
    color: var(--text-primary);
    cursor: pointer;
  }
  .op:active {
    background: var(--green-bg);
    box-shadow: none;
    transform: translate(1px, 1px);
  }
  .op:focus-visible {
    outline: var(--edge-thick);
    outline-offset: 3px;
  }

  /* Portion chips wrap (a food can offer several measures, and each label is
     wider than a gram number). */
  .portions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3xs);
    width: 100%;
    min-width: 0;
  }
  /* A USDA portion label is a sentence ("Potato large (3\" to 4-1/4\" dia) —
     369 g"), far wider than any chip. Button defaults to one nowrap line clipped
     at both ends by its own overflow:hidden, which cut the label mid-word on
     BOTH sides and read as broken. Here the label wraps inside the chip and the
     chip is capped at the row's width, so a portion always fits its container —
     tall chips, never clipped ones. Left-aligned, since a wrapped sentence
     centred over two lines reads worse than a block of text. */
  .portions :global(.portion-chip) {
    flex: 0 1 auto;
    max-width: 100%;
    min-width: 0;
    padding-left: var(--space-xs);
    padding-right: var(--space-xs);
    font-size: var(--step-n2);
    white-space: normal;
    /* Last-resort break, so even a label with no space or hyphen to break at
       stays inside the chip rather than spilling out of it. */
    overflow-wrap: anywhere;
    text-align: left;
    justify-content: flex-start;
  }
</style>
