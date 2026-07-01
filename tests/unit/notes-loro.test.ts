import { describe, it, expect } from "vitest";
import {
  addItem,
  addNote,
  base64ToBytes,
  bytesToBase64,
  createNotesDoc,
  exportUpdateBase64,
  importUpdateBase64,
  removeItem,
  removeNote,
  setNoteBody,
  setNoteTitle,
  toggleItem,
  toView,
} from "../../src/lib/notes/loro-doc";

describe("loro-doc checklist items", () => {
  it("adds an item that starts not done", () => {
    const doc = createNotesDoc();
    const id = addItem(doc, "buy milk", 1000);
    const { items } = toView(doc);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id,
      label: "buy milk",
      done: false,
      created: 1000,
    });
  });

  it("toggles done state", () => {
    const doc = createNotesDoc();
    const id = addItem(doc, "task");
    toggleItem(doc, id);
    expect(toView(doc).items[0].done).toBe(true);
    toggleItem(doc, id);
    expect(toView(doc).items[0].done).toBe(false);
  });

  it("removes an item", () => {
    const doc = createNotesDoc();
    const a = addItem(doc, "first");
    const b = addItem(doc, "second");
    removeItem(doc, b);
    const { items } = toView(doc);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: a, label: "first" });
  });

  it("ignores mutations for unknown ids", () => {
    const doc = createNotesDoc();
    addItem(doc, "task");
    toggleItem(doc, "nope");
    removeItem(doc, "nope");
    expect(toView(doc).items).toHaveLength(1);
  });
});

describe("loro-doc notes", () => {
  it("adds a note with an editable CRDT body", () => {
    const doc = createNotesDoc();
    const id = addNote(doc, "Shopping", 2000);
    setNoteBody(doc, id, "eggs and bread");
    setNoteTitle(doc, id, "Groceries");
    const { notes } = toView(doc);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      id,
      title: "Groceries",
      body: "eggs and bread",
      created: 2000,
    });
  });

  it("removes a note", () => {
    const doc = createNotesDoc();
    const id = addNote(doc, "temp");
    removeNote(doc, id);
    expect(toView(doc).notes).toHaveLength(0);
  });
});

describe("op-log persistence", () => {
  it("round-trips the whole document through update deltas", () => {
    const doc = createNotesDoc();
    const itemId = addItem(doc, "ship it", 10);
    toggleItem(doc, itemId);
    const noteId = addNote(doc, "Plan", 20);
    setNoteBody(doc, noteId, "step one\nstep two");

    // Persist as a sequence of deltas, replaying onto a fresh doc.
    const restored = createNotesDoc();
    importUpdateBase64(restored, exportUpdateBase64(doc));

    expect(toView(restored)).toEqual(toView(doc));
  });

  it("imports incremental deltas in order", () => {
    const doc = createNotesDoc();
    addItem(doc, "one", 1);
    const firstDelta = exportUpdateBase64(doc);
    const versionAfterFirst = doc.oplogVersion();
    addItem(doc, "two", 2);
    const secondDelta = exportUpdateBase64(doc, versionAfterFirst);

    const restored = createNotesDoc();
    importUpdateBase64(restored, firstDelta);
    importUpdateBase64(restored, secondDelta);

    expect(toView(restored).items.map((i) => i.label)).toEqual(["one", "two"]);
  });

  it("merges concurrent edits from two replicas without loss", () => {
    // Shared seed.
    const seed = createNotesDoc();
    const noteId = addNote(seed, "Shared", 1);
    const seedDelta = exportUpdateBase64(seed);

    const a = createNotesDoc();
    importUpdateBase64(a, seedDelta);
    const b = createNotesDoc();
    importUpdateBase64(b, seedDelta);

    // Concurrent: A adds an item, B edits the note body.
    const aBase = a.oplogVersion();
    addItem(a, "from A", 2);
    const aDelta = exportUpdateBase64(a, aBase);

    const bBase = b.oplogVersion();
    setNoteBody(b, noteId, "from B");
    const bDelta = exportUpdateBase64(b, bBase);

    // A fresh load imports every delta in arbitrary order.
    const fresh = createNotesDoc();
    for (const delta of [bDelta, seedDelta, aDelta]) {
      importUpdateBase64(fresh, delta);
    }

    const view = toView(fresh);
    expect(view.items.map((i) => i.label)).toEqual(["from A"]);
    expect(view.notes[0].body).toBe("from B");
  });

  it("base64 helpers are inverse for arbitrary bytes", () => {
    const bytes = new Uint8Array(512);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 7 + 3) % 256;
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});
