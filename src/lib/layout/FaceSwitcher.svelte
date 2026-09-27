<script lang="ts">
  import Disclosure from "../ui/Disclosure.svelte";
  import Modal from "../ui/Modal.svelte";
  import FaceGrid from "./FaceGrid.svelte";
  import { enterBackStop, leaveBackStop } from "../ui/back-stack";
  import type { FaceId, RosteredFace } from "../facets/registry";

  // The logo, and the panel it drops (ADR-0114 §5, §6).
  //
  // **The trigger and the region are in one file because the census wants them
  // there.** `tests/unit/disclosure.test.ts` resolves every `aria-controls` the
  // app writes against the ids in the *same* file, which is the guarantee
  // `ui/Disclosure` gave up when it kept the trigger and left the region to its
  // caller. Splitting the panel into a component of its own would put the id
  // beyond that sweep for no gain: nothing else opens this panel.
  //
  // **It is modal, not light dismiss.** Switching faces is a navigation act
  // rather than a peek, and the dim is what says the app is waiting on a choice.
  // `MealPicker`'s native `popover="auto"` is the right answer for a chooser
  // floating over a bar you are still reading; it is the wrong one for a surface
  // that replaces where you are.
  //
  // **No new member of the `ui/` vocabulary** (§6): the card's position is this
  // caller's business and `Modal` is the shell every overlay in the app already
  // sits on, so ADR-0100's gate is never engaged. Escape, the backdrop, the
  // `inert` behind it and the focus trap all arrive with it.

  let {
    face,
    faces,
    onPick,
    onHome,
  }: {
    /**
     * The face being looked at — its mark is the trigger, and its tile is the
     * inverted one in the grid.
     */
    face: RosteredFace;
    /** What this shell holds, in the roster's order (`facesOf(facet)`). */
    faces: readonly RosteredFace[];
    onPick: (id: FaceId) => void;
    /**
     * Where the app's own mark goes, if anywhere.
     *
     * **Optional, and the absence is the decision.** §6 has the triquetra go
     * home to the root's landing grid, "the one destination no face can offer" —
     * and under Rations that destination is `/`, which is *outside* the Facet.
     * A link there would eject a Rations install into a browser tab, which is
     * the crossing ADR-0078 §1 makes unexpressible and §8 of this record
     * promises the switcher is not. So Rations hands no `onHome` and its
     * masthead is a drawing rather than a control.
     *
     * The root's landing screen is
     * [#530](https://github.com/palebluebytes/inventoria/issues/530)'s, so the
     * root hands none yet either. This prop is the hole that ticket fills.
     */
    onHome?: () => void;
  } = $props();

  let open = $state(false);

  /**
   * The panel's id, named here because `aria-controls` has to reach it and
   * bits-ui portals the card to the end of `<body>` — the two elements are not
   * in one subtree at runtime even though they are in one file.
   *
   * A constant rather than a minted id: there is exactly one switcher in a
   * document, because there is one shell.
   */
  const PANEL = "face-switcher-panel";

  // An open panel is a Back stop (ADR-0089 §7, as amended). The gesture every
  // phone has closes it instead of leaving the app, which is the whole of that
  // record's second half — and the reason `back-stack.ts`'s `sheet` kind is now
  // worded as "an overlay Back dismisses" rather than as a `BottomSheet`: this
  // is the first stop that is not one.
  $effect(() => {
    if (!open) return;
    const id = enterBackStop("sheet", () => (open = false));
    return () => leaveBackStop(id);
  });

  function pick(id: FaceId) {
    // Tapping the face you are on closes the panel and goes nowhere (§7), which
    // needs no branch: `onPick` is handed the id either way and the shell sets
    // the state it already holds.
    open = false;
    onPick(id);
  }
</script>

<!-- Drawn once and hosted twice, because whether it is a control is the root's
     to say and the drawing is not: the mark and the wordmark are identical
     either way, and a second copy is what would drift. -->
{#snippet masthead()}
  <img
    class="face-masthead-mark"
    src="/icons/inventoria-192.png"
    alt=""
    width="36"
    height="36"
  />
  <span class="face-wordmark">Inventoria</span>
{/snippet}

<Disclosure
  class="face-trigger"
  {open}
  controls={PANEL}
  aria-label="{face.name}, switch face"
  onToggle={() => (open = !open)}
>
  <!-- The face's mark **and** the primitive's own caret, which is what the
       second snippet parameter is for: a logo with no affordance would be the
       app's only navigation with nothing to say so (§5), and a hand-drawn caret
       here would be a second copy of a path `ui/Disclosure` already owns. -->
  {#snippet mark(isOpen: boolean, caret: import("svelte").Snippet<[boolean]>)}
    <img
      class="face-trigger-mark"
      src={face.mark}
      alt=""
      width="28"
      height="28"
    />
    {@render caret(isOpen)}
  {/snippet}
</Disclosure>

{#if open}
  <Modal bind:open title="Switch face" overlayBlur="blur(2px)">
    {#snippet children({ props })}
      <!-- Top-anchored, at every width: the card starts where the shell's own
           chrome ends, so the header it dropped from stays visible above it and
           the trigger keeps saying `aria-expanded="true"`. `--vv-top` is the
           band (ADR-0089 §1) and `--shell-ceiling` is the header's measured
           height, both read bare because `src/app.css` declares each. -->
      <div {...props} id={PANEL} class="face-panel">
        <!-- The triquetra and the wordmark (§6). It is the app's mark rather
             than a face's, so it never sits in the row of tiles the eye
             compares — which is why it is the one drawing in the set that is
             flat rather than engraved (`docs/icon-provenance.md`). -->
        {#if onHome}
          <button
            type="button"
            class="face-masthead pressable"
            onclick={onHome}
          >
            {@render masthead()}
          </button>
        {:else}
          <div class="face-masthead">{@render masthead()}</div>
        {/if}
        <FaceGrid {faces} current={face.id} onPick={pick} />
      </div>
    {/snippet}
  </Modal>
{/if}

<style>
  /* The trigger's frame. The primitive declares the tap floor on both axes and
     centres what it holds; what is left here is the mark's size and the
     separation §5 calls load-bearing — the title beside it is *also* a control
     (ADR-0091 §5's way back off a page), so two adjacent boxes must not read as
     one. The gap is the header's, because it is between two of the header's
     children. */
  .face-trigger-mark {
    display: block;
    width: 28px;
    height: 28px;
  }

  /* **Fixed, and top-anchored at every width.** §6: the width changes at 768 and
     the shape does not, so ADR-0091 §8's rule that a shape change is a
     breakpoint has nothing to hold here. Below it the card spans the band. */
  .face-panel {
    position: fixed;
    top: calc(var(--vv-top) + var(--shell-ceiling));
    right: 0;
    left: 0;
    /* One above `Modal`'s default backdrop, which is the contract that
       component's `overlayZ` documents. */
    z-index: 999;
    /* Never taller than what is left of the band under the header, and
       scrollable inside itself: a roster long enough to overflow must not push
       its own last row off the bottom of a phone. */
    max-height: calc(var(--vv-h) - var(--shell-ceiling));
    overflow-y: auto;
    padding: var(--space-s);
    border-bottom: var(--edge);
    background: var(--bg-surface);
    /* ADR-0102 reserves the drop shadow for a box that must contain or cover
       one, and a panel dropping over the screen is the second. It is the only
       edge the shadow can reach, since the card spans the band's full width. */
    box-shadow: var(--shadow-2);
  }

  /* The masthead is a row whether or not it is a control. Both spellings are
     drawn by one rule, so the day the root hands an `onHome` nothing moves. */
  .face-masthead {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    width: 100%;
    /* ADR-0093's floor, declared on the row whether or not it is a control
       today. Two reasons rather than one: the box that accepts the tap is this
       one once the root hands an `onHome`, and a floor that arrived with the
       handler would move the grid down 26px on the day that ticket lands — the
       drawing must not change when the affordance does. */
    min-height: var(--tap-min);
    margin-bottom: var(--space-s);
    padding: 0 0 var(--space-2xs);
    border: none;
    border-bottom: var(--edge);
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: left;
  }
  /* Only where it is one. A `div` with a pointer would be claiming an
     affordance it does not have. */
  .face-masthead.pressable {
    cursor: pointer;
  }
  .face-masthead:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .face-masthead-mark {
    display: block;
    width: 36px;
    height: 36px;
  }
  /* The app's name, and the only place it is drawn: the deleted `Sidebar` wrote
     it with `display: none` below 768, so on a phone the app had no wordmark at
     all. */
  .face-wordmark {
    font-size: var(--step-0);
    font-weight: 700;
    letter-spacing: -0.05em;
    text-transform: uppercase;
  }

  @media (min-width: 768px) {
    .face-panel {
      /* Width-capped and left-aligned **under the logo** (§6). The inset is the
         same expression the header's own padding uses, which is what puts the
         card's left edge under the trigger rather than near it — the card is
         portalled to `<body>` and has no shell box to inherit one from. */
      right: auto;
      left: calc(env(safe-area-inset-left, 0px) + var(--space-s));
      width: min(30rem, calc(100% - 2 * var(--space-s)));
      border: var(--edge);
    }
  }
</style>
