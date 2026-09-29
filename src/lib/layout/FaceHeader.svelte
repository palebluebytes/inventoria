<script lang="ts">
  import FaceMaturity from "./FaceMaturity.svelte";
  import FaceSwitcher from "./FaceSwitcher.svelte";
  import { faceActions, faceBack } from "./face-actions";
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
  // **The maturity badge sits between the title and the actions**, which is where
  // §5's order puts it: it qualifies the name, so it follows the name, and it is
  // outside the `<h1>` so the heading stays the face's one spelling and nothing
  // else.
  //
  // **And the title is the way back off a page** (ADR-0091 §5), which is the one
  // job in this row that belongs to the face rather than to the shell. It is
  // drawn here because there is one `<h1>` in the app and this is it: until #538
  // the food screen kept a title row of its own to put the button in, so the one
  // face §3 was written about was the one face still spelled twice.

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
       Twins` and `Notes & Checklist`.

       **The word becomes the way back on a page, and stays the word**
       (ADR-0091 §5). It is a button inside the heading rather than beside it: a
       back arrow in the actions would be a second control saying what the word
       already says, and would move the word by taking its place in the row. The
       accessible name keeps the visible word in front of the destination —
       "Rations, button" on a settings page is somewhere nobody can guess, and a
       name that dropped the word would no longer be the label anyone can see.

       The face publishes only where it returns to; the name is the roster's, so
       this box composes the two. -->
  <h1 class="face-title">
    {#if $faceBack}
      <button
        type="button"
        class="title-back"
        aria-label="{face.name}, back to {$faceBack.to}"
        onclick={$faceBack.go}>{face.name}</button
      >
    {:else}
      {face.name}
    {/if}
  </h1>
  <!-- §11's second drawing, from the component the switcher tile's band comes
       from. A badge here rather than a band: a rectangle across a tap-sized mark
       would be four illegible pixels, and this row has the width for a label
       beside the name. -->
  <FaceMaturity maturity={face.maturity} />
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
     to be on. It takes the slack so the actions hold the right edge.

     **The line box is the tap floor**, declared here rather than on the button,
     which is ADR-0091 §5's "the word does not move by becoming a control" read
     as a measurement: a floor that arrived with the button would drop the word
     onto a different line on exactly the screens where it is a control. The row
     is already this tall — `ui/Disclosure` declares the same floor on the
     trigger — so no face's header changes height for it. */
  .face-title {
    flex: 1;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: var(--step-1);
    font-weight: 700;
    line-height: var(--tap-min);
    letter-spacing: -0.03em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  /* What the word gives up to be a control. `font: inherit` is the whole of the
     type, and it is stronger than the six declarations it replaces: the button
     is the heading's only child, so the two cannot be changed apart because
     there is only one declaration to change. The shorthand is what reaches
     `font-family` and `line-height`, the two a UA button does not inherit —
     and the rest of that box is given up rather than restyled, since a border,
     a padding or a background would draw a box around the word or shift it.

     `text-align: inherit` for a control that fills its line: without it a
     button centres its label and the word moves by exactly the slack.
     `text-overflow` is not an inherited property, so the ellipsis the title
     declares has to be asked for again on the box that now holds the text. */
  .title-back {
    /* The floor stated on the control, which is where `tap-floor.test.ts` reads
       one: the line box above already makes this box `--tap-min` tall, and a
       sweep over the sheet cannot see an inherited `line-height`. So the two
       say one number for two readers — the title's, so the word sits the same
       whether or not it is a control, and this one, so the control declares its
       own floor (ADR-0089 §3). */
    min-height: var(--tap-min);
    display: block;
    overflow: hidden;
    margin: 0;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    text-align: inherit;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  /* The hover and the focus ring are the header icons', because the title is a
     control in the same row and answering the pointer differently would make it
     read as a different kind of thing. */
  .title-back:hover {
    color: var(--text-secondary);
  }
  .title-back:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  /* It qualifies the title and must never be the thing that takes its room: the
     title has the slack and this holds its natural width, so a long name
     ellipsises and the badge stays whole. */
  .face-header :global(.badge) {
    flex-shrink: 0;
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
