<script lang="ts">
  import { secretsStore, setSecret } from "../../stores/secrets";
  import { get } from "svelte/store";
  import { onDestroy } from "svelte";
  import BottomSheet from "../../ui/BottomSheet.svelte";

  // **Media settings** (ADR-0080 §4): a setting lives beside the thing it
  // configures, not with its Facet. The TMDB key is a user credential for a
  // user feature, so it belongs on the screen that feature is on — and the
  // Media screen had no settings affordance at all, which is the cost that
  // record accepted when it chose *beside what it configures* over *with its
  // Facet*. This is that affordance, a gear on the header opening a sheet, the
  // same shape `FoodView` already uses.
  //
  // Deleting the key's old home dissolved the Settings screen's API Credentials
  // card outright: the scraper proxy beside it went with ADR-0070's default
  // rather than moving, so nothing was left in it.
  //
  // **The title is qualified, and ADR-0076 §5's ban survives.** There is one
  // screen called Settings and this is not it. Unlike _Rations settings_ the
  // word is written here rather than read off the registry, because that
  // derivation exists to stop a Facet's install name and its settings title
  // drifting apart (ADR-0080 §7) and Media is a Tracked Domain, not a Facet: it
  // installs under no name, so there is nothing for this one to drift against.
  //
  // There is no Save button. The field persists the moment it is left, matching
  // the food sheet, so this surface is dismissed rather than "submitted".
  let { onClose }: { onClose: () => void } = $props();

  // Seeded at construction rather than from an effect: the sheet is built fresh
  // each time the gear opens it, and the secret is `localStorage`-backed
  // (ADR-0034 §8), so it is right in the first frame and nothing is waiting on
  // a ledger read.
  let tmdbKey = $state(get(secretsStore).tmdb_api_key);

  let showTmdb = $state(false);

  // Straight to localStorage on blur, never a datom (ADR-0034 §8), trimmed like
  // any pasted credential.
  function persistTmdbKey() {
    setSecret("tmdb_api_key", tmdbKey.trim());
  }

  // And again on the way out, because blur is not guaranteed to have happened.
  // This sheet is dismissed by Escape and by a click on the backdrop as well as
  // by its close button, and removing a focused input from the document does
  // not reliably fire `blur` — so without this a key typed and then dismissed
  // with Escape would be lost with no Save button to have pressed. Writing the
  // same value twice costs a `localStorage` write and nothing else.
  onDestroy(persistTmdbKey);
</script>

<BottomSheet isOpen title="Media settings" {onClose}>
  <div class="settings-form">
    <div class="form-group">
      <label for="tmdb-api-key">TMDB API Key</label>
      <div class="input-wrapper">
        <input
          id="tmdb-api-key"
          type={showTmdb ? "text" : "password"}
          bind:value={tmdbKey}
          onblur={persistTmdbKey}
          placeholder="TMDB API key..."
          class="retro-input has-reveal"
        />
        <button
          type="button"
          class="reveal-toggle"
          aria-label={showTmdb ? "Hide TMDB API key" : "Show TMDB API key"}
          aria-pressed={showTmdb}
          onclick={() => (showTmdb = !showTmdb)}
        >
          {#if showTmdb}
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
              ><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
              ></path><circle cx="12" cy="12" r="3"></circle></svg
            >
          {/if}
        </button>
      </div>
      <span class="help-text"
        >Used for importing movie and TV digital twins. Stored on this device
        only, never in the synced database.</span
      >
    </div>
  </div>
</BottomSheet>

<style>
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
  .help-text {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    font-style: italic;
  }
</style>
