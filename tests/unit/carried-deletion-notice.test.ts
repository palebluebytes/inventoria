/**
 * The one-shot notice a peer shows after applying a carried deletion
 * (ADR-0096 §12).
 *
 * Three claims, and they are the three the record argues for: the names come
 * from **this** device's registry rather than off the wire, the notice is a
 * completed act with no prompt and no undo, and it survives being closed and
 * reopened until it is read.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { get } from "svelte/store";
import {
  stubLocalStorage,
  freshModule,
  type FakeLocalStorage,
} from "./support/local-storage";

// The module reaches the worker RPC only to subscribe. Everything under test
// here is what it does with what arrives, so the client is a stub with one
// member.
const listeners: ((swept: any) => void)[] = [];
vi.mock("../../src/lib/db/db.client", () => ({
  dbClient: {
    onCarriedDeletion: (listener: (swept: any) => void) => {
      listeners.push(listener);
      return () => {
        listeners.splice(listeners.indexOf(listener), 1);
      };
    },
  },
}));

type Notice = typeof import("../../src/lib/stores/carried-deletion-notice");

let jar: FakeLocalStorage;

/** The module reads its jar at import, so the two happen in that order. */
async function opened(
  seed: Record<string, string> = {}
): Promise<[Notice, FakeLocalStorage]> {
  jar = stubLocalStorage({ seed });
  const mod = await freshModule<Notice>(
    () => import("../../src/lib/stores/carried-deletion-notice")
  );
  return [mod, jar];
}

beforeEach(() => {
  listeners.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("what this device calls the prefixes it was handed", () => {
  it("names the owning domain once, however many of its prefixes went", async () => {
    const [notice] = await opened();
    expect(
      notice.namesOfCarriedPrefixes(["fdc:", "gtin:", "event:consume_"])
    ).toEqual(["Food"]);
  });

  // A peer that does not recognise a prefix deleted nothing under it, so a name
  // derived from the intersection says what this device actually did where a
  // label frozen by the wiping device would claim rows that are still here.
  it("drops a prefix this build has never minted under", async () => {
    const [notice] = await opened();
    expect(notice.namesOfCarriedPrefixes(["telepathy:", "habit:"])).toEqual([
      "Habits",
    ]);
    expect(notice.namesOfCarriedPrefixes(["telepathy:"])).toEqual([]);
  });
});

describe("the notice itself", () => {
  it("says nothing at all until something has been applied", async () => {
    const [notice] = await opened();
    expect(get(notice.carriedDeletionNotice)).toBeNull();
  });

  it("records a completed act and survives the page it was written on", async () => {
    const [first, store] = await opened();
    first.noteCarriedDeletion({
      prefixes: ["fdc:"],
      datomsDeleted: 412,
      refused: 0,
    });

    expect(get(first.carriedDeletionNotice)).toEqual({
      names: ["Food"],
      datoms: 412,
    });

    // A fresh import, reading the same jar: the person closed the tab before
    // they read it.
    const [again] = await opened(Object.fromEntries(store.store));
    expect(get(again.carriedDeletionNotice)).toEqual({
      names: ["Food"],
      datoms: 412,
    });
  });

  // A device shut for a fortnight can apply two wipes in one wake, and a queue
  // of banners about one absence is not what the person needs.
  it("adds a second act to the first rather than replacing or queuing it", async () => {
    const [notice] = await opened();
    notice.noteCarriedDeletion({
      prefixes: ["fdc:"],
      datomsDeleted: 400,
      refused: 0,
    });
    notice.noteCarriedDeletion({
      prefixes: ["habit:"],
      datomsDeleted: 12,
      refused: 0,
    });

    expect(get(notice.carriedDeletionNotice)).toEqual({
      names: ["Food", "Habits"],
      datoms: 412,
    });
  });

  it("stays quiet about a deletion that took nothing here", async () => {
    const [notice] = await opened();
    notice.noteCarriedDeletion({
      prefixes: ["fdc:"],
      datomsDeleted: 0,
      refused: 0,
    });
    expect(get(notice.carriedDeletionNotice)).toBeNull();
  });

  it("is one-shot: nothing brings it back once it is read", async () => {
    const [notice, store] = await opened();
    notice.noteCarriedDeletion({
      prefixes: ["fdc:"],
      datomsDeleted: 412,
      refused: 0,
    });
    notice.dismissCarriedDeletion();

    expect(get(notice.carriedDeletionNotice)).toBeNull();
    expect([...store.store.keys()]).toEqual([]);

    const [again] = await opened(Object.fromEntries(store.store));
    expect(get(again.carriedDeletionNotice)).toBeNull();
  });

  it("reads a record it cannot parse as nothing to say", async () => {
    const [notice] = await opened({
      inventoria_carried_deletion: '{"names":"Food"}',
    });
    expect(get(notice.carriedDeletionNotice)).toBeNull();
  });

  // A privacy-locked jar loses the notice at the end of the page rather than
  // throwing on the convergence path that applied the deletion.
  it("still shows for this page when the jar refuses", async () => {
    stubLocalStorage({ refuses: "privacy-locked" });
    const notice = await freshModule<Notice>(
      () => import("../../src/lib/stores/carried-deletion-notice")
    );
    notice.noteCarriedDeletion({
      prefixes: ["fdc:"],
      datomsDeleted: 7,
      refused: 0,
    });
    expect(get(notice.carriedDeletionNotice)).toEqual({
      names: ["Food"],
      datoms: 7,
    });
  });
});

describe("the sentence the person reads", () => {
  it("names what went, counts it, and offers no way back", async () => {
    const [notice] = await opened();
    expect(notice.carriedDeletionLine({ names: ["Food"], datoms: 412 })).toBe(
      "Food was deleted on another of your devices, so 412 datoms have gone " +
        "from this device too. It has already happened, and nothing here can " +
        "bring them back."
    );
  });

  it("counts without naming where it recognised nothing", async () => {
    const [notice] = await opened();
    expect(notice.carriedDeletionLine({ names: [], datoms: 3 })).toMatch(
      /^Data was deleted on another of your devices, so 3 datoms/
    );
  });

  it("writes two domains in the app's own voice", async () => {
    const [notice] = await opened();
    expect(
      notice.carriedDeletionLine({ names: ["Food", "Habits"], datoms: 1 })
    ).toMatch(/^Food and Habits was deleted/);
  });

  // No device, no pairing and no name: a deposit carries no author beyond the
  // lane it came down, and naming one would be a claim about a relationship
  // ADR-0075 §14.6 still refuses.
  it("never names which device did it", async () => {
    const [notice] = await opened();
    const line = notice.carriedDeletionLine({ names: ["Food"], datoms: 1 });
    expect(line).not.toMatch(/device_|paired|laptop|phone/i);
    expect(line).toMatch(/another of your devices/);
  });
});

describe("what makes one", () => {
  it("records whatever the worker announces, and stops when told to", async () => {
    const [notice] = await opened();
    const stop = notice.watchCarriedDeletions();
    expect(listeners).toHaveLength(1);

    listeners[0]({ prefixes: ["fdc:"], datomsDeleted: 5, refused: 0 });
    expect(get(notice.carriedDeletionNotice)).toEqual({
      names: ["Food"],
      datoms: 5,
    });

    stop();
    expect(listeners).toHaveLength(0);
  });
});
