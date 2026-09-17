<script lang="ts">
  import { onMount } from "svelte";
  import {
    VARIANT_NAMES,
    VARIANT_NOTES,
    setVariant,
    setSubject,
    step,
    type Variant,
  } from "./variants";
  import { PAIRED_FOODS } from "./data";

  // THROWAWAY. The floating bar that flips variants, and — this prototype
  // having four subjects rather than one — the food under them. Deliberately
  // ugly and deliberately not brutalist, so it cannot be mistaken for the
  // design under evaluation.
  let { variant, subject }: { variant: Variant; subject: string } = $props();

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
  <div class="proto-row">
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
  <div class="proto-foods">
    {#each PAIRED_FOODS as f (f.id)}
      <button
        type="button"
        class:on={f.id === subject}
        onclick={() => setSubject(f.id)}
      >
        {f.id}
        <em>{f.energyRatio.toFixed(2)}×</em>
      </button>
    {/each}
  </div>
</div>

<style>
  /* stylelint-disable -- THROWAWAY. The switcher is deliberately OFF the design
     system: the skill asks for a bar that cannot be mistaken for part of the
     design being judged, so it uses raw hex and raw pixels on purpose. */
  .proto-bar {
    position: fixed;
    left: 50%;
    bottom: calc(8px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: min(94vw, 32rem);
    background: #101014;
    color: #fff;
    border-radius: 10px;
    box-shadow: 0 6px 24px rgb(0 0 0 / 45%);
    font-family: ui-monospace, monospace;
    font-size: 11px;
    overflow: hidden;
  }
  .proto-row {
    display: flex;
    align-items: stretch;
    gap: 2px;
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
  .proto-label {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 6px 10px;
    line-height: 1.3;
    min-width: 0;
    flex: 1;
  }
  .proto-label b {
    color: #7dd3fc;
  }
  .proto-label small {
    color: #9ca3af;
    font-size: 10px;
  }
  .proto-foods {
    display: flex;
    gap: 2px;
  }
  .proto-foods button {
    flex: 1;
    font-size: 10px;
    padding: 4px 2px;
    line-height: 1.2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }
  .proto-foods button.on {
    background: #7dd3fc;
    color: #101014;
  }
  .proto-foods em {
    font-style: normal;
    opacity: 0.7;
  }
</style>
