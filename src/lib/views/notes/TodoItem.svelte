<script lang="ts">
  import { notesStore } from "../../stores/notes.store.svelte";
  import type { TodoView } from "../../notes/loro-doc";

  let { todo }: { todo: TodoView } = $props();
</script>

<li class="todo-item" class:done={todo.done} data-testid="todo-item">
  <label class="todo-label">
    <input
      type="checkbox"
      checked={todo.done}
      onchange={() => notesStore.toggleTodo(todo.id)}
    />
    <span class="todo-text">{todo.text}</span>
  </label>
  <button
    class="del-btn"
    title="Delete"
    aria-label="Delete to-do"
    onclick={() => notesStore.removeTodo(todo.id)}>×</button
  >
</li>

<style>
  .todo-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    border: 2px solid #000;
    background: #fff;
    padding: var(--space-xs) var(--space-s);
    box-shadow: 3px 3px 0 #000;
  }
  .todo-label {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    cursor: pointer;
    flex: 1;
    min-width: 0;
  }
  .todo-label input[type="checkbox"] {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: #000;
    flex-shrink: 0;
  }
  .todo-text {
    font-size: var(--step-n1);
    word-break: break-word;
  }
  .todo-item.done .todo-text {
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
