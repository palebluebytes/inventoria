<script lang="ts">
  import {
    offContributeDefault,
    setOffContributeDefault,
  } from "../../stores/device-settings";
  import { secretsStore, setSecret } from "../../stores/secrets";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import Checkbox from "../../ui/Checkbox.svelte";
  import NutritionTargetEditor from "./NutritionTargetEditor.svelte";
  import FoodDataSection from "./FoodDataSection.svelte";
  import LogSettingsSection from "../logs/LogSettingsSection.svelte";
  import { facetOf } from "../../facets/registry";

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
  }: { onClose: () => void; dbReady: boolean } = $props();

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

  let showOffPassword = $state(false);

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

{#snippet revealToggle(revealed: boolean, toggle: () => void, label: string)}
  <button
    type="button"
    class="reveal-toggle"
    aria-label={label}
    aria-pressed={revealed}
    onclick={toggle}
  >
    {#if revealed}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        ><path
          d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        ></path><line x1="1" y1="1" x2="23" y2="23"></line></svg
      >
    {:else}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        ><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle
          cx="12"
          cy="12"
          r="3"
        ></circle></svg
      >
    {/if}
  </button>
{/snippet}

<BottomSheet isOpen {title} fillHeight {onClose}>
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
        <label for="food-off-user-id">Open Food Facts Username</label>
        <input
          id="food-off-user-id"
          type="text"
          autocomplete="username"
          bind:value={offUserId}
          onblur={persistOffUserId}
          placeholder="Your Open Food Facts username..."
          class="retro-input full-width"
        />
        <span class="help-text"
          >Your Open Food Facts login, used to contribute corrected label data
          back to OFF. Stored on this device only.</span
        >
      </div>

      <div class="form-group">
        <label for="food-off-password">Open Food Facts Password</label>
        <div class="input-wrapper">
          <input
            id="food-off-password"
            type={showOffPassword ? "text" : "password"}
            autocomplete="current-password"
            bind:value={offPassword}
            onblur={persistOffPassword}
            placeholder="Your Open Food Facts password..."
            class="retro-input has-reveal"
          />
          {@render revealToggle(
            showOffPassword,
            () => (showOffPassword = !showOffPassword),
            showOffPassword
              ? "Hide Open Food Facts password"
              : "Show Open Food Facts password"
          )}
        </div>
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
  .form-group label {
    font-weight: 700;
    font-size: var(--step-n1);
    text-transform: uppercase;
  }
  .input-wrapper {
    position: relative;
    display: flex;
  }
  .input-wrapper input {
    flex: 1;
    /* Allow the input to shrink below its intrinsic (monospace placeholder)
       width so it never overflows the sheet. */
    min-width: 0;
  }
  /* Leave room for the reveal toggle so masked text never runs under it. */
  .retro-input.has-reveal {
    padding-right: 2.75rem;
  }
  .reveal-toggle {
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
    width: 2.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--ink);
    cursor: pointer;
  }
  .reveal-toggle svg {
    width: 1.25rem;
    height: 1.25rem;
  }
  .reveal-toggle:hover {
    color: var(--text-secondary);
  }
  .reveal-toggle:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
  }
  /* Only the input flips to a black background on focus, so flip the icon to
     white just for that case. Scoped to the input (not :focus-within) so that
     focusing the toggle button itself — e.g. clicking it — keeps the icon dark
     and visible on the still-white input. */
  .input-wrapper:has(.retro-input:focus) .reveal-toggle {
    color: var(--paper);
  }
  .input-wrapper:has(.retro-input:focus) .reveal-toggle:hover {
    color: var(--text-muted);
  }
  .retro-input {
    border: var(--edge);
    padding: var(--space-s);
    font-size: var(--step-0);
    font-family: var(--font-mono);
    font-weight: 700;
    border-radius: var(--radius);
    background: var(--paper);
    box-shadow: inset 2px 2px 0 var(--border);
    transition: all 0.1s step-end;
  }
  .retro-input:focus {
    outline: none;
    background: var(--ink);
    color: var(--paper);
    box-shadow: none;
  }
  .full-width {
    width: 100%;
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
