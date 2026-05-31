<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    children,
    class: className = "",
  }: {
    children?: Snippet;
    class?: string;
  } = $props();
</script>

<div class="card {className}">
  {@render children?.()}
</div>

<style>
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: var(--space-m) var(--space-l);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    transition:
      transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
      box-shadow 0.2s;
  }

  .card:hover {
    transform: translateY(-2px);
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
</style>
