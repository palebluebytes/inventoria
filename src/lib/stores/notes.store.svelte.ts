/**
 * Notes & Checklist store: bridges the Loro CRDT document to Svelte 5 `$state`
 * and persists it into the append-only EAVT ledger as an op-log (see ADR-0018).
 *
 * Design:
 *  - The LoroDoc is the live signal. `doc.subscribe` recomputes `$state` on every
 *    change and, for *local* edits, schedules a debounced persist.
 *  - Persistence is an append-only op-log: each save appends one immutable datom
 *    carrying the Loro update *delta* since the last persisted version
 *    (`notes:doc` / `notes/op`). Nothing is ever updated or superseded.
 *  - On load every `notes/op` delta is imported. Loro ops are commutative, so
 *    importing all of them — including concurrent edits replicated from other
 *    devices by a future sync — produces a correct merge. (Snapshot + latest-wins
 *    would instead discard one device's edits; see ADR-0018.)
 */

import { dbClient } from "../db/db.client";
import { parseDatomValue } from "../db/datom-fold";
import {
  addItem,
  addNote,
  createNotesDoc,
  editItemLabel,
  exportUpdateBase64,
  importUpdateBase64,
  removeItem,
  removeNote,
  setNoteBody,
  setNoteTitle,
  toggleItem,
  toView,
  type ChecklistItemView,
  type NoteView,
} from "../notes/loro-doc";
import type { VersionVector } from "loro-crdt";

const DOC_ENTITY = "notes:doc";
const OP_ATTRIBUTE = "notes/op";
const PERSIST_DEBOUNCE_MS = 400;

class NotesStore {
  items = $state<ChecklistItemView[]>([]);
  notes = $state<NoteView[]>([]);
  ready = $state(false);

  #doc = createNotesDoc();
  #initialized = false;
  #persist_timer: ReturnType<typeof setTimeout> | null = null;
  // Version of the ops already written to the ledger; each persist exports only
  // the delta past this point.
  #persisted_version: VersionVector | undefined = undefined;
  // Monotonic guard: the op-log PK is (entity, attribute, time), so two appends
  // in the same millisecond would collide. Always advance past the last one.
  #last_persist_time = 0;

  /** Loads and replays the op-log, then starts the live subscription. Idempotent. */
  async init(): Promise<void> {
    if (this.#initialized) return;
    this.#initialized = true;

    try {
      const rows = await dbClient.query<{ value: string }>(
        `SELECT value FROM datoms
         WHERE entity = ? AND attribute = ?
         ORDER BY time ASC`,
        [DOC_ENTITY, OP_ATTRIBUTE]
      );
      for (const row of rows) {
        if (row?.value === undefined || row.value === null) continue;
        const base64 = parseDatomValue(OP_ATTRIBUTE, row.value, [
          OP_ATTRIBUTE,
        ]) as string;
        importUpdateBase64(this.#doc, base64);
      }
    } catch (err) {
      console.error("notes: failed to replay op-log", err);
    }

    this.#persisted_version = this.#doc.oplogVersion();
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

  addItem(label: string): void {
    const trimmed = label.trim();
    if (trimmed) addItem(this.#doc, trimmed);
  }

  toggleItem(id: string): void {
    toggleItem(this.#doc, id);
  }

  editItemLabel(id: string, label: string): void {
    editItemLabel(this.#doc, id, label);
  }

  removeItem(id: string): void {
    removeItem(this.#doc, id);
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
    this.items = view.items;
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
    const base64 = exportUpdateBase64(this.#doc, this.#persisted_version);
    const time = Math.max(Date.now(), this.#last_persist_time + 1);
    this.#last_persist_time = time;
    try {
      await dbClient.append([
        {
          entity: DOC_ENTITY,
          attribute: OP_ATTRIBUTE,
          value: base64,
          time,
        },
      ]);
      // Only advance the watermark once the delta is durably appended.
      this.#persisted_version = this.#doc.oplogVersion();
    } catch (err) {
      console.error("notes: failed to persist op-log delta", err);
    }
  }
}

export const notesStore = new NotesStore();
