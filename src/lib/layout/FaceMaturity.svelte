<script lang="ts">
  import Badge from "../ui/Badge.svelte";
  import type { Face } from "../facets/registry";

  // **What a face claims about itself** (ADR-0114 §11), in the two shapes that
  // record names and from the one component ADR-0095 §1 requires.
  //
  // The shared thing is a predicate, a word and a look, and only the first two
  // are this component's: the look is `ui/Badge`, which already draws an ink
  // ground with paper caps, letterspaced and square (`--radius` is 0). So no
  // `ui/` member is minted and ADR-0100's gate is never engaged — the vocabulary
  // already had the box, and what was missing was the one place that decides
  // when it is drawn and what it says.
  //
  // **Three call sites, not the record's two.** The switcher tile's band and the
  // face header's badge are §11's, and the Settings face's visibility row is a
  // third: a row where somebody decides whether to keep Media, and a row that
  // said nothing about maturity would ask for that decision blind. The row wants
  // the badge shape rather than the band, which is §11's own argument for the
  // header — a band belongs across a tile, not down a list.

  let {
    maturity,
    shape = "badge",
  }: {
    /** The face's declared maturity, read off the roster and never derived. */
    maturity: Face["maturity"];
    /**
     * Which of §11's two drawings this site takes.
     *
     * A named axis rather than an open `class`, so the two shapes the record
     * decided are the two shapes that exist. A caller wanting a third would have
     * to come here, which is where the argument for it belongs.
     */
    shape?: "badge" | "band";
  } = $props();

  /**
   * Which maturities draw the band, named as a question about the word itself.
   *
   * A total record rather than an equality test against `"beta"`, for the
   * exhaustiveness: a third maturity added to the union in `registry.ts` is a
   * compile error *here*, at the one place that draws one, rather than a face
   * that quietly claims nothing. The key names what the answer decides, so
   * whoever adds that third value is asked the question in the form it actually
   * has — does this one say BETA — standing in the file that says it.
   *
   * `shipped` is `false` because silence is its statement: §11 has the badge earn
   * its way *off* a face, so a face that has earned it wears no replacement, not
   * a green one and not the word "stable".
   */
  const DRAWS_BETA: Record<Face["maturity"], boolean> = {
    shipped: false,
    beta: true,
  };
</script>

{#if DRAWS_BETA[maturity]}
  <!-- The band is the same primitive, full width and centred — the two utilities
       `src/app.css` already shares for the shells' DB-error line, which is the
       same shape at a different size, so nothing is declared here at all.
       "Full tile width" is §11's own wording and it is wider than the mark on a
       roomy column: the mark is capped at its natural 64 and centred, while a
       rectangle of solid ink gains nothing from a cap. -->
  <Badge
    variant="default"
    class={shape === "band" ? "w-full justify-center" : ""}>BETA</Badge
  >
{/if}
