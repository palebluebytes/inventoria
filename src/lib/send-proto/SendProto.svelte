<script lang="ts">
  // PROTOTYPE — throwaway, dev-only. See `src/lib/send-proto/README.md`.
  //
  // The host: one variant's surfaces, plus the rig. Mounted by FoodView when
  // `?variant=A|B|C` is on the URL and nothing at all otherwise.
  import VariantA from "./VariantA.svelte";
  import VariantB from "./VariantB.svelte";
  import VariantC from "./VariantC.svelte";
  import ProtoSwitcher from "./ProtoSwitcher.svelte";
  import { proto, type Variant } from "./proto-state.svelte";

  let { variant }: { variant: Variant } = $props();
</script>

{#if variant === "A"}
  <VariantA />
{:else if variant === "B"}
  <VariantB />
{:else}
  <VariantC />
{/if}

<!-- What accept looks like from the food screen. Shared by all three, because
     the re-mint is the same act whichever surface reached it: the meal is on
     the day now, in their Meal Type, on their clock, and the only thing worth
     saying is that it is theirs to change. -->
{#if proto.landed}
  <p class="landed" role="status">
    Added to your {proto.landed.meal_type}. It is yours now — edit or remove it
    like anything else you logged.
  </p>
{/if}

<ProtoSwitcher {variant} />

<style>
  .landed {
    position: fixed;
    left: 50%;
    bottom: 5.5rem;
    transform: translateX(-50%);
    z-index: 500;
    margin: 0;
    max-width: min(28rem, calc(100vw - 2rem));
    padding: var(--space-2xs) var(--space-xs);
    background: var(--green-bg);
    color: var(--ink);
    border: var(--edge);
    box-shadow: var(--shadow-2);
    font-size: var(--step-n1);
  }
</style>
