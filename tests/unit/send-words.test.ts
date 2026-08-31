/**
 * What the sender is told when a send ends (ADR-0074 §6).
 *
 * The rule is one line, with the technical cause behind a "show why", because
 * the refusal is read by somebody standing in front of the person they were
 * sending to — who needs to know it did not work rather than which clause
 * fired. The seal is the exception and keeps its own sentence, because
 * "someone else answered" is different news from "this is malformed".
 */
import { describe, it, expect } from "vitest";
import {
  MEAL_DELIVERED,
  sendEndingWords,
  type SendWords,
} from "../../src/lib/p2p/send-words";
import { SendFailedError, type SendFailure } from "../../src/lib/p2p/meal-send";
import { SealRefusedError } from "../../src/lib/p2p/sealed-frame";
import { SendCodeSpentError } from "../../src/lib/p2p/send-code";

const FAILURES: SendFailure[] = [
  "unavailable",
  "expired",
  "cancelled",
  "refused",
  "closed",
];

const words = (failure: SendFailure): SendWords =>
  sendEndingWords(new SendFailedError(failure, `${failure} happened.`));

describe("sendEndingWords", () => {
  it("says the meal arrived, and says nothing about what became of it", () => {
    expect(MEAL_DELIVERED.ending).toBe("delivered");
    expect(MEAL_DELIVERED.line).toBe("They have it.");
    // The sender learns delivery and never acceptance (ADR-0072 §7).
    expect(MEAL_DELIVERED.detail).not.toMatch(/accept|added|logged/i);
    // Nothing went wrong, so there is nothing behind a "show why".
    expect(MEAL_DELIVERED.cause).toBeNull();
    expect(MEAL_DELIVERED.retry).toBe(false);
  });

  it("has one line and one cause for every way a session can end", () => {
    for (const failure of FAILURES) {
      const said = words(failure);
      expect(said.ending).toBe(failure);
      expect(said.line).not.toBe("");
      expect(said.detail).not.toBe("");
      expect(said.cause).toBe(`${failure} happened.`);
    }
  });

  it("keeps every line to one sentence", () => {
    for (const failure of FAILURES) {
      expect(words(failure).line.match(/[.?!]/g)).toHaveLength(1);
    }
  });

  it("never puts the technical cause in the line itself", () => {
    // The whole point of the disclosure is that the line stays in the app's
    // voice: no close codes, no clause numbers, no error text.
    for (const failure of FAILURES) {
      expect(words(failure).line).not.toContain("happened");
      expect(words(failure).line).not.toMatch(/relay|payload|socket|room/i);
    }
  });

  it("gives the seal its own sentence, because someone else answered", () => {
    const said = sendEndingWords(new SealRefusedError());
    expect(said.ending).toBe("seal");
    expect(said.line).toBe("This did not come from the code you showed.");
    expect(said.cause).toBe("this frame does not open under this code.");
    // Different news from a malformed meal, so it must not share that line.
    expect(said.line).not.toBe(words("refused").line);
    // Somebody answered under the wrong key: minting another code changes
    // nothing about who is in the room.
    expect(said.retry).toBe(false);
  });

  it("offers another code where a retry could work, and not where it cannot", () => {
    // A refusal means the payload was malformed or hostile, so re-sending the
    // same meal fails identically and hides a real fault (ADR-0072 §6).
    expect(words("refused").retry).toBe(false);
    // A transport that never opened, a room that timed out, a room the relay
    // closed: nothing about the meal is implicated.
    expect(words("unavailable").retry).toBe(true);
    expect(words("expired").retry).toBe(true);
    expect(words("closed").retry).toBe(true);
  });

  it("names the relay being out of reach, so the export can be offered there", () => {
    // ADR-0072 §14's step-down is keyed on this ending and nothing else.
    expect(words("unavailable").ending).toBe("unavailable");
    expect(words("refused").ending).not.toBe("unavailable");
  });

  it("reads a spent code as an ending of its own rather than a stray error", () => {
    const said = sendEndingWords(new SendCodeSpentError());
    expect(said.ending).toBe("spent");
    expect(said.retry).toBe(false);
  });

  it("still has something honest to say about an error it does not know", () => {
    const said = sendEndingWords(new Error("the database went away"));
    expect(said.ending).toBe("unknown");
    expect(said.line).not.toBe("");
    expect(said.cause).toBe("the database went away");
    expect(said.retry).toBe(true);
  });

  it("takes a thrown non-error without inventing a message", () => {
    expect(sendEndingWords("boom").cause).toBe("boom");
    expect(sendEndingWords(undefined).cause).toBe("undefined");
  });
});
