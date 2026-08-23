<script lang="ts">
  import Card from "../../ui/Card.svelte";
  import Button from "../../ui/Button.svelte";
  import Badge from "../../ui/Badge.svelte";
  import LogReviewSheet from "./LogReviewSheet.svelte";
  import {
    settingsStore,
    saveLogExportConsent,
  } from "../../stores/settings.store";
  import {
    channelEntryCount,
    clearChannel,
    isChannelRecording,
    registeredChannels,
    setChannelRecording,
    type LogChannel,
  } from "../../logs/log-facility";
  import type { VocabularyBarReading } from "../../logs/search-log";
  import {
    readSearchChannelBar,
    recomputeSearchChannelBar,
  } from "../../logs/search-log";

  // The controls ADR-0053 §1 names — the entry count, a switch that stops the
  // recording, and an action that clears the log — plus ADR-0054 §4's master
  // export consent. Control and discoverability come from these; they do not
  // come from making the instrument opt-in, because a recorder gated behind a
  // toggle that defaults to off measures nothing.
  //
  // Importing the search channel's module is what REGISTERS it — a channel is
  // declared and registered in the same act — so this screen reaches it through
  // the one reading that is about that channel rather than about the facility,
  // and lists whatever else the registry holds generically.
  const channels = registeredChannels();

  // Bumped by any action that changes what is stored, so the counts and the bar
  // are re-read rather than trusted from a snapshot.
  let revision = $state(0);

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
      bar: readSearchChannelBar(),
    };
  });
  // The same bar re-read against the vocabulary as it stands now (§4). Async,
  // because it needs the corpus; null until it arrives, and null for good if the
  // artifact will not load, which costs this panel a line and nothing else.
  let barToday = $state<VocabularyBarReading | null>(null);
  $effect(() => {
    void revision;
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

  async function persistExportConsent(next: boolean) {
    try {
      await saveLogExportConsent(next);
    } catch (err) {
      console.error("Failed to save the log-export consent toggle", err);
    }
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
    <label class="toggle-label consent-toggle">
      <input
        type="checkbox"
        id="log-export-toggle"
        checked={$settingsStore.log_export}
        onchange={(e) => persistExportConsent(e.currentTarget.checked)}
      />
      <span class="toggle-text">Allow exporting local logs</span>
    </label>
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
        <label class="toggle-label">
          <input
            type="checkbox"
            checked={recording}
            onchange={(e) => toggleRecording(channel, e.currentTarget.checked)}
          />
          <span class="toggle-text">Recording</span>
        </label>
        <Button
          variant="danger"
          size="sm"
          disabled={entries === 0}
          onclick={() => clear(channel)}>Clear</Button
        >
      </div>
    </section>
  {/each}

  <section class="channel">
    <h3>What the search log says about #142</h3>
    <p class="reader">
      {stored.bar.mid_phrase} of {stored.bar.settled_empty} settled empty searches
      carried a vocabulary word inside a longer phrase. Six of them build the per-token
      tier; forty settled empty searches with fewer than six close it as a settled
      no.
    </p>
    <p class="verdict">Verdict: {stored.bar.verdict}</p>
    {#if barToday}
      <p class="reader">
        Against today's vocabulary, which re-derives on every corpus change: {barToday.mid_phrase}
        of {barToday.settled_empty} — {barToday.verdict}.
      </p>
    {/if}
  </section>

  <div class="actions-row mt-4">
    <Button variant="secondary" onclick={() => (reviewing = true)}>
      Review and Export
    </Button>
  </div>
</Card>

{#if reviewing}
  <LogReviewSheet
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
  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.65em;
    font-weight: 700;
    line-height: 1.4;
    color: var(--ink);
    cursor: pointer;
    user-select: none;
    text-transform: uppercase;
  }
  .consent-toggle {
    align-items: flex-start;
    font-size: var(--step-n1);
    text-transform: none;
    line-height: 1.35;
  }
  /* The house checkbox, as the food settings sheet draws it. */
  .toggle-label input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    flex: 0 0 auto;
    display: grid;
    place-content: center;
    width: 1.35em;
    height: 1.35em;
    margin: 0;
    border: var(--edge);
    background: var(--paper);
    cursor: pointer;
  }
  .toggle-label input[type="checkbox"]::before {
    content: "";
    width: 0.62em;
    height: 0.62em;
    background: var(--ink);
    transform: scale(0);
  }
  .toggle-label input[type="checkbox"]:checked::before {
    transform: scale(1);
  }
  .toggle-label input[type="checkbox"]:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
</style>
