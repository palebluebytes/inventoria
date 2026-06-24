/**
 * Notes / To-Do store: bridges the Loro CRDT document to Svelte 5 `$state` and
 * persists it into the append-only EAVT ledger.
 *
 * Design (see docs and the feature plan):
 *  - The LoroDoc is the live signal. `doc.subscribe` recomputes `$state` on every
 *    change and, for *local* edits, schedules a debounced snapshot save. We do
 *    NOT use `createLedgerStore` as the live signal — it reloads on every ledger
 *    invalidation, which would fight in-memory edits.
 *  - Persistence is append-only: each save appends the whole doc as one base64
 *    snapshot datom (`notes:loro_doc` / `notes/loro_snapshot`). On init we read
 *    the newest snapshot and import it. Latest wins by MAX(time); nothing is ever
 *    updated or deleted.
 */

import { dbClient } from "../db/db.client";
import { parseDatomValue } from "../db/datom-fold";
import {
  addNote,
  addTodo,
  createNotesDoc,
  editTodoText,
  exportSnapshotBase64,
  importSnapshotBase64,
  removeNote,
  removeTodo,
  setNoteBody,
  setNoteTitle,
  toggleTodo,
  toView,
  type NoteView,
  type TodoView,
} from "../notes/loro-doc";

const SNAPSHOT_ENTITY = "notes:loro_doc";
const SNAPSHOT_ATTRIBUTE = "notes/loro_snapshot";
const PERSIST_DEBOUNCE_MS = 400;

class NotesStore {
  todos = $state<TodoView[]>([]);
  notes = $state<NoteView[]>([]);
  ready = $state(false);

  #doc = createNotesDoc();
  #initialized = false;
  #persist_timer: ReturnType<typeof setTimeout> | null = null;
  // Monotonic guard: the snapshot PK is (entity, attribute, time), so two saves
  // in the same millisecond would collide. Always advance past the last one.
  #last_persist_time = 0;

  /** Loads the latest snapshot and starts the live subscription. Idempotent. */
  async init(): Promise<void> {
    if (this.#initialized) return;
    this.#initialized = true;

    try {
      const rows = await dbClient.query<{ value: string }>(
        `SELECT value FROM datoms
         WHERE entity = ? AND attribute = ?
         ORDER BY time DESC LIMIT 1`,
        [SNAPSHOT_ENTITY, SNAPSHOT_ATTRIBUTE]
      );
      const raw = rows[0]?.value;
      if (raw !== undefined && raw !== null) {
        const base64 = parseDatomValue(SNAPSHOT_ATTRIBUTE, raw, [
          SNAPSHOT_ATTRIBUTE,
        ]) as string;
        importSnapshotBase64(this.#doc, base64);
      }
    } catch (err) {
      console.error("notes: failed to load snapshot", err);
    }

    this.#sync();

    this.#doc.subscribe((event) => {
      this.#sync();
      if (event.by === "local") this.#schedulePersist();
    });

    if (typeof window !== "undefined") {
      window.addEventListener("visibilitychange", this.#onHide);
      window.addEventListener("beforeunload", this.#onHide);
    }

    this.ready = true;
  }

  // ── Actions (delegated; the subscription handles state + persistence) ───────

  addTodo(text: string): void {
    const trimmed = text.trim();
    if (trimmed) addTodo(this.#doc, trimmed);
  }

  toggleTodo(id: string): void {
    toggleTodo(this.#doc, id);
  }

  editTodoText(id: string, text: string): void {
    editTodoText(this.#doc, id, text);
  }

  removeTodo(id: string): void {
    removeTodo(this.#doc, id);
  }

  addNote(title: string): string {
    return addNote(this.#doc, title.trim() || "Untitled");
  }

  setNoteTitle(id: string, title: string): void {
    setNoteTitle(this.#doc, id, title);
  }

  setNoteBody(id: string, text: string): void {
    setNoteBody(this.#doc, id, text);
  }

  removeNote(id: string): void {
    removeNote(this.#doc, id);
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  #sync(): void {
    const view = toView(this.#doc);
    this.todos = view.todos;
    this.notes = view.notes;
  }

  #schedulePersist(): void {
    if (this.#persist_timer !== null) clearTimeout(this.#persist_timer);
    this.#persist_timer = setTimeout(() => {
      this.#persist_timer = null;
      void this.#persist();
    }, PERSIST_DEBOUNCE_MS);
  }

  /** Flush any pending debounced save immediately (tab hidden / unload). */
  #onHide = (): void => {
    if (this.#persist_timer === null) return;
    clearTimeout(this.#persist_timer);
    this.#persist_timer = null;
    void this.#persist();
  };

  async #persist(): Promise<void> {
    const base64 = exportSnapshotBase64(this.#doc);
    const time = Math.max(Date.now(), this.#last_persist_time + 1);
    this.#last_persist_time = time;
    try {
      await dbClient.append([
        {
          entity: SNAPSHOT_ENTITY,
          attribute: SNAPSHOT_ATTRIBUTE,
          value: base64,
          time,
        },
      ]);
    } catch (err) {
      console.error("notes: failed to persist snapshot", err);
    }
  }
}

export const notesStore = new NotesStore();
