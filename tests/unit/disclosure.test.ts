/**
 * The disclosure population `ui/Disclosure` was written to close — #316,
 * ADR-0100 §8.
 *
 * **The population has an attribute for a name, which makes this census the
 * strong kind.** A disclosure is not an element and not a look; it is
 * `aria-expanded` on a control that opens a region. So the sweep is simply:
 * every `aria-expanded` in `src/` is the primitive's, or it belongs to
 * something that is not a disclosure and is named with its argument.
 *
 * **And the second half is the one the ticket was really about.** `EndingLine`
 * shipped `aria-expanded` with **no `aria-controls` at all**: the button
 * announced itself as expanded while pointing at nothing. ADR-0068 called that
 * the way a copy fails — *not a wrong pixel, an absent one*. The primitive
 * makes `controls` a required prop, so that particular defect is now
 * unexpressible; what a required prop cannot catch is an id naming nothing, so
 * this file resolves every `aria-controls` the app writes against the ids in
 * its own file.
 *
 * That check is why the region stayed the caller's. #316 asked for a component
 * owning the button, the region, and the generated id linking them; at four of
 * the five sites the two boxes have different parents, and at one of those the
 * region is four hundred lines away in another part of the screen. Ownership
 * was not available, so the guarantee is made here instead — and it is the
 * stronger of the two, because it also catches a typo that ownership would only
 * have prevented where the structure allowed it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { render } from "svelte/server";
import { attr, elementsOf, trackedSvelteFiles } from "./support/markup";
import { decl, ruleOf } from "./support/stylesheet";
import Disclosure from "../../src/lib/ui/Disclosure.svelte";

const FILES = trackedSvelteFiles();
const PRIMITIVE = "src/lib/ui/Disclosure.svelte";

/** Every element in `src/` writing `aria-expanded` itself. */
const EXPANDERS = FILES.flatMap((file) =>
  elementsOf(file)
    .filter((el) => attr(el, "aria-expanded") !== undefined)
    .map((el) => `${file} <${el.tag}>`)
).sort();

/**
 * `aria-expanded` on something that is **not** a disclosure, with the argument.
 * ADR-0100 §7: a survivor is named, not omitted.
 */
const NOT_A_DISCLOSURE: Record<string, string> = {
  "src/lib/views/food/CategoryPicker.svelte":
    "A `role=combobox`. Its `aria-expanded` describes a popup listbox with its own keyboard contract, which is a different control and not a region a button folds.",
};

/**
 * Every region a control in `src/` claims to open: `aria-controls` written
 * directly, and the `controls` prop handed to `ui/Disclosure`, which is the
 * same claim one component out.
 *
 * **Both, or the sweep is empty.** After the port every call site writes
 * `controls=`, not `aria-controls=`, so a sweep reading only the attribute
 * would resolve five pairs, find zero, and pass — the vacuous shape this
 * repository keeps catching in its own tests.
 *
 * The primitive itself is excluded and is the one file that must be: it writes
 * `aria-controls={controls}`, forwarding a value its caller supplies, so there
 * is no id in that file for it to name and there should not be.
 */
const CONTROLS = FILES.filter((file) => file !== PRIMITIVE).flatMap((file) =>
  elementsOf(file)
    .map((el) => ({
      file,
      value:
        el.tag === "#Disclosure"
          ? attr(el, "controls")
          : attr(el, "aria-controls"),
    }))
    .filter((c): c is { file: string; value: string } => c.value !== undefined)
);

/** Whether `file` writes an `id` that `value` could name. A literal is matched
 *  against the literal ids; an expression is matched against the same
 *  expression appearing as an `id`, which is how a generated pair is written. */
function resolves(file: string, value: string): boolean {
  const ids = elementsOf(file)
    .map((el) => attr(el, "id"))
    .filter((id): id is string => id !== undefined);
  return ids.includes(value);
}

describe("Disclosure", () => {
  it("pairs aria-expanded with the region it was given", () => {
    const { body } = render(Disclosure, {
      props: {
        open: false,
        controls: "nutrition-display-help",
        onToggle: () => {},
        title: "Nutrition",
      },
    });
    expect(body).toContain('aria-expanded="false"');
    expect(body).toContain('aria-controls="nutrition-display-help"');
    expect(body).toContain("Nutrition");
  });

  it("draws the caret by default and turns it open", () => {
    const shut = render(Disclosure, {
      props: { open: false, controls: "r", onToggle: () => {} },
    }).body;
    const open = render(Disclosure, {
      props: { open: true, controls: "r", onToggle: () => {} },
    }).body;
    expect(shut).toContain("M7 6 L17 12 L7 18 Z");
    expect(shut).not.toContain("is-open");
    expect(open).toContain("is-open");
  });

  it("draws no mark at all when the label is the mark", () => {
    // `EndingLine`'s case: the words flip between Show and Hide, so a caret
    // beside them would say the same thing twice.
    const { body } = render(Disclosure, {
      props: {
        open: false,
        controls: "r",
        onToggle: () => {},
        mark: null,
        title: "Show why",
      },
    });
    expect(body).not.toContain("M7 6 L17 12 L7 18 Z");
    expect(body).toContain("Show why");
  });

  it("keeps the caller's class and its a11y attributes", () => {
    const { body } = render(Disclosure, {
      props: {
        open: false,
        controls: "allergen-disclaimer",
        onToggle: () => {},
        class: "info-open",
        "aria-label": "How this allergen reading is made",
        "data-testid": "allergen-disclaimer-toggle",
      } as Record<string, unknown>,
    });
    expect(body).toContain("disclosure info-open");
    expect(body).toContain('aria-label="How this allergen reading is made"');
    expect(body).toContain('data-testid="allergen-disclaimer-toggle"');
  });
});

describe("the floor a bare mark needs", () => {
  /**
   * **The sweep cannot make this assertion, which is why it is written out.**
   * `tap-floor.test.ts`'s `narrowness()` convicts a box declaring a `width`,
   * `max-width` or `min-width` under the floor; a box declaring **none at all**
   * reads as unbounded, because a shrink-to-fit width is a fact about rendered
   * content and not about a stylesheet.
   *
   * That blind spot is real and this ticket walked into it. `.info-btn` carried
   * `min-width: var(--tap-min)` — ADR-0098 §3's recipe puts the floor on both
   * axes precisely because the mark inside is smaller than the target — and the
   * first port of it declared only `min-height`. Every gate passed. A 21.6px ⓘ
   * in a button that shrinks to fit it is a 21.6x48 tap target, and what caught
   * it was the rebaseline moving pixels nobody had predicted.
   *
   * So the floor is asserted here, on both axes, against the token rather than
   * against a number.
   */
  const RULE = ruleOf("src/lib/ui/Disclosure.svelte", ".disclosure");

  it("declares the tap floor on both axes", () => {
    expect(decl(RULE, "min-height")).toBe("var(--tap-min)");
    expect(decl(RULE, "min-width")).toBe("var(--tap-min)");
  });

  it("centres what it draws, so the floor does not strand the mark", () => {
    // A floor without this puts a 21.6px ring against the left edge of a 48px
    // box — level, and visibly wrong.
    expect(decl(RULE, "justify-content")).toBe("center");
  });
});

describe("the disclosure census", () => {
  it("reads the whole tree, so an empty sweep cannot pass", () => {
    expect(FILES).toContain("src/App.svelte");
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("writes aria-expanded in one place, and names what is not a disclosure", () => {
    const loose = EXPANDERS.filter(
      (line) =>
        !line.startsWith(PRIMITIVE) &&
        !Object.keys(NOT_A_DISCLOSURE).some((file) => line.startsWith(file))
    );
    expect(loose).toEqual([]);
    // The primitive writes it, so the sweep cannot be passing on an empty read.
    expect(EXPANDERS.some((line) => line.startsWith(PRIMITIVE))).toBe(true);
  });

  it("holds the named exception to being a real one", () => {
    // An exemption for a file that no longer writes `aria-expanded` is a line
    // nobody deletes, so it costs a diff in both directions.
    for (const file of Object.keys(NOT_A_DISCLOSURE)) {
      expect(EXPANDERS.some((line) => line.startsWith(file))).toBe(true);
    }
  });

  it("resolves every aria-controls against an id in its own file", () => {
    // Five pairs at the time of writing, so the assertion below is reading
    // something. A sweep asserting an absence has to prove it looked.
    expect(CONTROLS.length).toBeGreaterThanOrEqual(5);

    const dangling = CONTROLS.filter(
      ({ file, value }) => !resolves(file, value)
    ).map(({ file, value }) => `${file}  aria-controls=${value}`);
    expect(dangling).toEqual([]);
  });

  it("is adopted at all five sites the ticket measured", () => {
    const wearing = FILES.filter((file) =>
      elementsOf(file).some((el) => el.tag === "#Disclosure")
    ).sort();
    expect(wearing).toEqual([
      "src/lib/views/EndingLine.svelte",
      "src/lib/views/FoodView.svelte",
      "src/lib/views/food/AllergenSafetyBlock.svelte",
      "src/lib/views/food/DailyDashboard.svelte",
      "src/lib/views/food/NutritionTargetEditor.svelte",
    ]);
  });

  it("leaves the accordion where it is, because it is not one of these", () => {
    // `RecipeBuilder` has many items, roving focus between headers and a
    // multiple-open policy — the between-item behaviour the platform lacks and
    // bits-ui supplies (ADR-0068 §1). It writes no `aria-expanded` of its own;
    // bits does.
    const recipe = readFileSync(
      "src/lib/views/food/RecipeBuilder.svelte",
      "utf8"
    );
    expect(recipe).toContain("Accordion.Root");
    expect(
      EXPANDERS.some((line) =>
        line.startsWith("src/lib/views/food/RecipeBuilder.svelte")
      )
    ).toBe(false);
  });
});
