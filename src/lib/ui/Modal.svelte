<script lang="ts">
  import { Dialog } from "bits-ui";
  import type { Snippet } from "svelte";

  let {
    open = $bindable(true),
    onClose,
    title,
    overlayBg = "rgba(0, 0, 0, 0.7)",
    overlayBlur = "blur(8px)",
    overlayZ = 998,
    children,
  }: {
    /** Bind for externally-controlled sheets; defaults open (parent mounts to show). */
    open?: boolean;
    /** Called whenever the dialog closes (Escape, backdrop, or a close button). */
    onClose?: () => void;
    /** Accessible label for the dialog (sets aria-label on the content). */
    title?: string;
    /** Backdrop dim colour (any CSS colour). */
    overlayBg?: string;
    /** Backdrop filter, e.g. `blur(8px)` or `none`. */
    overlayBlur?: string;
    /**
     * Backdrop stacking layer. Defaults to 998 (the card pins itself one above).
     * Raise it when this dialog is opened over another dialog so its dim also
     * covers the parent's card — see BottomSheet, which raises it above the
     * app's dialog layer.
     */
    overlayZ?: number;
    /** Renders the dialog card. Spread `props` onto your card element and call
        `close()` from close/cancel buttons. */
    children: Snippet<[{ props: Record<string, unknown>; close: () => void }]>;
  } = $props();

  // bits-ui fires onOpenChange only for its own close triggers (Escape,
  // outside-click), not for a programmatic `open = false`. Driving onClose from
  // the bound state covers every close path — Escape, backdrop, and buttons —
  // in one place, so consumers don't re-encode that quirk.
  $effect(() => {
    if (!open) onClose?.();
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay>
      {#snippet child({ props })}
        <div
          {...props}
          class="modal-overlay"
          style:background={overlayBg}
          style:backdrop-filter={overlayBlur}
          style:z-index={overlayZ}
        ></div>
      {/snippet}
    </Dialog.Overlay>
    <Dialog.Content aria-label={title}>
      {#snippet child({ props })}
        {@render children({ props, close: () => (open = false) })}
      {/snippet}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* Canonical modal backdrop. bits-ui portals the overlay and the card to the
     end of <body> as siblings, so the overlay only dims while each card pins
     itself one z-index above (cards use 999+). These styles MUST live here, not
     in each consumer's scoped block: the overlay element is rendered by this
     component, so a consumer's scoped `.modal-overlay` selector can never match
     it — which is why the dimmer previously failed to render. The dim colour,
     blur, and stacking layer vary per modal and arrive as inline styles via the
     props above (z-index defaults to 998). */
  .modal-overlay {
    position: fixed;
    inset: 0;
  }
</style>
