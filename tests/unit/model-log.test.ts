import { describe, it, expect } from "vitest";
import {
  beginModelSession,
  closeModelSession,
  modelAnswered,
  modelSaved,
  modelSessionLevel,
  MODEL_CHANNEL,
  MODEL_IDS,
  MODEL_OUTCOMES,
  type ModelLogEntry,
} from "../../src/lib/logs/model-log";
import { SEVERITY } from "../../src/lib/logs/log-facility";
import { readSource } from "./support/source";

/**
 * The model channel's shape and its refusals (ADR-0115 §11).
 *
 * The fold is what is asserted rather than a component's lifecycle, which is
 * `scan-log.test.ts`'s arrangement: a session is data, and "one entry per
 * session" is a property of `closeModelSession` rather than of anything that
 * runs.
 */

const MODEL = MODEL_IDS[0];

const asked = (images = 2) => beginModelSession(MODEL, images);

describe("one entry per session, and nothing from a session with nothing to say", () => {
  it("leaves one entry for an ask that answered", () => {
    const entry = closeModelSession(
      modelAnswered(asked(), "ok"),
      1_757_000_000_000
    );
    expect(entry).toEqual({
      outcome: "ok",
      model: MODEL,
      images: 2,
      saved: false,
      at: 1_757_000_000_000,
    });
  });

  // The form abandoned while the spinner ran. An entry states what the ask did,
  // so an ask that never reported leaves none.
  it("leaves nothing for an ask that never answered", () => {
    expect(closeModelSession(asked(), 1)).toBeNull();
  });

  it("carries how many photographs went", () => {
    const entry = closeModelSession(modelAnswered(asked(4), "unreachable"), 1);
    expect(entry?.images).toBe(4);
  });
});

describe("`saved` tells giving up from typing the pack in anyway", () => {
  it("is true after a failed read the user saved through", () => {
    const session = modelSaved(modelAnswered(asked(), "unreachable"), 0);
    expect(closeModelSession(session, 1)?.saved).toBe(true);
  });

  it("is false for a read that was never saved", () => {
    expect(closeModelSession(modelAnswered(asked(), "ok"), 1)?.saved).toBe(
      false
    );
  });
});

describe("`corrected` is written only where there was something to correct", () => {
  it("carries the count after a successful read that was saved", () => {
    const session = modelSaved(modelAnswered(asked(), "ok"), 3);
    expect(closeModelSession(session, 1)?.corrected).toBe(3);
  });

  // Omitted rather than zeroed: a `0` there would be a count, and the honest
  // statement is that there was nothing to correct.
  it("is absent where the read failed, even though the form was saved", () => {
    const session = modelSaved(modelAnswered(asked(), "unusable"), 9);
    const entry = closeModelSession(session, 1);
    expect(entry?.corrected).toBeUndefined();
    expect(Object.keys(entry ?? {})).not.toContain("corrected");
  });

  it("is absent where the form was never saved", () => {
    const entry = closeModelSession(modelAnswered(asked(), "ok"), 1);
    expect(Object.keys(entry ?? {})).not.toContain("corrected");
  });
});

describe("the level mirrors the scan channel's table", () => {
  const at = (outcome: ModelLogEntry["outcome"]): ModelLogEntry => ({
    outcome,
    model: MODEL,
    images: 1,
    saved: false,
    at: 1,
  });

  it("puts a refusal at ERROR, because a 403 is ours", () => {
    expect(modelSessionLevel(at("refused"))).toBe(SEVERITY.ERROR);
  });

  it("puts a success at INFO", () => {
    expect(modelSessionLevel(at("ok"))).toBe(SEVERITY.INFO);
  });

  // Including `exhausted`, which is the plan working as designed rather than
  // anything broken, and clears on its own.
  it("puts everything else at WARN", () => {
    for (const outcome of ["unreachable", "exhausted", "unusable"] as const)
      expect(modelSessionLevel(at(outcome))).toBe(SEVERITY.WARN);
  });
});

describe("the counters total what the entries already say", () => {
  const tally = (entry: ModelLogEntry) => MODEL_CHANNEL.tally?.(entry);

  it("counts one outcome per session", () => {
    expect(
      tally({ outcome: "ok", model: MODEL, images: 1, saved: false, at: 1 })
    ).toEqual(["outcome_ok"]);
  });

  it("counts a save beside its outcome", () => {
    expect(
      tally({
        outcome: "unreachable",
        model: MODEL,
        images: 1,
        saved: true,
        at: 1,
      })
    ).toEqual(["outcome_unreachable", "saved"]);
  });

  // ADR-0092 §9 admits only totals of what the entries say while they last, and
  // a running mean of rows touched is not one. The reading this channel was
  // built for is a person looking at the entries.
  it("keeps no counter over `corrected`", () => {
    const counters = [...(MODEL_CHANNEL.counters ?? [])];
    expect(counters.join(" ")).not.toContain("corrected");
    expect(counters.sort()).toEqual(
      [...MODEL_OUTCOMES.map((o) => `outcome_${o}`), "saved"].sort()
    );
  });
});

describe("the parse refuses a record it cannot read as a session", () => {
  const stored = {
    outcome: "ok",
    model: MODEL,
    images: 2,
    saved: true,
    corrected: 4,
    at: 1,
  };

  it("reads one back whole", () => {
    expect(MODEL_CHANNEL.parse(stored)).toEqual(stored);
  });

  it("refuses an outcome outside the declaration", () => {
    expect(MODEL_CHANNEL.parse({ ...stored, outcome: "timeout" })).toBeNull();
  });

  // The field is the app's own closed set, never echoed out of a response, so a
  // record naming something else was not written by this app.
  it("refuses a model outside the app's own set", () => {
    expect(
      MODEL_CHANNEL.parse({ ...stored, model: "@cf/some/other-model" })
    ).toBeNull();
  });

  it("takes a record with no `corrected`, because its absence is meaningful", () => {
    const { corrected, ...without } = stored;
    void corrected;
    expect(MODEL_CHANNEL.parse(without)).toEqual(without);
  });
});

/**
 * ADR-0115 §11 names what must never appear here, and the fields are what make
 * that true rather than a rule anybody has to remember: every one is a closed
 * enum, a small count, a boolean or a clock, so there is nowhere for a prompt,
 * an image, a nutrition value or a provider's error text to ride.
 */
describe("there is nowhere for anything readable to ride", () => {
  it("refuses a duration by name, so nobody adds one quietly", () => {
    const source = readSource("src/lib/logs/model-log.ts");
    expect(source).toMatch(/duration is refused by name/);
    expect([...(MODEL_CHANNEL.counters ?? [])].join(" ")).not.toMatch(
      /duration|elapsed|_ms\b/
    );
  });

  it("declares a domain, which is what keeps it inside Rations' export", () => {
    // `app` was the cheap option and is refused: it is `domain: null`, so a food
    // failure recorded there would sit outside Rations' export consent scoping.
    expect(MODEL_CHANNEL.domain).toBe("food");
  });
});
