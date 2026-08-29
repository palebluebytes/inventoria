<script lang="ts">
  // PROTOTYPE — throwaway, dev-only. See `src/lib/send-proto/README.md`.
  //
  // A REAL symbol, not a picture of one. The whole point of drawing it here is
  // that #198 measured the code at 101 characters — QR version 5, 37x37 modules,
  // read in 931 ms — and told this ticket to size the on-screen symbol for that
  // rather than for the dense v35 a QR-carried payload would need. A mock at the
  // wrong density would answer that wrongly, so the writer the #198 probe
  // already self-hosts renders it. Point a phone at it; it resolves to the link.
  //
  // Dynamically imported so the zxing writer's wasm stays out of the food
  // screen's chunk.
  let { link, size = "18rem" }: { link: string; size?: string } = $props();

  let svg = $state("");

  /**
   * Make the writer's SVG scale to its box.
   *
   * zxing emits a root `<svg>` carrying its own `width`/`height` in module
   * units, which no stylesheet rule can beat once the markup is injected — the
   * symbol renders at 45px in the corner of whatever holds it. Stripping them
   * and leaning on a viewBox is what hands the sizing back to CSS, and zint's
   * output carries no viewBox at all, so one is synthesised from the dimensions
   * being removed rather than removing them blind.
   *
   * The 45 is 37 modules plus a 4-module quiet zone each side, which the writer
   * fills with an opaque white rect. That IS the margin around the symbol, and
   * it is why this box carries no padding of its own.
   */
  function fitToBox(raw: string): string {
    const cleaned = raw
      .replace(/<\?xml[^>]*\?>\s*/g, "")
      .replace(/<!DOCTYPE[^>]*>\s*/gi, "");
    return cleaned.replace(/<svg([^>]*)>/, (_m, attrs: string) => {
      const w = /\swidth="([^"]*)"/.exec(attrs)?.[1];
      const h = /\sheight="([^"]*)"/.exec(attrs)?.[1];
      let out = attrs
        .replace(/\s(width|height)="[^"]*"/g, "")
        .replace(/\sstyle="[^"]*"/g, "")
        .replace(/\spreserveAspectRatio="[^"]*"/g, "");
      if (!/\sviewBox=/.test(out) && w && h) {
        out += ` viewBox="0 0 ${parseFloat(w)} ${parseFloat(h)}"`;
      }
      return `<svg${out} preserveAspectRatio="xMidYMid meet">`;
    });
  }

  $effect(() => {
    const text = link;
    let live = true;
    (async () => {
      const { renderSymbol } = await import("../p2p-probe/qr-codec");
      const bytes = new TextEncoder().encode(text);
      const out = await renderSymbol(bytes, "L", "binary");
      if (!live) return;
      svg = fitToBox(out.svg);
    })().catch((e) => {
      if (live) svg = `<!-- ${String(e)} -->`;
    });
    return () => {
      live = false;
    };
  });
</script>

<!-- The margin around the symbol is the QR's own quiet zone, which the writer
     adds and a reader needs, rather than padding on this box. Adding both would
     shrink the symbol to buy a gap that is already there. -->
<div class="qr" style:--qr-size={size}>
  {#if svg}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html svg}
  {:else}
    <div class="qr-wait" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .qr {
    width: var(--qr-size);
    height: var(--qr-size);
    background: var(--paper);
    border: var(--edge);
    box-shadow: var(--shadow-2);
    display: grid;
    place-items: stretch;
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
</style>
