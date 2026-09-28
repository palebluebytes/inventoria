<script lang="ts">
  /**
   * The operator's key for the model route (ADR-0115 §4.3).
   *
   * **One module, drawn twice** — on the root's Settings and again on Rations
   * settings — which is **Paired devices**' precedent and not a new shape.
   * ADR-0080 §4 dissolved the root's API Credentials card, so there is no
   * jar-wide home for a secret and each sits on the surface of the thing it
   * serves; but every runtime consumer of this one is Rations', and ADR-0078 §7
   * means a standalone Rations user can never reach the root's copy. So it is
   * drawn on both, from here, rather than typed out twice.
   *
   * It is a **shared key surface rather than a Facet-owned control**, so
   * ADR-0080's irreversibility-or-authorship test does not govern it. That test
   * decides which jar-wide controls a Facet may carry, and this is not one of
   * them: it is the same field in two places, not a jar-wide act delegated to a
   * Facet.
   *
   * **The copy's job is to stop it reading like a vendor API key.** The user
   * minted this themselves, against their own deployment, following
   * `docs/how-to-operate-the-model-route.md` — so the field says where it comes
   * from rather than implying an account to go and sign up for. It also says
   * what happens without one, because the answer is *everything still works*
   * (ADR-0115 §9.3) and a field that only says what it unlocks reads as a
   * requirement.
   */
  import { get } from "svelte/store";
  import { onDestroy } from "svelte";
  import Card from "../../ui/Card.svelte";
  import FieldCaption from "../../ui/FieldCaption.svelte";
  import SecretField from "../../ui/SecretField.svelte";
  import { secretsStore, setSecret } from "../../stores/secrets";
  import type { FacetId } from "../../facets/registry";

  const { facetId }: { facetId: FacetId } = $props();

  // Namespaced by Facet so the two copies never collide on a DOM id if both are
  // ever mounted at once, which is `PairedDevicesSection`'s own precaution.
  const fieldId = $derived(`${facetId}-model-route-key`);

  // Seeded at construction rather than from an effect, `MediaSettingsSheet`'s
  // pattern: the secret is `localStorage`-backed (ADR-0034 §8), so it is right
  // in the first frame and nothing is waiting on a ledger read. An effect would
  // also fight the field while it is being typed into.
  let key = $state(get(secretsStore).model_route_key);

  // Straight to localStorage, never a datom, trimmed like any pasted credential.
  function persist() {
    setSecret("model_route_key", key.trim());
  }

  // And again on the way out, for `MediaSettingsSheet`'s reason: on Rations this
  // is inside a sheet dismissed by Escape and by a backdrop click as well as by
  // its close button, and removing a focused input from the document does not
  // reliably fire `blur`. Writing the same value twice costs one
  // `localStorage` write and nothing else.
  onDestroy(persist);
</script>

<Card class="mt-4">
  <h2>Reading labels with AI</h2>
  <div class="settings-form mt-4">
    <div class="form-group">
      <FieldCaption for={fieldId}>Model route key</FieldCaption>
      <SecretField
        id={fieldId}
        reveals="model route key"
        autocomplete="off"
        bind:value={key}
        onblur={persist}
        placeholder="The key you set on your own deployment..."
      />
      <span class="help-text">
        Your own key for your own copy of Inventoria, not an account with
        anybody else. It lets this device ask the site to read a nutrition label
        off your photos. Without it everything on the label form still works —
        you type the panel in yourself, which is what happens today. Stored on
        this device only, never in the synced database.
      </span>
    </div>
  </div>
</Card>
