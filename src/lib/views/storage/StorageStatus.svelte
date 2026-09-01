<script lang="ts">
  // What the browser has agreed to keep, and how much it is holding (ADR-0065).
  // It sits at the top of the Database Ledger card because it is the answer to
  // "is this safe here?", which is the question the wipe and the export below it
  // both follow from.
  //
  // A readout and nothing else: no prompt, no retry button, no blocked screen.
  // The request happens once at startup, and a browser that refused is stating a
  // policy rather than waiting to be asked again.
  import Badge from "../../ui/Badge.svelte";
  import { describeBytes } from "../../storage/describe-bytes";
  import {
    ensurePersistentStorage,
    readPersistenceState,
    readStorageEstimate,
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
   * Not the worker's invalidation broadcast: every append broadcasts, and this
   * readout must not churn while it is being read.
   */
  let { shown }: { shown: boolean } = $props();

  // Snapshots rather than stores. Both describe the moment the screen was last
  // opened, and neither should churn while it is being read.
  let persistence = $state<PersistenceState>("unknown");
  let estimate = $state<StorageEstimateReading | null>(null);

  $effect(() => {
    if (!shown) return;
    // Wait for the startup request to have settled, then report what the browser
    // says now. Opening Settings is never a second request: the first call is the
    // memoised one, and the second is a read. The two differ where a browser
    // granted persistence on its own after refusing at load, which Chromium does
    // as a site is used more, and where that happens the badge should say so.
    //
    // The whole reading re-runs on every return to the screen, request included:
    // re-running a memoised promise costs nothing, and the estimate is the half
    // that a wipe, an import or a corpus download all move.
    ensurePersistentStorage()
      .then(() => readPersistenceState())
      .then((state) => (persistence = state));
    readStorageEstimate().then((reading) => (estimate = reading));
  });

  let durability = $derived.by(() => {
    if (persistence === "persisted") {
      return {
        label: "Persistent",
        variant: "success" as const,
        line: "This browser has marked this site's storage as persistent, so it will not be cleared to reclaim disk space.",
      };
    }
    if (persistence === "best-effort") {
      return {
        label: "Best effort",
        variant: "warning" as const,
        line: "This browser did not grant persistent storage, so it may clear this site's data when the device runs short of space. Nothing needs doing about it here; the browser decides, and it may decide differently once the site has been used more.",
      };
    }
    return null;
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

{#if durability || sizeLine}
  <section class="storage-status">
    <div class="heading">
      <h3>Storage</h3>
      {#if durability}
        <Badge id="storage-persistence" variant={durability.variant}>
          {durability.label}
        </Badge>
      {/if}
    </div>
    {#if durability}
      <p class="figure">{durability.line}</p>
    {/if}
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
  .heading {
    display: flex;
    align-items: center;
    gap: var(--space-s);
  }
  h3 {
    font-size: var(--step-n1);
    font-weight: 800;
    text-transform: uppercase;
    color: var(--ink);
    margin: 0;
  }
  .figure {
    font-size: var(--step-n2);
    font-style: italic;
    color: var(--text-secondary);
    margin: var(--space-2xs) 0 0;
  }
</style>
