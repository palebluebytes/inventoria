<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  // The one single-line field. `ui/Textarea` is its multi-line twin and wears
  // the same skin deliberately (#374): the two stand beside each other in the
  // same forms.
  //
  // **`class` is the wrapper's, not the input's.** A caller says where the
  // field sits — `flex: 1`, a width, a margin — and never what it looks like,
  // which is the whole of ADR-0038's frame arriving by reference rather than by
  // transcription. The one exception a caller may need is padding for an
  // adornment it draws itself over the field (a reveal toggle), and that is
  // reached with `:global(input)` under the caller's own class, which reads as
  // the exception it is.
  //
  // **It differs from `ui/Textarea` here, and the difference is the wrapper.**
  // Textarea has no wrapper, so its caller's class lands on the field itself;
  // this one does, because an adornment drawn over a field needs a box to be
  // positioned against, and both settings sheets draw one. So a caller styling
  // `ui/Textarea` reaches the field directly and a caller styling this reaches
  // the box around it. Neither is a channel for a look — that rule is the same
  // for both — but a rule written for one will not land on the other.
  //
  // **What #375 converged onto this.** Seven fields across four files wore
  // `.retro-input`: a mono 700 face, an inset shadow and a focus that inverted
  // the whole box to ink-on-paper. The rule was byte-identical in all four,
  // differing only by a `flex: 1` in one, which is what made it invisible — a
  // copy that renders the same everywhere is still four things a fix has to
  // reach — and it had crossed into Rations, a Facet that never asked for a
  // look invented in the media views. There was never an ADR behind it. Those
  // fields look like every other field now.
  //
  // `...rest` is the a11y/semantics/platform escape hatch (`aria-*`, `data-*`,
  // `name`, `autocomplete`, `min`, `max`, `step`, `onblur`), NOT a styling
  // channel — the same contract as Button, Checkbox and Textarea.
  type InputProps = {
    /**
     * `number` because `bind:value` on a `type="number"` field hands back a
     * number, and `null` because that is what an emptied one hands back — both
     * are the platform's, not this component's.
     */
    value?: string | number | null;
    placeholder?: string;
    type?: "text" | "password" | "email" | "number";
    id?: string;
    disabled?: boolean;
    /** Hints the on-screen keyboard (e.g. "numeric" for a barcode → number pad). */
    inputmode?:
      | "none"
      | "text"
      | "tel"
      | "url"
      | "email"
      | "numeric"
      | "decimal"
      | "search";
    onkeydown?: (e: KeyboardEvent) => void;
    /**
     * Every way text lands in the field, which a `onkeydown` cannot see: a
     * paste from the platform's own menu fires no key event at all.
     */
    oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void;
    class?: string;
  } & Omit<
    HTMLInputAttributes,
    | "value"
    | "placeholder"
    | "type"
    | "id"
    | "disabled"
    | "inputmode"
    | "onkeydown"
    | "oninput"
    | "class"
  >;

  let {
    value = $bindable(""),
    placeholder = "",
    type = "text",
    id = "",
    disabled = false,
    inputmode = undefined,
    onkeydown,
    oninput,
    class: className = "",
    ...rest
  }: InputProps = $props();
</script>

<div class="input-wrapper {className}">
  <input
    {...rest}
    {id}
    {type}
    {placeholder}
    {inputmode}
    bind:value
    {disabled}
    {onkeydown}
    {oninput}
    class="input"
  />
</div>

<style>
  .input-wrapper {
    position: relative;
    display: inline-flex;
    width: 100%;
  }

  .input {
    width: 100%;
    /* Shrinkable. The field is a flex item of the wrapper above it, and a flex
       item's automatic minimum is its content's — for an `<input>` that is the
       intrinsic width its `size` implies, roughly twenty characters, which is
       wider than a settings sheet on a phone. Both hand-rolled secret fields
       #375 converged carried this line on their own copy of the field, with a
       comment saying the same thing; it belongs to the primitive, so the next
       caller in a narrow column does not have to rediscover it. */
    min-width: 0;
    /* The floor is what a finger needs, and not what the padding happens to
       add up to. Everything else in this rule comes to 47px — `--space-2xs`
       above and below a `--step-0` line box, inside a `--edge-thin` — one pixel
       under `--tap-min` (#336, off #332 §4's measurement). Reaching 48 through
       the space scale instead would need a value between `--space-2xs` and
       `--space-xs`, and ADR-0089 §3 holds the space scale and the measurements
       apart precisely so that none exists: the next step up overshoots to 56px.
       `tests/unit/tap-targets.test.ts` re-derives all three numbers on every
       run, the 56 included, so the route not taken cannot drift either. */
    min-height: var(--tap-min);
    background: transparent;
    border: var(--edge-thin);
    border-radius: var(--radius);
    padding: var(--space-2xs) var(--space-s);
    color: var(--text-primary);
    font-size: var(--step-0);
    outline: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: inherit;
    position: relative;
    z-index: 1;
  }

  .input::placeholder {
    color: var(--text-muted);
    transition: opacity 0.2s;
  }

  .input:focus::placeholder {
    opacity: 0.5;
  }

  .input:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.02);
  }

  .input:focus {
    border-color: var(--ink);
    box-shadow: 0 0 0 1px var(--ink);
    background: var(--paper);
  }

  .input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
