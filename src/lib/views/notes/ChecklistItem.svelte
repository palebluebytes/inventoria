<script lang="ts">
  import { notesStore } from "../../stores/notes.store.svelte";
  import type { ChecklistItemView } from "../../notes/loro-doc";

  let { item }: { item: ChecklistItemView } = $props();
</script>

<li class="checklist-item" class:done={item.done} data-testid="checklist-item">
  <label class="item-label">
    <input
      type="checkbox"
      checked={item.done}
      onchange={() => notesStore.toggleItem(item.id)}
    />
    <span class="item-text">{item.label}</span>
  </label>
  <button
    class="del-btn"
    title="Delete"
    aria-label="Delete checklist item"
    onclick={() => notesStore.removeItem(item.id)}>×</button
  >
</li>

<style>
  .checklist-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    border: 2px solid #000;
    background: #fff;
    padding: var(--space-xs) var(--space-s);
    box-shadow: 3px 3px 0 #000;
  }
  .item-label {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    cursor: pointer;
    flex: 1;
    min-width: 0;
  }
  .item-label input[type="checkbox"] {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: #000;
    flex-shrink: 0;
  }
  .item-text {
    font-size: var(--step-n1);
    word-break: break-word;
  }
  .checklist-item.done .item-text {
    text-decoration: line-through;
    color: var(--text-secondary);
  }
  .del-btn {
    background: transparent;
    border: none;
    font-size: 1.4rem;
    line-height: 1;
    font-weight: 900;
    cursor: pointer;
    padding: 0 var(--space-2xs);
    color: #000;
    flex-shrink: 0;
  }
  .del-btn:hover {
    transform: scale(1.15);
  }
</style>
