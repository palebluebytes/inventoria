<script lang="ts">
  // **"Your data" on Rations settings** (ADR-0080 §7): the four blocks a
  // food-only user has to work with, in one group — the Facet-scoped export,
  // the un-narrowed Ledger import, the Facet-scoped wipe, and the persistence
  // badge. ADR-0078 §7 leaves a standalone Rations user no route to root
  // Settings, so what is not here is nowhere.
  //
  // The heading is **"Your data"** and not "Your food data" (#335). It was the
  // narrower sentence while the block held only food-scoped controls; two of the
  // four are jar-wide, so the narrower heading would now be a claim about the
  // import that ADR-0080 §3 explicitly refuses. The delete button keeps its own
  // wording, which is ADR-0079 §5's and is about food alone.
  //
  // **Delete all my food data, with an export beside it** (ADR-0079 §5, §6).
  //
  // It is called "Delete all my food data" and never "Wipe Rations": in a
  // standalone install the user has no evidence Rations is part of anything, so
  // the Facet's own name reads as *the whole app*. The wording names the noun
  // the user thinks in and needs no vocabulary to parse.
  //
  // **This component is food's, not generic machinery**, which is the one place
  // this split departs from the shape `LogSettingsSection` set. Everything
  // underneath is Facet-generic — the predicate, the census, the delete, the
  // scoped export — and none of it is here. What is here is a sentence that
  // says "food", and the registry has no field it could be derived from: a
  // Facet declares what it is *called*, and §5's whole point is that its name is
  // the wrong word to use. A second Facet's wipe writes its own sentences over
  // the same machinery rather than parameterising these.
  //
  // **An export sits beside the delete** and that pairing is what makes the
  // delete defensible (§6). ADR-0080 §5 keeps inspection tools at the root, and
  // an export next to a raw datom viewer is an inspection tool — but an export
  // next to a delete button is a safety control, and shipping the irreversible
  // half alone into the one Facet that by ADR-0078 cannot reach the other half
  // is the worst available split. It is the ordinary `LedgerExportButton`,
  // narrowed to food's rows, so the file it writes is the same artifact in the
  // same grammar that the whole-ledger Import already reads.
  //
  // **One behaviour on every platform** (§7). Nothing here branches on
  // `display-mode`, `navigator.standalone` or a guess at which storage jar the
  // page is in — the page cannot detect that. It is also unnecessary: if iOS
  // gives each install its own jar then the counts below simply come back
  // smaller, and the wipe removes less than the user feared and never more.
  import Alert from "../../ui/Alert.svelte";
  import Button from "../../ui/Button.svelte";
  import Modal from "../../ui/Modal.svelte";
  import LedgerExportButton from "../ledger/LedgerExportButton.svelte";
  import LedgerImport from "../ledger/LedgerImport.svelte";
  import PersistenceBadge from "../storage/PersistenceBadge.svelte";
  import {
    refreshPersistenceState,
    type PersistenceState,
  } from "../../storage/persistent-storage";
  import { dbClient } from "../../db/db.client";
  import type { EntityCensus } from "../../db/db.core";
  import type { FacetId } from "../../facets/registry";
  import {
    domainCensusGroups,
    facetStorageKeys,
    planFacetWipe,
    runFacetWipe,
    type FacetWipePlan,
  } from "../../facets/facet-wipe";

  // The Facet these controls belong to. Rations, from either entry point: the
  // root opens this same sheet from the Food tab's gear, and a wipe scoped to
  // food is the same act on both surfaces (§6).
  const FACET: FacetId = "food";

  /** Whether the worker is up, which is what the import needs to be told. */
  let { dbReady }: { dbReady: boolean } = $props();

  let census = $state<EntityCensus | null>(null);
  let unreadable = $state(false);
  let confirming = $state(false);
  let running = $state(false);
  /** What happened, once. A wipe is not a thing to report twice. */
  let outcome = $state<{ ok: boolean; message: string } | null>(null);

  // Read on mount and re-read whenever the ledger changes underneath, so the
  // figure on the button is not older than the sheet. `onInvalidate` is how
  // every other reader in the app hears about a write.
  $effect(() => {
    readCensus();
    return dbClient.onInvalidate(() => readCensus());
  });

  function readCensus() {
    dbClient
      .entityCensus(domainCensusGroups())
      .then((read) => {
        census = read;
        unreadable = false;
      })
      .catch((err) => {
        // A count nobody could read is a delete button with no figure behind
        // it, and §5's whole claim is that the figures are real. So it stays
        // shut and says why, rather than falling back to a sentence about
        // policy.
        unreadable = true;
        console.error("Failed to census the ledger", err);
      });
  }

  // Derived off the census, so the storage keys are recounted every time the
  // ledger says something changed. `localStorage` is not a signal and a
  // preference written since the last census will not have moved this on its
  // own — which is why the figure is a count of records the wipe *will* find
  // rather than a promise about the instant it is read.
  let plan = $derived<FacetWipePlan | null>(
    census ? planFacetWipe(FACET, census, facetStorageKeys(FACET)) : null
  );

  // The scope the export button narrows itself with: the count it shows, the
  // rows it walks and the name of the file it writes, from one prefix set.
  let scope = $derived(
    plan
      ? { facet_id: plan.facetId, entity_prefixes: plan.entityPrefixes }
      : undefined
  );

  /** What stays, in the words the confirmation uses. Never a roster (§5). */
  let staysLine = $derived.by(() => {
    if (!plan) return "";
    if (plan.datomsStaying === 0)
      return "There is nothing else in this database.";
    const named = plan.stayingDomains.map((d) => d.name);
    const rows = `${plan.datomsStaying.toLocaleString()} datoms stay`;
    return named.length === 0 ? `${rows}.` : `${rows}: ${listOf(named)}.`;
  });

  /** `a`, `a and b`, `a, b and c` — the app's own voice, not `Intl`'s. */
  function listOf(names: string[]): string {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }

  // The run itself is `facets/facet-wipe.ts`'s, not this screen's — the ordering
  // of the three effects and the sentence that reports them are the parts worth
  // testing, and neither needs a Worker to exercise. Same split as
  // `views/ledger/export-run.ts`, and for the same reason.
  async function wipe() {
    if (!plan || running) return;
    running = true;
    try {
      const ended = await runFacetWipe(FACET, plan.entityPrefixes, {
        deleteDatoms: (prefixes) => dbClient.facetWipe(prefixes),
        reclaimSpace: () => dbClient.vacuum(),
      });
      if (ended.kind === "failed") console.error(ended.error);
      outcome = { ok: ended.kind === "wiped", message: ended.message };
      confirming = false;
    } finally {
      running = false;
    }
  }

  // **What the browser has agreed to keep** (ADR-0065), which is the one place
  // the app says data may be evicted and therefore follows the Facet (ADR-0080
  // §2, clause (a)). The usage figure beside it at the root does not: it is
  // per-origin, so here it would report the root's bytes, the bundled corpus
  // included, as this user's meals.
  //
  // Read on mount, with no `shown` prop. The root's Settings screen needs one
  // because it is rendered under every tab and merely hidden, so a mount there
  // means "the app opened" (#290). This is a bottom sheet: it is created when
  // the gear is pressed and destroyed when it is dismissed, so a mount is the
  // opening, and the prop would be a constant `true`.
  let persistence = $state<PersistenceState>("unknown");
  $effect(() => {
    refreshPersistenceState().then((state) => (persistence = state));
  });

  // A reload, not a re-render, and it is the point rather than a shortcut. Every
  // settings store in `stores/device-settings.ts` is seeded from `localStorage`
  // at import and held in memory for the life of the page — deliberately, so a
  // target the first paint depends on is right in the first frame. The keys are
  // gone now, and the only thing that makes those snapshots agree with the jar
  // again is a new first frame.
  function reload() {
    location.reload();
  }
</script>

<section class="food-data">
  <h2>Your data</h2>
  <p class="lead">
    Everything you have logged, kept on this device. Take a copy before you
    delete it — nothing here can be undone afterwards.
  </p>

  {#if plan}
    <p class="figure">
      {plan.datomsGoing.toLocaleString()} datoms: every food, recipe and meal in your
      history, superseded facts included.
    </p>
  {:else if unreadable}
    <p class="figure">
      The ledger could not be read, so there is nothing to count yet.
    </p>
  {/if}

  <LedgerExportButton
    id="export-food-data-btn"
    ready={!!plan}
    size="sm"
    label="Export my food data"
    {scope}
  />

  <!-- **The import, un-narrowed** (ADR-0080 §3). The same control the root
       offers, reading the same file in the same grammar the export above
       writes: it merges, it takes foreign rows and all, and it filters nothing
       on ownership. An import cannot be narrowed to a scope — a file is
       whatever the user hands it, so filtering would destroy rows the user is
       holding in their hand and refusing would make a whole-Jar backup
       unrestorable from the app that most needs restoring.

       The residue, said out loud below rather than hidden: rows this screen can
       neither show nor wipe can arrive through it. They came from the user's
       own export, and the root removes them if it is ever installed. -->
  <LedgerImport {dbReady} id="food-import-ledger-btn" />
  <p class="figure import-note">
    A file holds whatever was in it when it was written. If yours was taken from
    the whole app rather than from here, importing it puts all of it back —
    including anything from parts of the app this screen does not show, which it
    can neither list nor delete. The delete above takes food and nothing else,
    so on this screen an imported file is added to what is here rather than made
    the only truth.
  </p>

  <div class="danger-row">
    <Button
      id="delete-food-data-btn"
      variant="danger"
      size="sm"
      disabled={!plan || running}
      onclick={() => {
        outcome = null;
        confirming = true;
      }}
    >
      Delete all my food data
    </Button>
  </div>

  {#if outcome}
    <div class="result">
      <Alert variant={outcome.ok ? "success" : "error"}>{outcome.message}</Alert
      >
      {#if outcome.ok}
        <div class="reload-row">
          <Button size="sm" variant="secondary" onclick={reload}>Reload</Button>
          <span class="help-text">
            The screens behind this sheet still hold what was on them before.
          </span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Last, because it is the sentence the controls above follow from rather
       than a control of its own: what the browser has agreed to keep is the
       reason to hold a copy at all. Below the delete and its outcome, so
       nothing comes between a button and the report of what it did. -->
  <div class="persistence">
    <PersistenceBadge {persistence} id="food-storage-persistence" />
  </div>
</section>

{#if confirming && plan}
  <!-- Above the sheet that opened it: `BottomSheet` sits at 1700/1701, so a
       confirmation on the default dialog layer would open behind the surface
       the button is on. Same arrangement `LogReviewSheet`'s `elevated` uses,
       stated here rather than borrowed, because this is a Modal and not a
       sheet. -->
  <Modal
    onClose={() => (confirming = false)}
    title="Delete all my food data"
    overlayZ={1800}
  >
    {#snippet children({ props, close })}
      <div {...props} class="confirm-card">
        <h3>Delete all my food data?</h3>

        <!-- It counts against the ledger rather than reciting policy (§5). The
             wipe computes its own row set, so the figures are free, and a
             confirmation that reports on *your* data is the difference between
             one that is read and one that is clicked through. -->
        <ul class="ledger-figures">
          <li>
            <strong>{plan.datomsGoing.toLocaleString()} datoms</strong> go: every
            food, recipe and meal you have logged.
          </li>
          <li>
            <strong>{plan.storageGoing.toLocaleString()} local settings</strong>
            go: your nutrition targets and limits, your display preferences, and the
            search log this device keeps. An export does not carry these.
          </li>
          <li>{staysLine}</li>
          <li>
            Your Open Food Facts login and this device's identity are not
            touched.
          </li>
        </ul>

        <p class="warn">This cannot be undone.</p>

        <div class="confirm-actions">
          <Button
            variant="secondary"
            size="sm"
            onclick={close}
            disabled={running}
          >
            Cancel
          </Button>
          <Button
            id="confirm-delete-food-data-btn"
            variant="danger"
            size="sm"
            loading={running}
            disabled={running}
            onclick={wipe}
          >
            Delete everything
          </Button>
        </div>
      </div>
    {/snippet}
  </Modal>
{/if}

<style>
  .food-data {
    animation: fadeIn 0.3s ease-out;
    margin-top: var(--space-l);
    padding-top: var(--space-l);
    border-top: var(--edge);
  }
  h2 {
    font-size: var(--step-1);
    font-weight: 800;
    color: var(--ink);
    text-transform: uppercase;
    margin: 0;
  }
  h3 {
    font-size: var(--step-0);
    font-weight: 800;
    color: var(--ink);
    text-transform: uppercase;
    margin: 0;
  }
  .lead {
    font-size: var(--step-n1);
    color: var(--text-secondary);
    margin: var(--space-2xs) 0 0;
  }
  .figure {
    font-size: var(--step-n2);
    font-style: italic;
    color: var(--text-secondary);
    margin: var(--space-2xs) 0 0;
  }
  .danger-row {
    margin-top: var(--space-s);
  }
  /* The import's own paragraph, tucked under the block it qualifies rather than
     spaced off as a new one. */
  .import-note {
    margin-top: var(--space-xs);
  }
  .persistence {
    border-top: var(--edge);
    padding-top: var(--space-s);
    margin-top: var(--space-m);
  }
  .result {
    margin-top: var(--space-s);
  }
  .reload-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-top: var(--space-xs);
  }
  .help-text {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    font-style: italic;
  }
  /* One above this Modal's own backdrop, which the caller raised to 1800 so it
     covers the sheet underneath. */
  .confirm-card {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 1801;
    background: var(--paper);
    border: var(--edge-thick);
    box-shadow: var(--shadow-3);
    width: calc(100% - 2 * var(--space-s));
    max-width: 32rem;
    max-height: 85vh;
    overflow-y: auto;
    padding: var(--space-m);
  }
  .ledger-figures {
    margin: var(--space-s) 0 0;
    padding-left: var(--space-m);
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    font-size: var(--step-n1);
    color: var(--ink);
  }
  .warn {
    margin: var(--space-s) 0 0;
    font-size: var(--step-n1);
    font-weight: 800;
    text-transform: uppercase;
    color: var(--ink);
  }
  .confirm-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-xs);
    margin-top: var(--space-m);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
