<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";

  // The one multi-line field (#374). A native `<textarea>` wearing the house
  // field skin — the same one `ui/Input` draws, because the two stand beside
  // each other in the same forms and a description that wears a different edge
  // from the name above it is two looks in one box.
  //
  // Not a bits-ui component, by ADR-0036's test as ADR-0068 §1 restates it: a
  // primitive reaches for bits only where the platform has no control with the
  // behaviour. `<textarea>` already resizes, participates in a form, carries
  // `maxlength`, and is correct with every assistive technology, so there is
  // nothing to add.
  //
  // **The height axis is `rows`, and nothing else.** The ten sites this
  // replaced expressed a height three different ways — six declared `rows`,
  // five a CSS `min-height`, one a fixed `height` — and those are mostly the
  // same wish said twice: `min-height: 80px` beside `rows="3"` is one box. The
  // platform's own attribute is kept and the CSS is dropped, with a default of
  // 3 because a browser's own default of 2 is not a number anyone chose. The
  // one site that fills a region rather than declaring a height (`NoteEditor`)
  // says so in its `class`, the way `ui/Input` leaves every layout question.
  //
  // `...rest` is the a11y/semantics escape hatch (`aria-*`, `data-*`, `name`,
  // `maxlength`, `oninput`), NOT a styling channel — the same contract as
  // Button and Checkbox.
  type TextareaProps = {
    value?: string;
    placeholder?: string;
    /** The height axis. See above: `rows` is the whole of it. */
    rows?: number;
    id?: string;
    disabled?: boolean;
    class?: string;
  } & Omit<
    HTMLTextareaAttributes,
    "value" | "placeholder" | "rows" | "id" | "disabled" | "class"
  >;

  let {
    value = $bindable(""),
    placeholder = "",
    rows = 3,
    id = undefined,
    disabled = false,
    class: className = "",
    ...rest
  }: TextareaProps = $props();
</script>

<textarea
  {...rest}
  {id}
  {rows}
  {placeholder}
  {disabled}
  bind:value
  class="textarea {className}"
></textarea>

<style>
  .textarea {
    width: 100%;
    /* The floor is what a finger needs, for the reason `ui/Input`'s `.input`
       gives at length (#336, ADR-0093): a box that clears 48 on arithmetic is
       a box the next type-step change moves, and a declared floor holds under
       both line-height readings. A three-row field stands well clear of it —
       the floor is here for the caller who asks for one row. */
    min-height: var(--tap-min);
    background: transparent;
    border: var(--edge-thin);
    border-radius: var(--radius);
    padding: var(--space-2xs) var(--space-s);
    color: var(--text-primary);
    font-family: inherit;
    font-size: var(--step-0);
    /* Declared rather than inherited: a form control takes the UA's
       `line-height: normal` over an inherited value, and on a single-line
       field that only shortens the box, while here it sets the spacing between
       every line the user reads. */
    line-height: 1.5;
    outline: none;
    /* One look, one answer. Eight of the nine skins this replaced allowed a
       vertical drag and one forbade it; none wanted a horizontal one, which
       lets a field be dragged wider than the column holding it. */
    resize: vertical;
    /* Named properties rather than `all`, which `ui/Input` can afford and this
       cannot: `all` animates the height too, and a box the user drags to resize
       would lag a fifth of a second behind the pointer for the whole drag. */
    transition:
      border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
      box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1),
      background 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .textarea::placeholder {
    color: var(--text-muted);
    transition: opacity 0.2s;
  }

  .textarea:focus::placeholder {
    opacity: 0.5;
  }

  .textarea:focus {
    border-color: var(--ink);
    box-shadow: 0 0 0 1px var(--ink);
    background: var(--paper);
  }

  .textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
