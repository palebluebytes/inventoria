<script lang="ts">
  // @ts-expect-error - virtual module provided by vite-plugin-pwa
  import { useRegisterSW } from "virtual:pwa-register/svelte";
  import Button from "./Button.svelte";

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegistered(r: any) {
      console.log("SW Registered");
    },
    onRegisterError(error: any) {
      console.log("SW registration error", error);
    },
  });

  function close() {
    $needRefresh = false;
  }
</script>

{#if $needRefresh}
  <div class="reload-prompt" role="alert">
    <div class="message">
      <strong>New update available!</strong>
      <span>Reload to get the latest version.</span>
    </div>
    <div class="actions">
      <Button variant="primary" onclick={() => updateServiceWorker(true)}>
        Reload
      </Button>
      <Button variant="secondary" onclick={close}>Dismiss</Button>
    </div>
  </div>
{/if}

<style>
  .reload-prompt {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    background: var(--bg-surface, #fff);
    color: var(--text-primary, #000);
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
