<script lang="ts">
  import FaceMaturity from "./FaceMaturity.svelte";
  import type { FaceId, RosteredFace } from "../facets/registry";

  // The grid of faces (ADR-0114 §7), and the app's whole navigation.
  //
  // **One component, two hosts.** It is rendered inside the switcher panel's
  // card here, and inline as the root's landing screen (§9) — the shape
  // `BottomSheet`'s `inline` prop already has, and the reason ADR-0095 gives for
  // reaching a shared look by reference: two drawings of one grid is two grids
  // that drift. What differs between the hosts is `current`, which is `null` on
  // the landing screen because no face is being looked at.
  //
  // **Nothing here re-sorts.** The order is the roster's, handed in through
  // `facesOf()`, and §7 refuses a frequency ordering at length: seven
  // destinations are learned by position within a week, and a grid whose tiles
  // move spends that and gives back adaptation nobody asked for. So this
  // component takes a list and draws it; it holds no comparator and no store.
  //
  // **The BETA band sits under the mark rather than across it** (ADR-0114 §11, as
  // it was rewritten by assembling this): a band over the tile's lower third
  // paints out the third of the drawing that identifies it, and five of the seven
  // faces carry one. It is `FaceMaturity`, which the header and the Settings
  // face's visibility row draw too.

  let {
    faces,
    current = null,
    onPick,
  }: {
    /**
     * The faces this shell holds, in the roster's order — `facesOf(facet)`.
     *
     * A shell's own declaration rather than `FACES`, because a shell cannot
     * offer a face whose screens are not in its build (ADR-0114 §8). Rations is
     * handed three and the root seven, and neither list is filtered here.
     */
    faces: readonly RosteredFace[];
    /**
     * The face being looked at, inverted in place, or `null` where none is.
     *
     * `null` is the landing screen's case and not an absence of information:
     * §9 has no tile inverted there, because the grid *is* where you are.
     */
    current?: FaceId | null;
    onPick: (id: FaceId) => void;
  } = $props();
</script>

<!-- A list, because it is one: seven destinations with no order-bearing
     relationship between neighbours beyond the one the roster fixes. The
     `grid` is on the `ul` and the cells are its items, so `list-style` and the
     browser's own indent are the two things the rule below has to undo. -->
<ul class="face-grid">
  {#each faces as face (face.id)}
    <li class="face-cell">
      <!-- Inverted rather than moved, and tapping the one you are on closes the
           panel (§7). `aria-current="page"` is what says it to a screen reader
           — the idiom the food header's page icons already use — and it is
           absent rather than `false` on the others. -->
      <button
        type="button"
        class="face-tile"
        class:current={face.id === current}
        aria-current={face.id === current ? "page" : undefined}
        onclick={() => onPick(face.id)}
      >
        <!-- `alt=""`, because the name is directly below it in the same
             control: a described mark would make every tile announce itself
             twice. The intrinsic size is declared so the row does not reflow
             when the image arrives — a switcher that jumps as it paints is a
             switcher you tap the wrong tile on. -->
        <img class="face-mark" src={face.mark} alt="" width="64" height="64" />
        <!-- Between the mark and the name, which is §11's order and the reason
             the band is legible: it is a full-width rectangle in its own row
             rather than a strip over line art whose interior paper is
             load-bearing. It joins the tile's accessible name, so a beta face
             announces itself as one — which is the whole point of drawing it
             where somebody chooses a destination. -->
        <FaceMaturity maturity={face.maturity} shape="band" />
        <span class="face-name">{face.name}</span>
      </button>
    </li>
  {/each}
</ul>

<style>
  /* **Four columns, fixed, at every width.** §7 settles the count, and the grid
     does not respond to space: a four-up grid of seven is two rows on a phone
     and two rows on a desktop, which is what makes the position learnable. A
     `repeat(auto-fit, …)` here would reflow the whole set at a width nobody
     chose. */
  .face-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* Settings is the roster's last member (ADR-0114 §2) and holds the grid's last
     column, which is a different claim from being last in the list: once faces
     can be hidden (§10) a seven-member row becomes a four-member one, and a
     Settings tile that merely followed its neighbours would walk left every time
     somebody hid something. Pinned by POSITION rather than by id — the rule says
     "the last face", not "the face called Settings", so nothing here has to know
     which face that is. */
  .face-cell:last-child {
    grid-column: 4;
  }
  /* The tap target is the whole tile, mark and name together: ADR-0093 puts the
     floor on the box that accepts the tap, and a 64px mark with a word under it
     is already past it on both axes — declared anyway, because a face whose name
     is short enough to shrink the column is not a smaller target than its
     neighbour. */
  .face-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-3xs);
    width: 100%;
    min-width: var(--tap-min);
    min-height: var(--tap-min);
    padding: var(--space-2xs) var(--space-3xs);
    border: var(--edge);
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    font-size: var(--step-n2);
    font-weight: 600;
    text-align: center;
    cursor: pointer;
  }
  /* The app's one selected mark: ink and paper swapped, the same inversion the
     food header's current page icon and the month calendar's chosen day wear
     (ADR-0038). Keyed on the class rather than on `[aria-current]` so the
     stylesheet says what it draws, with the attribute carrying the same fact to
     a screen reader. */
  .face-tile.current {
    background: var(--ink);
    color: var(--paper);
  }
  .face-tile:hover {
    background: var(--bg-input);
  }
  .face-tile.current:hover {
    background: var(--ink);
  }
  /* The same hard offset ring every pressable box in this frame carries
     (ADR-0039). */
  .face-tile:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  /* The mark is drawn on the app's own paper and never composited onto a
     background colour, which is what lets the set include a gear whose cut
     encloses no paper at all (`docs/icon-provenance.md`). It shrinks with the
     column on a narrow phone rather than forcing the grid wider — a four-column
     grid that overflows is the one failure this shape cannot absorb. */
  .face-mark {
    display: block;
    width: 100%;
    max-width: 64px;
    height: auto;
  }
  /* Under the tile, per §7, and allowed to wrap: the longest name on the roster
     is seven letters today, and a face named later must not be the thing that
     decides the grid's column width. */
  .face-name {
    display: block;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }
  /* Inverted with its tile. The mark is line art on transparency, so it would
     otherwise be black ink on a black ground — invisible, and only on the one
     tile that is supposed to stand out. `invert()` rather than a second file,
     because the drawing has exactly two values and inverting it is what the
     tile itself is doing. */
  .face-tile.current .face-mark {
    filter: invert(1);
  }
  /* And so is the band, by the same one line and for a reason the mark's comment
     already gives: the badge is an ink ground with paper caps, which on an ink
     tile is ink on ink. `invert()` rather than a second `ui/Badge` variant —
     `--ink` and `--paper` are `#000` and `#fff` here and there is no dark theme,
     so the filter lands on exactly the two tokens a variant would have named, and
     the border inverting with it is correct: an edge between paper and ink is
     what the swap already draws. `:global` because the box is the primitive's.

     Keyed on `.badge` and not on a class of ours, which is the one thing here
     worth a reviewer's eye: it is `ui/Badge`'s own class, so this rule is an
     override of a primitive from a host. It is allowed the way the inversion
     above is — the tile is ADR-0038's selected mark and swapping ink for paper is
     the whole of what that means — and it names no colour, so it cannot drift
     from what the primitive draws. */
  .face-tile.current :global(.badge) {
    filter: invert(1);
  }
</style>
