<script lang="ts">
  import Card from "../../ui/Card.svelte";
  import Meter from "../../ui/Meter.svelte";
  import Row from "../../ui/Row.svelte";
  import { channelCounters, partitionChannel } from "../../logs/log-facility";
  // Through the roster, never through the channel's own module: a surface that
  // imports a channel directly is a surface whose answer depends on what it
  // happened to import, which is the defect `logs/channels.ts` exists to remove
  // (#221).
  import { SCAN_CHANNEL } from "../../logs/channels";
  import { scanEntryLabels, scanReport } from "../../logs/scan-log";
  import { logDateLabel } from "./log-dates";

  // ADR-0071 §6's view: how often a barcode scan reaches Open Food Facts, as
  // counts and as proportions, with the recent sessions underneath.
  //
  // **It is no longer what makes the channel legal** — ADR-0092 retired that
  // rule with ADR-0054 §2's standing-channel requirement — so this is here
  // because the device's owner asked for a standing answer to "does the scan
  // work", which is the reader ADR-0071's Context names beside #208. #208's own
  // numbers are folded off an exported file by the person who cares, the way
  // ADR-0080 §6 already made of ADR-0053 §7's bar; nothing here draws a verdict
  // on a ticket.
  //
  // **The rate is read from the counters and never from the entries.** The ring
  // retains by age, so a rate over the 200 records it holds is the rate of the
  // last 200 lookups wearing a lifetime label (ADR-0092 §6, §9). The list below
  // is for looking at what happened recently; the numbers above it are for how
  // often.
  //
  // **It does not say why a scan failed, and must not.** A run of no-answers
  // says Open Food Facts did not answer *this device*: whether OFF was down, the
  // network was, or a captive portal was in the way is not something this
  // channel records, and the labels are worded so the screen does not imply
  // otherwise (ADR-0071's Consequences).
  //
  // Every word on it comes from `scan-log.ts`'s one label table, the recent list
  // included. A screen that spelled the outcome itself would be a second
  // vocabulary beside the counters', free to drift from it.

  /** How many of the retained sessions the list shows, newest first. */
  const RECENT = 8;

  // Read once, on mount. There is no action on this card, so nothing here can
  // invalidate its own numbers; a Clear on the Local Logs card below zeroes them
  // and this re-reads the next time the sheet is opened. Stamped once too, so
  // the epoch the counters are labelled with is the moment the screen was drawn
  // rather than a clock read per row.
  // svelte-ignore state_referenced_locally
  const drawnAt = Date.now();
  // `?? {}` cannot fire for THIS channel, which declares counters; the `| null`
  // is the facility's answer for a channel that declares none.
  // svelte-ignore state_referenced_locally
  const counters = channelCounters(SCAN_CHANNEL, drawnAt);
  // svelte-ignore state_referenced_locally
  const report = scanReport(counters?.counts ?? {});
  // Partitioned rather than read: a record this build cannot parse is one the
  // list silently drops, and #229's rule is that the count is disclosed rather
  // than the shortfall left unexplained.
  // svelte-ignore state_referenced_locally
  const contents = partitionChannel(SCAN_CHANNEL);
  const recent = contents.entries.slice(-RECENT).reverse();

  const percent = (share: number | null) =>
    share === null ? "" : `${Math.round(share * 100)}%`;
</script>

<Card>
  <h2>Barcode scans</h2>
  {#if report.sessions === 0}
    <p class="lead">
      Nothing scanned yet. Once you look a barcode up, this counts how often
      Open Food Facts had the product, how often it did not answer, and what you
      typed in by hand instead.
    </p>
  {:else}
    <p class="lead">
      {report.sessions} barcode lookup{report.sessions === 1 ? "" : "s"} since {logDateLabel(
        counters?.since ?? drawnAt
      )}, on this device. Asking again after no answer is a second lookup and
      counts as one; a barcode this app already holds is not counted at all,
      because nothing was asked.
    </p>

    <ul class="outcomes">
      {#each report.outcomes as outcome (outcome.name)}
        <li>
          <span class="row-head">
            <span>{outcome.label}</span>
            <span class="row-count"
              >{outcome.count}<span class="share">{percent(outcome.share)}</span
              ></span
            >
          </span>
          <Meter
            fill={(outcome.share ?? 0) * 100}
            valueText="{outcome.label}: {outcome.count} of {report.sessions}"
            testid="scan-share-{outcome.name}"
          />
        </li>
      {/each}
    </ul>

    <p class="caution">
      "No answer" means the service did not reply to this device. It does not
      say whether Open Food Facts was down, the network was, or something in
      between was in the way — none of that is recorded.
    </p>

    <p class="counters">
      {#each [...report.attempts, ...report.doors, report.settled, report.unreachable_then_door] as counter (counter.name)}
        <span class="counter"
          >{counter.label} <b>{counter.count}</b><i>{percent(counter.share)}</i
          ></span
        >
      {/each}
    </p>

    <h3>Recent lookups</h3>
    {#each recent as entry, index (index)}
      {@const labels = scanEntryLabels(entry)}
      <Row title={labels.headline} subtitle={labels.detail}>
        {#snippet trailing()}
          <span class="when">{logDateLabel(entry.at)}</span>
        {/snippet}
      </Row>
    {/each}
    {#if recent.length < report.sessions}
      <p class="caution">
        The list keeps the most recent lookups only. The totals above count
        every one.
      </p>
    {/if}
    {#if contents.unreadable > 0}
      <!-- Disclosed rather than quietly missing from the list (#229): these
           records exist, they hold a cap slot, and Clear is what removes them.
           It does not say WHY they cannot be read — a version this build does
           not know and a half-written record are indistinguishable here. -->
      <p class="caution">
        {contents.unreadable} record{contents.unreadable === 1 ? "" : "s"} this version
        of the app cannot read, so they are not in the list. The totals above still
        count them.
      </p>
    {/if}
  {/if}
</Card>

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
    margin: var(--space-m) 0 var(--space-2xs);
  }
  .lead,
  .caution {
    font-size: var(--step-n1);
    color: var(--text-secondary);
    margin: var(--space-2xs) 0 0;
  }
  .caution {
    font-size: var(--step-n2);
    font-style: italic;
  }
  .outcomes {
    list-style: none;
    margin: var(--space-s) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }
  .row-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2xs);
    font-size: var(--step-n1);
  }
  .row-count {
    margin-left: auto;
    font-family: var(--font-mono);
    font-weight: 800;
  }
  .share {
    margin-left: var(--space-2xs);
    font-weight: 400;
    color: var(--text-secondary);
  }
  .counters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3xs) var(--space-2xs);
    margin: var(--space-s) 0 0;
    font-size: var(--step-n2);
  }
  .counter {
    border: var(--edge-thin);
    border-radius: var(--radius);
    padding: 0 var(--space-3xs);
  }
  .counter b {
    font-family: var(--font-mono);
  }
  .counter i {
    margin-left: var(--space-3xs);
    color: var(--text-secondary);
    font-style: normal;
  }
  .when {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
</style>
