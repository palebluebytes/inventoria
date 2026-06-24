/**
 * Pure Loro CRDT layer for the Notes / To-Do feature.
 *
 * This module owns the conflict-free data model and knows nothing about the DB
 * or Svelte — it is deliberately side-effect-free so it can be unit-tested in
 * isolation. The store (`notes.store.svelte.ts`) wires this into the ledger and
 * the UI.
 *
 * The document holds two top-level movable lists:
 *   - `todos`: LoroMap { id, text, done, created }
 *   - `notes`: LoroMap { id, title, created, body } where `body` is a nested
 *     LoroText so note bodies merge character-by-character.
 *
 * Every mutation ends with `doc.commit()` so Loro materialises the ops and fires
 * subscribers; uncommitted ops are invisible to both `subscribe` and `export`.
 */

import { LoroDoc, LoroMap, LoroText } from "loro-crdt";

const TODOS = "todos";
const NOTES = "notes";

export interface TodoView {
  id: string;
  text: string;
  done: boolean;
  created: number;
}

export interface NoteView {
  id: string;
  title: string;
  body: string;
  created: number;
}

export interface NotesSnapshot {
  todos: TodoView[];
  notes: NoteView[];
}

export function createNotesDoc(): LoroDoc {
  return new LoroDoc();
}

// ── Internals ────────────────────────────────────────────────────────────────

function todoList(doc: LoroDoc) {
  return doc.getMovableList(TODOS);
}

function noteList(doc: LoroDoc) {
  return doc.getMovableList(NOTES);
}

/** Loro lists are index-addressed; find the entry index for a stable `id`. */
function indexOfId(list: ReturnType<typeof todoList>, id: string): number {
  const entries = list.toJSON() as Array<{ id?: string }>;
  return entries.findIndex((entry) => entry?.id === id);
}

function mapAt(
  list: ReturnType<typeof todoList>,
  index: number
): LoroMap | undefined {
  if (index < 0) return undefined;
  return list.get(index) as unknown as LoroMap;
}

// ── To-dos ───────────────────────────────────────────────────────────────────

export function addTodo(
  doc: LoroDoc,
  text: string,
  now: number = Date.now()
): string {
  const list = todoList(doc);
  const map = list.insertContainer(list.length, new LoroMap());
  const id = crypto.randomUUID();
  map.set("id", id);
  map.set("text", text);
  map.set("done", false);
  map.set("created", now);
  doc.commit();
  return id;
}

export function toggleTodo(doc: LoroDoc, id: string): void {
  const list = todoList(doc);
  const map = mapAt(list, indexOfId(list, id));
  if (!map) return;
  map.set("done", !map.get("done"));
  doc.commit();
}

export function editTodoText(doc: LoroDoc, id: string, text: string): void {
  const list = todoList(doc);
  const map = mapAt(list, indexOfId(list, id));
  if (!map) return;
  map.set("text", text);
  doc.commit();
}

export function removeTodo(doc: LoroDoc, id: string): void {
  const list = todoList(doc);
  const index = indexOfId(list, id);
  if (index < 0) return;
  list.delete(index, 1);
  doc.commit();
}

// ── Notes ────────────────────────────────────────────────────────────────────

export function addNote(
  doc: LoroDoc,
  title: string,
  now: number = Date.now()
): string {
  const list = noteList(doc);
  const map = list.insertContainer(list.length, new LoroMap());
  const id = crypto.randomUUID();
  map.set("id", id);
  map.set("title", title);
  map.set("created", now);
  map.setContainer("body", new LoroText());
  doc.commit();
  return id;
}

export function setNoteTitle(doc: LoroDoc, id: string, title: string): void {
  const list = noteList(doc);
  const map = mapAt(list, indexOfId(list, id));
  if (!map) return;
  map.set("title", title);
  doc.commit();
}

export function setNoteBody(doc: LoroDoc, id: string, text: string): void {
  const list = noteList(doc);
  const map = mapAt(list, indexOfId(list, id));
  if (!map) return;
  const body = map.get("body") as unknown as LoroText | undefined;
  if (!body) return;
  // `update` diffs against the current text and applies a minimal delta, so
  // concurrent edits to different regions merge instead of clobbering.
  body.update(text);
  doc.commit();
}

export function removeNote(doc: LoroDoc, id: string): void {
  const list = noteList(doc);
  const index = indexOfId(list, id);
  if (index < 0) return;
  list.delete(index, 1);
  doc.commit();
}

// ── Views ────────────────────────────────────────────────────────────────────

/**
 * Projects the document into plain, typed view objects. `doc.toJSON()` is `any`
 * (nested LoroText renders as a string), so this is the single boundary where we
 * validate and coerce shapes.
 */
export function toView(doc: LoroDoc): NotesSnapshot {
  const json = doc.toJSON() as { todos?: unknown; notes?: unknown };
  return {
    todos: normalizeTodos(json.todos),
    notes: normalizeNotes(json.notes),
  };
}

function normalizeTodos(raw: unknown): TodoView[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    return {
      id: String(item.id ?? ""),
      text: String(item.text ?? ""),
      done: Boolean(item.done),
      created: Number(item.created ?? 0),
    };
  });
}

function normalizeNotes(raw: unknown): NoteView[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    return {
      id: String(item.id ?? ""),
      title: String(item.title ?? ""),
      body: String(item.body ?? ""),
      created: Number(item.created ?? 0),
    };
  });
}

// ── Snapshot persistence ─────────────────────────────────────────────────────

export function exportSnapshotBase64(doc: LoroDoc): string {
  doc.commit();
  return bytesToBase64(doc.export({ mode: "snapshot" }));
}

export function importSnapshotBase64(doc: LoroDoc, base64: string): void {
  doc.import(base64ToBytes(base64));
}

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    // Chunk the spread so a large snapshot can't blow the call-stack limit.
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
