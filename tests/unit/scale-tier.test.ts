/**
 * The Scale tier's gating (ADR-0088 §5).
 *
 * `ScaleControl` — the inline field-and-two-buttons this replaces — had no test
 * of its own either, so the rule that used to disable the operators is pinned
 * here in the shape it now takes: **Apply is dead until an operator is chosen
 * AND the factor parses**, and the button says which operation it will run.
 *
 * The arithmetic itself stays covered by `scale-amount.test.ts`; this is only
 * about what the control lets you do.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import ScaleTier from "../../src/lib/views/food/ScaleTier.svelte";

const noop = () => {};

const draw = (props: Record<string, unknown>) =>
  render(ScaleTier, { props: { onApply: noop, ...props } }).body;

const applyButton = (body: string) => {
  const at = body.indexOf('data-testid="scale-apply"');
  expect(at).toBeGreaterThan(-1);
  // Back up to the opening tag the attribute belongs to.
  const open = body.lastIndexOf("<button", at);
  return body.slice(open, body.indexOf("</button>", at));
};

// `ui/Button` writes BOTH a bare `disabled` and `aria-disabled="false"`, so a
// substring test for "disabled" matches an enabled button too. Read the state.
const isDead = (body: string) =>
  applyButton(body).includes('aria-disabled="true"');

describe("the Scale tier", () => {
  it("is dead until an operator is chosen", () => {
    const body = draw({ factor: "2", op: "" });

    expect(isDead(body)).toBe(true);
    expect(applyButton(body)).toContain("Apply");
  });

  it("is dead while the factor is not yet usable", () => {
    // Mid-typed, empty, malformed and non-positive all collapse to one signal.
    for (const factor of ["", "abc", "0", "-3"]) {
      expect(isDead(draw({ factor, op: "multiply" }))).toBe(true);
    }
  });

  it("comes alive, and says which operation it will run", () => {
    expect(applyButton(draw({ factor: "2", op: "multiply" }))).toContain(
      "Apply ×2"
    );
    expect(applyButton(draw({ factor: "2", op: "divide" }))).toContain(
      "Apply ÷2"
    );
  });

  it("keeps the amount field's expression grammar", () => {
    // `3/2` is the same factor here as it is in an amount field (ADR-0023).
    expect(applyButton(draw({ factor: "3/2", op: "multiply" }))).toContain(
      "Apply ×3/2"
    );
    expect(isDead(draw({ factor: "3/2", op: "multiply" }))).toBe(false);
  });

  it("stays dead while a run is in flight", () => {
    const body = draw({ factor: "2", op: "multiply", busy: true });

    expect(isDead(body)).toBe(true);
  });

  it("flags a factor that does not parse, on the field itself", () => {
    expect(draw({ factor: "abc", op: "" })).toMatch(
      /data-testid="scale-factor"[\s\S]*?aria-invalid="true"|aria-invalid="true"[\s\S]*?data-testid="scale-factor"/
    );
    expect(draw({ factor: "2", op: "" })).toMatch(
      /data-testid="scale-factor"[\s\S]*?aria-invalid="false"|aria-invalid="false"[\s\S]*?data-testid="scale-factor"/
    );
  });

  it("offers the two operations as a deselectable pair", () => {
    // ui/ToggleGroup, so tapping the active operator clears it — which is what
    // cancels a live preview, and why there is no cancel control (ADR-0040).
    const body = draw({ factor: "2", op: "multiply" });

    expect(body).toContain('data-testid="scale-op"');
    expect(body).toContain("×");
    expect(body).toContain("÷");
  });
});
