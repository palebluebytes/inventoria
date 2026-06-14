<script lang="ts">
  import { saveAcquisitionTwin } from "../../stores/acquisition.store";
  import Card from "../../ui/Card.svelte";
  import Button from "../../ui/Button.svelte";
  import Input from "../../ui/Input.svelte";

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
      const entityId = `twin:manual_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const parsedTags = manualTags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      await saveAcquisitionTwin(
        {
          entity: entityId,
          attributes: {
            "twin/name": manualName.trim(),
            "twin/image": manualImage.trim(),
            "twin/description": manualDescription.trim(),
            "twin/brand": manualBrand.trim(),
            "twin/tags": parsedTags,
            "twin/note": manualNote.trim(),
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

<Card class="manual-form mt-4">
  <h2>Add Digital Twin Manually</h2>
  <form onsubmit={handleManualSubmit} class="form-grid">
    <div class="form-group">
      <label for="manual-name">Item Name *</label>
      <Input
        id="manual-name"
        bind:value={manualName}
        placeholder="e.g. Mechanical Keyboard"
      />
    </div>

    <div class="form-group">
      <label for="manual-brand">Brand</label>
      <Input
        id="manual-brand"
        bind:value={manualBrand}
        placeholder="e.g. Keychron"
      />
    </div>

    <div class="form-group">
      <label for="manual-image">Image URL</label>
      <Input
        id="manual-image"
        type="text"
        bind:value={manualImage}
        placeholder="https://..."
      />
    </div>

    <div class="form-group">
      <label for="manual-status">Initial Status</label>
      <select
        id="manual-status"
        bind:value={manualStatus}
        class="custom-select"
      >
        <option value="wanted">Wanted</option>
        <option value="owned">Owned</option>
      </select>
    </div>

    <div class="form-group">
      <label for="manual-tags">Tags (comma-separated)</label>
      <Input
        id="manual-tags"
        type="text"
        bind:value={manualTags}
        placeholder="e.g. tech, home, setup"
      />
    </div>

    <div class="form-group full-width">
      <label for="manual-desc">Description</label>
      <textarea
        id="manual-desc"
        bind:value={manualDescription}
        placeholder="Details about this twin..."
      ></textarea>
    </div>

    <div class="form-group full-width">
      <label for="manual-note">Note</label>
      <textarea
        id="manual-note"
        bind:value={manualNote}
        placeholder="Personal notes about this item..."
      ></textarea>
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
    gap: 4px;
  }
  .form-group label {
    font-size: var(--step-n2);
    font-weight: 600;
    text-transform: uppercase;
  }
  .full-width {
    grid-column: span 2;
  }
  .custom-select {
    width: 100%;
    padding: 10px;
    border: 2px solid #000;
    border-radius: 0;
    font-size: var(--step-n1);
    background: #fff;
    font-family: inherit;
    font-weight: 500;
  }
  .custom-select:focus {
    outline: none;
    border-color: var(--primary);
  }
  textarea {
    width: 100%;
    min-height: 80px;
    padding: 10px;
    border: 2px solid #000;
    border-radius: 0;
    font-size: var(--step-n1);
    font-family: inherit;
    resize: vertical;
  }
  textarea:focus {
    outline: none;
    border-color: var(--primary);
  }
  .form-actions {
    display: flex;
    gap: var(--space-s);
    margin-top: var(--space-s);
  }
</style>
