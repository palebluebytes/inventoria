<script lang="ts">
  // **Whether this browser has agreed to keep the Jar** (ADR-0065), as a badge
  // and the sentence that reads it.
  //
  // Split out of `StorageStatus` for ADR-0080 §2, which cuts that card on a
  // badge/figure line rather than a block line: the badge answers *can this
  // device throw my food away*, which is clause (a) and therefore follows a
  // Facet, while the usage figure beside it is inspection — and inspection that
  // would lie, because `estimate()` is per-origin and a Rations user reading it
  // would attribute the root's bytes to their meals. So this is the half both
  // surfaces draw and the figure stays at the root (#335).
  //
  // **It takes the reading rather than making it.** The two surfaces learn that
  // they are being looked at in different ways — the root's Settings screen
  // mounts once per page load and needs a prop (#290), a bottom sheet mounts
  // when it opens — so each owns its own read and hands the answer here. That
  // keeps this component the shared thing it is: the badge, its variant and the
  // one sentence the app says about eviction.
  import Badge from "../../ui/Badge.svelte";
  import {
    isDecided,
    type PersistenceState,
  } from "../../storage/persistent-storage";

  let {
    /** What the browser last said. `unknown` renders nothing at all. */
    persistence,
    /**
     * The badge's DOM id. It has a default because the root's is the original,
     * and it is a prop because both surfaces can be mounted at once: on the root
     * the Settings screen is rendered under every tab while the food gear's
     * sheet is open, and one id on two live elements is an ambiguous selector
     * rather than a duplicate that shows.
     */
    id = "storage-persistence",
  }: {
    persistence: PersistenceState;
    id?: string;
  } = $props();

  // A readout and nothing else: no prompt, no retry button, no blocked screen.
  // The request happens once at startup, and a browser that refused is stating a
  // policy rather than waiting to be asked again.
  let durability = $derived.by(() => {
    if (!isDecided(persistence)) return null;
    if (persistence === "persisted") {
      return {
        label: "Persistent",
        variant: "success" as const,
        line: "This browser has marked this site's storage as persistent, so it will not be cleared to reclaim disk space.",
      };
    }
    return {
      label: "Best effort",
      variant: "warning" as const,
      line: "This browser did not grant persistent storage, so it may clear this site's data when the device runs short of space. Nothing needs doing about it here; the browser decides, and it may decide differently once the site has been used more.",
    };
  });
</script>

{#if durability}
  <div class="heading">
    <h3>Storage</h3>
    <Badge {id} variant={durability.variant}>
      {durability.label}
    </Badge>
  </div>
  <p class="figure">{durability.line}</p>
{/if}

<style>
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
