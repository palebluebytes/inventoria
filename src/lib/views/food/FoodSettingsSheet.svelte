<script lang="ts">
  import {
    offContributeDefault,
    setOffContributeDefault,
  } from "../../stores/device-settings";
  import { secretsStore, setSecret } from "../../stores/secrets";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import Checkbox from "../../ui/Checkbox.svelte";
  import FieldCaption from "../../ui/FieldCaption.svelte";
  import Input from "../../ui/Input.svelte";
  import SecretField from "../../ui/SecretField.svelte";
  import NutritionTargetEditor from "./NutritionTargetEditor.svelte";
  import FoodDataSection from "./FoodDataSection.svelte";
  import PairedDevicesSection from "../pairing/PairedDevicesSection.svelte";
  import LogSettingsSection from "../logs/LogSettingsSection.svelte";
  import ScanSessionsCard from "../logs/ScanSessionsCard.svelte";
  import { facetOf, type FacetId } from "../../facets/registry";

  // **Rations settings** (ADR-0080 §7): the one named, full-height surface the
  // food screen's gear opens, from either entry point.
  //
  // It was the food screen's own sheet of food config — the Open Food Facts
  // login, the OFF-contribution default and the nutrition-target editor, moved
  // off the global Settings tab before Facets existed. ADR-0080 makes it the
  // whole of what a food-only user can do to their own data: ADR-0078 §7 leaves
  // Rations no route to root Settings and no escape hatch is coming, so
  // anything a standalone Rations user needs is here or nowhere.
  //
  // That is the threshold ADR-0076 §5 said would come, and it was not a count of
  // blocks — it was the arrival of a destructive action and a run that reports
  // progress for minutes, loose in a container the user dismisses by swiping.
  // Hence the pinned height rather than one that swings with its content.
  //
  // **The title is read off the registry** (ADR-0080 §7, §8), so a second Facet
  // gets its own without a second decision. It is qualified rather than plain
  // "Settings" because the same surface opens from the root's Food tab, one tab
  // away from the root's own Settings screen — which is the collision ADR-0076
  // §5's ban was written for, and one string is correct in both contexts.
  //
  // USDA needs nothing here: the base-food corpus is bundled, so there is no key
  // to enter and no quota to explain (ADR-0047 §1/§9).
  //
  // There is no Save button: every field persists the moment it changes (a
  // secret on blur, the toggle on change), matching how the nutrition editor
  // below already auto-saves. So the sheet is dismissed, never "submitted".
  let {
    onClose,
    /**
     * Whether the worker is up, threaded from whichever shell mounted the food
     * screen. The Ledger import in "Your data" is the only control here that
     * needs it: everything else on this sheet is `localStorage`, and the
     * export's own readiness comes from the census it already reads.
     */
    dbReady,
    inline = false,
    /**
     * Which Facet's shell is drawing this sheet, threaded from the entry point
     * (ADR-0076 §6).
     *
     * The sheet is Rations' settings screen whichever shell draws it — the
     * title below says so — but one control on it is not a fact about food, and
     * that is the pairing surface: ADR-0103 §1 scopes a pairing to the Facet
     * the act ran in, and an act performed in the root's Food tab ran in the
     * root. So the card is drawn under Rations and nowhere else, and the root
     * keeps the one pairing surface it already has on its own Settings screen.
     */
    shell,
  }: {
    onClose: () => void;
    dbReady: boolean;
    inline?: boolean;
    shell: FacetId;
  } = $props();

  // The Facet whose settings these are — always Rations, whichever entry point
  // is drawing the screen. Read off the registry rather than typed, so the name
  // a home screen installs under and the name this title says cannot come apart.
  const title = `${facetOf("food").name} settings`;

  // Local form state. Both are per-device `localStorage`: the OFF login is a
  // secret (ADR-0034 §8), and the contribution toggle is a setting, because it
  // seeds a checkbox rather than recording an agreement (ADR-0086 §2).
  let offUserId = $state("");
  let offPassword = $state("");
  // OFF-contribution default (ADR-0034 §8, model C). Off unless set; it only
  // seeds the per-capture checkbox in the capture form, and never submits.
  let offContribute = $state(false);

  // Seed the form once. Both stores are `localStorage`-backed and therefore
  // right in the first frame — the guard that waited on a ledger read is gone
  // with the datom (ADR-0086 §2), and the seed runs once so typing into a field
  // is never overwritten by its own store.
  let initialized = $state(false);
  $effect(() => {
    if (!initialized) {
      offUserId = $secretsStore.off_user_id;
      offPassword = $secretsStore.off_password;
      offContribute = $offContributeDefault;
      initialized = true;
    }
  });

  // Each secret persists straight to localStorage on blur — never a datom
  // (ADR-0034 §8). The password is stored verbatim (it may legitimately contain
  // spaces); the username is trimmed like any pasted credential.
  function persistOffUserId() {
    setSecret("off_user_id", offUserId.trim());
  }
  function persistOffPassword() {
    setSecret("off_password", offPassword);
  }

  // This sheet now writes **no datom at all**. It used to write one, and used to
  // carry the scraper proxy and the Nutrition Display selections along just so
  // toggling it could not clobber them; every setting is a device setting now
  // (ADR-0085 §1, ADR-0086 §2), so that hazard is gone rather than handled.
  function persistOffContribute(next: boolean) {
    offContribute = next;
    setOffContributeDefault(next);
  }
</script>

<BottomSheet isOpen {title} fillHeight {onClose} {inline}>
  <!-- Nutrition Display leads the sheet, borderless and full-bleed: the negative
       inline margins cancel the sheet body's padding so the editor spans the
       full width, edge to edge. -->
  <div class="nutrition-full-bleed">
    <NutritionTargetEditor />
  </div>

  <section class="settings-section">
    <h2>Food Data Sources</h2>
    <div class="settings-form mt-4">
      <div class="form-group">
        <FieldCaption for="food-off-user-id"
          >Open Food Facts Username</FieldCaption
        >
        <Input
          id="food-off-user-id"
          type="text"
          autocomplete="username"
          bind:value={offUserId}
          onblur={persistOffUserId}
          placeholder="Your Open Food Facts username..."
        />
        <span class="help-text"
          >Your Open Food Facts login, used to contribute corrected label data
          back to OFF. Stored on this device only.</span
        >
      </div>

      <div class="form-group">
        <FieldCaption for="food-off-password"
          >Open Food Facts Password</FieldCaption
        >
        <SecretField
          id="food-off-password"
          reveals="Open Food Facts password"
          autocomplete="current-password"
          bind:value={offPassword}
          onblur={persistOffPassword}
          placeholder="Your Open Food Facts password..."
        />
        <span class="help-text"
          >Stored on this device only, never in the synced database.</span
        >
      </div>

      <div class="form-group">
        <!-- OFF-contribution default (ADR-0034 §8, model C). Off unless set.
             It never submits on its own — it only pre-ticks the per-capture
             checkbox shown in the capture form, which you confirm every time.
             That per-capture tick is the agreement; this is its default, which
             is why it is a setting and not a datom (ADR-0086 §2). Persists the
             instant it changes. -->
        <Checkbox
          id="food-off-contribute-toggle"
          class="opt-in-toggle"
          label="Contribute to Open Food Facts by default"
          checked={offContribute}
          onCheckedChange={persistOffContribute}
        />
        <span class="help-text"
          >Pre-ticks the "share with Open Food Facts" option on the capture form
          when you scan or correct a barcoded product. The option always appears
          (when you have an OFF login); this just sets its default. You confirm
          each contribution individually — nothing is ever sent automatically.</span
        >
      </div>
    </div>
  </section>

  <!-- **"Your data"** (ADR-0080 §7): the Facet-scoped export and wipe (ADR-0079
       §6), the un-narrowed Ledger import and the persistence badge (#335). It
       sits below the two
       sections that configure food and above the log card, because it is the
       one control here that takes something away rather than setting it: the
       destructive action ADR-0080 §7 named as the reason this sheet has a
       pinned height instead of one that swings with its content.

       It appears here and at the root wherever food's screens already appear,
       which is this same sheet — never a root inventory of Facets with a wipe
       button each, which is the launcher ADR-0076 refuses and would need a
       second enumeration of Facets. -->
  <FoodDataSection {dbReady} />

  <!-- **Paired devices, entire** (ADR-0103 §10): the pairing act, the list, the
       naming, the two-phase unpair and ADR-0096 §11's pending-revocation and
       stopped-at-K states. It is the root's own module, reached by reference
       rather than copied (ADR-0095) — ADR-0078 §1 permits exactly that, because
       the rule binds *screens* and a shared component is not a crossing. Rations
       gains a screen of its own and no link to the root's.

       It carries the Facet its acts run in as a literal (ADR-0076 §6), which is
       the whole of what ADR-0103 §1 needs: a pairing carries the domains of the
       Facet the act ran in, so a pairing made here is a food lane.

       **Which is why the root does not draw it.** This sheet is Rations'
       screen, but the root draws the whole of it in its Food tab, and an act
       performed there ran in the root — a Facet is an install (ADR-0076 §1) and
       not a tab. Drawing the card under both shells would put two pairing
       surfaces in one root document disagreeing about what a pairing means, and
       §4 would have the food one silently re-scope a jar-wide lane the other
       made. The rest of this sheet is unconditional because the rest of it is
       about food's *data*, which is the same fact whoever is asking.

       It sits directly under "Your data" because the wipe above it is the
       control §8 is about: "Delete all my food data" takes food's rows and
       food's `localStorage` and **unpairs nothing**, and the two being one
       screen apart is what makes that legible rather than merely true. -->
  {#if shell === "food"}
    <PairedDevicesSection facetId="food" />
  {/if}

  <!-- What the barcode scan has been doing (ADR-0071 §6). Rations' surface and
       not the root's, because the reading belongs to the domain that writes the
       channel — the same clause (b) that puts the log card's export switch here
       — and because a standing readout of one Facet's instrument on the jar's
       own Settings screen is the shape ADR-0080 §6 deleted. It sits directly
       above the log card the channel is listed in, so its Clear is one card
       away from the numbers it zeroes. -->
  <ScanSessionsCard />

  <!-- Local logs, Rations' own (ADR-0080 §2). The same card the root draws,
       narrowed to the channels food's domain writes and switched by Rations'
       own export door — clause (b) of ADR-0080 §1: Rations writes the only
       channel there is, so Rations governs its egress. Until this surface
       existed that switch lived on a screen ADR-0078 §7 gives a Rations user no
       way to reach, so it was off forever with nothing saying why. -->
  <LogSettingsSection facetId="food" elevated />
</BottomSheet>

<style>
  /* Stretch the Nutrition Display editor to the full sheet width by cancelling
     the body's `--space-m` padding on both sides. Its top edge keeps the body
     padding so the heading isn't jammed under the sheet header. */
  .nutrition-full-bleed {
    margin-inline: calc(-1 * var(--space-m));
  }
  /* Food Data Sources follows the full-bleed editor — a rule + space sets it off
     as the second section. */
  .settings-section {
    animation: fadeIn 0.3s ease-out;
    margin-top: var(--space-l);
    padding-top: var(--space-l);
    border-top: var(--edge);
  }
  h2 {
    font-size: var(--step-1);
    font-weight: 800;
    color: var(--ink);
    text-transform: uppercase;
    margin: 0;
  }
  .settings-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }
  .help-text {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    font-style: italic;
  }
  /* The row is the shared Checkbox (ADR-0068). Only this opt-in row's
     departure from the house look stays here — a longer, sentence-case label
     that wraps rather than clips, with the box aligned to its first line —
     reached via :global as the class rides the primitive's label. */
  .form-group :global(.opt-in-toggle) {
    align-items: flex-start;
    text-transform: none;
    line-height: 1.35;
  }
  .mt-4 {
    margin-top: var(--space-m);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
