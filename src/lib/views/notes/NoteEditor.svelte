<script lang="ts">
  import { notesStore } from "../../stores/notes.store.svelte";
  import type { NoteView } from "../../notes/loro-doc";

  // The parent remounts this component via `{#key note.id}`, so local editor
  // state is seeded once per note and never fights the CRDT round-trip.
  let { note }: { note: NoteView } = $props();

  let title = $state(note.title);
  let body = $state(note.body);
</script>

<div class="note-editor">
  <input
    class="note-title"
    type="text"
    placeholder="Title"
    bind:value={title}
    oninput={() => notesStore.setNoteTitle(note.id, title)}
  />
  <textarea
    class="note-body"
    placeholder="Write a note…"
    data-testid="note-body"
    bind:value={body}
    oninput={() => notesStore.setNoteBody(note.id, body)}
  ></textarea>
</div>

<style>
  .note-editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    flex: 1;
    min-height: 0;
  }
  .note-title {
    font-size: var(--step-1);
    font-weight: 700;
    border: 2px solid #000;
    background: #fff;
    padding: var(--space-xs) var(--space-s);
  }
  .note-body {
    flex: 1;
    min-height: 16rem;
    resize: vertical;
    border: 2px solid #000;
    background: #fff;
    padding: var(--space-s);
    font-family: inherit;
    font-size: var(--step-0);
    line-height: 1.5;
    box-shadow: 4px 4px 0 #000;
  }
  .note-title:focus,
  .note-body:focus {
    outline: 2px solid #000;
    outline-offset: 2px;
  }
</style>
