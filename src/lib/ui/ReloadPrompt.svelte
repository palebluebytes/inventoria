<script lang="ts">
  // The update prompt, one per Facet (ADR-0077 §8). It takes the Facet it is
  // standing in rather than reaching for a virtual module;
  // `src/lib/facets/service-worker.ts` is where that measurement lives.
  import { untrack } from "svelte";
  import { registerFacetServiceWorker } from "../facets/service-worker";
  import type { Facet } from "../facets/registry";
  import Button from "./Button.svelte";

  let { facet }: { facet: Facet } = $props();

  let needRefresh = $state(false);

  // Read once, and `untrack` says so rather than leaving a warning to be
  // ignored: which Facet a shell is mounted under is a build-time constant
  // (ADR-0076 §6), so there is no later value for this to have missed.
  const registration = untrack(() =>
    registerFacetServiceWorker(facet, () => {
      needRefresh = true;
    })
  );
</script>

{#if needRefresh}
  <div class="reload-prompt" role="alert">
    <div class="message">
      <strong>New update available!</strong>
      <span>Reload to get the latest version.</span>
    </div>
    <div class="actions">
      <Button variant="primary" onclick={() => registration.update()}>
        Reload
      </Button>
      <Button variant="secondary" onclick={() => (needRefresh = false)}>
        Dismiss
      </Button>
    </div>
  </div>
{/if}

<style>
  .reload-prompt {
    position: fixed;
    /* Pinned to the viewport, so it sits outside the shell's padding and pays
       for its own insets (ADR-0089 §2). 1rem alone put the toast's lower edge
       inside the home indicator's band. */
    right: calc(env(safe-area-inset-right, 0px) + 1rem);
    bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem);
    background: var(--bg-surface, var(--paper));
    color: var(--text-primary, var(--ink));
    border: var(--edge);
    border-radius: var(--radius);
    padding: var(--space-m);
    box-shadow: var(--shadow-2);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
    animation: slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .message {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    font-size: var(--step-n1);
  }

  .actions {
    display: flex;
    gap: var(--space-s);
    justify-content: flex-end;
  }

  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(1rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
