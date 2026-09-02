/**
 * The Selection bar's DOM (ADR-0088 §2).
 *
 * Nothing tested this strip before #321 — not its markup, not its verbs, not
 * the status line — while it carried a bulk retract-and-replace across every
 * selected food. Three of its rules are contracts rather than styling, and this
 * is where they are pinned:
 *
 *   the ✕ comes FIRST, so no status line can wrap the only exit off the bar;
 *   the bar writes NOTHING — the rows say what is picked, the bar only acts;
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
  onHandOff: noop,
  onScale: noop,
  onMove: noop,
  onRecipe: noop,
};

const order = (body: string, ...testids: string[]) =>
  testids.map((id) => body.indexOf(`data-testid="${id}"`));

describe("the Selection bar", () => {
  it("writes no count, and no prose at all", () => {
    const { body } = render(SelectionBar, { props });

    // The rows carry their own selected marks; a bar of verbs restating the
    // tally was the one caption here, and it is gone.
    expect(body).not.toContain("selected<");
    expect(body).not.toContain("3 selected");
    expect(body).not.toContain("selection-count");
  });

  it("still names the size of the Selection to a screen reader", () => {
    // Nothing is drawn, so the count has to survive on the verbs themselves —
    // otherwise the bar offers four unlabelled acts on an unstated number.
    const many = render(SelectionBar, { props }).body;
    const one = render(SelectionBar, { props: { ...props, count: 1 } }).body;

    expect(many).toContain('aria-label="Scale these 3 foods"');
    expect(many).toContain('aria-label="Hand over these 3 foods"');
    expect(one).toContain('aria-label="Scale this food"');
    expect(one).toContain('aria-label="Hand over this food"');
  });

  it("puts the ✕ ahead of the verbs", () => {
    const { body } = render(SelectionBar, { props });
    const [dismiss, scale, move, handOff, recipe] = order(
      body,
      "selection-dismiss",
      "selection-scale",
      "selection-move",
      "selection-hand-off",
      "selection-recipe"
    );

    expect(dismiss).toBeGreaterThan(-1);
    expect(dismiss).toBeLessThan(scale);
    expect(scale).toBeLessThan(move);
    expect(move).toBeLessThan(handOff);
    expect(handOff).toBeLessThan(recipe);
  });

  it("carries the hand-off as a verb, opening the Selection's panel", () => {
    const { body } = render(SelectionBar, { props });

    // It inherited the `N selected ›` control's job: the panel behind it is
    // where the Way out and the Selection's totals both live.
    expect(body).toMatch(
      /<button[^>]*data-testid="selection-hand-off"[^>]*aria-haspopup="dialog"/
    );
    // A door to that panel, not a Send face of its own.
    expect(body.toLowerCase()).not.toContain("send");
  });

  it("draws its verbs rather than writing them, and keeps no emoji", () => {
    const { body } = render(SelectionBar, { props });

    // Four marks, two of them borrowed whole: WayInIcon's pot retired the 🍲,
    // and WayOutIcon is the day's Way out at a third scale.
    expect(body).not.toContain("🍲");
    expect(body).toMatch(/data-testid="selection-scale"[\s\S]*?<svg/);
    expect(body).toMatch(/data-testid="selection-move"[\s\S]*?<svg/);
    expect(body).toMatch(/data-testid="selection-hand-off"[\s\S]*?<svg/);
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
