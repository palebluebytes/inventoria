<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  // The canonical surface primitive, carrying the ADR-0038 brutalist frame
  // (hard edge, square corner, offset shadow). One module covers both static
  // frames and interactive tiles: pass `onclick` and the card renders as a
  // native <button> (real press semantics + keyboard activation + the shared
  // focus ring); omit it and the card is a plain <div>. `...rest` is the
  // a11y/semantics escape hatch (aria-*, title, data-*), NOT a styling channel —
  // `class` stays for styling.
  let {
    onclick,
    children,
    class: className = "",
    ...rest
  }: {
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
    class?: string;
  } & HTMLAttributes<HTMLElement> = $props();
</script>

{#if onclick}
  <button
    {...rest}
    type="button"
    class="card card-pressable {className}"
    {onclick}
  >
    {@render children?.()}
  </button>
{:else}
  <div {...rest} class="card {className}">
    {@render children?.()}
  </div>
{/if}

<style>
  /* Fill and padding are the two things callers routinely need to vary, so they
     read through custom properties rather than being overridden by a competing
     selector: Svelte scopes this rule to `.card.svelte-<hash>`, which an outside
     `:global(.macro-item)` can never outrank without `!important`. A caller sets
     `--card-bg` / `--card-padding` on the card or any ancestor and it inherits
     down. `--card-bg` must be an opaque colour — the fill is what hides the
     pixel of frame shadow that runs under the border (see box-shadow below). */
  .card {
    background: var(--card-bg, var(--bg-card));
    /* The brutalist frame (ADR-0038). */
    border: var(--edge);
    border-radius: var(--radius);
    /* --shadow-2's frame (4px past the bottom/right), drawn as offset 3 + spread
       1 so the shadow runs a whole pixel *under* the card's own border instead of
       abutting it. Abutting edges land on a fractional device pixel whenever the
       fluid type/space scale gives the card a fractional height or offset: border
       and shadow are each antialiased to partial coverage and composite to a
       light seam, so the frame reads thin on whichever cards happen to fall
       off-pixel. The overlapping pixel hides behind the card's opaque fill. */
    box-shadow: 3px 3px 0 1px var(--ink);
    padding: var(--card-padding, var(--space-m) var(--space-l));
    transition:
      transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
      box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Reset the native <button> so a pressable card is visually identical to a
     static one, then layer the tile interactions on top. */
  .card-pressable {
    display: block;
    width: 100%;
    font: inherit;
    color: inherit;
    text-align: inherit;
    cursor: pointer;
  }

  /* One unified brutalist focus ring — a hard offset outline, shared with
     Button (ADR-0039). */
  .card-pressable:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  /* The pressable tile presses flush into the page on activation. */
  .card-pressable:active {
    transform: translate(2px, 2px);
    box-shadow: none;
  }

  /* Only lift on devices with a real hover-capable pointer. On touch screens
     :hover sticks after a tap, which reads as the card bouncing up with no way
     to un-hover. */
  @media (hover: hover) {
    .card-pressable:hover {
      transform: translateY(-2px);
      /* --shadow-3's frame, same flush-under-the-border geometry as above. */
      box-shadow: 7px 7px 0 1px var(--ink);
    }
  }
</style>
