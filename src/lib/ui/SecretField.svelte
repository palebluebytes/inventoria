<script lang="ts">
  import type { ComponentProps } from "svelte";
  import Input from "./Input.svelte";

  // A field whose value is masked, with a way to reveal it (#384, ADR-0100).
  //
  // **What earned it was not the count, it was the bill.** Two copies clears
  // ADR-0100 §1's trigger, and the reach here has already been **paid twice**:
  // `z-index: 2` at #375, then `2.75rem → var(--tap-min)` at #361, each one
  // cause written into two files by somebody who remembered the second copy
  // existed. ADR-0093's Consequences names the failure that did not happen only
  // by luck — *"a copy taken before a fix never receives it"*.
  //
  // **No bits-ui, by ADR-0068 §1.** The platform has the control: masking is
  // `type="password"`, revealing is assigning `"text"`, and the button is a
  // button. There is nothing here a headless library supplies.
  //
  // **The toggle sits over the field rather than beside it**, and that is a
  // measured decision rather than a style. A flex sibling made the field's
  // intrinsic monospace width overflow its sheet on a phone; positioning the
  // button over the field's right edge and paying for it with one
  // `padding-right` keeps the field free to shrink. The padding and the
  // button's width are **one token** so the gap cannot drift from the thing it
  // is leaving room for, and `z-index: 2` is not cosmetic — `ui/Input`'s field
  // carries `z-index: 1`, so without it the button both paints under a
  // transparent field and takes its clicks.
  //
  // `reveals` names the secret rather than the button: the accessible name is
  // built here as "Show …" / "Hide …", so a call site cannot ship one half of
  // the pair or word the two differently. `class` is the wrapper's placement
  // channel and `...rest` reaches `ui/Input`'s platform attributes
  // (`autocomplete`, `onblur`, `aria-*`) — the same contract every other field
  // primitive states.
  // The escape hatch is `ui/Input`'s own props rather than
  // `HTMLInputAttributes`, because this component *composes* that one:
  // everything `...rest` carries is handed straight to it, so borrowing the
  // platform's attribute type instead would let a call site pass something the
  // field cannot take.
  type SecretFieldProps = {
    value?: string | null;
    /** What is being masked, in the words the toggle should say: "TMDB API
     *  key" becomes "Show TMDB API key" / "Hide TMDB API key". */
    reveals: string;
    /** The wrapper's placement, never the field's look — `ui/Input`'s contract,
     *  one box further out. */
    class?: string;
  } & Omit<ComponentProps<typeof Input>, "value" | "type" | "class">;

  let {
    value = $bindable(),
    reveals,
    class: className = "",
    ...rest
  }: SecretFieldProps = $props();

  let revealed = $state(false);
</script>

<div class="secret-field {className}">
  <Input {...rest} type={revealed ? "text" : "password"} bind:value />
  <button
    type="button"
    class="reveal-toggle"
    aria-label={revealed ? `Hide ${reveals}` : `Show ${reveals}`}
    aria-pressed={revealed}
    onclick={() => (revealed = !revealed)}
  >
    {#if revealed}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        ><path
          d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        ></path><line x1="1" y1="1" x2="23" y2="23"></line></svg
      >
    {:else}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        ><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle
          cx="12"
          cy="12"
          r="3"
        ></circle></svg
      >
    {/if}
  </button>
</div>

<style>
  /* The box the toggle is positioned against. `tests/settings-ui.spec.ts`
     selects it by this name, which is reach 4 in ADR-0097's terms and the
     reason the name did not change when the box moved in here. */
  .secret-field {
    position: relative;
    display: flex;
  }

  /* Leave room for the toggle so masked text never runs under it. One token for
     both, so the gap cannot drift from the button's width. `:global` because
     the field is `ui/Input`'s element, which is the one exception that
     primitive's contract allows a caller drawing an adornment over it. */
  .secret-field :global(input) {
    padding-right: var(--tap-min);
  }

  .reveal-toggle {
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
    /* Was 2.75rem in both copies — Apple's 44pt (ADR-0089 §3). The field it
       sits in carries the floor, so `height: 100%` clears it; the width is this
       rule's own. */
    min-height: var(--tap-min);
    width: var(--tap-min);
    /* Above the field, which carries `z-index: 1` of its own. Without this the
       button paints and, worse, *takes its clicks* under a transparent field:
       same document order as before, different stacking. */
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--ink);
    cursor: pointer;
  }

  .reveal-toggle svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .reveal-toggle:hover {
    color: var(--text-secondary);
  }

  .reveal-toggle:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
  }
</style>
