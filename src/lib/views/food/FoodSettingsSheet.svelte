<script lang="ts">
  import { settingsStore, saveSettings } from "../../stores/settings.store";
  import { secretsStore, setSecret } from "../../stores/secrets";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import NutritionTargetEditor from "./NutritionTargetEditor.svelte";

  // The food screen's own settings surface (top-right gear on FoodView). Holds
  // just the food-relevant settings — the USDA + Open Food Facts credentials,
  // the OFF-contribution consent toggle, and the nutrition-target editor — that
  // moved off the global Settings tab so food config lives with the food. The
  // TMDB key, scraper proxy, ledger and dev options stay on Settings.
  //
  // There is no Save button: every field persists the moment it changes (a
  // secret on blur, the toggle on change), matching how the nutrition editor
  // below already auto-saves. So the sheet is dismissed, never "submitted".
  let { onClose }: { onClose: () => void } = $props();

  // Local form state. The USDA key and OFF login are secrets (localStorage,
  // ADR-0034 §8); the contribution toggle is a non-secret settings datom.
  let usdaKey = $state("");
  let offUserId = $state("");
  let offPassword = $state("");
  // OFF-contribution consent MASTER toggle (ADR-0034 §8, model C). Default off;
  // it only seeds the per-capture checkbox in the capture form, never submits.
  let offContribute = $state(false);

  let showUsda = $state(false);
  let showOffPassword = $state(false);

  // Seed the form once the stores load. Secrets come from the localStorage-backed
  // secrets store; the consent toggle from the settings ledger.
  let initialized = $state(false);
  $effect(() => {
    if (!initialized && $settingsStore) {
      usdaKey = $secretsStore.usda_api_key;
      offUserId = $secretsStore.off_user_id;
      offPassword = $secretsStore.off_password;
      offContribute = $settingsStore.off_contribute;
      initialized = true;
    }
  });

  // Each secret persists straight to localStorage on blur — never a datom
  // (ADR-0034 §8). The password is stored verbatim (it may legitimately contain
  // spaces); the key and username are trimmed like any pasted credential.
  function persistUsda() {
    setSecret("usda_api_key", usdaKey.trim());
  }
  function persistOffUserId() {
    setSecret("off_user_id", offUserId.trim());
  }
  function persistOffPassword() {
    setSecret("off_password", offPassword);
  }

  // The consent toggle is the one non-secret here, so it rides the ledger. Persist
  // it on change, preserving every other datom saveSettings writes by reading its
  // current value off the store — the scraper proxy (owned by the global Settings
  // tab) and the Nutrition Display selections (owned by NutritionTargetEditor) —
  // so toggling consent never clobbers a setting this sheet doesn't own.
  async function persistOffContribute(next: boolean) {
    offContribute = next;
    try {
      await saveSettings({
        scraper_proxy_url: $settingsStore.scraper_proxy_url,
        visible_nutrients: $settingsStore.visible_nutrients,
        round_nutrition: $settingsStore.round_nutrition,
        off_contribute: next,
      });
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
        <label for="food-usda-api-key">USDA FoodData Central API Key</label>
        <div class="input-wrapper">
          <input
            id="food-usda-api-key"
            type={showUsda ? "text" : "password"}
            bind:value={usdaKey}
            onblur={persistUsda}
            placeholder="USDA FDC API key..."
            class="retro-input has-reveal"
          />
          {@render revealToggle(
            showUsda,
            () => (showUsda = !showUsda),
            showUsda ? "Hide USDA API key" : "Show USDA API key"
          )}
        </div>
        <span class="help-text"
          >Used for searching ingredients in recipes and food logging.</span
        >
      </div>

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
        <label class="toggle-label consent-toggle">
          <input
            type="checkbox"
            id="food-off-contribute-toggle"
            checked={offContribute}
            onchange={(e) => persistOffContribute(e.currentTarget.checked)}
          />
          <span class="toggle-text"
            >Contribute to Open Food Facts by default</span
          >
        </label>
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
    font-family: monospace;
    font-weight: 700;
    border-radius: var(--radius);
    background: var(--paper);
    box-shadow: inset 2px 2px 0 #e4e4e7;
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
  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.65em;
    font-weight: 700;
    line-height: 1.4;
    color: var(--ink);
    cursor: pointer;
    user-select: none;
    text-transform: uppercase;
  }
  /* The consent toggle's longer, sentence-case label wraps rather than clips,
     and the checkbox aligns to the first line. */
  .consent-toggle {
    align-items: flex-start;
    font-size: var(--step-n1);
    text-transform: none;
    line-height: 1.35;
  }
  /* The caps sit ~0.08em above the line-box centre (Epilogue's ascent is taller
     than its cap height), so flex centring alone leaves them floating high.
     Fallback for engines without text-box-trim: nudge the text down optically. */
  .toggle-text {
    position: relative;
    top: 0.08em;
  }
  .consent-toggle .toggle-text {
    top: 0;
  }
  @supports (text-box-trim: trim-both) {
    .toggle-text {
      text-box-trim: trim-both;
      text-box-edge: cap alphabetic;
      top: 0;
    }
  }
  /* Custom retro checkbox: appearance:none lets the control fill its own box so
     it centers cleanly against the text, matching the 2px black borders used
     elsewhere. */
  .toggle-label input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    flex: 0 0 auto;
    display: grid;
    place-content: center;
    width: 1.35em;
    height: 1.35em;
    margin: 0;
    border: var(--edge);
    background: var(--paper);
    cursor: pointer;
  }
  .toggle-label input[type="checkbox"]::before {
    content: "";
    width: 0.62em;
    height: 0.62em;
    background: var(--ink);
    transform: scale(0);
  }
  .toggle-label input[type="checkbox"]:checked::before {
    transform: scale(1);
  }
  .toggle-label input[type="checkbox"]:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
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
