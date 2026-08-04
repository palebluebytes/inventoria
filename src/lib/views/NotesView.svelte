<script lang="ts">
  import { notesStore } from "../stores/notes.store.svelte";
  import Badge from "../ui/Badge.svelte";
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
      <button class="add-btn" type="submit">Add</button>
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
      <button class="add-btn full" onclick={createNote}>+ New note</button>
      {#each notesStore.notes as note (note.id)}
        <div class="note-row" class:active={note.id === selected_note_id}>
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
        </div>
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
    background: #000;
    color: #fff;
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
    background: #fff;
    padding: var(--space-xs) var(--space-s);
    font-size: var(--step-0);
  }
  .item-input:focus {
    outline: 2px solid #000;
    outline-offset: 2px;
  }

  .add-btn {
    border: var(--edge);
    background: #000;
    color: #fff;
    font-weight: 700;
    text-transform: uppercase;
    font-size: var(--step-n1);
    padding: var(--space-xs) var(--space-m);
    cursor: pointer;
    box-shadow: var(--shadow-2);
  }
  .add-btn:hover {
    transform: translate(-1px, -1px);
    box-shadow: var(--shadow-2);
  }
  .add-btn.full {
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
    color: #000;
    text-align: center;
    padding: var(--space-l) var(--space-s);
    border: 2px dashed #000;
    background: #fff;
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

  .note-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: var(--edge);
    background: #fff;
    margin-bottom: var(--space-xs);
    box-shadow: var(--shadow-2);
  }
  .note-row.active {
    background: #000;
  }
  .note-row.active .note-row-title {
    color: #fff;
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
    color: #000;
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
  .note-row.active .del-btn {
    color: #fff;
  }
  .del-btn:hover {
    transform: scale(1.15);
  }
</style>
