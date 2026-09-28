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
  import JarSettings from "../settings/JarSettings.svelte";
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
     * title below says so — but it is Rations' **Settings face** only under
     * Rations. Under the root it is a page inside the Rations face, and an act
     * performed there ran in the root (ADR-0108 §1), so the pairing surface and
     * the visibility toggles belong to the root's own door. This prop is the
     * whole of what says which; `JarSettings` draws the conclusion.
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

  <!-- **The jar-wide half of this face** (ADR-0114 §10): the pairing surface,
       the log card, the face-visibility toggles, and — where there is one to
       offer — an install. One component, drawn here and on the root's own
       Settings screen, because the two used to spell the same blocks out twice
       with a Facet id the only difference between the copies.

       Everything above this line is Rations': the nutrition editor, the OFF
       login, "Your data" and its Facet-scoped wipe stay on this sheet, because
       ADR-0114 §10 moves the jar-wide blocks into the face and leaves the
       food-specific settings where the gear already opens them.

       `shell` is threaded rather than sniffed, and it is the whole of why this
       sheet is one surface under Rations and a *page* under the root: the root
       draws it in its Rations face, where an act performed runs in the root
       (ADR-0108 §1), so the pairing card and the visibility toggles belong to
       the root's own door and not to this one. `JarSettings` judges that; this
       sheet only says which shell it is in.

       The scan card rides the slot rather than the list, so it keeps its
       adjacency (ADR-0071 §6): it sits directly above the log card its channel
       is listed in, so its Clear is one card away from the numbers it zeroes. -->
  <JarSettings facetId="food" {shell} elevated>
    {#snippet interleave()}
      <ScanSessionsCard />
    {/snippet}
  </JarSettings>
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
