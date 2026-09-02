<script lang="ts">
  import { onMount } from "svelte";
  import { dbClient } from "./lib/db/db.client";
  import { runStartupErrands } from "./lib/facets/startup";
  import type { Facet } from "./lib/facets/registry";
  import {
    takeCodeHandover,
    takeReceiveLink,
    type ReceiveOpening,
  } from "./lib/p2p/receive-link";
  import { isIosSafariTab } from "./lib/p2p/safari-tab";
  import Badge from "./lib/ui/Badge.svelte";
  import FoodView from "./lib/views/FoodView.svelte";
  import CodeHandover from "./lib/views/food/CodeHandover.svelte";
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

  // ── A meal, arriving by link ──────────────────────────────────────────────
  //
  // **The receive link is Rations', and the root reads none** (ADR-0084 §5).
  // A meal is `event:consume_*` and food twins, so the hand-off belongs to the
  // Facet that owns them (§1) — and prefix matching is one-directional, so a
  // link at `/food/` opened by somebody who installed only the root is still
  // inside their scope and lands, while the reverse would eject a Rations user
  // into a browser tab. There is one arrival and one door.
  //
  // Receiving has no door of its own (ADR-0074 §4), so this is not a route and
  // there is nothing to navigate to. The link is `/food/#r=…&k=…` — the secret
  // in the fragment, so it reaches no server — and it is read here because the
  // URL belongs to the shell rather than to any one screen. What it opens
  // belongs to the food screen, which is where a meal is.
  //
  // §9's rule is what this shape is bought with: **the page that reads it is
  // served by the asset router, never by the Worker script.** A route falling
  // through to the script answers without the `cross-origin-*` headers
  // `_headers` puts on an asset — no cross-origin isolation, no
  // `SharedArrayBuffer`, and an in-memory database. `/food/index.html` is
  // Rations' own precached entry, served 200 as an asset (#312), so the hole is
  // avoided by never leaving it. Do not give receive an HTML entry of its own.
  let receiveLink = $state<ReceiveOpening | null>(null);

  // ── The one case that never opens the ledger ──────────────────────────────
  //
  // **A Safari tab on iOS never accepts a meal. It shows the code and says
  // where to put it** (ADR-0082 §2). The link cannot reach the installed app's
  // Ledger, so the page does not try: it hands the code to a door that already
  // exists, and mounts `CodeHandover` instead of the app.
  //
  // **This is read here, above the `init` below, and that ordering is §8.**
  //
  // > The page must not ask the browser to durably keep a jar it is in the
  // > middle of telling you is not yours.
  //
  // Both of §6's tests are synchronous property reads, so the gate is
  // affordable, and skipping is safe because this page mounts no view that
  // subscribes to a ledger store — which is the invariant the synchronous
  // kick-off below exists to protect. **Nothing else moves.**
  //
  // The read is total: `isIosSafariTab` swallows a signal that throws, and
  // `takeCodeHandover` swallows a `replaceState` the browser refused (ADR-0082
  // §9), so nothing here can reach ADR-0069's boot guard.
  const handover: ReceiveOpening | null =
    typeof window !== "undefined" && isIosSafariTab(window.navigator)
      ? takeCodeHandover({
          href: window.location.href,
          clean: (url) => window.history.replaceState(null, "", url),
        })
      : null;
  // Only the handover page reads this, and `handover` is non-null only when
  // there was a `window` to read it from — so the empty string is unreachable
  // rather than a fallback anything renders.
  const origin = handover === null ? "" : window.location.origin;

  // ── DB init ───────────────────────────────────────────────────────────────
  //
  // The same Jar as the root's, at the same path. A Facet is a face onto one
  // jar, not a jar of its own (ADR-0076 §1), so this opens the ledger the root
  // opens and every meal logged here is in the root's Food tab.
  let dbReady = $state(false);
  let dbError = $state("");

  // The same hook `App.svelte` hangs off `window`, and it is here for the same
  // reason it is there: `tests/receive-link.spec.ts` reads it to hold ADR-0082
  // §8's claim that the handover path opened no database at all, and it can
  // only read an absence it can tell apart from an absent hook. It is set
  // before the branch below, so the assertion is about `init` rather than about
  // this line.
  if (typeof window !== "undefined") {
    window.dbClient = dbClient;
  }

  // Kick off worker creation synchronously, before any child view subscribes to
  // a ledger store. init() assigns dbClient.worker and posts its `init` message
  // before its first await, so store queries that fire during the initial render
  // are queued behind that init message (the worker processes messages in order)
  // instead of racing an unset worker and rejecting with "not initialized".
  const initPromise = handover ? null : dbClient.init("/inventoria.db");

  onMount(async () => {
    // A page that is handing the code over opens nothing and asks for nothing
    // (ADR-0082 §8): no database, no persistence request, no corpus fetch and
    // no second reading of a URL it has already taken the code off. Every
    // errand below is an errand on behalf of a jar this page is telling you is
    // not yours.
    if (handover) return;
    // Every entry point's errands, including the request to keep the ledger.
    // The list is shared precisely so this entry cannot quietly skip one.
    runStartupErrands();
    // Before the ledger, not after it. ADR-0073 §10 measured the cold-boot
    // window out of existence on the strength of SQLite being entirely OFF the
    // mount path: waiting in the room needs a WebSocket and `crypto.subtle`,
    // not OPFS, so a meal can arrive and be shown while the database is still
    // opening — and a database that never opens must not swallow the link.
    readReceiveLink();
    try {
      await initPromise;
      dbReady = true;
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
    }
  });

  /**
   * Takes the code off the URL, once (ADR-0074 §8).
   *
   * **After mount and inside a `try`**, both forced rather than chosen.
   * ADR-0069's boot guard reads a throw during module evaluation as "this shell
   * cannot start" and wipes the service worker and every cache, so a malformed
   * fragment must not be able to reach it. The `try` is real work rather than
   * ceremony: `takeReceiveLink` deliberately lets a refused `replaceState` out,
   * because a code still sitting in the address bar is a code a reload could
   * spend a second time, and an ordinary boot is the safe reading of that.
   *
   * The read is what cleans the URL, so a reload is never a retry.
   */
  function readReceiveLink() {
    if (typeof window === "undefined") return;
    try {
      const link = takeReceiveLink({
        href: window.location.href,
        clean: (url) => window.history.replaceState(null, "", url),
      });
      if (link.kind === "none") return;
      receiveLink = link;
      // No tab to switch to: Rations is one screen, and the food screen is
      // already the one that is mounted.
    } catch {
      // An ordinary boot, which is the safe reading of a URL that could not be
      // cleaned. The sender is still standing there and mints another code.
    }
  }
</script>

<svelte:head>
  <title>{facet.name}</title>
  <!-- The Facet's own sentence, which its manifest also carries (#305). Read
       rather than repeated, so the two cannot come apart. -->
  <meta name="description" content={facet.description} />
</svelte:head>

{#if handover}
  <!-- ADR-0082 §2. Not a route and not a service-worker change (§11.3): the
       same fragment on the same `/food/`, answered by a different page. The
       app's own shell is deliberately absent — no food screen — because §8's
       skipped `init` is only safe while nothing here subscribes to a ledger
       store. -->
  <CodeHandover opening={handover} {origin} />
{:else}
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

      <!-- The link lands here (ADR-0084 §5), and the surface it opens is the
           food screen's. There is no Tab to wander off, which is ADR-0073 §10's
           clause satisfied by the shape rather than by an effect: leaving this
           screen is leaving Rations, and the payload, the socket and the code
           all die with the page. The Scan door's own code is cleared inside
           FoodView. -->
      <FoodView
        {dbReady}
        {receiveLink}
        onReceiveClose={() => (receiveLink = null)}
      />
    </main>

    <!-- Rations registers its own service worker and prompts its own clients.
         One deploy therefore prompts twice on a device with both Facets
         installed, which is accepted rather than mitigated: they are two
         installs with two precaches, and a single prompt updating both would
         claim an authority the registration model does not grant
         (ADR-0077 §8). -->
    <ReloadPrompt {facet} />
  </div>
{/if}

<style>
  .rations {
    display: flex;
    flex-direction: column;
    height: 100svh;
    background: var(--bg-base);
    /* All four, unlike the root's `.app`, which hands the bottom to its nav
       (ADR-0089 §2). Rations has no nav — that is ADR-0078 §1 — so nothing
       stands between this box and the home indicator, and the food screen's
       last row would sit under it. */
    padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
      env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
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
