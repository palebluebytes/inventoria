<script lang="ts">
  import Meter from "../../../ui/Meter.svelte";
  import type { BandRow } from "./day";
  import type { Variant } from "./variants";

  // THROWAWAY (#244) — the second surface, and the harder one.
  //
  // The panel has a row's worth of space to say where a figure came from. The
  // meter has 6px of track (`ui/Meter.svelte`, ADR-0037) and a two-line card
  // (`NutrientCard`). So each panel variant gets the meter treatment that
  // follows from its seam, and the question is whether the seam survives the
  // shrink:
  //
  // - A — one track, two segments. Measured solid ink, estimated hatched. The
  //   vertical seam of the two-column panel becomes a horizontal one.
  // - B — two tracks stacked. The framed-off block becomes a bar of its own,
  //   thinner, under the measured one, with its own reading. Honest and twice
  //   the height: twelve of these is a chart, which is the cost to look at.
  // - C — one track, one fill, the estimate an outlined extension past the end
  //   of the solid part. The mark shrinks to an outline; nothing else changes.
  //
  // `now` renders the SHIPPED meter for the same day, which is the control: on
  // a packaged diet most of these read near zero, and that is the whole reason
  // the map exists.
  let { row, variant }: { row: BandRow; variant: Variant } = $props();
</script>

{#if variant === "now"}
  <Meter
    fill={row.measuredFill}
    valueText={`${row.measured} of ${row.target}`}
  />
{:else if variant === "A"}
  <div class="track" data-variant="A">
    <div class="solid" style="width: {row.measuredFill}%"></div>
    <div class="hatch" style="width: {row.estimatedFill}%"></div>
  </div>
{:else if variant === "B"}
  <div class="stack">
    <Meter
      fill={row.measuredFill}
      valueText={`${row.measured} of ${row.target}`}
    />
    {#if row.estimated}
      <div class="second">
        <div class="track thin" data-variant="B">
          <div
            class="hatch"
            style="width: {row.estimatedFill}%; margin-left: {row.measuredFill}%"
          ></div>
        </div>
        <span class="second-read">+{row.estimated} est</span>
      </div>
    {/if}
  </div>
{:else}
  <div class="track" data-variant="C">
    <div class="solid" style="width: {row.measuredFill}%"></div>
    <div class="outline" style="width: {row.estimatedFill}%"></div>
  </div>
{/if}

<style>
  /* Not the shared Meter: these are the shapes being judged, and a primitive
     that grew a `band` prop before anyone had looked at one would be the
     decision made by accident. The winner gets folded into `ui/Meter.svelte`
     properly, once there is a winner. */
  .track {
    display: flex;
    width: 100%;
    height: 6px;
    background: var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .track.thin {
    height: 4px;
  }
  .solid {
    height: 100%;
    background: var(--ink);
  }
  /* The estimate: the ink, cut with the track's own grey at 45°. Same hue as
     the measured fill, so the two read as one quantity; broken, so they do not
     read as one measurement. */
  .hatch {
    height: 100%;
    background: repeating-linear-gradient(
      45deg,
      var(--ink),
      var(--ink) 2px,
      var(--paper) 2px,
      var(--paper) 4px
    );
  }
  .outline {
    height: 100%;
    border-top: 1px solid var(--ink);
    border-bottom: 1px solid var(--ink);
    border-right: 1px solid var(--ink);
    box-sizing: border-box;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }
  .second {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }
  .second-read {
    font-size: var(--step-n4);
    font-family: var(--font-mono);
    color: var(--text-secondary);
    white-space: nowrap;
  }
</style>
