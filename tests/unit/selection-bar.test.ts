/**
 * The Selection bar's DOM (ADR-0088 §2).
 *
 * Nothing tested this strip before #321 — not its markup, not its verbs, not
 * the status line — while it carried a bulk retract-and-replace across every
 * selected food. Three of its rules are contracts rather than styling, and this
 * is where they are pinned:
 *
 *   the ✕ comes FIRST, so no status line can wrap the only exit off the bar;
 *   the count is a BUTTON, because it is the door to the Selection's panel;
 *   the status line is ABSENT on success, not empty.
 *
 * `#build-recipe-btn` is a shipped DOM contract too — the recipe e2e locates it
 * by that id — so the move off the old markup keeps it where it was.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import SelectionBar from "../../src/lib/views/food/SelectionBar.svelte";

const noop = () => {};
const props = {
  count: 3,
  onDismiss: noop,
  onCount: noop,
  onScale: noop,
  onMove: noop,
  onRecipe: noop,
};

const order = (body: string, ...testids: string[]) =>
  testids.map((id) => body.indexOf(`data-testid="${id}"`));

describe("the Selection bar", () => {
  it("says how many foods are selected", () => {
    const { body } = render(SelectionBar, { props });

    expect(body).toMatch(/data-testid="selection-count"[\s\S]*?3 selected/);
  });

  it("puts the ✕ ahead of the count and the verbs", () => {
    const { body } = render(SelectionBar, { props });
    const [dismiss, count, scale, move, recipe] = order(
      body,
      "selection-dismiss",
      "selection-count",
      "selection-scale",
      "selection-move",
      "selection-recipe"
    );

    expect(dismiss).toBeGreaterThan(-1);
    expect(dismiss).toBeLessThan(count);
    expect(count).toBeLessThan(scale);
    expect(scale).toBeLessThan(move);
    expect(move).toBeLessThan(recipe);
  });

  it("makes the count a control, not a caption", () => {
    const { body } = render(SelectionBar, { props });

    // A door to the Selection's nutrition panel, where the Way out lives.
    expect(body).toMatch(
      /<button[^>]*data-testid="selection-count"[^>]*aria-haspopup="dialog"/
    );
  });

  it("carries no share verb — the count is the only way to a Send code", () => {
    const { body } = render(SelectionBar, { props });

    expect(body).not.toContain("selection-share");
    expect(body.toLowerCase()).not.toContain("send");
  });

  it("draws its verbs rather than writing them, and keeps no emoji", () => {
    const { body } = render(SelectionBar, { props });

    // Three marks, one of which is WayInIcon's own pot: the 🍲 is retired.
    expect(body).not.toContain("🍲");
    expect(body).toMatch(/data-testid="selection-scale"[\s\S]*?<svg/);
    expect(body).toMatch(/data-testid="selection-move"[\s\S]*?<svg/);
    expect(body).toMatch(/data-testid="selection-recipe"[\s\S]*?<svg/);
  });

  it("keeps `#build-recipe-btn`, which the recipe e2e locates by id", () => {
    const { body } = render(SelectionBar, { props });

    expect(body).toMatch(/<button[^>]*id="build-recipe-btn"/);
  });

  it("shows no status line on success", () => {
    const { body } = render(SelectionBar, { props });

    expect(body).not.toContain('role="status"');
  });

  it("shows the one status line when a verb has something to report", () => {
    const { body } = render(SelectionBar, {
      props: { ...props, note: "2 scaled · 1 with no weight to scale" },
    });

    expect(body).toMatch(
      /role="status"[^>]*>2 scaled · 1 with no weight to scale/
    );
  });

  it("marks the scale verb pressed while its tier is open", () => {
    const open = render(SelectionBar, {
      props: { ...props, scaleOpen: true },
    }).body;
    const shut = render(SelectionBar, { props }).body;

    expect(open).toMatch(
      /data-testid="selection-scale"[^>]*aria-pressed="true"/
    );
    expect(shut).toMatch(
      /data-testid="selection-scale"[^>]*aria-pressed="false"/
    );
  });
});
