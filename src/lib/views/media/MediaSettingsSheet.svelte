<script lang="ts">
  import { secretsStore, setSecret } from "../../stores/secrets";
  import { get } from "svelte/store";
  import { onDestroy } from "svelte";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import FieldCaption from "../../ui/FieldCaption.svelte";
  import SecretField from "../../ui/SecretField.svelte";

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
      <FieldCaption for="tmdb-api-key">TMDB API Key</FieldCaption>
      <SecretField
        id="tmdb-api-key"
        reveals="TMDB API key"
        bind:value={tmdbKey}
        onblur={persistTmdbKey}
        placeholder="TMDB API key..."
      />
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
  .help-text {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    font-style: italic;
  }
</style>
