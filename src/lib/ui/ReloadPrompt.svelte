<script lang="ts">
  // @ts-expect-error - virtual module provided by vite-plugin-pwa
  import { useRegisterSW } from "virtual:pwa-register/svelte";

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
      <button class="reload" onclick={() => updateServiceWorker(true)}
        >Reload</button
      >
      <button class="dismiss" onclick={close}>Dismiss</button>
    </div>
  </div>
{/if}

<style>
  .reload-prompt {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    background: var(--bg-surface);
    color: var(--text-base);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-m);
    padding: var(--space-m);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
    animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .message {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    font-size: var(--text-sm);
  }

  .actions {
    display: flex;
    gap: var(--space-s);
    justify-content: flex-end;
  }

  button {
    background: transparent;
    border: 1px solid var(--border-subtle);
    color: var(--text-base);
    padding: var(--space-xs) var(--space-s);
    border-radius: var(--radius-s);
    cursor: pointer;
    font-size: var(--text-sm);
    transition: background 0.2s;
  }

  button.reload {
    background: var(--brand-base);
    color: white;
    border-color: var(--brand-base);
    font-weight: 600;
  }

  button:hover {
    background: var(--bg-surface-hover);
  }

  button.reload:hover {
    background: var(--brand-hover);
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
