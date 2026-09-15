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
  // evaluation. Lifted from `meal-header.prototype/`, moved to the top edge.
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
    /* **The right edge, vertically centred**, which is the only place on a
       phone this round leaves free. The foot is the subject in all three
       variants and the head is C's, so a debug bar at either end covers the
       thing being judged; the middle covers nothing but a list of empty
       meals. */
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
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
  /* On a phone the debug chrome was taller than the bar it is there to switch:
     the note wrapped into a column and covered the day. The key and the name
     are what the switcher needs to say; the note is read on a desktop. */
  @media (max-width: 520px) {
    .proto-bar {
      max-width: 62vw;
    }
    .proto-label {
      padding: 4px 8px;
    }
    .proto-label small {
      display: none;
    }
  }
</style>
