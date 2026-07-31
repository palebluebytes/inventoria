import { describe, it, expect } from "vitest";
import {
  TARGET_RATIONALES,
  type RationaleId,
} from "../../src/lib/food/target-rationale";

// The four "Why these defaults?" info sheets (ADR-0033 §5, #46) map 1:1 to the
// reference docs. These tests lock the content module's shape so a rationale can't
// silently lose its citations, links, or the caveats the calculator must carry.

const IDS: RationaleId[] = ["macros", "micros", "limits", "calculator"];

const REFERENCE_DOCS: Record<RationaleId, string> = {
  macros: "docs/reference/active-adult-macros.md",
  micros: "docs/reference/fda-daily-values.md",
  limits: "docs/reference/daily-nutrient-limits.md",
  calculator: "docs/reference/personalized-energy-and-macros.md",
};

describe("TARGET_RATIONALES", () => {
  it("has exactly the four expected rationales", () => {
    expect(Object.keys(TARGET_RATIONALES).sort()).toEqual([...IDS].sort());
  });

  for (const id of IDS) {
    describe(id, () => {
      const r = TARGET_RATIONALES[id];

      it("maps 1:1 to its reference doc", () => {
        expect(r.referenceDoc).toBe(REFERENCE_DOCS[id]);
      });

      it("has a title, lead, and non-empty reasoning body", () => {
        expect(r.title.length).toBeGreaterThan(0);
        expect(r.lead.length).toBeGreaterThan(0);
        expect(r.blocks.length).toBeGreaterThan(0);
      });

      it("cites at least one source, each with a clickable https link", () => {
        expect(r.sources.length).toBeGreaterThan(0);
        for (const src of r.sources) {
          expect(src.label.length).toBeGreaterThan(0);
          expect(src.url).toMatch(/^https:\/\//);
          // A parseable URL (guards against typos in the baked links).
          expect(() => new URL(src.url)).not.toThrow();
        }
      });

      it("every list block has items", () => {
        for (const block of r.blocks) {
          if (block.kind === "list") {
            expect(block.items.length).toBeGreaterThan(0);
          }
        }
      });
    });
  }

  it("the calculator sheet states the MSJ×PAL and binary-sex caveats plainly", () => {
    const text = [
      TARGET_RATIONALES.calculator.lead,
      ...TARGET_RATIONALES.calculator.blocks.flatMap((b) =>
        b.kind === "list" ? b.items : [b.text]
      ),
    ]
      .join(" ")
      .toLowerCase();
    // MSJ×PAL "not IOM-blessed" caveat.
    expect(text).toContain("iom");
    expect(text).toContain("not a unit");
    // Binary-sex caveat.
    expect(text).toContain("biological sex");
    expect(text).toContain("non-binary");
  });

  it("the calculator cites Mifflin-St Jeor", () => {
    const cited = TARGET_RATIONALES.calculator.sources
      .map((s) => s.label)
      .join(" ");
    expect(cited).toMatch(/Mifflin/);
  });
});
