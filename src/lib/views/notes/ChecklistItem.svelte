<script lang="ts">
  import { notesStore } from "../../stores/notes.store.svelte";
  import type { ChecklistItemView } from "../../notes/loro-doc";
  import Card from "../../ui/Card.svelte";
  import Checkbox from "../../ui/Checkbox.svelte";

  let { item }: { item: ChecklistItemView } = $props();
</script>

<li class="checklist-host" class:done={item.done} data-testid="checklist-item">
  <!-- The tile frame is the shared Card (ADR-0039), but a STATIC <div> Card, not
       a pressable one: the row already wraps a checkbox and a delete button, so
       a pressable Card (real <button>) would nest interactive controls
       (button-in-button). Only the row layout rides the class, reached via
       :global since it now sits on the child component's root. -->
  <Card class="checklist-item">
    <Checkbox
      class="item-label"
      checked={item.done}
      onCheckedChange={() => notesStore.toggleItem(item.id)}
    >
      <span class="item-text">{item.label}</span>
    </Checkbox>
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
  /* The tick is the shared Checkbox (ADR-0068) — a native accent-color box in a
     brutalist app was drift, so this row converges on the house look and its
     tick grows by about a fifth. Only the row's own layout and its plain,
     sentence-case text stay here, reached via :global as the class rides the
     primitive's label. */
  .checklist-host :global(.item-label) {
    gap: var(--space-s);
    flex: 1;
    min-width: 0;
    font-weight: normal;
    text-transform: none;
    /* The house row is unselectable, because dragging across a caps label is
       only ever a mis-click. This text is the user's own note, so it stays
       selectable — the one thing about this row that is not chrome. */
    user-select: text;
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
