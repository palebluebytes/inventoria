import { describe, it, expect } from "vitest";
import {
  addNote,
  addTodo,
  base64ToBytes,
  bytesToBase64,
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
} from "../../src/lib/notes/loro-doc";

describe("loro-doc to-dos", () => {
  it("adds a to-do that starts not done", () => {
    const doc = createNotesDoc();
    const id = addTodo(doc, "buy milk", 1000);
    const { todos } = toView(doc);
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({
      id,
      text: "buy milk",
      done: false,
      created: 1000,
    });
  });

  it("toggles done state", () => {
    const doc = createNotesDoc();
    const id = addTodo(doc, "task");
    toggleTodo(doc, id);
    expect(toView(doc).todos[0].done).toBe(true);
    toggleTodo(doc, id);
    expect(toView(doc).todos[0].done).toBe(false);
  });

  it("edits and removes a to-do", () => {
    const doc = createNotesDoc();
    const a = addTodo(doc, "first");
    const b = addTodo(doc, "second");
    editTodoText(doc, a, "first edited");
    removeTodo(doc, b);
    const { todos } = toView(doc);
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ id: a, text: "first edited" });
  });

  it("ignores mutations for unknown ids", () => {
    const doc = createNotesDoc();
    addTodo(doc, "task");
    toggleTodo(doc, "nope");
    removeTodo(doc, "nope");
    expect(toView(doc).todos).toHaveLength(1);
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

describe("snapshot persistence", () => {
  it("round-trips the whole document through a base64 snapshot", () => {
    const doc = createNotesDoc();
    const todoId = addTodo(doc, "ship it", 10);
    toggleTodo(doc, todoId);
    const noteId = addNote(doc, "Plan", 20);
    setNoteBody(doc, noteId, "step one\nstep two");

    const base64 = exportSnapshotBase64(doc);
    const restored = createNotesDoc();
    importSnapshotBase64(restored, base64);

    expect(toView(restored)).toEqual(toView(doc));
  });

  it("base64 helpers are inverse for arbitrary bytes", () => {
    const bytes = new Uint8Array(512);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 7 + 3) % 256;
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("imported docs keep merging edits", () => {
    const doc = createNotesDoc();
    const id = addNote(doc, "Doc", 1);
    setNoteBody(doc, id, "hello");

    const restored = createNotesDoc();
    importSnapshotBase64(restored, exportSnapshotBase64(doc));
    setNoteBody(restored, id, "hello world");

    expect(toView(restored).notes[0].body).toBe("hello world");
  });
});
