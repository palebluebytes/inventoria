/**
 * The caption population `ui/FieldCaption` was written to close — #383,
 * ADR-0100 §8.
 *
 * **A census per population, beside the concern it polices**, and this one is
 * two censuses because the population has two halves that fail differently.
 *
 * **The element half, which is the strong one.** After the port, `<label for>`
 * *is* the caption: every one in `src/` is the primitive's own. That is the
 * `<textarea>` and `<select>` shape — a population that goes to zero — and it
 * was not available when the ticket was written, because the app then held
 * seventeen caption rules and half the captions were `<span>`s. The labels that
 * survive all **wrap** their control and carry no `for`, which is a different
 * device: there the label is the row or the card, sized to take the tap
 * (ADR-0093, #338). They are named with their arguments, so a fifth costs a
 * diff.
 *
 * **The rule half, for what the element half cannot see.** A caption written as
 * a `<span>` over an input renders identically and no element sweep can find
 * it. What is decidable is whether anybody re-declared the *look* — which is
 * the route every one of the seventeen arrived by, since each was a copy of the
 * nearest example.
 *
 * That look had **seven distinct settings** across the app before this ticket:
 * n1/800, n1/700, n2/700, n2/600, `0.75rem`/700, `0.92rem` with no transform,
 * and `--step-n2` with no transform — two outside the type scale altogether and
 * two not uppercase. Nothing mechanical could have told you, because every one
 * of them rendered exactly as its author intended.
 *
 * **The census the ticket carried was short twice.** The original body found
 * ten sites; the re-measure found six more and called it fifteen rules in seven
 * settings. Implementing it found two neither pass had: `FoodStager`'s
 * `.cf-pack > span` (`0.92rem`/700 over `#cf-pack-size`, with a comment saying
 * it means to read as one of the `.cf-lbl` rows it sits above) and
 * `ReadPairingCode`'s `.label` (n2/700 uppercase with a letter-spacing, an
 * eighth setting). Both were invisible to the re-measure's method for the same
 * reason: their caption is a `<span>` inside a wrapping `<label>`, so a sweep
 * keyed on rules reaching a label found the wrapper and not the text.
 *
 * `OUT_OF_REACH_SET` is ADR-0100 §7's shape — what was left out is named with
 * its reason rather than being quietly absent — and its own docblock is careful
 * about how much that list actually proves.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { render } from "svelte/server";
import { createRawSnippet } from "svelte";
import {
  attr,
  elementsOf,
  matches,
  trackedSvelteFiles,
} from "./support/markup";
import {
  appSheet,
  decl,
  ruleIn,
  ruleOf,
  rulesOf,
  styleOf,
  type Rule,
} from "./support/stylesheet";
import FieldCaption from "../../src/lib/ui/FieldCaption.svelte";

const FILES = trackedSvelteFiles();

/** The look, read off `app.css` rather than restated here: a census that
 *  hard-codes the numbers it is looking for stops finding them the day
 *  somebody changes one. */
const SHARED = ruleIn(appSheet(), ".field-caption", null, "src/app.css");

const LOOK = {
  "font-size": decl(SHARED, "font-size")!,
  "font-weight": decl(SHARED, "font-weight")!,
  "text-transform": decl(SHARED, "text-transform")!,
};

/**
 * Rules that look like a caption to a reader and are **out of the reach set**,
 * each with the argument, in ADR-0100 §7's shape.
 *
 * Be exact about what this is, because the honest version is weaker than it
 * first looks: not one of these would be convicted by the sweep below — every
 * one of them sets a type the shared rule does not — so calling them
 * *exemptions from it* would be a list that costs nothing and proves nothing.
 * They are exclusions from the **reach set**, decided by reading, and they are
 * written here because the next person to run the census will look at these
 * four and ask why they were left.
 *
 * What makes the list load-bearing is the selector beside each one: `ruleOf`
 * throws where a rule has been renamed or removed, so converging any of these
 * fails here until its note goes with it.
 */
const OUT_OF_REACH_SET: { file: string; selector: string; why: string }[] = [
  {
    file: "src/lib/ui/Checkbox.svelte",
    selector: ".checkbox",
    why: "A control's name *beside* its box, not a caption above a field — different semantics under ADR-0100 §1, so its --step-n1/700 is not a disagreement with this look.",
  },
  {
    file: "src/lib/views/items/ItemEditModal.svelte",
    selector: ".field-name",
    why: "The heading over a read-only value. The markup's own comment says it: there is no control under it to label.",
  },
  {
    file: "src/lib/views/food/IngredientListEditor.svelte",
    selector: ".section-head",
    why: "Names the ingredient list and the figures under it — a section, not a control, so there is nothing for a `for` to point at.",
  },
  {
    file: "src/lib/views/items/ItemInspector.svelte",
    selector: ".note-label",
    why: "An inline `Note:` prefix to a note's text, which is a readout and not a caption at all. It joins `.macro-label` and the others the census set aside.",
  },
];

/**
 * Every rule in `file` that sets all three of the look's declarations to the
 * values `app.css` does **and** lands on a `<label>` written in that file.
 *
 * Both halves are needed, and the second one is what makes the sweep mean
 * something. The type test alone convicts six rules that share the setting and
 * are not captions — three `h3`s, a warning line, a subhead and a submit button
 * — because a type scale is shared on purpose and n1/800/uppercase is simply
 * what a small heading looks like in this app. Requiring the rule to reach a
 * `<label>` narrows it to the element a caption now is, which is the narrowing
 * the ticket's own re-measure used.
 *
 * The narrowing is bought honestly: `matches` returns `null` where the tree
 * cannot say, and an undecidable selector is **kept** rather than dropped, so
 * the sweep errs towards reporting a rule it could not clear.
 */
function capitulations(file: string): Rule[] {
  if (!readFileSync(file, "utf8").includes("<style>")) return [];
  const labels = elementsOf(file).filter(
    (el) => el.tag === "label" || /Label$/.test(el.tag)
  );
  if (labels.length === 0) return [];
  return rulesOf(styleOf(file)).filter(
    (rule) =>
      Object.entries(LOOK).every(
        ([prop, value]) => decl(rule, prop) === value
      ) &&
      rule.selectors.some((selector) =>
        labels.some((el) => matches(selector, el) !== false)
      )
  );
}

const REDECLARED = FILES.flatMap((file) =>
  capitulations(file).map((rule) => `${file}  ${rule.selectors.join(", ")}`)
).sort();

/**
 * Every `<label>` in `src/`, split by whether it names a control with `for` or
 * wraps one.
 *
 * A `<label>` whose expression-borne `for` cannot be read statically still
 * counts as having one — `attr` hands back `{…}` — which is the direction this
 * has to fail in: crediting an unreadable `for` as absent would file the
 * primitive itself among the wrappers.
 */
const LABELS = FILES.flatMap((file) =>
  elementsOf(file)
    .filter((el) => el.tag === "label")
    .map((el) => ({ file, named: attr(el, "for") !== undefined }))
);

/** A label that wraps its control instead of naming one: the label is the box,
 *  and it is sized to take the tap. Each is named with its argument. */
const WRAPPING_LABELS: Record<string, string> = {
  "src/lib/ui/Checkbox.svelte":
    "ADR-0068: the native checkbox sits in the label that names it, so the whole row is one target and the name is not optional.",
  "src/lib/views/food/AmountField.svelte":
    "The row IS the label (#338). It was a div holding a smaller label around just the number, which made the 32px value the target while the 54px row took nothing.",
  "src/lib/views/food/NutrientCard.svelte":
    "When `toggle` is set the whole card IS the checkbox — a `svelte:element` that renders `label` for exactly that reason — so the tap target is the card.",
};

describe("FieldCaption", () => {
  it("renders a <label> carrying the for it was given", () => {
    const { body } = render(FieldCaption, {
      props: {
        for: "calc-age",
        children: createRawSnippet(() => ({
          render: () => "<span>Age</span>",
        })),
      },
    });
    expect(body).toMatch(/<label[^>]*for="calc-age"/);
    expect(body).toContain("field-caption");
  });

  it("keeps the caller's class beside the shared one", () => {
    const { body } = render(FieldCaption, {
      props: {
        for: "cf-fat",
        class: "cf-lbl",
        children: createRawSnippet(() => ({ render: () => "Fat" })),
      },
    });
    expect(body).toContain("field-caption cf-lbl");
  });

  it("spreads ...rest onto the label and never over the class", () => {
    const { body } = render(FieldCaption, {
      props: {
        for: "x",
        class: "styled",
        "data-testid": "cap",
        children: createRawSnippet(() => ({ render: () => "X" })),
      } as Record<string, unknown>,
    });
    expect(body).toContain('data-testid="cap"');
    expect(body).toContain("field-caption styled");
  });
});

describe("the caption census", () => {
  it("reads the whole tree, so an empty sweep cannot pass", () => {
    expect(FILES).toContain("src/App.svelte");
    expect(FILES).toContain("src/Rations.svelte");
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("reads the look off app.css rather than restating it", () => {
    // If this block ever has to change, the look changed — which is a decision,
    // and ADR-0100 §6 says it is argued rather than drifted into.
    expect(LOOK).toEqual({
      "font-size": "var(--step-n1)",
      "font-weight": "800",
      "text-transform": "uppercase",
    });
  });

  it("declares the caption look in exactly one place", () => {
    expect(REDECLARED).toEqual([]);
  });

  it("holds each out-of-reach rule to the file that argues for it", () => {
    // `ruleOf` throws on a rename or a removal rather than passing quietly, so
    // converging one of these cannot leave its argument behind as prose about
    // a rule that is gone.
    for (const { file, selector } of OUT_OF_REACH_SET) {
      expect(() => ruleOf(file, selector)).not.toThrow();
    }
  });

  it("keeps none of them at the caption's own setting", () => {
    // What the list would be hiding if it were wrong: an exclusion whose rule
    // draws exactly this look is not an exclusion, it is an unconverted copy.
    for (const { file, selector } of OUT_OF_REACH_SET) {
      const rule = ruleOf(file, selector);
      const same = Object.entries(LOOK).every(
        ([prop, value]) => decl(rule, prop) === value
      );
      expect(`${file} ${selector} ${same}`).toContain("false");
    }
  });

  it("finds exactly one <label for> in src/, and it is the primitive", () => {
    // The population that goes to zero. A hand-written `<label for>` caption
    // fails here on the commit that writes it, whatever type it chose — which
    // is what the rule sweep above cannot say.
    expect([
      ...new Set(LABELS.filter((l) => l.named).map((l) => l.file)),
    ]).toEqual(["src/lib/ui/FieldCaption.svelte"]);
  });

  it("names every label that wraps its control instead", () => {
    // The other kind, and the reason the assertion above is about `for` rather
    // than about `<label>`: three boxes in this app are a label because the
    // label is the tap target, and none of them is a caption.
    expect(
      [...new Set(LABELS.filter((l) => !l.named).map((l) => l.file))].sort()
    ).toEqual(Object.keys(WRAPPING_LABELS).sort());
  });

  it("leaves no caption drawn by a <span> over a control it has adopted", () => {
    // The narrow, decidable half of the a11y claim: every site this ticket
    // converted now names its control explicitly. Read off the markup rather
    // than asserted, so deleting a `for` fails here.
    const adopted = FILES.flatMap((file) =>
      elementsOf(file)
        .filter((el) => el.tag === "#FieldCaption")
        .map((el) => `${file} ${el.attrs.includes("for=") ? "ok" : "NO for"}`)
    ).filter((line) => line.endsWith("NO for"));

    expect(adopted).toEqual([]);
  });

  it("is adopted widely enough that the sweep above means something", () => {
    // A floor rather than a target: the census asserts an absence, and an
    // absence is trivially true if nothing adopted the component.
    const wearing = FILES.filter((file) =>
      elementsOf(file).some((el) => el.tag === "#FieldCaption")
    );
    expect(wearing.length).toBeGreaterThanOrEqual(12);
  });
});
