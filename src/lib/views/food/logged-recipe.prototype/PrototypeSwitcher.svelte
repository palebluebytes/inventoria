<script lang="ts">
  import { onMount } from "svelte";
  import {
    VARIANT_NAMES,
    VARIANT_NOTES,
    setVariant,
    step,
    type Variant,
  } from "./variants";

  // THROWAWAY. The floating bar that flips variants. Deliberately ugly and
  // deliberately not brutalist, so it cannot be mistaken for the design under
  // evaluation. Lifted from `meal-picker.prototype/`, moved to the top edge.
  let { variant }: { variant: Variant } = $props();

  function go(by: 1 | -1) {
    setVariant(step(variant, by));
  }

  onMount(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
</script>

<div class="proto-bar">
  <button type="button" aria-label="Previous variant" onclick={() => go(-1)}
    >←</button
  >
  <span class="proto-label">
    <b>{variant}</b>
    {VARIANT_NAMES[variant]}
    <small>{VARIANT_NOTES[variant]}</small>
  </span>
  <button type="button" aria-label="Next variant" onclick={() => go(1)}
    >→</button
  >
</div>

<style>
  /* stylelint-disable -- THROWAWAY. The switcher is deliberately OFF the design
     system: the skill asks for a bar that cannot be mistaken for part of the
     design being judged, so it uses raw hex and raw pixels on purpose. */
  .proto-bar {
    position: fixed;
    /* **The top edge, centred.** The subject this round is the meal list,
       which runs the whole middle of the column and reaches the foot where the
       Way-in bar sits; the only band free of it is the day's own header — the
       date and the week strip — which nothing here is asking about. */
    top: 4px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    align-items: stretch;
    gap: 2px;
    max-width: min(60vw, 22rem);
    background: #101014;
    color: #fff;
    border-radius: 10px;
    box-shadow: 0 6px 24px rgb(0 0 0 / 45%);
    font-family: ui-monospace, monospace;
    font-size: 11px;
  }
  .proto-bar button {
    background: #2a2a33;
    color: #fff;
    border: 0;
    /* Declared rather than drawn, so `tap-floor.test.ts` has nothing to say
       about the debug chrome and every shortfall it reports is a real one. */
    min-width: var(--tap-min);
    min-height: var(--tap-min);
    font-size: 16px;
    cursor: pointer;
  }
  .proto-bar button:first-child {
    border-radius: 10px 0 0 10px;
  }
  .proto-bar button:last-child {
    border-radius: 0 10px 10px 0;
  }
  .proto-label {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 6px 10px;
    line-height: 1.3;
    min-width: 0;
  }
  .proto-label b {
    color: #7dd3fc;
  }
  .proto-label small {
    color: #9ca3af;
    font-size: 10px;
  }
  /* One line, always. On a phone a wrapped note turned the debug chrome into a
     column taller than the bar it switches; the width it has is what it gets,
     and the rest is an ellipsis. Written as a truncation rather than a
     breakpoint because the app's width roster is closed
     (`tests/unit/breakpoints.test.ts`) and throwaway chrome has no business on
     it. */
  .proto-label small {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
