<script lang="ts">
  import type { Snippet } from "svelte";
  import BottomSheet from "../../ui/BottomSheet.svelte";

  // The shared chrome behind every food explainer — the tap-through sheets the
  // source tag, the NOVA badge and the dietary marks open. They are siblings a
  // user moves between from one row of tags, so they are ONE card: elevated over
  // the sheet the tag was tapped in, and pinned to a single height instead of
  // each sizing to its own copy. Sized to themselves, a two-line origin note and
  // the four-group NOVA scale produced wildly different cards; a body longer
  // than the card scrolls inside it, which the tall NOVA faces already did.
  //
  // Each explainer keeps its own body and its own state seam (`kind`/`verdict` →
  // null on close); only the frame lives here.
  let {
    title,
    children,
    onClose,
    class: className = "",
  }: {
    /** Header label. Kept short — the header is a label, not the food's name. */
    title: string;
    children: Snippet;
    /** Dismiss — the surface clears its explainer state back to null. */
    onClose: () => void;
    /** Extra class on the sheet, so an explainer can be targeted individually. */
    class?: string;
  } = $props();
</script>

<BottomSheet isOpen elevated {title} class="explainer {className}" {onClose}>
  {@render children()}
</BottomSheet>

<style>
  /* One height for every explainer. BottomSheet is rendered by the component
     above, so this reaches it globally — bounded by the `explainer` class this
     component is the only source of. */
  :global(.bottom-sheet-content.explainer) {
    height: 60vh;
  }
</style>
