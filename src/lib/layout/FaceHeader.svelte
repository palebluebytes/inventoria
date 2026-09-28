<script lang="ts">
  import FaceSwitcher from "./FaceSwitcher.svelte";
  import { faceActions } from "./face-actions";
  import { clearShellCeiling, publishShellCeiling } from "./shell-ceiling";
  import type { FaceId, RosteredFace } from "../facets/registry";

  // The one pinned header every face wears (ADR-0114 §5).
  //
  // **Logo hard left, a gap, the title, then the face's own actions.** The gap
  // is load-bearing rather than decorative: ADR-0091 §5 made the title *the way
  // back off a page*, so the top-left corner now holds two controls with
  // different jobs, and the logo never changes meaning. Letting it also mean "up
  // one level" when a page is open is precisely the ambiguity that record wrote
  // its rule to avoid.
  //
  // **It is pinned because it carries the app's only navigation**, and
  // navigation that scrolls out of reach is not navigation. It is a flex item
  // above the scroll box rather than a `position: fixed` band, so nothing under
  // it has to reserve room; what it publishes is for the surfaces that are
  // fixed — the switcher panel drops from its lower edge and is portalled out of
  // this tree entirely.
  //
  // The maturity badge beside the title is
  // [#534](https://github.com/palebluebytes/inventoria/issues/534)'s. This is the
  // box it lands in.

  let {
    face,
    faces,
    onPick,
    onHome,
  }: {
    /** The face being looked at: its mark is the trigger, its name the title. */
    face: RosteredFace;
    /** What this shell holds, in the roster's order (`facesOf(facet)`). */
    faces: readonly RosteredFace[];
    onPick: (id: FaceId) => void;
    /** See `FaceSwitcher` — absent means the app's mark is a drawing. */
    onHome?: () => void;
  } = $props();

  /**
   * This box's own border-box height, published as `--shell-ceiling`.
   *
   * Measured rather than restated, for the reason the deleted `Sidebar`
   * measured itself (ADR-0089 §2): the height is a tap floor plus two paddings
   * plus a safe-area inset the device picks, and a sum of those written anywhere
   * else is the copy that goes stale.
   */
  let height = $state(0);

  $effect(() => {
    publishShellCeiling(height);
    return clearShellCeiling;
  });
</script>

<header class="face-header" bind:offsetHeight={height}>
  <FaceSwitcher {face} {faces} {onPick} {onHome} />
  <!-- The one canonical name (§3), read off the roster rather than spelled: the
       tile, this title, the accessible name of the trigger and the `<h1>` are
       one string, which is what retires `Media Tracker`, `Physical Digital
       Twins` and `Notes & Checklist`. -->
  <h1 class="face-title">{face.name}</h1>
  <!-- The face's own controls, published from inside the scroll box by
       `face-actions.ts` rather than handed down as a prop. The header is above
       `.main` and every face mounts inside it, so the shell is the only box that
       could have passed them and it is the wrong owner: Media's gear opens a
       sheet over `MediaView`'s state, and the food screen's four read a page and
       a date that exist nowhere else. What this box owns is where they sit. -->
  {#if $faceActions}
    <div class="face-actions">{@render $faceActions()}</div>
  {/if}
</header>

<style>
  .face-header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    /* §5's gap, and the reason it is a `gap` rather than a margin on the title:
       two adjacent controls must never both read as "back", so the separation
       belongs to the row and survives a title that is absent or a trigger that
       grows. */
    gap: var(--space-s);
    /* The same expression `FaceSwitcher`'s wide card uses for its left inset, so
       the panel's edge lands under the logo rather than near it. Two rules in
       two files, held together by `tests/unit/face-switcher.test.ts`, because
       the card is portalled to `<body>` and cannot inherit this box's padding. */
    padding: var(--space-2xs) var(--space-s);
    border-bottom: var(--edge);
    background: var(--bg-surface);
    /* ADR-0102, as amended here: the reservation is for a box that must contain
       a shadow or cover one, and a pinned header covers the column scrolling
       under it. Nothing else joins the reservation. */
    box-shadow: var(--shadow-1);
  }
  /* The title, and the way back off a page (ADR-0091 §5) once a face has pages
     to be on. It takes the slack so the actions hold the right edge. */
  .face-title {
    flex: 1;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: var(--step-1);
    font-weight: 700;
    letter-spacing: -0.03em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .face-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--space-3xs);
  }
  /* The trigger's own box is `ui/Disclosure`'s — it declares the tap floor on
     both axes and centres what it holds. What this row adds is the refusal to
     shrink: the logo is hard left and stays the size it is whatever the title
     does. `:global` because the class is handed to a component as a prop, which
     Svelte does not scope. */
  .face-header :global(.face-trigger) {
    flex-shrink: 0;
  }
</style>
