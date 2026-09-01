/**
 * What the recipient is told (ADR-0074 §6).
 *
 * The mirror of `send-words.test.ts`: one line, the technical cause behind a
 * "show why", and the seal keeping its own sentence — read here by somebody
 * standing in front of the person who sent it, rather than by the person who
 * sent it.
 */
import { describe, it, expect } from "vitest";
import {
  MEAL_HAS_NOTHING,
  mealCodeBrokenWords,
  mealLandedWords,
  receiveEndingWords,
  type ReceiveWords,
} from "../../src/lib/p2p/receive-words";
import { SendFailedError, type SendFailure } from "../../src/lib/p2p/meal-send";
import { MealPayloadTooLargeError } from "../../src/lib/p2p/meal-reader";
import { SealRefusedError } from "../../src/lib/p2p/sealed-frame";
import { SendCodeSpentError } from "../../src/lib/p2p/send-code";
import type { MealType } from "../../src/lib/food/meal-type";

const FAILURES: SendFailure[] = [
  "unavailable",
  "expired",
  "cancelled",
  "refused",
  "closed",
];

const words = (failure: SendFailure): ReceiveWords =>
  receiveEndingWords(new SendFailedError(failure, `${failure} happened.`));

describe("receiveEndingWords", () => {
  it("has words for every way a session can end", () => {
    for (const failure of FAILURES) {
      expect(words(failure).ending).toBe(failure);
      expect(words(failure).line).not.toBe("");
    }
  });

  it("keeps the whole diagnosis behind the disclosure, never in the line", () => {
    for (const failure of FAILURES) {
      expect(words(failure).cause).toBe(`${failure} happened.`);
      expect(words(failure).line).not.toContain("happened");
    }
  });

  it("says a stranger answered, rather than that the meal was malformed", () => {
    const seal = receiveEndingWords(new SealRefusedError());

    expect(seal.ending).toBe("seal");
    expect(seal.line).toBe("This did not come from the code you scanned.");
  });

  it("gives all seven refusals and the ceiling one line between them", () => {
    const refused = receiveEndingWords(new MealPayloadTooLargeError(2, 1));

    expect(refused.ending).toBe("unreadable");
    // The clause that fired is readable, and it is not in the line.
    expect(refused.cause).toMatch(/2/);
    expect(refused.line).not.toMatch(/\d/);
  });

  it("says a spent code is spent rather than that the meal failed", () => {
    expect(receiveEndingWords(new SendCodeSpentError()).ending).toBe("spent");
  });

  it("says a code that never named a room is still the sender's to reuse", () => {
    const broken = mealCodeBrokenWords("this code is missing half of itself.");

    expect(broken.ending).toBe("broken");
    // Nothing was attempted, so nothing of theirs was spent — which is the one
    // thing that separates this from every other refusal.
    expect(broken.detail).toMatch(/still good/);
    expect(broken.cause).toBe("this code is missing half of itself.");
  });

  it("does not guess when it does not know", () => {
    const unknown = receiveEndingWords(new Error("something else entirely"));

    expect(unknown.ending).toBe("unknown");
    expect(unknown.cause).toBe("something else entirely");
  });

  it("never tells the recipient anything about what the sender was told", () => {
    for (const ending of [
      ...FAILURES.map(words),
      receiveEndingWords(new SealRefusedError()),
      MEAL_HAS_NOTHING,
    ]) {
      expect(`${ending.line} ${ending.detail}`).not.toMatch(
        /they (were|know)/i
      );
    }
  });
});

describe("what one accept did", () => {
  const landed = {
    logged: 0,
    absorbed: 0,
    lost: 0,
    meal_types: [] as MealType[],
    landed: 0,
    skipped: 0,
  };

  /** One meal was offered and it landed in one meal type — the common case. */
  const intoLunch = { ...landed, meal_types: ["lunch" as MealType] };

  it("counts what went into the meal, and names the meal", () => {
    const words = mealLandedWords({ ...intoLunch, logged: 3 }, 1);

    expect(words.ending).toBe("landed");
    expect(words.line).toBe("3 foods added to your lunch.");
  });

  it("counts one food as one food", () => {
    expect(
      mealLandedWords({ ...landed, logged: 1, meal_types: ["dinner"] }, 1).line
    ).toBe("1 food added to your dinner.");
  });

  it("says a day went into the day, rather than naming four meals at somebody", () => {
    const words = mealLandedWords(
      { ...landed, logged: 6, meal_types: ["breakfast", "lunch", "dinner"] },
      3
    );

    expect(words.line).toBe("6 foods added to your day.");
  });

  it("says a meal accepted twice landed once, rather than saying nothing", () => {
    // Nothing landed, so there are no meal types to read: what was OFFERED is
    // the only thing that can word this one.
    const words = mealLandedWords({ ...landed, absorbed: 2 }, 1);

    expect(words.line).toBe("You already had this meal.");
  });

  it("says a day accepted twice was already a day", () => {
    const words = mealLandedWords({ ...landed, absorbed: 5 }, 3);

    expect(words.line).toBe("You already had this day.");
  });

  it("reports what could not be reproduced rather than rounding it away", () => {
    const words = mealLandedWords({ ...intoLunch, logged: 2, lost: 1 }, 1);

    expect(words.line).toBe("2 foods added to your lunch.");
    expect(words.detail).toMatch(/1 food could not be reproduced/);
  });
});
