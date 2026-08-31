<script lang="ts">
  import { renderQrSymbol } from "../../p2p/qr-symbol";

  // The **Send code** as a symbol, for the half of the code's two carriers that
  // works when both people are in the same room (ADR-0072 §7).
  //
  // A real symbol rather than a picture of one, and sized for the code it
  // actually carries: about 100 characters is a version 5 QR, 37x37 modules,
  // read in 931 ms on hardware, and it does not grow with the meal. Point a
  // phone at it and it resolves to the link.
  //
  // `link` is null while the meal is still being read: the symbol's own
  // placeholder is what stands in for the gather, so the box does not resize
  // under the person holding the phone up.
  let { link }: { link: string | null } = $props();

  let svg = $state("");
  let failed = $state(false);

  $effect(() => {
    const text = link;
    if (text === null) return;
    let live = true;
    renderQrSymbol(text)
      .then((drawn) => {
        if (live) svg = drawn;
      })
      .catch(() => {
        // The code is still live and still carried by the link below the
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
<div class="qr" data-testid="send-code-symbol">
  {#if svg}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html svg}
  {:else if failed}
    <p class="qr-failed">This code could not be drawn. Send them the link.</p>
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
