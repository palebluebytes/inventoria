<script lang="ts" generics="T">
  import type { HTMLSelectAttributes } from "svelte/elements";

  // The one select (#378). A native `<select>` wearing the house field skin —
  // the same one `ui/Input` and `ui/Textarea` draw, because all three stand
  // beside each other in the same form and a status picker with a different
  // edge from the name above it is two looks in one box.
  //
  // **Not bits-ui.** ADR-0036's test, as ADR-0068 §1 restates it: a primitive
  // reaches for bits only where the platform has no control with the
  // behaviour. Here the platform supplies *more*, not less. bits renders a
  // custom listbox out of a portalled `Root/Trigger/Content/Item` stack; a
  // native `<select>` opens the OS picker — full-width rows far above
  // `--tap-min`, correct with every assistive technology, zero code — so
  // adopting bits would replace a control that already satisfies ADR-0093 with
  // one this project would then have to floor itself. Nothing here wants
  // typeahead, grouping or multi-select against 2–7 static options, and
  // bits-ui portals have a recorded cost in this repo: they defeat the SSR
  // tests (#235).
  //
  // **Options are data, not a snippet.** A `children` snippet hands the
  // interior back to the call site, and the call site is where copies come
  // from — which is the whole finding of #362. So `options` is a list and this
  // component takes no children.
  //
  // **The value is generic.** `value: T`, checked against the call site's own
  // option list. One adopting site binds `number | undefined` (a rating, with a
  // `No Rating` option) and the rest bind strings; forcing a `Number()` at a
  // write site to satisfy a UI primitive would be the tail wagging the dog.
  //
  // **No `label` prop**, matching `ui/Input`: this takes an `id` and the caller
  // keeps its own `<label for>`. A select's box is itself the tap target, so
  // `ui/Checkbox`'s reason for owning its label does not transfer, and adopting
  // it here would settle what a form caption looks like app-wide as a side
  // effect of a select refactor.
  //
  // **`class` is the wrapper's, not the field's** — the same split `ui/Input`
  // makes, and for the same reason it has a wrapper at all: a caller says where
  // the field sits (`flex: 1`, a width) and never what it looks like. The
  // wrapper is not optional here, because the mark below is positioned against
  // it.
  //
  // `...rest` is the a11y/semantics/platform escape hatch (`name`, `required`,
  // `form`, `aria-*`, `data-*`), NOT a styling channel — the same contract as
  // Button, Checkbox, Input and Textarea.
  type SelectProps = {
    value?: T;
    /** The whole interior, as data. See above: there is no `children`. */
    options: { value: T; label: string }[];
    /**
     * Fires with the chosen option's own value, so a caller persists without
     * reaching into `e.currentTarget.value` — which hands back a string and
     * defeats the generic exactly where it matters. Same reason
     * `ui/Checkbox` carries `onCheckedChange`.
     */
    onValueChange?: (value: T) => void;
    /** Modelled, not spread: the caller keeps its `<label for>` and that
     *  pairing is first-class rather than something that survives a spread. */
    id?: string;
    disabled?: boolean;
    class?: string;
  } & Omit<
    HTMLSelectAttributes,
    "value" | "id" | "disabled" | "class" | "children" | "onchange"
  >;

  let {
    value = $bindable(),
    options,
    onValueChange,
    id = undefined,
    disabled = false,
    class: className = "",
    ...rest
  }: SelectProps = $props();

  /** The chosen option's own value, read off the list rather than off the
   *  element — `e.currentTarget.value` is a string whatever `T` is. */
  function handleChange(e: Event & { currentTarget: HTMLSelectElement }) {
    const chosen = options[e.currentTarget.selectedIndex];
    if (chosen) onValueChange?.(chosen.value);
  }
</script>

<div class="select-wrapper {className}">
  <select
    {...rest}
    {id}
    {disabled}
    bind:value
    class="select"
    onchange={handleChange}
  >
    {#each options as option (String(option.value))}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
  <!-- The third wearer of this mark. `DailyDashboard` and `RecipeBuilder` each
       draw the same triangle, each with a comment saying why it is drawn and
       not typed: `▸`/`▾` fall outside every unicode-range Epilogue is served
       in, so a glyph is left to whatever fallback the device has. Extracting a
       shared mark here would decide the mark vocabulary's name, sizing contract
       and rotation API as a side effect of a select refactor; that is #317's
       ticket, which weighs eighteen marks rather than three. So the copy is
       named rather than hidden, and this site joins #317's population.

       Quarter-turned to point down, which is the closed-disclosure reading a
       select's caret carries everywhere. `pointer-events: none` so the mark
       cannot swallow a tap meant for the control underneath it. -->
  <svg class="select-mark" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 6 L17 12 L7 18 Z" fill="currentColor"></path>
  </svg>
</div>

<style>
  .select-wrapper {
    position: relative;
    display: inline-flex;
    width: 100%;
  }

  .select {
    width: 100%;
    /* Shrinkable, as `ui/Input`'s field is: a flex item's automatic minimum is
       its content's, and for a `<select>` that is the widest option label,
       which is wider than a form column on a phone. */
    min-width: 0;
    /* The floor is what a finger needs, and not what the padding happens to
       add up to (#336, ADR-0093). The rule below builds to 47px on an
       inherited line-height; the box this replaced built to 49 optimistic and
       43.6 pessimistic, which is a box that clears the floor on an assumption
       rather than clearing it. A declared floor holds under both readings. */
    min-height: var(--tap-min);
    background: transparent;
    border: var(--edge-thin);
    border-radius: var(--radius);
    /* Room on the right for the mark, which is drawn over the field rather
       than laid out beside it, so nothing but this padding keeps a long option
       label off it. */
    padding: var(--space-2xs) var(--space-l) var(--space-2xs) var(--space-s);
    color: var(--text-primary);
    font-family: inherit;
    font-size: var(--step-0);
    /* Declared rather than inherited: a form control takes the UA's
       `line-height: normal` over an inherited value, which draws a shorter box
       than the arithmetic above assumes. */
    line-height: 1.5;
    cursor: pointer;
    outline: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    /* Removes the UA's own button chrome so the mark above is the app's and
       not the browser's — the same decision `ui/Checkbox` made, for the same
       reason: without it a platform-drawn arrow sits inside a brutalist border
       and looks different on every device, which makes the one visible
       difference between a Select and an Input the only thing here owned by
       nobody. It removes the chrome and nothing else: the OS picker still
       opens, which is the whole argument for a native control. */
    appearance: none;
    -webkit-appearance: none;
  }

  .select:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.02);
  }

  .select:focus {
    border-color: var(--ink);
    box-shadow: 0 0 0 1px var(--ink);
    background: var(--paper);
  }

  .select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .select-mark {
    position: absolute;
    right: var(--space-s);
    top: 50%;
    width: 1em;
    height: 1em;
    font-size: var(--step-n1);
    color: var(--text-secondary);
    transform: translateY(-50%) rotate(90deg);
    pointer-events: none;
  }

  .select-wrapper:has(.select:disabled) .select-mark {
    opacity: 0.6;
  }
</style>
