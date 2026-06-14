<script lang="ts">
  import type { Snippet } from "svelte";
  import { Dialog } from "bits-ui";

  let {
    isOpen = $bindable(false),
    title = "",
    children,
  }: {
    isOpen?: boolean;
    title?: string;
    children?: Snippet;
  } = $props();
</script>

<Dialog.Root bind:open={isOpen}>
  <Dialog.Portal>
    <Dialog.Overlay>
      {#snippet child({ props })}
        <div {...props} class="bottom-sheet-backdrop"></div>
      {/snippet}
    </Dialog.Overlay>
    <Dialog.Content>
      {#snippet child({ props })}
        <div {...props} class="bottom-sheet-content">
          <div class="bottom-sheet-handle-bar">
            <div class="drag-handle"></div>
          </div>

          <div class="bottom-sheet-header">
            <Dialog.Title>
              {#snippet child({ props })}
                <h2 {...props}>{title}</h2>
              {/snippet}
            </Dialog.Title>
            <button
              class="close-btn"
              onclick={() => (isOpen = false)}
              aria-label="Close">&times;</button
            >
          </div>

          <div class="bottom-sheet-body">
            {@render children?.()}
          </div>
        </div>
      {/snippet}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* bits-ui renders the backdrop and sheet as siblings: the backdrop only
     dims, and the sheet pins itself to the bottom. */
  .bottom-sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .bottom-sheet-content {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1001;
    background: var(--bg-surface, #fff);
    border: 3px solid #000;
    border-bottom: none;
    box-shadow: 0 -8px 0 #000;
    width: 100%;
    max-width: 600px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .bottom-sheet-handle-bar {
    display: flex;
    justify-content: center;
    padding: var(--space-xs) 0 0 0;
    cursor: pointer;
  }

  .drag-handle {
    width: 40px;
    height: 5px;
    background: #000;
    border: 1px solid #000;
  }

  .bottom-sheet-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #000;
    padding: 0 var(--space-m) var(--space-xs) var(--space-m);
    margin-top: var(--space-xs);
  }

  .bottom-sheet-header h2 {
    font-size: var(--step-1);
    font-weight: 700;
    margin: 0;
    text-transform: uppercase;
  }

  .close-btn {
    background: none;
    border: none;
    color: #000;
    font-size: 2rem;
    cursor: pointer;
    line-height: 1;
  }

  .close-btn:hover {
    transform: scale(1.1);
  }

  .bottom-sheet-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-m);
  }

  @keyframes slideUp {
    from {
      transform: translateX(-50%) translateY(100%);
    }
    to {
      transform: translateX(-50%) translateY(0);
    }
  }
</style>
