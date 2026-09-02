<script lang="ts">
  // What the browser has agreed to keep, and how much it is holding (ADR-0065).
  // It sits at the top of the Database Ledger card because it is the answer to
  // "is this safe here?", which is the question the wipe and the export below it
  // both follow from.
  //
  // **The root's card, and only the root's** (ADR-0080 §2). The badge below is
  // shared with Rations; the usage figure is not, because `estimate()` is
  // per-origin and would report the root's bytes as food's on a surface that
  // shows nothing but food. The reading of both halves is here, because the
  // thing this screen has to work around — a Settings screen that mounts once
  // per page load — is this screen's and not the badge's (#290).
  import PersistenceBadge from "./PersistenceBadge.svelte";
  import { describeBytes } from "../../storage/describe-bytes";
  import {
    isDecided,
    readStorageEstimate,
    refreshPersistenceState,
    type PersistenceState,
    type StorageEstimateReading,
  } from "../../storage/persistent-storage";

  /**
   * Whether the screen this sits on is the one being looked at — threaded from
   * the root's active tab, through Settings ([#290](https://github.com/palebluebytes/inventoria/issues/290)).
   *
   * A prop rather than a mount, because the Settings screen is rendered under
   * every tab and merely hidden, so it mounts once per page load and never
   * again. A mount-time effect read at app startup and never afterwards: the
   * figure below was frozen from the moment the *app* opened, which is why
   * wiping the database left it unmoved on the very screen the button sits on.
   *
   * ADR-0065 §2 already reasoned that the request is memoised and the reading
   * is not, so that a badge cannot report a refusal from ten minutes ago. That
   * split was real per mount, and a screen that never unmounts defeated it.
   *
   * It is not the only way in: a wipe happens while this is already `true`, so
   * `read` below is exported for the screen to call directly.
   */
  let { shown }: { shown: boolean } = $props();

  // Snapshots rather than stores. Both describe the moment the screen was last
  // opened, and neither should churn while it is being read.
  let persistence = $state<PersistenceState>("unknown");
  let estimate = $state<StorageEstimateReading | null>(null);

  /**
   * Takes the reading, and is exported so the screen can ask for it again
   * ([#290](https://github.com/palebluebytes/inventoria/issues/290)).
   *
   * The prop above answers "is this being looked at", which is the wrong
   * question during a wipe: the button is on this card, so `shown` is already
   * `true` and stays `true` throughout, nothing re-runs, and the figure would
   * sit frozen with the person still standing in front of it. Settings reaches
   * this by `bind:this` after the wipe has finished — one caller, after one
   * operation known to move the number.
   *
   * Deliberately not the worker's invalidation broadcast: every append
   * broadcasts, and this readout must not churn while it is being read.
   *
   * A fresh reading is attempted, not promised. Quota accounting is not
   * required to be synchronous with the change behind it, so a browser may
   * still answer with the old figure — which is what the estimate is at any
   * other moment too.
   *
   * Wait for the startup request to have settled, then report what the browser
   * says now. Opening Settings is never a second request: the first call is the
   * memoised one, and the second is a read. The two differ where a browser
   * granted persistence on its own after refusing at load, which Chromium does
   * as a site is used more, and where that happens the badge should say so.
   *
   * Both halves re-run every time, request included: re-running a memoised
   * promise costs nothing, and the estimate is the half that a wipe, an import
   * or a corpus download all move.
   */
  export function read() {
    refreshPersistenceState().then((state) => (persistence = state));
    readStorageEstimate().then((reading) => (estimate = reading));
  }

  $effect(() => {
    if (!shown) return;
    read();
  });

  // Both figures are optional in the Storage standard, so each combination gets
  // a sentence of its own rather than a template with holes in it. The last
  // clause is the honest part: the number is the whole origin, and no part of it
  // can be attributed to the ledger.
  let sizeLine = $derived.by(() => {
    const usageBytes = estimate?.usageBytes ?? null;
    const quotaBytes = estimate?.quotaBytes ?? null;
    const origin =
      " That covers everything stored for the site, the bundled food data and the app itself included, rather than the ledger alone.";
    if (usageBytes !== null && quotaBytes !== null) {
      return `This site is using about ${describeBytes(usageBytes)} of the roughly ${describeBytes(quotaBytes)} this browser allows it.${origin}`;
    }
    if (usageBytes !== null) {
      return `This site is using about ${describeBytes(usageBytes)}, and this browser does not say how much it allows.${origin}`;
    }
    if (quotaBytes !== null) {
      return `This browser allows this site about ${describeBytes(quotaBytes)} and does not say how much of it is in use.`;
    }
    return "";
  });
</script>

{#if isDecided(persistence) || sizeLine}
  <section class="storage-status">
    <!-- The badge and its sentence, which Rations draws too (ADR-0080 §2). The
         reading stays here, because #290's `shown` is this screen's problem and
         not the component's. -->
    <PersistenceBadge {persistence} />
    {#if sizeLine}
      <p class="figure">{sizeLine}</p>
    {/if}
    <p class="figure">
      Either way this is not a backup. Clearing site data takes it, so does Wipe
      Database, and so does losing the device. Export the ledger for that.
    </p>
  </section>
{/if}

<style>
  .storage-status {
    border-top: var(--edge);
    padding-top: var(--space-s);
    margin-top: var(--space-m);
  }
  .figure {
    font-size: var(--step-n2);
    font-style: italic;
    color: var(--text-secondary);
    margin: var(--space-2xs) 0 0;
  }
</style>
