<script lang="ts">
  import Card from "../../ui/Card.svelte";
  import Button from "../../ui/Button.svelte";
  import Checkbox from "../../ui/Checkbox.svelte";
  import Segmented from "../../ui/Segmented.svelte";
  import LogReviewSheet from "./LogReviewSheet.svelte";
  import {
    logExportEnabledFor,
    setLogExportEnabledFor,
  } from "../../stores/device-settings";
  import {
    channelEntryCount,
    clearChannel,
    dialPosition,
    DIAL_POSITIONS,
    isChannelRecording,
    setChannelRecording,
    setDialPosition,
    type LogChannel,
  } from "../../logs/log-facility";
  // From the roster rather than from the facility, because a registry filled by
  // import side effect answers with whatever somebody imported — which used to
  // be this screen's job, by way of a side-effect import of the one channel it
  // knew about. `logs/channels.ts` carries the argument (ADR-0092's roster
  // amendment); what changes here is which module is asked.
  import { channelsOfFacet } from "../../logs/channels";
  import type { FacetId } from "../../facets/registry";

  // The controls ADR-0053 §1 names — the entry count, a switch that stops the
  // recording, and an action that clears the log — plus the export switch and
  // ADR-0092 §4's dial. Control and discoverability come from these; they do not
  // come from making the instrument opt-in, because a recorder gated behind a
  // toggle that defaults to off measures nothing.
  //
  // What it lists comes from the facility's registry, generically, and never
  // from a list held here.
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
  // The root holds all six content domains, so its card stays jar-wide.
  // svelte-ignore state_referenced_locally
  const channels = channelsOfFacet(facetId);
  // This Facet's own export door (ADR-0080 §5). The root's switch no longer
  // speaks for food's channel: a Rations user has one of these on a surface
  // they can actually reach, which is what ADR-0078 §7 makes necessary.
  // svelte-ignore state_referenced_locally
  const exportEnabled = logExportEnabledFor(facetId);

  // Bumped by any action that changes what is stored, so the counts are re-read
  // rather than trusted from a snapshot.
  let revision = $state(0);

  // One derivation for the rows, keyed on `revision`: these are plain reads
  // rather than reactive stores, so a write has to say so.
  //
  // **A channel's row says what is held, never what it has decided.** This card
  // used to end with a verdict on #142 read off the search channel; ADR-0080 §6
  // deleted it, because a permanent readout of a question that has an ending is
  // how the #41 comments went stale, and because it put a maintainer reading a
  // ticket over the shoulder of someone who installed an app to log lunch. The
  // recording and the export are untouched, and the verdict is derivable from
  // the exported file by the person who cares, whenever they care.
  let stored = $derived.by(() => {
    void revision;
    return channels.map((channel) => ({
      channel,
      entries: channelEntryCount(channel),
      recording: isChannelRecording(channel),
    }));
  });

  let reviewing = $state(false);

  // The dial (ADR-0092 §4). **One dial, facility-wide, on a card that renders
  // once per Facet** — so both cards move the same value, and that is deliberate
  // twice over. It is the departure from every framework #264 surveyed, which
  // resolve a dial per logger; none of those arbitrates a shared fixed ceiling,
  // and asking a user to buy room in one channel by narrowing another is not
  // something any view can present honestly. And a Rations-only install is a
  // supported install with no way out (ADR-0078), so its user has to be able to
  // reach the control that governs what their device records.
  //
  // Held as the threshold's decimal string, because that is what a single-choice
  // control's values are; the facility stores the number.
  // svelte-ignore state_referenced_locally
  let dial = $state(String(dialPosition()));
  const dialOptions = DIAL_POSITIONS.map((position) => ({
    value: String(position.threshold),
    label: position.label,
  }));
  // The position the control is showing, found rather than parsed back: the
  // facility's own entry carries the threshold AND the words under the control,
  // so nothing here turns a string into a `DialPosition` by assertion.
  let chosen = $derived(
    DIAL_POSITIONS.find((position) => String(position.threshold) === dial)
  );
  // Writes only a move. The guard is what keeps the first run — which fires with
  // the position already in force — from creating the key nobody has touched.
  $effect(() => {
    if (chosen && chosen.threshold !== dialPosition())
      setDialPosition(chosen.threshold);
  });

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

  <div class="form-group">
    <Segmented
      options={dialOptions}
      bind:value={dial}
      label="How much is recorded"
    />
    <span class="help-text"
      >{chosen?.reads} It is not an off switch: each channel's Recording switch below
      is that.</span
    >
  </div>

  {#each stored as { channel, entries, recording } (channel.name)}
    <section class="channel">
      <div class="channel-head">
        <span class="channel-name">{channel.name}</span>
        <span class="count">{entries} entries of {channel.cap}</span>
      </div>
      <p class="purpose">{channel.purpose}</p>
      <!--
        Derived from `domain`, never from a channel name. It is the same field
        ADR-0092 §13's two filters read, so the sentence cannot drift from the
        behaviour and a second jar-wide channel inherits it without an edit.
        Without it, `Delete all my food data` takes two of the three rows on this
        card and leaves the third standing with nothing saying why.
      -->
      {#if channel.domain === null}
        <p class="jar-wide">
          The app's own, not one domain's. A Facet-scoped wipe leaves this
          standing; Clear takes it.
        </p>
      {/if}
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
  .lead,
  .purpose,
  .jar-wide,
  .help-text {
    font-size: var(--step-n1);
    color: var(--text-secondary);
    margin: var(--space-2xs) 0 0;
  }
  .purpose,
  .jar-wide,
  .help-text {
    font-size: var(--step-n2);
    font-style: italic;
  }
  .jar-wide {
    font-style: normal;
    font-weight: 700;
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
