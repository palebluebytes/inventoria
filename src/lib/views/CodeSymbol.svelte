<script lang="ts">
  import { renderQrSymbol } from "../p2p/qr-symbol";

  // A code as a symbol, for the carrier that works when the two devices are in
  // the same room (ADR-0072 §7, ADR-0096 §8).
  //
  // A real symbol rather than a picture of one, and sized for the code it
  // actually carries: about 100 characters is a version 5 QR, 37x37 modules,
  // read in 931 ms on hardware, and it does not grow with what is being handed
  // over. Point a phone at it and it resolves to whatever text was written.
  //
  // **It is jar-wide rather than Rations'**, because the two codes with this
  // carrier are minted on different Facets: a Send code is Rations' and travels
  // as a link, a Pairing code is the root's and deliberately does not (ADR-0096
  // §8). What is drawn here is the text either one wrote.
  //
  // `text` is null while the caller is still working out what to draw — reading
  // a meal off the ledger, waiting for a room. The symbol's own placeholder is
  // what stands in for that, so the box does not resize under the person
  // holding the phone up.
  let { text }: { text: string | null } = $props();

  let svg = $state("");
  let failed = $state(false);

  $effect(() => {
    const drawing = text;
    if (drawing === null) return;
    let live = true;
    renderQrSymbol(drawing)
      .then((drawn) => {
        if (live) svg = drawn;
      })
      .catch(() => {
        // The code is still live and still carried in writing below the
        // symbol, so a writer that will not load costs the same-room carrier
        // and nothing else.
        if (live) failed = true;
      });
    return () => {
      live = false;
    };
  });
</script>

<!-- The margin around the symbol is the QR's own quiet zone, which the writer
     adds and a reader needs, rather than padding on this box. Adding both would
     shrink the symbol to buy a gap that is already there. -->
<div class="qr" data-testid="code-symbol">
  {#if svg}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html svg}
  {:else if failed}
    <p class="qr-failed">This code could not be drawn. Use the text below.</p>
  {:else}
    <div class="qr-wait" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .qr {
    /* Sized for a version 5 symbol at arm's length on a phone, which is what
       the code is: bigger buys nothing a camera can use, and smaller costs the
       read. */
    width: min(70vw, 15rem);
    height: min(70vw, 15rem);
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
  .qr-failed {
    place-self: center;
    margin: 0;
    padding: var(--space-2xs);
    font-size: var(--step-n2);
    color: var(--text-secondary);
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
