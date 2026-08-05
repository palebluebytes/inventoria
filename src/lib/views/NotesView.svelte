<script lang="ts">
  import { notesStore } from "../stores/notes.store.svelte";
  import Badge from "../ui/Badge.svelte";
  import Button from "../ui/Button.svelte";
  import Card from "../ui/Card.svelte";
  import ChecklistItem from "./notes/ChecklistItem.svelte";
  import NoteEditor from "./notes/NoteEditor.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

  type Section = "checklist" | "notes";
  let active_section = $state<Section>("checklist");
  let new_item_label = $state("");
  let selected_note_id = $state<string | null>(null);

  // The store replays its op-log from the ledger once the DB is ready. `init`
  // is idempotent, so re-running this effect is harmless.
  $effect(() => {
    if (dbReady) void notesStore.init();
  });

  const open_items = $derived(notesStore.items.filter((i) => !i.done).length);

  const selected_note = $derived(
    selected_note_id
      ? (notesStore.notes.find((n) => n.id === selected_note_id) ?? null)
      : null
  );

  function submitItem(event: Event) {
    event.preventDefault();
    notesStore.addItem(new_item_label);
    new_item_label = "";
  }

  function createNote() {
    selected_note_id = notesStore.addNote("Untitled");
    active_section = "notes";
  }

  function deleteNote(id: string) {
    notesStore.removeNote(id);
    if (selected_note_id === id) selected_note_id = null;
  }
</script>

<header class="page-header">
  <h1>Notes &amp; Checklist</h1>
  <p>
    A conflict-free scratchpad backed by a Loro CRDT, persisted to the local
    ledger.
  </p>
</header>

<div class="mobile-tabs">
  <button
    class="tab-btn"
    class:active={active_section === "checklist"}
    onclick={() => (active_section = "checklist")}
  >
    Checklist
  </button>
  <button
    class="tab-btn"
    class:active={active_section === "notes"}
    onclick={() => (active_section = "notes")}
  >
    Notes
  </button>
</div>

{#if active_section === "checklist"}
  <section class="panel">
    <form class="item-form" onsubmit={submitItem}>
      <input
        class="item-input"
        type="text"
        placeholder="Add a checklist item…"
        data-testid="new-item-input"
        bind:value={new_item_label}
      />
      <Button variant="primary" type="submit">Add</Button>
    </form>

    <div class="item-count">
      <Badge variant="default">{open_items} open</Badge>
    </div>

    <ul class="checklist" data-testid="checklist">
      {#each notesStore.items as item (item.id)}
        <ChecklistItem {item} />
      {:else}
        <li class="empty">No checklist items yet.</li>
      {/each}
    </ul>
  </section>
{:else}
  <section class="panel notes-panel">
    <aside class="note-list">
      <Button variant="primary" class="new-note-btn" onclick={createNote}
        >+ New note</Button
      >
      {#each notesStore.notes as note (note.id)}
        <!-- The note row is a framed tile whose frame is now the shared Card
             (ADR-0039). It stays a STATIC <div> Card, not a pressable one:
             the row wraps a title button and a delete button, so a pressable
             Card would nest interactive controls (button-in-button). The row
             layout and active fill ride the class via :global. -->
        <Card
          class={`note-row${note.id === selected_note_id ? " active" : ""}`}
        >
          <button
            class="note-row-title"
            onclick={() => (selected_note_id = note.id)}
          >
            {note.title || "Untitled"}
          </button>
          <button
            class="del-btn"
            title="Delete note"
            aria-label="Delete note"
            onclick={() => deleteNote(note.id)}>×</button
          >
        </Card>
      {:else}
        <p class="empty">No notes yet.</p>
      {/each}
    </aside>

    <div class="note-detail">
      {#if selected_note}
        {#key selected_note.id}
          <NoteEditor note={selected_note} />
        {/key}
      {:else}
        <p class="empty placeholder">Select or create a note.</p>
      {/if}
    </div>
  </section>
{/if}

<style>
  .page-header {
    margin-bottom: var(--space-m);
    border-bottom: var(--edge);
    padding-bottom: var(--space-s);
  }
  h1 {
    font-size: var(--step-2);
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--space-3xs);
    letter-spacing: -0.05em;
    text-transform: uppercase;
  }
  p {
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }

  .mobile-tabs {
    display: flex;
    border: var(--edge);
    background: var(--bg-surface);
    margin-bottom: var(--space-m);
  }
  .tab-btn {
    flex: 1;
    background: transparent;
    border: none;
    border-right: var(--edge-thin);
    padding: var(--space-xs) 0;
    font-family: monospace;
    font-weight: 700;
    font-size: var(--step-n2);
    text-transform: uppercase;
    cursor: pointer;
  }
  .tab-btn:last-child {
    border-right: none;
  }
  .tab-btn.active {
    background: var(--ink);
    color: var(--paper);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }

  .item-form {
    display: flex;
    gap: var(--space-s);
  }
  .item-input {
    flex: 1;
    border: var(--edge);
    background: var(--paper);
    padding: var(--space-xs) var(--space-s);
    font-size: var(--step-0);
  }
  .item-input:focus {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  /* The "+ New note" action is a full-width primary Button; only its width and
     spacing are layout, reached via :global since the class rides the Button. */
  .note-list :global(.new-note-btn) {
    width: 100%;
    margin-bottom: var(--space-s);
  }

  .item-count {
    display: flex;
  }

  .checklist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .empty {
    font-family: monospace;
    font-size: var(--step-n1);
    color: var(--ink);
    text-align: center;
    padding: var(--space-l) var(--space-s);
    border: 2px dashed var(--ink);
    background: var(--paper);
    text-transform: uppercase;
  }
  .placeholder {
    margin: 0;
  }

  /* Notes: list + detail */
  .notes-panel {
    flex-direction: column;
  }
  @media (min-width: 640px) {
    .notes-panel {
      flex-direction: row;
      align-items: stretch;
    }
    .note-list {
      width: 16rem;
      flex-shrink: 0;
    }
    .note-detail {
      flex: 1;
      display: flex;
    }
  }

  /* The note row's edge/paper/shadow frame is now the Card; its flex layout,
     zeroed padding (the children own their padding) and active fill ride the
     class via :global. */
  .note-list :global(.note-row) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-xs);
    padding: 0;
  }
  .note-list :global(.note-row.active) {
    background: var(--ink);
  }
  .note-list :global(.note-row.active .note-row-title) {
    color: var(--paper);
  }
  .note-row-title {
    flex: 1;
    text-align: left;
    background: transparent;
    border: none;
    padding: var(--space-xs) var(--space-s);
    font-weight: 600;
    font-size: var(--step-n1);
    cursor: pointer;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .del-btn {
    background: transparent;
    border: none;
    font-size: 1.4rem;
    line-height: 1;
    font-weight: 900;
    cursor: pointer;
    padding: 0 var(--space-2xs);
    color: inherit;
  }
  .note-list :global(.note-row.active .del-btn) {
    color: var(--paper);
  }
  .del-btn:hover {
    transform: scale(1.15);
  }
</style>
