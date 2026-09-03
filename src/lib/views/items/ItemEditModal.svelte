<script lang="ts">
  import { updateAcquisitionMetadata } from "../../stores/acquisition.store";
  import Button from "../../ui/Button.svelte";
  import Input from "../../ui/Input.svelte";
  import Alert from "../../ui/Alert.svelte";
  import BottomSheet from "../../ui/BottomSheet.svelte";

  let {
    editingItem = $bindable(),
    showEditModal = $bindable(),
  }: {
    editingItem: any;
    showEditModal: boolean;
  } = $props();

  let editTags = $state("");
  let editNote = $state("");
  let editError = $state("");

  // The dock's Save is outside the <form> — it is the sheet's, not the body's —
  // so it reaches the form by name rather than by containment.
  const FORM_ID = "edit-item-form";

  function closeModal() {
    showEditModal = false;
    editingItem = null;
  }

  $effect(() => {
    if (editingItem) {
      editTags = editingItem.tags ? editingItem.tags.join(", ") : "";
      editNote = editingItem.note || "";
      editError = "";
    }
  });

  async function handleEditSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!editingItem) return;
    try {
      const parsedTags = editTags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      await updateAcquisitionMetadata(
        editingItem.id,
        parsedTags,
        editNote.trim()
      );
      showEditModal = false;
      editingItem = null;
    } catch (err: any) {
      editError = err.message || "Failed to save edits.";
    }
  }
</script>

<!-- A sheet on a phone, a centred card above 768px (ADR-0089 §6, #329). It
     holds two text fields, which is why it is `fillHeight`: on a phone a sheet
     with a field in it takes the whole band and gives up the peek, so the
     keyboard cannot push its header off the top (§5). -->
{#if showEditModal && editingItem}
  <BottomSheet
    isOpen
    title="Edit Tags & Note"
    onClose={closeModal}
    fillHeight
    centred
  >
    {#if editError}
      <Alert variant="error" class="mb-4">{editError}</Alert>
    {/if}

    <form id={FORM_ID} onsubmit={handleEditSubmit} class="form">
      <div class="form-group">
        <!-- Not a <label>: there is no control under it to label. The name is
             what is being edited, not one of the fields editing it. -->
        <span class="field-name">Item Name</span>
        <div class="read-only-value">{editingItem.name}</div>
      </div>

      <div class="form-group">
        <label for="edit-tags">Tags (comma-separated)</label>
        <Input
          id="edit-tags"
          type="text"
          bind:value={editTags}
          placeholder="e.g. tech, home, setup"
        />
      </div>

      <div class="form-group">
        <label for="edit-note">Note</label>
        <textarea
          id="edit-note"
          bind:value={editNote}
          placeholder="Write personal notes about this item..."
          rows="3"
        ></textarea>
      </div>
    </form>

    {#snippet footer({ close }: { close: () => void })}
      <div class="dock">
        <Button variant="secondary" type="button" onclick={close}>Cancel</Button
        >
        <Button type="submit" form={FORM_ID}>Save Changes</Button>
      </div>
    {/snippet}
  </BottomSheet>
{/if}

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }
  .form-group label,
  .field-name {
    font-size: var(--step-n2);
    font-weight: 600;
    text-transform: uppercase;
  }
  .read-only-value {
    padding: var(--space-2xs);
    background: var(--bg-input);
    border: var(--edge);
    font-weight: 600;
    font-size: var(--step-n1);
  }
  textarea {
    width: 100%;
    min-height: 80px;
    padding: var(--space-2xs);
    border: var(--edge);
    border-radius: var(--radius);
    font-size: var(--step-0);
    font-family: inherit;
    resize: vertical;
  }
  textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .dock {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-s);
  }
  :global(.mb-4) {
    margin-bottom: var(--space-s);
  }
</style>
