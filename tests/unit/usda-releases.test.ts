import { describe, it, expect } from "vitest";
// A plain-Node ops module, deliberately outside the app's tsconfig: it is shared
// by the mirror check and the bundle generator, both of which run on Node
// built-ins alone.
// @ts-ignore
import {
  compareToPublished,
  splitRelease,
} from "../../scripts/usda-releases.mjs";

// The one question two callers ask: has USDA published a release the manifest
// does not pin? `usda-backup check` reports it, and `usda-bundle` refuses to
// generate against it (ADR-0047 section 12).

const FOUNDATION = "FoodData_Central_foundation_food_json_2026-04-30.zip";
const SR_LEGACY = "FoodData_Central_sr_legacy_food_json_2018-04.zip";

const archive = (dataset: string, file: string) => ({ dataset, file });

describe("splitRelease — reading a release date out of an archive filename", () => {
  it("reads a Foundation release, which USDA dates to the day", () => {
    expect(splitRelease(FOUNDATION)).toEqual({
      family: "FoodData_Central_foundation_food_json_",
      release: "2026-04-30",
    });
  });

  it("reads SR Legacy's lone release, which is dated to the month", () => {
    expect(splitRelease(SR_LEGACY)?.release).toBe("2018-04");
  });

  it("reads nothing out of a name that carries no date", () => {
    expect(
      splitRelease("FoodData_Central_foundation_food_json.zip")
    ).toBeNull();
  });
});

describe("compareToPublished — the manifest against what USDA serves", () => {
  it("reads a mirror holding the newest release as current", () => {
    const [verdict] = compareToPublished(
      [archive("Foundation Foods", FOUNDATION)],
      [FOUNDATION]
    );
    expect(verdict.state).toBe("current");
    expect(verdict.message).toContain("2026-04-30");
  });

  it("reads a mirror behind USDA as stale, naming both releases", () => {
    const [verdict] = compareToPublished(
      [archive("Foundation Foods", FOUNDATION)],
      [FOUNDATION, "FoodData_Central_foundation_food_json_2026-10-31.zip"]
    );
    expect(verdict.state).toBe("stale");
    expect(verdict.message).toContain("mirror holds 2026-04-30");
    expect(verdict.message).toContain("2026-10-31");
  });

  it("takes the newest of several published releases, not the last listed", () => {
    const [verdict] = compareToPublished(
      [archive("Foundation Foods", FOUNDATION)],
      [
        "FoodData_Central_foundation_food_json_2026-10-31.zip",
        "FoodData_Central_foundation_food_json_2025-12-18.zip",
      ]
    );
    expect(verdict.message).toContain("2026-10-31");
  });

  it("never reads an older published release as a reason to fail", () => {
    const [verdict] = compareToPublished(
      [archive("Foundation Foods", FOUNDATION)],
      ["FoodData_Central_foundation_food_json_2025-12-18.zip", FOUNDATION]
    );
    expect(verdict.state).toBe("current");
  });

  it("does not match one dataset's release against another's family", () => {
    // Every archive name shares the FoodData_Central_ prefix, so a comparison
    // that matched on that alone would read SR Legacy as eight years behind
    // Foundation and block every generation.
    const [verdict] = compareToPublished(
      [archive("SR Legacy", SR_LEGACY)],
      [FOUNDATION, SR_LEGACY]
    );
    expect(verdict.state).toBe("current");
  });

  it("reports a family USDA publishes nothing of, rather than passing it", () => {
    const [verdict] = compareToPublished(
      [archive("SR Legacy", SR_LEGACY)],
      [FOUNDATION]
    );
    expect(verdict.state).toBe("unpublished");
  });

  it("reports a manifest filename it cannot read a release out of", () => {
    const [verdict] = compareToPublished(
      [archive("Foundation Foods", "whatever.zip")],
      [FOUNDATION]
    );
    expect(verdict.state).toBe("unreadable");
  });

  it("returns one verdict per archive, in the order given", () => {
    expect(
      compareToPublished(
        [
          archive("Foundation Foods", FOUNDATION),
          archive("SR Legacy", SR_LEGACY),
        ],
        [FOUNDATION, SR_LEGACY]
      ).map((v: { dataset: string }) => v.dataset)
    ).toEqual(["Foundation Foods", "SR Legacy"]);
  });
});
