<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLLabelAttributes } from "svelte/elements";

  // The caption over a control: the line that names what the field under it is
  // for (#383, ADR-0100).
  //
  // **It owns the element, and that is why it is required rather than merely
  // earned.** Before this component the app held fifteen caption rules in
  // seven distinct settings, and half of them were not `<label>`s at all.
  // `CalorieCalculatorSheet`'s `.field-label` was `<span>Age</span>` over a
  // number input — no `for`, no association, nothing for a screen reader to
  // announce — while `HabitDetailView`'s **identically named** `.field-label`
  // was `<label for="log-status-val">`. One class name, two files, two
  // elements. ADR-0100 §5: where a trigger is met and any site in the reach
  // set has the semantics *wrong*, the member is required, because correctness
  // has to be reached by reference or it regresses the next time somebody
  // copies the nearest example. A typography census could never have found it.
  //
  // **`for` is not optional, and takes no fallback.** A caption with nothing
  // to name is the defect this component exists to delete, so the type demands
  // it and a caller that has no id for its control has to mint one. That is
  // the whole cost, and three sheets paid it here.
  //
  // **Why `--step-n1` / 800 / uppercase, and not the majority.** There was no
  // majority: the re-measure put the largest camp at three sites of fifteen.
  // Counting *independent choices* instead — three byte-identical
  // `.form-group label` transcriptions are one decision propagating, not three
  // votes — n1/800 led four to two, and the four are the interesting part:
  // `ui/Segmented` and `ui/ToggleGroup` had already declared it, and
  // `ReportsPage`'s range caption (#346) was written *after* this ticket was
  // filed, by somebody reaching for numbers unprompted with no primitive to
  // copy, and landed on 800. That is as close to a controlled experiment as
  // the question gets. It is also the only setting that was ever reached by
  // reference; every other camp is a copy of a copy, which ADR-0095 §1 says is
  // evidence of one decision propagating rather than of agreement.
  //
  // **Two things that look like this and are deliberately not this.**
  // `ui/Checkbox` renders its control's name inline at n1/**700**: that is a
  // name *beside* a box rather than a caption *above* a field, so it is
  // different semantics under ADR-0100 §1 and its disagreement is not one.
  // And a caption over a *group* — `ui/Segmented`, `ui/ToggleGroup`,
  // `ReportsPage`'s date range — has no single labelable control to point a
  // `for` at, so it stays a `<span id>` with `aria-labelledby` and reaches the
  // look through the `.field-caption` class in `src/app.css`. The look is
  // declared there once for both populations; this component owns only what a
  // class cannot carry.
  //
  // **No variants, and `MediaEngagementModal` is the worked case.** Its six
  // captions wore a mono face on an inverted ink chip, and converging them
  // loses the chip. A `variant` for it would be a branch serving one caller —
  // *"bloating a new primitive's variant axis to serve a single caller"*, the
  // sentence ADR-0040 refused `Chip` with — so minting a caption primitive and
  // immediately handing it one would be the new rule failing on its first
  // application (ADR-0100 §3). A screen that genuinely needs a heavier caption
  // gets an ADR, not a prop.
  //
  // `class` is the caller's **placement** channel and never a styling one —
  // a margin, a grid area, a `flex` — the same contract `ui/Input`,
  // `ui/Textarea`, `ui/Button` and `ui/Checkbox` state. `...rest` carries the
  // a11y and platform attributes (`id`, `aria-*`, `data-*`), and is not a
  // styling channel either.
  type FieldCaptionProps = {
    /** The `id` of the control this names. Required: the association is the
     *  point of the component, and half the population it replaced had lost
     *  it. */
    for: string;
    class?: string;
    children: Snippet;
  } & Omit<HTMLLabelAttributes, "for" | "class" | "children">;

  let {
    for: htmlFor,
    class: className = "",
    children,
    ...rest
  }: FieldCaptionProps = $props();
</script>

<label {...rest} for={htmlFor} class="field-caption {className}">
  {@render children()}
</label>
