/**
 * Class names a `ui/` primitive puts on its own boxes, worn by a caller — #413.
 *
 * `worn-classes.test.ts` asks whether a name a caller wears is reached by *any*
 * rule (ADR-0097), and `ui-primitives.test.ts` asks whether a platform element
 * still appears outside the primitive that owns it (ADR-0095 §3). Neither can
 * see this one: `.input-wrapper` on a `<div>` in `EventRecurrenceField` is
 * reached by that file's own rule, and it is not an element anybody ported. It
 * renders correctly and always has.
 *
 * **The hazard is to tests, and it is not hypothetical.** A selector-based
 * test that walks to the nearest `.input-wrapper` ancestor lands on whichever
 * is nearer, and `tests/settings-ui.spec.ts` carries the scar in its own
 * comment:
 *
 * > Named directly rather than by walking to the nearest `.input-wrapper`
 * > ancestor, which since #375 is `ui/Input`'s own wrapper: an inner box that no
 * > longer contains the toggle, so the xpath still resolved and quietly measured
 * > something else.
 *
 * *Still resolved and quietly measured something else* is the failure mode. It
 * fails by measuring the wrong box rather than by erroring, so nothing prints.
 *
 * It also cuts against ADR-0095 §1's premise directly. A component is the
 * **strong** form of reference precisely because a call site holds a pointer to
 * the definition rather than a copy of its name; a caller writing the name
 * anyway takes the weak form while looking like the strong one.
 *
 * **Static classes on both sides, and that is the whole narrowing.** A `class:`
 * directive is a *state* — `class:selected`, `class:loading` — and `markup.ts`
 * already keeps those apart from the names an element unconditionally wears,
 * for the reason this sweep needs: a state is never the box's identity, so a
 * selector reaching one reaches a condition and not a box. Reading both sides
 * unnarrowed reports 17 wearings; eleven of them are `class:selected` and
 * `class:loading` compounded onto the caller's own base class
 * (`.day-btn.selected`, `.category-chip.selected`), which name exactly one box
 * each and are not the collision this is for.
 *
 * The other narrowing is the roster: five of those seventeen were owned by
 * `BottomSheetDemo.svelte`, which is not a member of anything
 * (`support/ui-roster.ts`).
 *
 * ADR-0100 §8's shape, so the population is discovered rather than named: six
 * wearings of five names went at #413 — `.input-wrapper` (`ui/Input`),
 * `.checkbox` (`ui/Checkbox`), `.row` (`ui/Row`), `.icon` (`ui/Alert`) and
 * `.actions` (`ui/ReloadPrompt`, twice) — and a seventh fails on the commit
 * that writes it.
 */
import { describe, expect, it } from "vitest";
import { elementsOf, trackedSvelteFiles } from "./support/markup";
import { MEMBERS, NOT_MEMBERS, uiFolderFiles } from "./support/ui-roster";

const FILES = trackedSvelteFiles();

/** Every class name a rostered member unconditionally puts on a plain element
 *  of its own, with the members that put it there. A name on a component tag
 *  inside a primitive is a prop it is handing on, not a box it owns. */
const OWNED = new Map<string, string[]>();
for (const file of MEMBERS) {
  for (const el of elementsOf(file)) {
    if (el.tag.startsWith("#") || el.tag.includes(".")) continue;
    for (const name of el.classes) {
      OWNED.set(name, [...new Set([...(OWNED.get(name) ?? []), file])]);
    }
  }
}

/** Every wearing of one of those names outside `src/lib/ui/`. */
const COLLISIONS = [
  ...new Set(
    FILES.filter((file) => !file.startsWith("src/lib/ui/")).flatMap((file) =>
      elementsOf(file).flatMap((el) =>
        el.classes
          .filter((name) => OWNED.has(name))
          .map(
            (name) =>
              `${file} <${el.tag}> .${name}  (owned by ${OWNED.get(name)!.join(", ")})`
          )
      )
    )
  ),
].sort();

describe("a ui/ primitive's internal class names", () => {
  it("reads the whole tree and a roster big enough to be the vocabulary", () => {
    // Not targets, floors: the failure a sweep is most exposed to is a reader
    // that quietly stops finding markup and reports a clean tree.
    expect(FILES.length).toBeGreaterThan(100);
    expect(OWNED.size).toBeGreaterThan(30);
  });

  it("holds the roster to the folder, so a new file must declare which it is", () => {
    // ADR-0100 §8: a declared list, not a folder listing — and a declared list
    // nothing checks is a list that goes stale silently.
    expect([...MEMBERS, ...Object.keys(NOT_MEMBERS)].sort()).toEqual(
      uiFolderFiles().sort()
    );
  });

  it("credits the harness to nobody", () => {
    // The record's own worked reason for a declared roster. `.dock-input`,
    // `.method`, `.on` and `.primary` are BottomSheetDemo's, and crediting them
    // to the vocabulary would convict four callers of wearing a name no
    // primitive owns.
    expect(Object.keys(NOT_MEMBERS)).toContain(
      "src/lib/ui/BottomSheetDemo.svelte"
    );
    for (const name of ["dock-input", "method", "on", "primary"]) {
      expect(OWNED.has(name)).toBe(false);
    }
  });

  it("finds the names it is about, so an empty sweep cannot pass", () => {
    // One live example per reading the sweep depends on: a wrapper `<div>`, a
    // root `<label>`, and a name two members would both answer to.
    expect(OWNED.get("input-wrapper")).toEqual(["src/lib/ui/Input.svelte"]);
    expect(OWNED.get("checkbox")).toEqual(["src/lib/ui/Checkbox.svelte"]);
    expect(OWNED.get("row")).toEqual(["src/lib/ui/Row.svelte"]);
  });

  it("is worn by no caller", () => {
    expect(COLLISIONS).toEqual([]);
  });
});
