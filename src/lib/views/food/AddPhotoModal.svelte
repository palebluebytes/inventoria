<script lang="ts">
  import { untrack } from "svelte";
  import {
    saveCustomFood,
    logFoodConsumption,
  } from "../../stores/calorie.store";
  import Button from "../../ui/Button.svelte";
  import Input from "../../ui/Input.svelte";
  import Card from "../../ui/Card.svelte";
  import Alert from "../../ui/Alert.svelte";
  import Modal from "../../ui/Modal.svelte";

  let {
    meal_type,
    selectedDate,
    onClose,
  }: {
    meal_type: "breakfast" | "lunch" | "dinner" | "snack";
    selectedDate: Date;
    onClose: () => void;
  } = $props();

  let name = $state("");
  let calories = $state("");
  let protein = $state("");
  let fat = $state("");
  let carbs = $state("");
  let selected_meal_type = $state(untrack(() => meal_type));

  let photo_base64 = $state<string | null>(null);
  let uploadStatus = $state<"idle" | "loading" | "error">("idle");
  let uploadError = $state("");

  let fileInput: HTMLInputElement;

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    // Convert file to Base64
    const reader = new FileReader();
    reader.onload = (event) => {
      photo_base64 = event.target?.result as string;
    };
    reader.onerror = () => {
      uploadStatus = "error";
      uploadError = "Failed to read image file.";
    };
    reader.readAsDataURL(file);
  }

  function triggerFileSelect() {
    fileInput?.click();
  }

  async function handleLog() {
    const parsedCal = parseFloat(calories);
    if (!name.trim() || isNaN(parsedCal)) return;
    uploadStatus = "loading";
    uploadError = "";
    try {
      const parsedProt = parseFloat(protein) || 0;
      const parsedFat = parseFloat(fat) || 0;
      const parsedCarbs = parseFloat(carbs) || 0;

      // 1. Save the custom food twin with the photo base64
      const twinId = await saveCustomFood(
        name.trim(),
        parsedCal,
        parsedProt,
        parsedFat,
        parsedCarbs,
        photo_base64 || undefined
      );

      // 2. Log consumption of this custom twin
      await logFoodConsumption(
        twinId,
        "1 serving",
        selected_meal_type,
        parsedCal,
        parsedProt,
        parsedFat,
        parsedCarbs,
        selectedDate
      );

      onClose();
    } catch (e: any) {
      uploadStatus = "error";
      uploadError = e.message ?? String(e);
    }
  }
</script>

<Modal onClose={onClose} title="📷 Log Food with Photo">
  {#snippet children({ props, close })}
    <div {...props} class="modal-card">
      <div class="modal-header">
        <h2>📷 Log Food with Photo</h2>
        <button class="close-btn" onclick={close}>&times;</button>
      </div>

    <div class="photo-upload-section mt-4">
      <!-- Hidden file input -->
      <input
        type="file"
        accept="image/*"
        capture="environment"
        class="hidden-file-input"
        bind:this={fileInput}
        onchange={handleFileChange}
      />

      {#if photo_base64}
        <div class="photo-preview-box">
          <img
            src={photo_base64}
            alt="Food Upload Preview"
            class="photo-preview"
          />
          <button class="change-photo-btn" onclick={triggerFileSelect}>
            Change Photo
          </button>
        </div>
      {:else}
        <div
          class="upload-placeholder"
          role="button"
          tabindex="0"
          onclick={triggerFileSelect}
          onkeydown={(e) =>
            (e.key === "Enter" || e.key === " ") && triggerFileSelect()}
        >
          <span class="camera-icon">📷</span>
          <span class="upload-text">Take a photo or upload from library</span>
        </div>
      {/if}
    </div>

    <div class="form mt-4">
      <div class="form-field">
        <label for="photo-name-input">Food Name</label>
        <Input
          id="photo-name-input"
          placeholder="e.g. Avocado Toast"
          bind:value={name}
        />
      </div>

      <div class="macros-row">
        <div class="form-field flex-1">
          <label for="photo-cal-input">Calories (kcal)</label>
          <Input
            id="photo-cal-input"
            type="number"
            placeholder="0"
            bind:value={calories}
          />
        </div>
        <div class="form-field flex-1">
          <label for="photo-prot-input">Protein (g)</label>
          <Input
            id="photo-prot-input"
            type="number"
            placeholder="0"
            bind:value={protein}
          />
        </div>
      </div>

      <div class="macros-row">
        <div class="form-field flex-1">
          <label for="photo-fat-input">Fat (g)</label>
          <Input
            id="photo-fat-input"
            type="number"
            placeholder="0"
            bind:value={fat}
          />
        </div>
        <div class="form-field flex-1">
          <label for="photo-carb-input">Carbs (g)</label>
          <Input
            id="photo-carb-input"
            type="number"
            placeholder="0"
            bind:value={carbs}
          />
        </div>
      </div>

      <div class="form-field">
        <label for="photo-meal-select">Meal Type</label>
        <select
          id="photo-meal-select"
          bind:value={selected_meal_type}
          class="custom-select"
        >
          <option value="breakfast">Breakfast</option>
          <option value="lunch">Lunch</option>
          <option value="dinner">Dinner</option>
          <option value="snack">Snack</option>
        </select>
      </div>

      {#if uploadStatus === "error"}
        <div class="mt-2">
          <Alert variant="error">{uploadError}</Alert>
        </div>
      {/if}

      <div class="actions-row mt-4">
        <Button variant="secondary" onclick={close}>Cancel</Button>
        <Button
          onclick={handleLog}
          disabled={uploadStatus === "loading" ||
            !name.trim() ||
            String(calories).trim() === ""}
          loading={uploadStatus === "loading"}
        >
          Log Food
        </Button>
      </div>
    </div>
    </div>
  {/snippet}
</Modal>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.7);
    z-index: 999;
    backdrop-filter: blur(8px);
  }
  .modal-card {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000;
    background: var(--bg-card, #121214);
    border: 1px solid var(--border);
    border-radius: 16px;
    width: calc(100% - 2 * var(--space-s));
    max-width: 450px;
    max-height: 85vh;
    overflow-y: auto;
    padding: var(--space-m);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    animation: zoomIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--space-xs);
  }
  .modal-header h2 {
    font-size: var(--step-1);
    font-weight: 700;
    color: var(--text-primary);
  }
  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: var(--step-2);
    cursor: pointer;
  }
  .close-btn:hover {
    color: var(--text-primary);
  }

  .hidden-file-input {
    display: none;
  }

  .photo-upload-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .upload-placeholder {
    width: 100%;
    height: 180px;
    border: 2px dashed var(--border);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.01);
    transition: all 0.2s;
  }
  .upload-placeholder:hover {
    border-color: var(--accent);
    background: rgba(255, 255, 255, 0.02);
  }
  .camera-icon {
    font-size: 36px;
    margin-bottom: var(--space-xs);
  }
  .upload-text {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    font-weight: 500;
  }

  .photo-preview-box {
    position: relative;
    width: 100%;
    max-height: 220px;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .photo-preview {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .change-photo-btn {
    position: absolute;
    bottom: var(--space-xs);
    right: var(--space-xs);
    background: rgba(0, 0, 0, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    padding: var(--space-2xs) var(--space-xs);
    border-radius: 8px;
    font-size: var(--step-n2);
    font-weight: 600;
    cursor: pointer;
    backdrop-filter: blur(4px);
    transition: background 0.2s;
  }
  .change-photo-btn:hover {
    background: rgba(0, 0, 0, 0.8);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }
  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }
  .form-field label {
    font-size: var(--step-n2);
    font-weight: 600;
    color: var(--text-secondary);
  }
  .custom-select {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: var(--space-xs);
    color: var(--text-primary);
    font-size: var(--step-n1);
    outline: none;
  }

  .macros-row {
    display: flex;
    gap: var(--space-s);
  }
  .flex-1 {
    flex: 1;
  }

  .actions-row {
    display: flex;
    justify-content: space-between;
  }

  @keyframes zoomIn {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
</style>
