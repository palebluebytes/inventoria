import { describe, it, expect } from "vitest";
// A plain-Node ops script, deliberately outside the app's tsconfig: it reads the
// mirrored archives with Node built-ins only, like the mirror check beside it.
// @ts-ignore
import {
  PANEL_ROWS,
  reportsField,
  createCoverageTally,
  countSharedNdbNumbers,
  formatCoverageTable,
} from "../../scripts/usda-coverage.mjs";
import { PANEL_FIELDS } from "../../src/lib/food/usda-fdc";

// The measurement behind the completeness table in research note #108. What it
// answers is narrow: how many records of a bulk dataset report a panel field at
// all. Presence, not quality — a reported zero counts, a missing assay does not.

interface BulkNutrient {
  nutrient: { id: number };
  amount?: number | null;
}
const food = (nutrients: BulkNutrient[], ndbNumber?: number) => ({
  ndbNumber,
  foodNutrients: nutrients,
});
const reported = (id: number, amount: number = 1) => ({
  nutrient: { id },
  amount,
});

describe("reportsField — what counts as a reported value", () => {
  it("counts an entry carrying a non-null amount", () => {
    expect(reportsField(food([reported(1079, 2.4)]), [1079])).toBe(true);
  });

  it("counts a reported zero, which is a measurement like any other", () => {
    expect(reportsField(food([reported(1079, 0)]), [1079])).toBe(true);
  });

  it("does not count an entry whose amount is null or absent", () => {
    expect(
      reportsField(food([{ nutrient: { id: 1079 }, amount: null }]), [1079])
    ).toBe(false);
    expect(reportsField(food([{ nutrient: { id: 1079 } }]), [1079])).toBe(
      false
    );
  });

  it("does not count a nutrient the field is not carried by", () => {
    expect(reportsField(food([reported(1087)]), [1079, 2033])).toBe(false);
  });

  it("counts the field under any of the ids that carry it", () => {
    // Some Foundation foods report fibre only under AOAC 2011.25, and the app
    // reads either (ADR-0045 §3), so the measurement has to as well.
    expect(reportsField(food([reported(2033, 1.6)]), [1079, 2033])).toBe(true);
  });

  it("reads a food with no nutrients at all as reporting nothing", () => {
    expect(reportsField({ foodNutrients: [] }, [1079])).toBe(false);
    expect(reportsField({}, [1079])).toBe(false);
  });
});

describe("createCoverageTally — presence over a whole dataset", () => {
  const rows = [
    { label: "Fibre", ids: [1079, 2033] },
    { label: "B12", ids: [1178] },
  ];

  it("counts the records reporting each field, out of the records seen", () => {
    const tally = createCoverageTally(rows);
    tally.add(food([reported(1079, 2.4), reported(1178, 0.2)]));
    tally.add(food([reported(2033, 1.6)]));
    tally.add(food([reported(1087)]));
    expect(tally.total()).toEqual({
      records: 3,
      present: { Fibre: 2, B12: 1 },
    });
  });

  it("starts every row at zero, so an unmeasured field reads as measured absence", () => {
    expect(createCoverageTally(rows).total()).toEqual({
      records: 0,
      present: { Fibre: 0, B12: 0 },
    });
  });
});

describe("countSharedNdbNumbers — the twinned pairs between two datasets", () => {
  it("counts the ndbNumbers carried by both datasets", () => {
    expect(
      countSharedNdbNumbers([9050, 11090, 16158], [9050, 16158, 9999])
    ).toEqual({
      pairs: 2,
      untwinned: 1,
    });
  });

  it("ignores a record with no ndbNumber rather than pairing on absence", () => {
    expect(
      countSharedNdbNumbers([9050, undefined, null], [9050, undefined])
    ).toEqual({ pairs: 1, untwinned: 0 });
  });

  it("counts one pair per distinct ndbNumber, however often it repeats", () => {
    expect(countSharedNdbNumbers([9050, 9050], [9050, 9050, 9050])).toEqual({
      pairs: 1,
      untwinned: 0,
    });
  });
});

describe("formatCoverageTable — the table the correction quotes", () => {
  it("names the denominator in each column heading", () => {
    const table = formatCoverageTable([
      {
        name: "USDA Foundation",
        total: { records: 363, present: { Fibre: 202 } },
      },
      {
        name: "USDA SR Legacy",
        total: { records: 7793, present: { Fibre: 7168 } },
      },
    ]);
    expect(table).toContain("USDA Foundation (363)");
    expect(table).toContain("USDA SR Legacy (7,793)");
  });

  it("reports each field as a whole-number percentage of its own denominator", () => {
    const table = formatCoverageTable([
      {
        name: "USDA Foundation",
        total: { records: 363, present: { Fibre: 202, B12: 64 } },
      },
    ]);
    expect(table).toContain("| Fibre | 56% |");
    expect(table).toContain("| B12 | 18% |");
  });
});

describe("PANEL_ROWS — the fields the note's completeness table names", () => {
  it("measures each field under the same ids the app fills it from", () => {
    // The ids are restated rather than imported, because the measurement is a
    // plain-Node script and the panel is app TypeScript. This is what keeps the
    // restatement honest: a measured completeness that stopped describing what
    // the panel can fill would misdescribe the app while looking right.
    for (const row of PANEL_ROWS as { field: string; ids: number[] }[]) {
      const field = PANEL_FIELDS.find((f) => f.key === row.field);
      expect(field, `no panel field named ${row.field}`).toBeDefined();
      expect(field?.ids, row.field).toEqual(row.ids);
    }
  });

  it("carries every row of the §4 table, in the note's order", () => {
    expect(PANEL_ROWS.map((row: { label: string }) => row.label)).toEqual([
      "Energy",
      "Protein",
      "Carbohydrate",
      "Fibre",
      "Saturated fat",
      "Sodium",
      "Calcium",
      "Iron",
      "Vitamin C",
      "Vitamin D",
      "Vitamin A",
      "B12",
      "Folate",
    ]);
  });
});
