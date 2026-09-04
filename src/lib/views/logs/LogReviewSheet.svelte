<script lang="ts">
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import Button from "../../ui/Button.svelte";
  import Checkbox from "../../ui/Checkbox.svelte";
  import { logExportEnabledFor } from "../../stores/device-settings";
  import {
    buildLogExport,
    channelCounters,
    channelsOfFacet,
    deleteChannelEntry,
    partitionChannel,
    type LogChannel,
  } from "../../logs/log-facility";
  import type { FacetId } from "../../facets/registry";
  import { downloadLogExport } from "./export-target";

  // The review the export is conditional on (ADR-0092 §11): the exact payload,
  // shown before anything is written, each channel chosen individually. One
  // switch over everything would be a consent surface that does not mean what it
  // appears to.
  //
  // **Nothing marks a channel as sensitive, and nothing replaces the marking.**
  // ADR-0092 §11 deleted `ChannelSensitivity` rather than renaming it: a badge on
  // a channel is field classification wearing a different word, and the reading
  // and the choosing below are the whole of the protection. What a channel holds
  // is said by its `purpose`, in prose, which is why that field got more
  // load-bearing rather than less.
  //
  // Redaction happens here too, and it is a DELETION from the channel rather
  // than an exclusion from one export: two states would mean this screen shows
  // something other than what exists.
  //
  // The review is **this Facet's**, both halves of it: it offers the channels
  // the Facet's own domains write, and its door is the Facet's own opt-in
  // (ADR-0080 §2, §5). Rations reviewing the root's channels would be a Facet
  // exporting records of acts it did not perform.
  //
  // `elevated` raises this sheet over a sheet it was opened from — Rations
  // settings is one, the root's Settings screen is not — so its backdrop dims
  // the parent card instead of landing beside it on the same layer.
  let {
    facetId,
    elevated = false,
    onClose,
  }: { facetId: FacetId; elevated?: boolean; onClose: () => void } = $props();

  // Read once, like the card that opened this: the review belongs to whichever
  // Facet's Local Logs card is behind it, and that cannot change mid-sheet.
  // svelte-ignore state_referenced_locally
  const channels = channelsOfFacet(facetId);
  // svelte-ignore state_referenced_locally
  const exportEnabled = logExportEnabledFor(facetId);
  // Stamped once, and used for BOTH the preview and the file, so what the review
  // showed is byte for byte what leaves. It dates the export to the moment it
  // was reviewed, which is the moment that matters here.
  const exported_at = Date.now();

  // Nothing is selected at first, so the export button starts inert and every
  // channel that leaves is one the user picked.
  let selectedNames = $state<string[]>([]);
  // Bumped by a delete, so what is shown is re-read from storage rather than
  // from a snapshot that no longer matches what exists.
  let revision = $state(0);

  let selected = $derived(
    channels.filter((c) => selectedNames.includes(c.name))
  );
  // One walk per channel, holding both halves: what this build can read and how
  // many records it cannot. The second is disclosed rather than hidden (#229) —
  // a channel holding only unreadable records used to print "Nothing recorded
  // yet" over records that were really there.
  //
  // **Why this is not read off `payload` instead**, which #229 §7 assumed it
  // would be. The payload carries the SELECTED channels, and this screen has to
  // show every channel before anything is selected — that is what the reading is
  // for — and has to offer redaction per entry in each. The two are still one
  // surface in the sense the ticket meant: both numbers come from the same pure
  // `partitionChannel` over the same store, keyed on the same `revision`, so a
  // redaction moves them together and neither can drift from the file.
  let contentsByChannel = $derived.by(() => {
    void revision;
    return new Map(channels.map((c) => [c.name, partitionChannel(c)] as const));
  });
  // The counters, read off the same store on the same key, so the screen and
  // the file below cannot show different totals (ADR-0092 §9). They belong on
  // THIS screen more than any entry does: they are the part a Delete does not
  // reach, so a review that showed only entries would be showing less than what
  // exists on the one surface whose whole job is to show what exists.
  let countersByChannel = $derived.by(() => {
    void revision;
    return new Map(
      channels.map((c) => [c.name, channelCounters(c, exported_at)] as const)
    );
  });

  // "since 5 September", never "lifetime" (#214 §9): after a Clear the totals
  // start again, and a word implying otherwise would be the screen lying about
  // a number it can see the epoch of.
  const sinceLabel = (since: number) =>
    new Date(since).toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  // The value the file will hold, built by the same function the export calls:
  // the review IS the payload, not a summary of it.
  let payload = $derived.by(() => {
    void revision;
    return buildLogExport(selected, exported_at);
  });
  // Serialised ONCE. This exact string is what the review renders below and
  // what `downloadLogExport` is handed, so the reviewed bytes and the written
  // bytes are one value rather than two stringifications that could drift.
  let payloadText = $derived(JSON.stringify(payload, null, 2));

  function toggleChannel(name: string, on: boolean) {
    selectedNames = on
      ? [...selectedNames, name]
      : selectedNames.filter((n) => n !== name);
  }

  function redact(channel: LogChannel<unknown>, index: number) {
    deleteChannelEntry(channel, index);
    revision += 1;
  }

  // The only way a record leaves this device (ADR-0054 §5): a file, written
  // locally, after the user has read the whole of what it holds. There is no
  // sink, no endpoint and no optional remote mode anywhere in the facility.
  //
  // The vehicle is `./export-target`, one named module, and this screen holds
  // no `Blob` and no anchor of its own — which is what lets
  // `scripts/log-egress-check.mjs` name the one place bytes may leave and fail
  // on a second (#213 §2, #223).
  function exportSelected() {
    downloadLogExport(payloadText, exported_at);
  }
</script>

<BottomSheet isOpen title="Review Local Logs" {elevated} {onClose}>
  <p class="lead">
    Nothing here has been sent anywhere. Choose the channels you want to hand
    over, read what they hold, and the export writes exactly that to a file.
  </p>

  {#each channels as channel (channel.name)}
    {@const contents = contentsByChannel.get(channel.name)}
    {@const entries = contents?.entries ?? []}
    {@const unreadable = contents?.unreadable ?? 0}
    {@const counters = countersByChannel.get(channel.name)}
    <section class="channel">
      <Checkbox
        class="channel-head"
        checked={selectedNames.includes(channel.name)}
        onCheckedChange={(on) => toggleChannel(channel.name, on)}
      >
        <span class="head-row">
          <span class="channel-name">{channel.name}</span>
          <span class="count">{entries.length} entries</span>
        </span>
      </Checkbox>
      <p class="purpose">{channel.purpose}</p>

      {#if counters}
        <p class="counters">
          <span class="counter-head"
            >Counted since {sinceLabel(counters.since)}</span
          >
          {#each Object.entries(counters.counts) as [name, count] (name)}
            <span class="counter">{name} <b>{count}</b></span>
          {/each}
        </p>
        <p class="empty">
          Deleting an entry below does not take its count. These go when you
          Clear the channel, and they are in the export whole.
        </p>
      {/if}

      {#if unreadable > 0}
        <!-- Counted, never shown: an older shape may hold exactly the free text
             the current one excludes by construction, so the review discloses
             that the records exist and Clear is what removes them.

             It does not say WHY they cannot be read. A version this build does
             not know and a half-written record are indistinguishable here, and
             naming one of them would be the screen guessing. -->
        <p class="empty">
          {unreadable} record{unreadable === 1 ? "" : "s"} this version of the app
          cannot read. They stay until you Clear the channel, and they are not in
          the export.
        </p>
      {/if}

      {#if entries.length === 0}
        <p class="empty">Nothing recorded yet.</p>
      {:else}
        <ul class="entries">
          {#each entries as entry, index (index)}
            <li>
              <code>{JSON.stringify(entry)}</code>
              <Button
                variant="danger"
                size="sm"
                onclick={() => redact(channel, index)}>Delete</Button
              >
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}

  {#if selected.length > 0}
    <section class="channel">
      <h3>What the file will hold</h3>
      <pre class="payload">{payloadText}</pre>
    </section>
  {/if}

  {#if !$exportEnabled}
    <!-- Names the card rather than the screen it sits on: the same card is the
         root's Settings tab and Rations settings, and each Facet's switch opens
         only its own door (ADR-0080 §5). -->
    <p class="empty">
      Turn on "Allow exporting local logs" in the Local Logs card to enable the
      export.
    </p>
  {/if}

  {#snippet footer()}
    <div class="dock">
      <Button
        disabled={!$exportEnabled || selected.length === 0}
        onclick={exportSelected}
      >
        Export {selected.length} channel{selected.length === 1 ? "" : "s"}
      </Button>
    </div>
  {/snippet}
</BottomSheet>

<style>
  .lead,
  .purpose,
  .empty {
    font-size: var(--step-n1);
    color: var(--text-secondary);
    margin: 0 0 var(--space-s);
  }
  .purpose {
    font-style: italic;
  }
  .channel {
    border-top: var(--edge);
    padding-top: var(--space-s);
    margin-top: var(--space-s);
  }
  /* The row is the shared Checkbox (ADR-0068); its name here is a row of its
     own — the channel and its entry count — so the content the primitive is
     given lays itself out, and only the row's heavier weight is reached via
     :global. */
  .channel :global(.channel-head) {
    font-weight: 800;
  }
  .head-row {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }
  .channel-name {
    font-size: var(--step-0);
  }
  .count {
    margin-left: auto;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .counters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3xs) var(--space-2xs);
    margin: 0 0 var(--space-3xs);
    font-size: var(--step-n2);
  }
  .counter-head {
    color: var(--text-secondary);
    text-transform: uppercase;
  }
  .counter {
    border: var(--edge-thin);
    border-radius: var(--radius);
    padding: 0 var(--space-3xs);
    font-family: var(--font-mono);
  }
  h3 {
    font-size: var(--step-n1);
    text-transform: uppercase;
    margin: 0 0 var(--space-2xs);
  }
  .entries {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }
  .entries li {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    border: var(--edge-thin);
    border-radius: var(--radius);
    padding: var(--space-3xs) var(--space-2xs);
  }
  .entries code {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    white-space: nowrap;
  }
  .payload {
    max-height: 16rem;
    overflow: auto;
    border: var(--edge-thin);
    border-radius: var(--radius);
    padding: var(--space-2xs);
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    background: var(--paper);
  }
  .dock {
    display: flex;
    justify-content: flex-end;
  }
</style>
