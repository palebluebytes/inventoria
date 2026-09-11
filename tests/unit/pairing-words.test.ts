/**
 * What the pairing section prints when an act ends (ADR-0096 §8).
 *
 * The map of endings has to be **total**: a hole shows up as the unknown line
 * on the day something new ends a pairing, which is a defect reported as a
 * shrug. So every failure is enumerated here rather than sampled.
 */
import { describe, it, expect } from "vitest";
import { PairingRefusedError } from "../../src/lib/p2p/pairing-act";
import {
  DEVICES_PAIRED,
  pairingEndingWords,
  type PairingReach,
  type PairingWords,
} from "../../src/lib/p2p/pairing-words";
import {
  RoomFailedError,
  type RoomFailure,
} from "../../src/lib/p2p/relay-room";
import { RoomCodeSpentError } from "../../src/lib/p2p/room-code";
import { SealRefusedError } from "../../src/lib/p2p/sealed-frame";

const FAILURES: RoomFailure[] = [
  "unavailable",
  "expired",
  "cancelled",
  "refused",
  "closed",
];

const REACHES: PairingReach[] = ["code", "sync"];

const words = (
  failure: RoomFailure,
  reach: PairingReach = "code"
): PairingWords =>
  pairingEndingWords(
    new RoomFailedError(failure, `${failure} happened.`),
    reach
  );

describe("every ending has its own words", () => {
  it("names each of the five ways a session ends, however far it got", () => {
    for (const reach of REACHES) {
      for (const failure of FAILURES) {
        expect(words(failure, reach).ending).toBe(failure);
      }
    }
  });

  it("says one thing, in one sentence, whatever ended it", () => {
    for (const reach of REACHES) {
      for (const failure of FAILURES) {
        expect(words(failure, reach).line).toMatch(/^[^.]+\.$/);
      }
    }
  });

  it("keeps the technical cause behind the line, never in it", () => {
    for (const reach of REACHES) {
      for (const failure of FAILURES) {
        expect(words(failure, reach).cause).toBe(`${failure} happened.`);
        expect(words(failure, reach).line).not.toContain(failure);
      }
    }
  });

  it("gives the seal, an unreadable secret and a spent code their own endings", () => {
    expect(pairingEndingWords(new SealRefusedError()).ending).toBe("seal");
    expect(pairingEndingWords(new PairingRefusedError("8 bytes")).ending).toBe(
      "unreadable"
    );
    expect(pairingEndingWords(new RoomCodeSpentError()).ending).toBe("spent");
  });

  it("does not read something it has never seen as the nearest ending it has", () => {
    const said = pairingEndingWords(new Error("the ledger would not open"));
    expect(said.ending).toBe("unknown");
    expect(said.cause).toBe("the ledger would not open");
  });
});

describe("paired is said once, and only from the far side of a first sync", () => {
  it("is the only wording anywhere that claims it", () => {
    expect(DEVICES_PAIRED.line).toMatch(/paired/i);
    for (const reach of REACHES) {
      for (const failure of FAILURES) {
        expect(words(failure, reach).line).not.toMatch(/\bare paired\b/i);
      }
    }
  });

  it("says nothing was paired on every failure that reached a room", () => {
    // The one ending this does not claim before the transfer is `expired`,
    // where nothing crossed at all — a code nobody read has no pairing to have
    // failed. Once rows are crossing, every ending says it.
    for (const failure of ["unavailable", "refused", "unknown"] as const) {
      const said =
        failure === "unknown"
          ? pairingEndingWords(new Error("something"))
          : words(failure);
      expect(said.detail).toMatch(/nothing was paired/i);
    }
    for (const failure of FAILURES) {
      expect(words(failure, "sync").detail).toMatch(/nothing is paired/i);
    }
  });
});

describe("an ending part way through says what happened to what crossed", () => {
  // ADR-0096 §8: repeated pairing is a resume, not a retry, because imported
  // rows are real data and the version vector is queried rather than kept. A
  // screen that said "nothing crossed" would be telling somebody their transfer
  // was lost when it was banked.
  it("never claims nothing crossed once rows have", () => {
    for (const failure of FAILURES) {
      const said = words(failure, "sync");
      expect(said.detail).not.toMatch(/nothing crossed/i);
      expect(said.detail).toMatch(/what (already )?crossed is kept/i);
    }
  });

  it("still claims nothing crossed while the code was only being waited on", () => {
    for (const failure of ["expired", "cancelled", "closed"] as const) {
      expect(words(failure, "code").detail).toMatch(/nothing crossed/i);
    }
  });

  it("offers another attempt from every ending inside a transfer", () => {
    for (const failure of FAILURES) {
      expect(words(failure, "sync").retry).toBe(true);
    }
  });

  it("reads the code's own endings when nothing says otherwise", () => {
    const ended = new RoomFailedError("expired", "x");
    expect(pairingEndingWords(ended)).toEqual(
      pairingEndingWords(ended, "code")
    );
  });
});
