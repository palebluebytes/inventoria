import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { importersOf } from "./support/importers";
import {
  COLLAPSING_AXES,
  claimingAxis,
  collapseGroupKey,
  descriptionSegments,
  residualDescription,
} from "../../src/lib/food/usda-collapse-roster";

// ADR-0103 §2's roster, pinned against real corpus descriptions — an axis tuned
// against invented names is tuned against nothing. Every segment quoted here is
// one `public/usda/search-index.json` carries today.
//
// It runs ONCE per generation (ADR-0047 §4), never in the app, so this file is
// also where that arrangement is asserted — see the last block.

describe("a roster entry says which of §2's two kinds it claims, and why", () => {
  // The KIND half of §9's first requirement is the compiler's, not this file's:
  // `CollapsingAxis.kind` is the literal `"collapsing"`, so an entry that
  // cannot say does not build and `pnpm check` is where it fails. A runtime
  // assertion over that field could not fail and is not written. What a test
  // CAN add is that the second half — the why — is actually there.

  it("carries a written reason on every entry, not a placeholder", () => {
    // A sentence, not a word: every entry has to carry the as-bought argument
    // for its own axis, and 80 characters is below the shortest one written.
    for (const entry of COLLAPSING_AXES)
      expect([entry.axis, entry.because.trim().length > 80]).toEqual([
        entry.axis,
        true,
      ]);
  });

  it("holds three axes, and preparation is not one of them", () => {
    expect([...new Set(COLLAPSING_AXES.map((entry) => entry.axis))]).toEqual([
      "separation",
      "trim",
      "grade",
    ]);
  });
});

describe("claimingAxis", () => {
  it("reads the butcher's dissection as a separation", () => {
    expect(claimingAxis("separable lean and fat")?.axis).toBe("separation");
    expect(claimingAxis("boneless separable lean only")?.axis).toBe(
      "separation"
    );
    expect(claimingAxis("lean only")?.axis).toBe("separation");
  });

  it("reads a trim specification, with or without USDA's missing space", () => {
    // ADR-0103 §10: the archives spell it both ways, so an entry is a pattern
    // over a segment rather than a literal string.
    expect(claimingAxis('trimmed to 1/8" fat')?.axis).toBe("trim");
    expect(claimingAxis('trimmed to 1/8"fat')?.axis).toBe("trim");
    expect(claimingAxis('trimmed to 0" fat')?.axis).toBe("trim");
  });

  it("reads a carcass grade in either country's vocabulary", () => {
    expect(claimingAxis("choice")?.axis).toBe("grade");
    expect(claimingAxis("USDA Select")?.axis).toBe("grade");
    expect(claimingAxis("Aust. marble score 9")?.axis).toBe("grade");
  });

  it("matches a whole segment and never a substring", () => {
    // §10's clause. `primavera` carries `prime`, `selected` carries `select`,
    // and `84% lean / 16% fat` is a fat content, which §2 classes as
    // distinguishing — you buy 80/20 mince as 80/20 mince.
    for (const segment of [
      "primavera",
      "selected",
      "extra lean",
      "84% lean / 16% fat",
      "external fat",
      "composite of trimmed retail cuts",
    ])
      expect([segment, claimingAxis(segment)]).toEqual([segment, null]);
  });

  it("never reads USDA's egg grade as a carcass grade", () => {
    // §10's standing warning: `grade a` is a different sense of the word, and an
    // entry reading the word rather than the segment renames three egg rows.
    expect(claimingAxis("Grade A")).toBe(null);
    expect(residualDescription("Eggs, Grade A, Large, egg white")).toBe(
      "Eggs, Grade A, Large, egg white"
    );
  });
});

describe("the preparation axis is absent, and ADR-0104's roasted rows say why", () => {
  // ADR-0104 owns cooked forms and removed them, so the only segments a
  // preparation entry still reaches in the shipped corpus are eight roasted
  // nuts and seeds the shop test deliberately KEEPS (ADR-0104 §2). Carrying the
  // pilot's regex across would collapse each onto its plain sibling and reverse
  // that decision silently.
  //
  // They are read OUT OF THE CORPUS rather than transcribed, because the
  // module's own prose already lists them and #162 is this map's standing
  // lesson about one count restated in three files. A regeneration that changes
  // the eight fails here rather than leaving the prose quietly wrong.
  const shipped: { description: string }[] = JSON.parse(
    readFileSync("public/usda/search-index.json", "utf8")
  ).foods;
  const roasted = shipped.filter((row) =>
    descriptionSegments(row.description).tail.some((segment) =>
      /^roasted$/i.test(segment)
    )
  );

  it("claims none of the eight rows ADR-0104 protects", () => {
    expect(roasted.map((row) => row.description).sort()).toEqual([
      "Nuts, chestnuts, chinese, roasted",
      "Nuts, chestnuts, european, roasted",
      "Nuts, chestnuts, japanese, roasted",
      "Seeds, breadfruit seeds, roasted",
      "Seeds, pumpkin and squash seed kernels, roasted, with salt added",
      "Seeds, pumpkin and squash seed kernels, roasted, without salt",
      "Seeds, pumpkin and squash seeds, whole, roasted, with salt added",
      "Seeds, pumpkin and squash seeds, whole, roasted, without salt",
    ]);
    for (const { description } of roasted)
      expect([description, residualDescription(description)]).toEqual([
        description,
        description,
      ]);
  });

  it("is the whole of what a preparation entry would still reach", () => {
    // The corpus-wide claim behind the module's prose: no OTHER shipped row
    // carries a segment the retired axis read, so dropping it costs these eight
    // and nothing else.
    const claimed = shipped.filter((row) =>
      descriptionSegments(row.description).tail.some((segment) =>
        /^(raw|raw or unheated|cooked|grilled|braised|roasted|broiled|boiled|baked|fried)$/i.test(
          segment
        )
      )
    );
    expect(claimed.length).toBe(8);
  });

  it("leaves a roasted chestnut in a group of its own", () => {
    // The three that would actually have merged. The roasted row states a
    // non-preferred preparation, so it would lose §4's chain to the plain row
    // and vanish — a collapse acting as the deletion ADR-0104 refused.
    expect(collapseGroupKey("Nuts, chestnuts, japanese, roasted")).not.toBe(
      collapseGroupKey("Nuts, chestnuts, japanese")
    );
    expect(collapseGroupKey("Seeds, breadfruit seeds, roasted")).not.toBe(
      collapseGroupKey("Seeds, breadfruit seeds")
    );
  });

  it("claims no spelling of the uncooked state either", () => {
    // ADR-0104 §4 already strips these from every shipped name, so the pilot's
    // `raw` entries reach nothing and left with the rest of the axis.
    expect(claimingAxis("raw")).toBe(null);
    expect(claimingAxis("cooked")).toBe(null);
    expect(claimingAxis("roasted")).toBe(null);
  });
});

describe("the residual description", () => {
  it("strikes out every collapsing segment and keeps the rest", () => {
    expect(
      residualDescription(
        'Beef, loin, tenderloin steak, separable lean and fat, trimmed to 1/8" fat, choice, raw'
      )
    ).toBe("Beef, loin, tenderloin steak, raw");
  });

  it("never strikes out the head, which is the food", () => {
    // §3 strips comma-SEGMENTS. The first part names the food and is what the
    // group is a group of, so it is never a candidate however it reads.
    expect(descriptionSegments("Beef, choice").head).toBe("Beef");
    expect(residualDescription("Choice")).toBe("Choice");
  });

  it("leaves a fat content standing, because §2 calls it distinguishing", () => {
    expect(
      residualDescription("Beef, ground, 80% lean meat / 20% fat, raw")
    ).toBe("Beef, ground, 80% lean meat / 20% fat, raw");
  });
});

describe("the collapse group key", () => {
  it("normalises punctuation, because USDA spells one cut both ways", () => {
    // §3's normalisation clause (#191): a comma is not a difference of food.
    expect(collapseGroupKey("Beef, round, top round, steak")).toBe(
      collapseGroupKey("Beef, round, top round steak")
    );
  });

  it("normalises nothing that carries meaning", () => {
    // The clause is punctuation and whitespace only. `boneless` is a real
    // difference in USDA's vocabulary and the pilot measured widening it as a
    // separate, refused lever.
    expect(collapseGroupKey("Beef, chuck eye roast, boneless")).not.toBe(
      collapseGroupKey("Beef, chuck eye roast")
    );
  });
});

describe("the roster stays out of the app's bundle", () => {
  it("is reached only through the generator's esbuild seam", () => {
    // The arrangement `usda-food-kind.ts` and `usda-variant-drops.ts` already
    // follow: the corpus is filtered once, ahead of time, and what ships is the
    // survivors (ADR-0047 §4).
    expect(importersOf("usda-collapse-roster")).toEqual([]);
  });
});
