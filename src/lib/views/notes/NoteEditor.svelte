<script lang="ts">
  import { untrack } from "svelte";
  import { notesStore } from "../../stores/notes.store.svelte";
  import type { NoteView } from "../../notes/loro-doc";
  import Textarea from "../../ui/Textarea.svelte";

  // The parent remounts this component via `{#key note.id}`, so local editor
  // state is seeded once per note and never fights the CRDT round-trip. The
  // seed is a deliberate one-time read of the prop, hence `untrack`.
  let { note }: { note: NoteView } = $props();

  let title = $state(untrack(() => note.title));
  let body = $state(untrack(() => note.body));
</script>

<div class="note-editor">
  <input
    class="note-title"
    type="text"
    placeholder="Title"
    bind:value={title}
    oninput={() => notesStore.setNoteTitle(note.id, title)}
  />
  <Textarea
    class="note-body"
    placeholder="Write a note…"
    data-testid="note-body"
    bind:value={body}
    oninput={() => notesStore.setNoteBody(note.id, body)}
  />
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
    border: var(--edge);
    background: var(--paper);
    padding: var(--space-xs) var(--space-s);
  }
  /* The body is the one site whose height is not a row count: it takes what
     the editor's column leaves it. That is the question `Textarea`'s `rows`
     deliberately does not answer, so it stays the caller's (#374). Reached
     through `:global` because the element belongs to the primitive, and
     anchored on `.note-editor` so it outranks the floor it is raising rather
     than tying with it. */
  .note-editor :global(.note-body) {
    flex: 1;
    min-height: 16rem;
  }
  .note-title:focus {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
</style>
