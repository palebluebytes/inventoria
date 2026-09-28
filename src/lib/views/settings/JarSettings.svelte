<script lang="ts">
  import type { Snippet } from "svelte";
  import FacetExit from "../../layout/FacetExit.svelte";
  import LogSettingsSection from "../logs/LogSettingsSection.svelte";
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
   * hosted by every settings surface in the app.
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
   * one component waiting to be named, and the guard below was a rule stated in
   * the caller that now has one home.
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
    shell,
    elevated = false,
    interleave,
  }: {
    /**
     * **Whose settings these are** — the Facet whose scope the blocks below
     * report on. A literal at every call site (ADR-0076 §6): the root's screen
     * says `root`, Rations' sheet says `food`, and nothing works it out from a
     * URL.
     */
    facetId: FacetId;
    /**
     * **Which Facet's document is drawing them**, threaded from the entry point.
     *
     * The two differ exactly once, and that case is why this prop exists: the
     * root draws the whole of Rations' settings sheet in its Rations face, so
     * `facetId` is `food` there while `shell` is `root`.
     */
    shell: FacetId;
    /**
     * Whether the log card's review sheet has to clear a sheet it is already
     * inside (#329). **A hosting fact and the one thing the Facet id does not
     * decide** — the same surface is a page at the root and a bottom sheet under
     * Rations.
     */
    elevated?: boolean;
    /**
     * The host's own card, drawn between the pairing surface and the log card.
     *
     * One caller passes one thing: Rations' `ScanSessionsCard`, which has to sit
     * directly above the log card its channel is listed in, so its Clear is one
     * card away from the numbers it zeroes. Without the slot that adjacency would
     * be the price of this component, and it was argued for in ADR-0071 §6.
     */
    interleave?: Snippet;
  } = $props();

  /**
   * Whether this surface is the drawing shell's **own** settings door.
   *
   * It is the one predicate this component judges, and both halves of it are
   * records rather than preference. A surface scoped to the Facet you are
   * standing in is that Facet's door; the same surface scoped to *another* Facet
   * and drawn inside your shell is that Facet's page, which is what the root's
   * Rations face holds (ADR-0078 §1 binds screens, so drawing one is not a
   * crossing).
   *
   * What hangs on it is the pairing surface, by ADR-0108 §1: a pairing carries
   * the domains of the Facet the act **ran in**, and an act performed in the
   * root's Rations face ran in the root, because a Facet is an install
   * (ADR-0076 §1) and not a face. Two cards in one root document would disagree
   * about what a pairing means, and §4 would have the food one silently re-scope
   * a jar-wide lane the other made. The root keeps the one card on its own door.
   */
  const ownDoor = $derived(facetId === shell);
</script>

<!-- Your own devices, and the act that pairs one (ADR-0096 §8, ADR-0084 §6). It
     expands in place rather than opening the Devices screen ADR-0075 §4 used to
     name, and it carries the Facet its acts run in (ADR-0105 §1). -->
{#if ownDoor}
  <PairedDevicesSection {facetId} />
{/if}

{@render interleave?.()}

<!-- Local logs, this Facet's own (ADR-0080 §2, §5): the channels its domains
     write, switched by its own export door, because a consent follows its
     channel. Unconditional, and that is the one asymmetry with the card above:
     a consent is a fact about egress from a Facet rather than about the document
     the switch is drawn in, so food's door belongs wherever food's screens are —
     including the root's Rations face, where until ADR-0080 it was off forever
     with nothing saying why. -->
<LogSettingsSection {facetId} {elevated} />

<!-- Which faces this device shows (ADR-0114 §10). Only on the shell's own door:
     it lists what *this shell* holds, so a copy on a face belonging to another
     Facet would offer to hide three tiles out of a grid of seven. -->
{#if ownDoor}
  <FaceVisibilitySection faces={facesOf(facetOf(facetId))} />
{/if}

<!-- The sanctioned exit (ADR-0078 §4), which ADR-0114 §10 moves off the Rations
     face and onto this one: an offer to install Rations, made from inside a face
     called Rations, was the app advertising a rival copy of itself.

     **Enumerated rather than gated, and it needs no `ownDoor`.** The offer goes
     to the Facets nested inside this one, which is ADR-0078 §3's prefix matching
     read as data: only a Facet containing another can link to it without leaving
     its own scope. So the root offers Rations, and every other combination —
     Rations' own door, and Rations' sheet drawn inside the root — comes back
     empty on its own, with no rule written down against `root`. A third Facet
     costs no edit here. -->
{#each nestedFacetsOf(facetId) as facet (facet.id)}
  <FacetExit {facet} />
{/each}
