<script lang="ts">
  import { isDirty, snapshotLine, totalCalories, type Draft } from "./draft";

  // THROWAWAY. The state readout the prototype skill asks for: after every tap,
  // what the draft now holds and what committing it would append. Shared by all
  // three variants because it is not part of any of them — it wears the
  // switcher's debug skin (mono, dark, raw pixels) for exactly that reason.
  //
  // The line worth watching is ADR-0022's invariant: this surface holds yield
  // at 1, so the headline it would freeze is simply Σ of the rows on screen.
  let { draft }: { draft: Draft } = $props();
</script>

<div class="proto-state">
  <b>{isDirty(draft) ? "dirty" : "clean"}</b>
  Σrows = {totalCalories(draft)} kcal · yield 1 · was {Math.round(
    draft.frozenCalories
  )}
  <small>{snapshotLine(draft)}</small>
</div>

<style>
  /* stylelint-disable -- THROWAWAY debug chrome, deliberately off the design
     system so it cannot be mistaken for the design under judgement. */
  .proto-state {
    margin-top: 6px;
    padding: 4px 6px;
    background: #101014;
    color: #e5e7eb;
    font-family: ui-monospace, monospace;
    font-size: 10px;
    line-height: 1.4;
    word-break: break-all;
  }
  .proto-state b {
    color: #7dd3fc;
  }
  .proto-state small {
    display: block;
    color: #9ca3af;
    font-size: 9px;
  }
</style>
