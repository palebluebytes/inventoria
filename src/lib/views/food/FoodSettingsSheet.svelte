<script lang="ts">
  import {
    settingsStore,
    saveOffContribute,
  } from "../../stores/settings.store";
  import { secretsStore, setSecret } from "../../stores/secrets";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import Checkbox from "../../ui/Checkbox.svelte";
  import NutritionTargetEditor from "./NutritionTargetEditor.svelte";

  // The food screen's own settings surface (top-right gear on FoodView). Holds
  // just the food-relevant settings — the Open Food Facts login, the
  // OFF-contribution consent toggle, and the nutrition-target editor — that
  // moved off the global Settings tab so food config lives with the food. The
  // TMDB key, scraper proxy, ledger and dev options stay on Settings.
  //
  // USDA needs nothing here: the base-food corpus is bundled, so there is no key
  // to enter and no quota to explain (ADR-0047 §1/§9).
  //
  // There is no Save button: every field persists the moment it changes (a
  // secret on blur, the toggle on change), matching how the nutrition editor
  // below already auto-saves. So the sheet is dismissed, never "submitted".
  let { onClose }: { onClose: () => void } = $props();

  // Local form state. The OFF login is a secret (localStorage, ADR-0034 §8); the
  // contribution toggle is a non-secret settings datom.
  let offUserId = $state("");
  let offPassword = $state("");
  // OFF-contribution consent MASTER toggle (ADR-0034 §8, model C). Default off;
  // it only seeds the per-capture checkbox in the capture form, never submits.
  let offContribute = $state(false);

  let showOffPassword = $state(false);

  // Seed the form once the stores load. Secrets come from the localStorage-backed
  // secrets store; the consent toggle from the settings ledger.
  let initialized = $state(false);
  $effect(() => {
    if (!initialized && $settingsStore) {
      offUserId = $secretsStore.off_user_id;
      offPassword = $secretsStore.off_password;
      offContribute = $settingsStore.off_contribute;
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

  // The consent toggle is the one non-secret here, so it rides the ledger — and
  // it is now the only datom this sheet writes, through a writer that touches
  // nothing else. It used to carry the scraper proxy and the Nutrition Display
  // selections along just so toggling consent could not clobber them; both are
  // device settings now (ADR-0063), so that hazard is gone rather than handled.
  async function persistOffContribute(next: boolean) {
    offContribute = next;
    try {
      await saveOffContribute(next);
    } catch (err) {
      console.error("Failed to save OFF-contribution consent", err);
    }
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

<BottomSheet isOpen title="Food Settings" {onClose}>
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
        <!-- OFF-contribution consent MASTER toggle (ADR-0034 §8, model C).
             Default off. It never submits on its own — it only pre-ticks the
             per-capture checkbox shown in the capture form, which you confirm
             every time. Persists the instant it changes. -->
        <Checkbox
          id="food-off-contribute-toggle"
          class="consent-toggle"
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
  /* The row is the shared Checkbox (ADR-0068). Only this consent row's
     departure from the house look stays here — a longer, sentence-case label
     that wraps rather than clips, with the box aligned to its first line —
     reached via :global as the class rides the primitive's label. */
  .form-group :global(.consent-toggle) {
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
