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
  DEVICES_MET,
  pairingEndingWords,
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

const words = (failure: RoomFailure): PairingWords =>
  pairingEndingWords(new RoomFailedError(failure, `${failure} happened.`));

describe("every ending has its own words", () => {
  it("names each of the five ways a session ends", () => {
    for (const failure of FAILURES) {
      expect(words(failure).ending).toBe(failure);
    }
  });

  it("says one thing, in one sentence, whatever ended it", () => {
    for (const failure of FAILURES) {
      expect(words(failure).line).toMatch(/^[^.]+\.$/);
    }
  });

  it("keeps the technical cause behind the line, never in it", () => {
    for (const failure of FAILURES) {
      expect(words(failure).cause).toBe(`${failure} happened.`);
      expect(words(failure).line).not.toContain(failure);
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

describe("nothing says paired, because nothing is", () => {
  it("says the two devices met, and that the sync is what completes it", () => {
    expect(DEVICES_MET.line).not.toMatch(/paired/i);
    expect(DEVICES_MET.detail).toMatch(/first sync/);
  });

  it("says nothing was paired on every failure that reached a room", () => {
    // The one ending this does not claim is `expired`, where nothing crossed at
    // all — a code nobody read has no pairing to have failed.
    for (const failure of ["unavailable", "refused", "unknown"] as const) {
      const said =
        failure === "unknown"
          ? pairingEndingWords(new Error("something"))
          : words(failure);
      expect(said.detail).toMatch(/nothing was paired/i);
    }
  });
});
