<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLInputAttributes } from "svelte/elements";

  // The one checkbox (ADR-0068). A native `<input type="checkbox">` wrapped in
  // the `<label>` that names it: the platform already supplies the keyboard,
  // the checked state, the label association and the form participation, so
  // there is nothing here for bits-ui to add (ADR-0036's test). What this
  // primitive owns is the brutalist skin — the 1.35em box with a scaling inner
  // square — which was copied verbatim at five sites before it existed.
  //
  // There is one look and no size axis. The row's typography is the caller's
  // `class`, because two adopting rows carry a container-query font ramp
  // measured against their own label string. `...rest` spreads onto the input
  // as the a11y/semantics escape hatch (`name`, `required`, `form`, `value`,
  // `aria-*`, `data-*`), NOT a styling channel — same contract as Button.
  // `indeterminate` is deliberately absent: it is a DOM property rather than an
  // attribute, so `...rest` could not carry it, and no site wants a tri-state.
  type CheckboxProps = {
    checked?: boolean;
    /** Fires with the new state, so a call site persists without digging into the event. */
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    id?: string;
    class?: string;
  } & Omit<
    HTMLInputAttributes,
    "type" | "checked" | "disabled" | "id" | "class" | "children" | "onchange"
  > &
    // A name is not optional: one of `label` or `children` must be given, and
    // `children` wins when both are.
    (| { label: string; children?: Snippet }
      | { label?: string; children: Snippet }
    );

  let {
    checked = $bindable(false),
    onCheckedChange,
    label,
    children,
    disabled = false,
    id = undefined,
    class: className = "",
    ...rest
  }: CheckboxProps = $props();
</script>

<label class="checkbox {className}">
  <input
    {...rest}
    {id}
    type="checkbox"
    bind:checked
    {disabled}
    onchange={(e) => onCheckedChange?.(e.currentTarget.checked)}
  />
  <span class="checkbox-text">
    {#if children}{@render children()}{:else}{label}{/if}
  </span>
</label>

<style>
  .checkbox {
    display: flex;
    align-items: center;
    /* The `<label>` is the tap target, not the box inside it: the box is 1.35em
       and the row around it is what a finger lands on (ADR-0093). Without this
       the row draws 21px — a 20.25px box against a 21px line of `--step-n1` at
       1.4 — which is the largest shortfall #338 found, in the one place it
       reaches ten call sites at once.

       There is no size axis here and no dense variant, deliberately. An opt-out
       from the floor is an opt-out from the finger, and ADR-0089 §3's whole
       argument is that 48 does not vary with the context it is used in. */
    min-height: var(--tap-min);
    /* em-based so the box, the gap and the text scale together as one unit. */
    gap: 0.65em;
    font-size: var(--step-n1);
    font-weight: 700;
    line-height: 1.4;
    color: var(--ink);
    cursor: pointer;
    user-select: none;
    text-transform: uppercase;
  }
  /* The caps sit ~0.08em above the line-box centre (Epilogue's ascent is taller
     than its cap height), so flex centring alone leaves them floating high.
     Fallback for engines without text-box-trim: nudge the text down optically. */
  .checkbox-text {
    position: relative;
    top: 0.08em;
    /* The name takes the rest of the row, so a caller whose label is a row of
       its own — a channel name, a Badge and a right-aligned count — has the
       width to lay that out inside. */
    flex: 1;
    min-width: 0;
  }
  /* Preferred: trim the text box to the cap height so it hugs the glyphs. The
     box then *is* the caps, so flex centring aligns it exactly against the box
     at every font size — no magic nudge, symmetric top and bottom. */
  @supports (text-box-trim: trim-both) {
    .checkbox-text {
      text-box-trim: trim-both;
      text-box-edge: cap alphabetic;
      top: 0;
    }
  }
  /* A native checkbox forced to 1.35em only enlarges its hit box, leaving the
     ~13px glyph top-left inside it, which reads as misaligned with the label.
     appearance:none lets the control fill its own box so it centres cleanly
     against the text, in the ADR-0038 edge. */
  .checkbox input {
    appearance: none;
    -webkit-appearance: none;
    flex: 0 0 auto;
    display: grid;
    place-content: center;
    width: 1.35em;
    height: 1.35em;
    margin: 0;
    border: var(--edge);
    background: var(--paper);
    cursor: pointer;
  }
  .checkbox input::before {
    content: "";
    width: 0.62em;
    height: 0.62em;
    background: var(--ink);
    transform: scale(0);
  }
  .checkbox input:checked::before {
    transform: scale(1);
  }
  .checkbox input:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .checkbox input:disabled {
    cursor: not-allowed;
  }
  /* The whole row dims when the control is dead, as Button's :disabled does. */
  .checkbox:has(input:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
