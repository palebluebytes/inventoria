<script lang="ts">
  import { updateAcquisitionMetadata } from "../../stores/acquisition.store";
  import Button from "../../ui/Button.svelte";
  import Input from "../../ui/Input.svelte";
  import Alert from "../../ui/Alert.svelte";
  import Modal from "../../ui/Modal.svelte";

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

{#if showEditModal && editingItem}
  <Modal onClose={closeModal} title="✏️ Edit Tags & Note">
    {#snippet children({ props, close })}
      <div {...props} class="modal-card">
        <div class="modal-header">
          <h2>✏️ Edit Tags & Note</h2>
          <button class="close-btn" onclick={close}>&times;</button>
        </div>

      {#if editError}
        <Alert variant="error" class="mb-4">{editError}</Alert>
      {/if}

      <form onsubmit={handleEditSubmit} class="form mt-4">
        <div class="form-group">
          <label for="edit-item-name">Item Name</label>
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

        <div class="modal-footer">
          <Button variant="secondary" type="button" onclick={close}
            >Cancel</Button
          >
          <Button type="submit">Save Changes</Button>
        </div>
      </form>
      </div>
    {/snippet}
  </Modal>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
    backdrop-filter: blur(4px);
  }
  .modal-card {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000;
    background: var(--bg-surface, #fff);
    border: 3px solid #000;
    box-shadow: 8px 8px 0 #000;
    width: calc(100% - 2 * var(--space-s));
    max-width: 500px;
    max-height: 85vh;
    overflow-y: auto;
    padding: var(--space-m);
    animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #000;
    padding-bottom: var(--space-xs);
    margin-bottom: var(--space-s);
  }
  .modal-header h2 {
    font-size: var(--step-1);
    font-weight: 700;
    margin: 0;
    text-transform: uppercase;
  }
  .close-btn {
    background: none;
    border: none;
    color: #000;
    font-size: 2rem;
    cursor: pointer;
    line-height: 1;
  }
  .close-btn:hover {
    transform: scale(1.1);
  }
  .form {
    display: flex;
    flex-direction: column;
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
  .read-only-value {
    padding: 10px;
    background: #f4f4f5;
    border: 2px solid #000;
    font-weight: 600;
    font-size: var(--step-n1);
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
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-s);
    margin-top: var(--space-m);
  }
  .mt-4 {
    margin-top: var(--space-s);
  }
  :global(.mb-4) {
    margin-bottom: var(--space-s);
  }

  @keyframes popIn {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
</style>
