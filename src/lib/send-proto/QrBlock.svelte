<script lang="ts">
  // PROTOTYPE — throwaway, dev-only. See `src/lib/send-proto/README.md`.
  //
  // A REAL symbol, not a picture of one. The whole point of drawing it here is
  // that #198 measured the code at 101 characters — QR version 5, 37x37 modules,
  // read in 931 ms — and told this ticket to size the on-screen symbol for that
  // rather than for the dense v35 a QR-carried payload would need. A mock at the
  // wrong density would answer the sizing question wrongly, so the writer the
  // #198 probe already self-hosts renders it and the module count is printed
  // beside it. Point a phone at it; it resolves to the link.
  //
  // Dynamically imported so the zxing writer's wasm stays out of the food
  // screen's chunk.
  let { link, size = "18rem" }: { link: string; size?: string } = $props();

  let svg = $state("");
  let modules = $state("");

  $effect(() => {
    const text = link;
    let live = true;
    (async () => {
      const { renderSymbol } = await import("../p2p-probe/qr-codec");
      const bytes = new TextEncoder().encode(text);
      const out = await renderSymbol(bytes, "L", "binary");
      if (!live) return;
      svg = out.svg;
      modules = out.version;
    })().catch((e) => {
      if (live) svg = `<!-- ${String(e)} -->`;
    });
    return () => {
      live = false;
    };
  });
</script>

<div class="qr" style:--qr-size={size}>
  {#if svg}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html svg}
  {:else}
    <div class="qr-wait" aria-hidden="true"></div>
  {/if}
</div>
{#if modules}
  <p class="qr-note">{modules} modules · {link.length} characters</p>
{/if}

<style>
  .qr {
    width: var(--qr-size);
    height: var(--qr-size);
    background: var(--paper);
    border: var(--edge);
    box-shadow: var(--shadow-2);
    display: grid;
    place-items: center;
    padding: var(--space-3xs);
  }
  .qr :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
    /* Nearest-neighbour so a vector symbol lands on whole device pixels rather
       than being softened at the module edges, which is what a camera reads. */
    shape-rendering: crispEdges;
  }
  .qr-wait {
    width: 100%;
    height: 100%;
    background: repeating-conic-gradient(
      var(--bg-input) 0% 25%,
      var(--paper) 0% 50%
    );
    background-size: 8% 8%;
  }
  .qr-note {
    margin: var(--space-3xs) 0 0;
    font-family: var(--font-mono);
    font-size: var(--step-n3);
    color: var(--text-muted);
    text-align: center;
  }
</style>
