<script lang="ts">
  import { onMount } from "svelte";
  import { dbClient } from "./lib/db/db.client";
  import { runStartupErrands } from "./lib/facets/startup";
  import type { Facet } from "./lib/facets/registry";
  import Badge from "./lib/ui/Badge.svelte";
  import FoodView from "./lib/views/FoodView.svelte";
  import ReloadPrompt from "./lib/ui/ReloadPrompt.svelte";

  /**
   * Which Facet this is, handed in by the entry point that mounted this shell
   * (ADR-0076 §6). It arrives as a prop rather than being read here so that
   * `src/food-main.ts` stays the single place Rations' identity is named, and so
   * that nothing in this tree is ever tempted to work it out from a URL.
   */
  let { facet }: { facet: Facet } = $props();

  // ── The whole of Rations' chrome ──────────────────────────────────────────
  //
  // There is no Sidebar and no tab bar, and that is the decision rather than an
  // omission (ADR-0078 §1–2). Rations is one Tracked Domain, so it is one
  // screen, and a cross-Facet link is not forbidden here — it is
  // **unexpressible**, because the screen it would point at is not in this
  // build. The chrome is the food screen itself and the gear it already carries.
  //
  // Nothing tests `display-mode` (ADR-0078 §5): a visitor in a browser tab and a
  // visitor in an install get the same app, because two behaviours would be two
  // things to build and two things to prove.

  // ── DB init ───────────────────────────────────────────────────────────────
  //
  // The same Jar as the root's, at the same path. A Facet is a face onto one
  // jar, not a jar of its own (ADR-0076 §1), so this opens the ledger the root
  // opens and every meal logged here is in the root's Food tab.
  //
  // `App.svelte` additionally hangs the client off `window` for
  // tests/reactive-store.spec.ts, which drives the root. That hook is the root
  // suite's rather than the app's, so it is not repeated here.
  let dbReady = $state(false);
  let dbError = $state("");

  // Kick off worker creation synchronously, before any child view subscribes to
  // a ledger store. init() assigns dbClient.worker and posts its `init` message
  // before its first await, so store queries that fire during the initial render
  // are queued behind that init message (the worker processes messages in order)
  // instead of racing an unset worker and rejecting with "not initialized".
  const initPromise = dbClient.init("/inventoria.db");

  onMount(async () => {
    // Every entry point's errands, including the request to keep the ledger.
    // The list is shared precisely so this entry cannot quietly skip one.
    runStartupErrands();
    try {
      await initPromise;
      dbReady = true;
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
    }
  });
</script>

<svelte:head>
  <title>{facet.name}</title>
  <!-- The Facet's own sentence, which its manifest also carries (#305). Read
       rather than repeated, so the two cannot come apart. -->
  <meta name="description" content={facet.description} />
</svelte:head>

<div class="rations">
  <main class="main">
    {#if dbError}
      <!-- The root reports this in the Sidebar's footer badge. Rations has no
           sidebar to put it in, and a food screen that silently never becomes
           ready is the one failure a user cannot read off the page. -->
      <Badge class="w-full justify-center" variant="error">
        ✕ DB Error — {dbError}
      </Badge>
    {/if}

    <!-- No `receiveLink`: a receive link is minted at `/` and read there
         (ADR-0074 §8), and a Facet does not forward a hand-off aimed at the
         other one (ADR-0078 §6). #313 is what moves the mint to `/food/`. Until
         then there is no link for this shell to hold, so there is nothing for
         leaving the surface to clear — the Scan door's own code is cleared
         inside FoodView. -->
    <FoodView {dbReady} onReceiveClose={() => {}} />
  </main>

  <!-- Rations registers its own service worker and prompts its own clients. One
       deploy therefore prompts twice on a device with both Facets installed,
       which is accepted rather than mitigated: they are two installs with two
       precaches, and a single prompt updating both would claim an authority the
       registration model does not grant (ADR-0077 §8). -->
  <ReloadPrompt {facet} />
</div>

<style>
  .rations {
    display: flex;
    flex-direction: column;
    height: 100svh;
    background: var(--bg-base);
  }

  .main {
    flex: 1;
    padding: var(--space-m) var(--space-s);
    width: 100%;
    overflow-y: auto;
    position: relative;
  }

  @media (min-width: 768px) {
    .main {
      padding: var(--space-l) var(--space-xl);
      max-width: 54rem;
    }
  }
</style>
