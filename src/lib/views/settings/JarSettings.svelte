<script lang="ts">
  import type { Snippet } from "svelte";
  import FacetExit from "../../layout/FacetExit.svelte";
  import PairedDevicesSection from "../pairing/PairedDevicesSection.svelte";
  import FaceVisibilitySection from "./FaceVisibilitySection.svelte";
  import {
    facesOf,
    facetOf,
    nestedFacetsOf,
    type FacetId,
  } from "../../facets/registry";

  /**
   * **The jar-wide half of the Settings face** (ADR-0114 §10), drawn once and
   * hosted by every shell's own settings door.
   *
   * ADR-0080's rule is unrevised — a Facet carries a jar-wide control only where
   * losing it loses data — and §2's split table moves in here, where the blocks
   * it governs are. What a person gains is a door in the same place everywhere;
   * what they do not gain is every control everywhere.
   *
   * **It exists because two of these blocks were drawn twice.**
   * `PairedDevicesSection` and `LogSettingsSection` each had a call site on the
   * root's `SettingsView` and another on `FoodSettingsSheet`, with the whole
   * difference between them being a Facet id and one `{#if}` — so the pair was
   * one component waiting to be named.
   *
   * **This component held two surfaces, and #555 cut it along the seam.** The
   * blocks below are the drawing shell's *own* door; the log card was never one
   * of them — it followed the **Facet's screens** rather than the shell's door,
   * which the card's own comment said in so many words — and it rode here by
   * assembly. It has gone with the Facet's own settings, so `ownDoor` is gone
   * too: it was the seam showing through as a predicate, and with one surface
   * left there is nothing for it to decide. Every block here is the shell's own,
   * because a face's shell is always its own Facet.
   *
   * **What is *not* here is as deliberate as what is.** The raw datom viewer,
   * Wipe Database, the jar-wide export, the usage figure and Developer Options
   * stay on `SettingsView`, because ADR-0080 §2 gives each of them to the root
   * alone; the food-specific settings stay on `FoodSettingsSheet`, because they
   * are Rations'. A component that took all of them and branched on `facetId`
   * would be the split table re-expressed as an `{#if}` ladder, which is the
   * shape ADR-0083 §10 declined to gate precisely because it is a judgement.
   */
  let {
    facetId,
    interleave,
  }: {
    /**
     * **Whose settings these are** — the Facet whose scope the blocks below
     * report on, which is now always the Facet of the shell drawing them. A
     * literal at every call site (ADR-0076 §6): the root's screen says `root`,
     * Rations' Settings face says `food`, and nothing works it out from a URL.
     *
     * It used to have a companion, `shell`, for the one case where the two
     * differed: the root drew the whole of Rations' settings sheet inside its
     * Rations face. That surface is the gear's page now and holds none of these
     * blocks, so the case has no way to arise and ADR-0108 §1's hazard is
     * unexpressible rather than judged.
     */
    facetId: FacetId;
    /**
     * The host's own card, drawn between the pairing surface and the toggles.
     *
     * **The slot outlived its first tenant.** Rations' `ScanSessionsCard` was
     * what it was cut for — it has to sit directly above the log card its
     * channel is listed in (ADR-0071 §6) — and both have moved to the gear's
     * page together, where that adjacency survives unbroken. What fills it now
     * is the root's own log card, which keeps the root's screen in the order it
     * has always been drawn in: pairing, logs, then the rest.
     */
    interleave?: Snippet;
  } = $props();
</script>

<!-- Your own devices, and the act that pairs one (ADR-0096 §8, ADR-0084 §6). It
     expands in place rather than opening the Devices screen ADR-0075 §4 used to
     name, and it carries the Facet its acts run in (ADR-0105 §1).

     Unconditional, and that is the cut rather than a relaxation: this component
     is only ever a shell's own door now, so "the Facet this act runs in" and
     "the Facet whose settings these are" are one Facet and `facetId` is both. -->
<PairedDevicesSection {facetId} />

{@render interleave?.()}

<!-- Which faces this device shows (ADR-0114 §10). It lists what *this shell*
     holds, which is what the Facet id above names. -->
<FaceVisibilitySection faces={facesOf(facetOf(facetId))} />

<!-- The sanctioned exit (ADR-0078 §4), which ADR-0114 §10 moves off the Rations
     face and onto this one: an offer to install Rations, made from inside a face
     called Rations, was the app advertising a rival copy of itself.

     **Enumerated rather than gated.** The offer goes to the Facets nested inside
     this one, which is ADR-0078 §3's prefix matching read as data: only a Facet
     containing another can link to it without leaving its own scope. So the root
     offers Rations and Rations offers nothing, with no rule written down against
     either. A third Facet costs no edit here. -->
{#each nestedFacetsOf(facetId) as facet (facet.id)}
  <FacetExit {facet} />
{/each}
