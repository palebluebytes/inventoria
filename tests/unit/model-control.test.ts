import { describe, it, expect } from "vitest";
import {
  MODEL_EGRESS_SHEET,
  MODEL_FAILURE_COPY,
  offersRetry,
  sendDisclosure,
  TAKE_PHOTO_HINT,
} from "../../src/lib/food/model-copy";
import { MODEL_OUTCOMES } from "../../src/lib/logs/model-log";
import { MAX_IMAGES } from "../../src/lib/food/model-route";
import { readSource } from "./support/source";
import { trackedSvelteFiles } from "./support/markup";

/**
 * What the app says about its one readable egress, and where it says it
 * (ADR-0115 §3.2, §8, §9).
 *
 * The copy is held here rather than left to a component for `off-retry.ts`'s
 * reason: a sentence that decides what somebody believes about where their
 * photographs went is worth a diff of its own.
 */

/**
 * **`readSource`, not `readCode`, and that is not a preference.** This file
 * carries `accept="image/*"` on the photo input, and `/*` opens a block comment
 * the stripper runs to the next `*\/` — which swallows the markup below it
 * wholesale. Every claim below is about a code or markup shape that no comment
 * in this file states in prose, so reading it raw costs nothing.
 */
const STAGER = readSource("src/lib/views/food/FoodStager.svelte");

/**
 * Markup and line comments taken out, block comments left in.
 *
 * `readCode` would be the shared reader for this, and it cannot be used on
 * `FoodStager.svelte` for the reason above. This strips exactly the two kinds
 * of comment that are safe to strip here — `<!-- -->` and `//` — which is
 * enough for the one claim that needs it: the rule that this app predicts the
 * network nowhere is argued **in prose** in the very files it is a claim about,
 * so a reader that could not tell the argument from the code would find the
 * sentence and fail on it.
 */
const withoutProse = (source: string) =>
  source.replace(/<!--[\s\S]*?-->/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/**
 * One top-level function's body out of the component.
 *
 * Sliced to the closing brace at its own indent rather than matched inside a
 * window of N characters: a distance is a number that goes stale the moment
 * somebody adds a line, and it fails in the direction that reads as the claim
 * being false.
 */
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `${name} is not in this file`).toBeGreaterThan(-1);
  const end = source.indexOf("\n  }", start);
  expect(end, `${name} has no closing brace at its own indent`).toBeGreaterThan(
    start
  );
  return source.slice(start, end);
}

describe("the disclosure names the count, because the count is what is sent", () => {
  it("counts the photographs, in both grammars", () => {
    expect(sendDisclosure(1)).toContain("this photo");
    expect(sendDisclosure(2)).toContain("these 2 photos");
    expect(sendDisclosure(MAX_IMAGES)).toContain(`these ${MAX_IMAGES} photos`);
  });

  /**
   * *"Nothing else leaves this phone"* is **literally** true rather than nearly
   * true, and only because the prompt lives on the Worker: the request is
   * photographs and a task name, and the task name is a word we chose.
   */
  it("names who receives them and claims nothing else goes", () => {
    for (const n of [1, 2, 3, 4]) {
      expect(sendDisclosure(n)).toContain("Cloudflare");
      expect(sendDisclosure(n)).toContain("Nothing else leaves this phone");
    }
  });

  // The empty state is a different proposition, and says so: on a phone every
  // scan door arrives photo-less, so this is the common case.
  it("offers a camera rather than a send when there is nothing to send", () => {
    expect(TAKE_PHOTO_HINT).toMatch(/Take a photo/);
    expect(TAKE_PHOTO_HINT).not.toContain("Cloudflare");
  });
});

describe("the four lines each name a cause and hand over the same recovery", () => {
  const failures = MODEL_OUTCOMES.filter((o) => o !== "ok");

  it("has a line for every outcome but success", () => {
    for (const outcome of failures)
      expect(MODEL_FAILURE_COPY[outcome].length).toBeGreaterThan(0);
    expect(MODEL_FAILURE_COPY.ok).toBe("");
  });

  // The wrong inference is always the same one — that the photo was bad — and
  // the recovery is always the same, because all four are read while standing
  // in a form that already works. That repeated clause IS the stance.
  it("ends every line by handing the form back", () => {
    for (const outcome of failures)
      expect(MODEL_FAILURE_COPY[outcome]).toMatch(
        /fill (the panel|it) in below/i
      );
  });

  /**
   * #480 wrote *"it resets at midnight UTC"* from the documented allocation.
   * #509 then measured 2,449 neurons spent since 00:00 UTC refused as *used up
   * your daily free allocation*, with 8,938 spent the previous UTC day — a
   * rolling window, not a calendar day. A line naming a time would be wrong
   * most evenings.
   */
  it("promises no reset time, and never suggests an upgrade", () => {
    const line = MODEL_FAILURE_COPY.exhausted;
    expect(line).not.toMatch(/midnight|UTC|tomorrow|\d\s*(am|pm)/i);
    expect(line).not.toMatch(/upgrade|plan|paid/i);
  });

  it("offers another attempt everywhere it would not be a lie", () => {
    expect(offersRetry("unreachable")).toBe(true);
    expect(offersRetry("unusable")).toBe(true);
    expect(offersRetry("refused")).toBe(true);
    // It clears when the allowance does, and nothing the user presses moves it.
    expect(offersRetry("exhausted")).toBe(false);
    expect(offersRetry("ok")).toBe(false);
  });
});

/**
 * The fourth paragraph is the one to defend in review: duller and longer than a
 * reassurance would be, and the only version the evidence permits. Cloudflare
 * document no training and say nothing quotable about retention, and Workers AI
 * is `✘ Not compatible` with Regional Services.
 */
describe("the first-use sheet says what is not known, not only what is", () => {
  const body = MODEL_EGRESS_SHEET.paragraphs.join(" ");

  it("says it is not trained on, and refuses to say it is not kept", () => {
    expect(body).toMatch(/don't use what you send to train/);
    expect(body).toMatch(/don't say how long they keep it/);
    expect(body).not.toMatch(/(isn't|is not|never) (kept|stored|retained)/i);
  });

  it("says the model may run anywhere, because no setting keeps it in Europe", () => {
    expect(body).toMatch(/anywhere in the world/);
    expect(body).toMatch(/keep it in Europe/);
  });

  it("says nothing else goes with the photographs", () => {
    expect(body).toMatch(/not your meals/);
    expect(body).toMatch(/nothing is saved until you do/i);
  });

  // Pressing the control with no key opens this sheet rather than meeting a
  // disabled button — which refuses TMDB's standing Alert on a difference in
  // kind, since that one gates a whole screen.
  it("tells a device with no key where to get one, and that the form still works", () => {
    expect(MODEL_EGRESS_SHEET.noKey).toMatch(/needs a key/);
    expect(MODEL_EGRESS_SHEET.noKey).toMatch(/works without it/);
  });
});

/**
 * One control, on the photo row, with two states keyed on the capture array —
 * which is what makes the door question dissolve rather than be answered door
 * by door.
 */
describe("the offer belongs to the photographs, not to a door", () => {
  it("is drawn once", () => {
    expect(STAGER.match(/data-testid="model-read-btn"/g)).toHaveLength(1);
    expect(STAGER.match(/data-testid="model-control"/g)).toHaveLength(1);
  });

  it("keys its two states on the capture array and on nothing else", () => {
    expect(STAGER).toMatch(
      /modelControl = \$derived\(labelPhotos\.length === 0 \? "camera" : "send"\)/
    );
    // Not on `captureReason`, which is a banner and a key rather than an
    // affordance set, and not on `panelDoor`.
    expect(STAGER).not.toMatch(/modelControl[^\n]*captureReason/);
  });

  // In the add-ingredient flow `allowPhoto` is off, so there is no capture
  // array and nothing to send. That falls out for free and needs no rule.
  it("is absent where there is no photo tile at all", () => {
    const guarded = /\{#if allowPhoto\}[\s\S]*?data-testid="model-control"/;
    expect(STAGER).toMatch(guarded);
  });

  /**
   * Never hidden, never disabled on connectivity. `navigator.onLine` appears
   * nowhere in `src/`: neither the barcode scan nor the bundled-artifact path
   * predicts the network, and a feature that vanishes on a train is unfindable
   * forever afterwards.
   */
  it("predicts the network nowhere in the app", () => {
    const predicting = trackedSvelteFiles()
      .concat(["src/lib/food/model-route.ts", "src/lib/food/ai-autofill.ts"])
      .filter((file) =>
        withoutProse(readSource(file)).includes("navigator.onLine")
      );
    expect(predicting).toEqual([]);
  });

  // The failure is atomic and invisible (§9.1), so the line that describes it
  // must not outlive the next action.
  it("clears the failure line wherever the form resets", () => {
    for (const fn of ["resetCustomForm", "openEditForm", "prefillFromPayload"])
      expect(bodyOf(STAGER, fn), fn).toContain("modelFailure = null");
  });

  /**
   * ADR-0115 §10's test, and the one an implementer gets wrong: a read applied
   * and then abandoned by switching door must not colour the save that follows.
   */
  it("resets the applied flag wherever the form resets", () => {
    for (const fn of ["resetCustomForm", "openEditForm", "prefillFromPayload"])
      expect(bodyOf(STAGER, fn), fn).toContain("modelReadApplied = false");
  });

  /**
   * The ratchet needs the envelope the twin already carries, and `edit` is the
   * door that arrives with one. It was wired on the found-but-poor door first
   * and **not** on this one, which is the door #511 identified as the whole
   * case — so the read is asserted per door rather than once.
   */
  it("reads the prior capture on every door that is handed a twin", () => {
    for (const fn of ["openEditForm", "prefillFromPayload"])
      expect(bodyOf(STAGER, fn), fn).toContain("priorLabelCapture =");
    // And drops it where there is no twin at all, so a fresh form cannot
    // inherit the last one's claim.
    expect(bodyOf(STAGER, "resetCustomForm")).toContain(
      "priorLabelCapture = null"
    );
  });

  // Inherit or upgrade, never downgrade: `"manual"` is the stronger claim, so a
  // later hand-edit must not launder model output into it.
  it("writes the method through the ratchet", () => {
    expect(STAGER).toMatch(
      /method: modelReadApplied\s*\?\s*"ai-confirmed"\s*:\s*\(priorLabelCapture\?\.method \?\? "manual"\)/
    );
  });

  // OFF's own product shots are on screen at the found-but-poor door and are
  // refused by name: they are a third party's images of a different physical
  // pack, and the closed list is the capture array.
  it("never sends anything but the capture array", () => {
    expect(STAGER).toMatch(/autofillFromPackageImage\(labelPhotos\)/);
    expect(STAGER).not.toMatch(/autofillFromPackageImage\([^)]*offRefPhotos/);
  });
});
