<script lang="ts">
  import Card from "../../ui/Card.svelte";
  import Button from "../../ui/Button.svelte";
  import Badge from "../../ui/Badge.svelte";
  import Checkbox from "../../ui/Checkbox.svelte";
  import LogReviewSheet from "./LogReviewSheet.svelte";
  import {
    logExportEnabledFor,
    setLogExportEnabledFor,
  } from "../../stores/device-settings";
  import {
    channelEntryCount,
    channelsOfFacet,
    clearChannel,
    isChannelRecording,
    setChannelRecording,
    type LogChannel,
  } from "../../logs/log-facility";
  import type { FacetId } from "../../facets/registry";
  import type { VocabularyBarReading } from "../../logs/search-log";
  import {
    readSearchChannelBar,
    recomputeSearchChannelBar,
  } from "../../logs/search-log";

  // The controls ADR-0053 §1 names — the entry count, a switch that stops the
  // recording, and an action that clears the log — plus ADR-0054 §4's export
  // switch. Control and discoverability come from these; they do not
  // come from making the instrument opt-in, because a recorder gated behind a
  // toggle that defaults to off measures nothing.
  //
  // Importing the search channel's module is what REGISTERS it — a channel is
  // declared and registered in the same act — so this screen reaches it through
  // the one reading that is about that channel rather than about the facility,
  // and lists whatever else the registry holds generically.
  //
  // **One card, rendered once per Facet** (ADR-0080 §2). The Facet is the whole
  // of what changes between the two: which channels are listed, which key the
  // export switch writes, and what a review can carry out. Everything else is
  // the same machinery, which is why this takes an id and not a list — the
  // registry supplies identity and nothing here records what a Facet carries
  // (ADR-0080 §8).
  //
  // `elevated` is the one thing the Facet id does NOT decide, because it is not
  // about the Facet: it says the caller drew this card inside a BottomSheet, so
  // the review this card opens has to float above that sheet rather than land
  // on the same layer. The root draws it on a screen and Rations settings draws
  // it in a sheet, which is why the caller says so rather than the id implying
  // it — a third surface could do either.
  let { facetId, elevated = false }: { facetId: FacetId; elevated?: boolean } =
    $props();

  // Read once, on purpose: which Facet a card belongs to is fixed by the surface
  // that drew it — `root` on Settings, `food` on Rations settings — and neither
  // call site can hand this component a different one while it is mounted.
  //
  // Its own channels only, derived from the domains the Facet already declares.
  // The root holds all six, so its card stays jar-wide.
  // svelte-ignore state_referenced_locally
  const channels = channelsOfFacet(facetId);
  // This Facet's own export door (ADR-0080 §5). The root's switch no longer
  // speaks for food's channel: a Rations user has one of these on a surface
  // they can actually reach, which is what ADR-0078 §7 makes necessary.
  // svelte-ignore state_referenced_locally
  const exportEnabled = logExportEnabledFor(facetId);

  // Bumped by any action that changes what is stored, so the counts and the bar
  // are re-read rather than trusted from a snapshot.
  let revision = $state(0);

  // The #142 readout is the root's row and nobody else's (ADR-0080 §2), and §6
  // deletes it outright — #303 is that deletion. Both reads are guarded on the
  // Facet rather than only the markup: `recomputeSearchChannelBar` fetches the
  // USDA corpus, and paying for it to draw nothing would be the cost of a
  // readout Rations does not have.
  // svelte-ignore state_referenced_locally
  const showsSearchBar = facetId === "root";

  // One derivation for everything read out of storage, keyed on `revision`:
  // these are plain reads rather than reactive stores, so a write has to say so.
  let stored = $derived.by(() => {
    void revision;
    return {
      rows: channels.map((channel) => ({
        channel,
        entries: channelEntryCount(channel),
        recording: isChannelRecording(channel),
      })),
      // What the channel says about #142 (ADR-0053 §7, as amended): two counts
      // rather than a rate over a window, because the app is not in use yet and
      // a calendar with no start decides nothing.
      bar: showsSearchBar ? readSearchChannelBar() : null,
    };
  });
  // The same bar re-read against the vocabulary as it stands now (§4). Async,
  // because it needs the corpus; null until it arrives, and null for good if the
  // artifact will not load, which costs this panel a line and nothing else.
  let barToday = $state<VocabularyBarReading | null>(null);
  $effect(() => {
    void revision;
    if (!showsSearchBar) return;
    recomputeSearchChannelBar()
      .then((reading) => (barToday = reading))
      .catch(() => (barToday = null));
  });

  let reviewing = $state(false);

  function toggleRecording(channel: LogChannel<unknown>, on: boolean) {
    setChannelRecording(channel, on);
    revision += 1;
  }

  function clear(channel: LogChannel<unknown>) {
    clearChannel(channel);
    revision += 1;
  }

  // A device setting, not a datom: it enables a door rather than recording an
  // agreement, and the agreement is the review sheet you read before exporting
  // (ADR-0086 §2).
  function persistExportEnabled(next: boolean) {
    setLogExportEnabledFor(facetId, next);
  }
</script>

<Card class="mt-4">
  <h2>Local Logs</h2>
  <p class="lead">
    Kept on this device only. There is no sink, no endpoint and no upload
    anywhere in this facility: the one way a record leaves is a file you export
    by hand after reading it.
  </p>

  <div class="form-group">
    <Checkbox
      id="log-export-toggle"
      class="opt-in-toggle"
      label="Allow exporting local logs"
      checked={$exportEnabled}
      onCheckedChange={persistExportEnabled}
    />
    <span class="help-text"
      >Off by default. It enables the export button; you still choose which
      channels go into the file and read them first.</span
    >
  </div>

  {#each stored.rows as { channel, entries, recording } (channel.name)}
    <section class="channel">
      <div class="channel-head">
        <span class="channel-name">{channel.name}</span>
        <Badge
          variant={channel.sensitivity === "personal" ? "warning" : "neutral"}
          >{channel.sensitivity}</Badge
        >
        <span class="count">{entries} entries of {channel.cap}</span>
      </div>
      <p class="reader">{channel.reader}</p>
      <div class="channel-actions">
        <Checkbox
          label="Recording"
          checked={recording}
          onCheckedChange={(on) => toggleRecording(channel, on)}
        />
        <Button
          variant="danger"
          size="sm"
          disabled={entries === 0}
          onclick={() => clear(channel)}>Clear</Button
        >
      </div>
    </section>
  {/each}

  <!-- ADR-0080 §2 gives this row to the root and nothing to Rations, and §6
       deletes it outright: a verdict about a corpus decision is a maintainer
       reading a ticket over the user's shoulder, on the screen of an app they
       installed to log lunch. #303 is the deletion; until it lands the readout
       stays where it already was and goes nowhere new. -->
  {#if stored.bar}
    {@const bar = stored.bar}
    <section class="channel">
      <h3>What the search log says about #142</h3>
      <p class="reader">
        {bar.mid_phrase} of {bar.settled_empty} settled empty searches carried a vocabulary
        word inside a longer phrase. Six of them build the per-token tier; forty settled
        empty searches with fewer than six close it as a settled no.
      </p>
      <p class="verdict">Verdict: {bar.verdict}</p>
      {#if barToday}
        <p class="reader">
          Against today's vocabulary, which re-derives on every corpus change: {barToday.mid_phrase}
          of {barToday.settled_empty} — {barToday.verdict}.
        </p>
      {/if}
    </section>
  {/if}

  <div class="actions-row mt-4">
    <Button variant="secondary" onclick={() => (reviewing = true)}>
      Review and Export
    </Button>
  </div>
</Card>

{#if reviewing}
  <LogReviewSheet
    {facetId}
    {elevated}
    onClose={() => {
      reviewing = false;
      revision += 1;
    }}
  />
{/if}

<style>
  h2 {
    font-size: var(--step-1);
    font-weight: 800;
    color: var(--ink);
    text-transform: uppercase;
    margin: 0;
  }
  h3 {
    font-size: var(--step-n1);
    text-transform: uppercase;
    margin: 0 0 var(--space-2xs);
  }
  .lead,
  .reader,
  .help-text {
    font-size: var(--step-n1);
    color: var(--text-secondary);
    margin: var(--space-2xs) 0 0;
  }
  .reader,
  .help-text {
    font-size: var(--step-n2);
    font-style: italic;
  }
  .verdict {
    font-weight: 800;
    text-transform: uppercase;
    margin: var(--space-2xs) 0 0;
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    margin-top: var(--space-m);
  }
  .channel {
    border-top: var(--edge);
    padding-top: var(--space-s);
    margin-top: var(--space-s);
  }
  .channel-head {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    font-weight: 800;
    text-transform: uppercase;
  }
  .channel-name {
    font-size: var(--step-0);
  }
  .count {
    margin-left: auto;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .channel-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    margin-top: var(--space-s);
  }
  .actions-row {
    display: flex;
    gap: var(--space-s);
  }
  .mt-4 {
    margin-top: var(--space-m);
  }
  /* The rows are the shared Checkbox (ADR-0068). Only this opt-in row's
     departure from the house look stays here — a sentence-case label that wraps
     rather than clips, with the box aligned to its first line — reached via
     :global as the class rides the primitive's label. */
  .form-group :global(.opt-in-toggle) {
    align-items: flex-start;
    text-transform: none;
    line-height: 1.35;
  }
</style>
