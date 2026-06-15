<script lang="ts">
  import { Dialog } from "bits-ui";
  import type { Snippet } from "svelte";

  let {
    open = $bindable(true),
    onClose,
    title,
    overlayClass = "modal-overlay",
    children,
  }: {
    /** Bind for externally-controlled sheets; defaults open (parent mounts to show). */
    open?: boolean;
    /** Called whenever the dialog closes (Escape, backdrop, or a close button). */
    onClose?: () => void;
    /** Accessible label for the dialog (sets aria-label on the content). */
    title?: string;
    /** Class for the backdrop element (modals style their own dimmer). */
    overlayClass?: string;
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
        <div {...props} class={overlayClass}></div>
      {/snippet}
    </Dialog.Overlay>
    <Dialog.Content aria-label={title}>
      {#snippet child({ props })}
        {@render children({ props, close: () => (open = false) })}
      {/snippet}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
