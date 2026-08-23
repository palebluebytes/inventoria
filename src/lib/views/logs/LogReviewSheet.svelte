<script lang="ts">
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import Button from "../../ui/Button.svelte";
  import Badge from "../../ui/Badge.svelte";
  import { settingsStore } from "../../stores/settings.store";
  import {
    buildLogExport,
    deleteChannelEntry,
    readChannel,
    registeredChannels,
    type LogChannel,
  } from "../../logs/log-facility";

  // The review ADR-0054 §4 makes the condition of an export: the exact payload,
  // shown before anything is written, with `personal` channels marked and each
  // channel chosen individually. One switch over everything would be a consent
  // surface that does not mean what it appears to — agreeing to hand over a
  // technical channel is not agreeing to hand over what you searched for.
  //
  // Redaction happens here too, and it is a DELETION from the channel rather
  // than an exclusion from one export: two states would mean this screen shows
  // something other than what exists.
  let { onClose }: { onClose: () => void } = $props();

  const channels = registeredChannels();
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
  let entriesByChannel = $derived.by(() => {
    void revision;
    return new Map(channels.map((c) => [c.name, readChannel(c)] as const));
  });
  // The value the file will hold, built by the same function the export calls:
  // the review IS the payload, not a summary of it.
  let payload = $derived.by(() => {
    void revision;
    return buildLogExport(selected, exported_at);
  });

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
  function exportSelected() {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventoria-log-${new Date(exported_at)
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<BottomSheet isOpen title="Review Local Logs" {onClose}>
  <p class="lead">
    Nothing here has been sent anywhere. Choose the channels you want to hand
    over, read what they hold, and the export writes exactly that to a file.
  </p>

  {#each channels as channel (channel.name)}
    {@const entries = entriesByChannel.get(channel.name) ?? []}
    <section class="channel">
      <label class="channel-head">
        <input
          type="checkbox"
          checked={selectedNames.includes(channel.name)}
          onchange={(e) => toggleChannel(channel.name, e.currentTarget.checked)}
        />
        <span class="channel-name">{channel.name}</span>
        <Badge
          variant={channel.sensitivity === "personal" ? "warning" : "neutral"}
          >{channel.sensitivity}</Badge
        >
        <span class="count">{entries.length} entries</span>
      </label>
      <p class="reader">{channel.reader}</p>

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
      <pre class="payload">{JSON.stringify(payload, null, 2)}</pre>
    </section>
  {/if}

  {#if !$settingsStore.log_export}
    <p class="empty">
      Turn on "Allow exporting local logs" in Settings to enable the export.
    </p>
  {/if}

  {#snippet footer()}
    <div class="dock">
      <Button
        disabled={!$settingsStore.log_export || selected.length === 0}
        onclick={exportSelected}
      >
        Export {selected.length} channel{selected.length === 1 ? "" : "s"}
      </Button>
    </div>
  {/snippet}
</BottomSheet>

<style>
  .lead,
  .reader,
  .empty {
    font-size: var(--step-n1);
    color: var(--text-secondary);
    margin: 0 0 var(--space-s);
  }
  .reader {
    font-style: italic;
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
    cursor: pointer;
  }
  .channel-name {
    font-size: var(--step-0);
  }
  .count {
    margin-left: auto;
    font-size: var(--step-n2);
    color: var(--text-secondary);
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
  /* The house checkbox, as the food settings sheet draws it. */
  .channel-head input[type="checkbox"] {
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
  .channel-head input[type="checkbox"]::before {
    content: "";
    width: 0.62em;
    height: 0.62em;
    background: var(--ink);
    transform: scale(0);
  }
  .channel-head input[type="checkbox"]:checked::before {
    transform: scale(1);
  }
  .channel-head input[type="checkbox"]:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
</style>
