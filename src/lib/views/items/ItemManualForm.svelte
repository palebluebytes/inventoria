<script lang="ts">
  import { mintEntity } from "../../facets/entity-id";
  import { saveAcquisitionTwin } from "../../stores/acquisition.store";
  import Card from "../../ui/Card.svelte";
  import Button from "../../ui/Button.svelte";
  import FieldCaption from "../../ui/FieldCaption.svelte";
  import Input from "../../ui/Input.svelte";
  import Textarea from "../../ui/Textarea.svelte";
  import Select from "../../ui/Select.svelte";

  let {
    showManualForm = $bindable(),
    onSaveSuccess,
    onSaveError,
  }: {
    showManualForm: boolean;
    onSaveSuccess?: (msg: string) => void;
    onSaveError?: (msg: string) => void;
  } = $props();

  let manualName = $state("");
  let manualBrand = $state("");
  let manualDescription = $state("");
  let manualImage = $state("");
  let manualStatus = $state<"owned" | "wanted">("wanted");
  let manualTags = $state("");
  let manualNote = $state("");

  async function handleManualSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!manualName.trim()) return;

    try {
      const entityId = mintEntity(
        "twin:manual_",
        `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      );
      const parsedTags = manualTags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      await saveAcquisitionTwin(
        {
          entity: entityId,
          attributes: {
            "item/name": manualName.trim(),
            "item/image": manualImage.trim(),
            "item/description": manualDescription.trim(),
            "item/brand": manualBrand.trim(),
            "item/tags": parsedTags,
            "item/note": manualNote.trim(),
          },
        },
        manualStatus
      );

      // Reset form
      manualName = "";
      manualBrand = "";
      manualDescription = "";
      manualImage = "";
      manualTags = "";
      manualNote = "";
      showManualForm = false;

      if (onSaveSuccess) {
        onSaveSuccess("Physical Digital Twin saved successfully!");
      }
    } catch (err: any) {
      if (onSaveError) {
        onSaveError(err.message || "Failed to save manually.");
      }
    }
  }
</script>

<Card class="mt-4">
  <h2>Add Digital Twin Manually</h2>
  <form onsubmit={handleManualSubmit} class="form-grid">
    <div class="form-group">
      <FieldCaption for="manual-name">Item Name *</FieldCaption>
      <Input
        id="manual-name"
        bind:value={manualName}
        placeholder="e.g. Mechanical Keyboard"
      />
    </div>

    <div class="form-group">
      <FieldCaption for="manual-brand">Brand</FieldCaption>
      <Input
        id="manual-brand"
        bind:value={manualBrand}
        placeholder="e.g. Keychron"
      />
    </div>

    <div class="form-group">
      <FieldCaption for="manual-image">Image URL</FieldCaption>
      <Input
        id="manual-image"
        type="text"
        bind:value={manualImage}
        placeholder="https://..."
      />
    </div>

    <div class="form-group">
      <FieldCaption for="manual-status">Initial Status</FieldCaption>
      <Select
        id="manual-status"
        bind:value={manualStatus}
        options={[
          { value: "wanted", label: "Wanted" },
          { value: "owned", label: "Owned" },
        ]}
      />
    </div>

    <div class="form-group">
      <FieldCaption for="manual-tags">Tags (comma-separated)</FieldCaption>
      <Input
        id="manual-tags"
        type="text"
        bind:value={manualTags}
        placeholder="e.g. tech, home, setup"
      />
    </div>

    <div class="form-group full-width">
      <FieldCaption for="manual-desc">Description</FieldCaption>
      <Textarea
        id="manual-desc"
        bind:value={manualDescription}
        placeholder="Details about this twin..."
      />
    </div>

    <div class="form-group full-width">
      <FieldCaption for="manual-note">Note</FieldCaption>
      <Textarea
        id="manual-note"
        bind:value={manualNote}
        placeholder="Personal notes about this item..."
      />
    </div>

    <div class="form-actions full-width">
      <Button variant="primary" type="submit">Save Digital Twin</Button>
      <Button
        variant="secondary"
        type="button"
        onclick={() => (showManualForm = false)}>Cancel</Button
      >
    </div>
  </form>
</Card>

<style>
  h2 {
    font-size: var(--step-0);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: -0.02em;
    margin-bottom: var(--space-s);
  }
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-s);
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }
  .full-width {
    grid-column: span 2;
  }
  .form-actions {
    display: flex;
    gap: var(--space-s);
    margin-top: var(--space-s);
  }
</style>
