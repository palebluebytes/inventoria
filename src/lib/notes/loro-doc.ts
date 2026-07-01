/**
 * Pure Loro CRDT layer for the Notes & Checklist feature.
 *
 * This module owns the conflict-free data model and knows nothing about the DB
 * or Svelte — it is deliberately side-effect-free so it can be unit-tested in
 * isolation. The store (`notes.store.svelte.ts`) wires this into the ledger and
 * the UI.
 *
 * The document holds two top-level movable lists:
 *   - `items`: a Checklist of LoroMap { id, label, done, created }
 *   - `notes`: Notes of LoroMap { id, title, created, body } where `body` is a
 *     nested LoroText so note bodies merge character-by-character.
 *
 * Persistence is an append-only op-log (see ADR-0018): each change is exported
 * as an incremental update *delta* (`exportUpdateBase64`) and on load every
 * delta is imported (`importUpdateBase64`). Deltas are commutative, so importing
 * them in any order — including concurrent edits from multiple devices — yields
 * a correct merge.
 *
 * Every mutation ends with `doc.commit()` so Loro materialises the ops and fires
 * subscribers; uncommitted ops are invisible to both `subscribe` and `export`.
 */

import { LoroDoc, LoroMap, LoroText, type VersionVector } from "loro-crdt";

const ITEMS = "items";
const NOTES = "notes";

export interface ChecklistItemView {
  id: string;
  label: string;
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
  items: ChecklistItemView[];
  notes: NoteView[];
}

export function createNotesDoc(): LoroDoc {
  return new LoroDoc();
}

// ── Internals ────────────────────────────────────────────────────────────────

function itemList(doc: LoroDoc) {
  return doc.getMovableList(ITEMS);
}

function noteList(doc: LoroDoc) {
  return doc.getMovableList(NOTES);
}

/**
 * Loro lists are index-addressed; find the entry index for a stable `id`.
 *
 * Note: this deep-serialises the whole list (`toJSON`, including nested note
 * bodies) on every lookup, so each mutation is O(n · doc). That is fine for a
 * personal scratchpad — if this feature ever grows, key the list by id via a
 * parallel LoroMap instead of re-deriving the index from a JSON scan.
 */
function indexOfId(list: ReturnType<typeof itemList>, id: string): number {
  const entries = list.toJSON() as Array<{ id?: string }>;
  return entries.findIndex((entry) => entry?.id === id);
}

function mapAt(
  list: ReturnType<typeof itemList>,
  index: number
): LoroMap | undefined {
  if (index < 0) return undefined;
  return list.get(index) as unknown as LoroMap;
}

/** Resolves a note's nested `LoroText` body, keeping the container cast here. */
function noteBodyAt(doc: LoroDoc, id: string): LoroText | undefined {
  const list = noteList(doc);
  const map = mapAt(list, indexOfId(list, id));
  if (!map) return undefined;
  return map.get("body") as unknown as LoroText | undefined;
}

// ── Checklist items ──────────────────────────────────────────────────────────

export function addItem(
  doc: LoroDoc,
  label: string,
  now: number = Date.now()
): string {
  const list = itemList(doc);
  const map = list.insertContainer(list.length, new LoroMap());
  const id = crypto.randomUUID();
  map.set("id", id);
  map.set("label", label);
  map.set("done", false);
  map.set("created", now);
  doc.commit();
  return id;
}

export function toggleItem(doc: LoroDoc, id: string): void {
  const list = itemList(doc);
  const map = mapAt(list, indexOfId(list, id));
  if (!map) return;
  map.set("done", !map.get("done"));
  doc.commit();
}

export function removeItem(doc: LoroDoc, id: string): void {
  const list = itemList(doc);
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
  const body = noteBodyAt(doc, id);
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
  const json = doc.toJSON() as { items?: unknown; notes?: unknown };
  return {
    items: normalizeItems(json.items),
    notes: normalizeNotes(json.notes),
  };
}

function normalizeItems(raw: unknown): ChecklistItemView[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    return {
      id: String(item.id ?? ""),
      label: String(item.label ?? ""),
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

// ── Op-log persistence ───────────────────────────────────────────────────────

/**
 * Exports the operations appended since `from` (the version last persisted) as
 * a base64 update delta. With no `from`, exports the whole op history. Commits
 * defensively so pending ops are included.
 */
export function exportUpdateBase64(doc: LoroDoc, from?: VersionVector): string {
  doc.commit();
  const bytes = from
    ? doc.export({ mode: "update", from })
    : doc.export({ mode: "update" });
  return bytesToBase64(bytes);
}

/** Imports a base64 update delta (or snapshot) into the document. */
export function importUpdateBase64(doc: LoroDoc, base64: string): void {
  doc.import(base64ToBytes(base64));
}

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    // Chunk the spread so a large delta can't blow the call-stack limit.
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
