<script lang="ts">
  import { notesStore } from "../../stores/notes.store.svelte";
  import type { ChecklistItemView } from "../../notes/loro-doc";
  import Card from "../../ui/Card.svelte";

  let { item }: { item: ChecklistItemView } = $props();
</script>

<li class="checklist-host" class:done={item.done} data-testid="checklist-item">
  <!-- The tile frame is the shared Card (ADR-0039), but a STATIC <div> Card, not
       a pressable one: the row already wraps a checkbox and a delete button, so
       a pressable Card (real <button>) would nest interactive controls
       (button-in-button). Only the row layout rides the class, reached via
       :global since it now sits on the child component's root. -->
  <Card class="checklist-item">
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
  </Card>
</li>

<style>
  /* The edge/paper/shadow frame is now the Card; only the row layout and the
     tighter checklist padding stay local (Card's default padding is roomier). */
  .checklist-host :global(.checklist-item) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    padding: var(--space-xs) var(--space-s);
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
    accent-color: var(--ink);
    flex-shrink: 0;
  }
  .item-text {
    font-size: var(--step-n1);
    overflow-wrap: break-word;
  }
  .checklist-host.done .item-text {
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
    color: var(--ink);
    flex-shrink: 0;
  }
  .del-btn:hover {
    transform: scale(1.15);
  }
</style>
