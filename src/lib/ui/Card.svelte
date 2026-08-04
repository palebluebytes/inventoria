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
    border: 1px solid var(--border-accent);
    border-radius: var(--radius);
    padding: var(--space-m) var(--space-l);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Only lift on devices with a real hover-capable pointer. On touch screens
     :hover sticks after a tap, which reads as the card bouncing up with no way
     to un-hover. */
  @media (hover: hover) {
    .card:hover {
      transform: translateY(-2px);
    }
  }
</style>
